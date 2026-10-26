// Provider de AniList (GraphQL). Lee la lista actual y escribe progreso.
import { ANILIST, STATUS } from '../config.js';
import * as storage from '../lib/storage.js';

const FROM_ANI = {
  CURRENT: STATUS.WATCHING,
  PLANNING: STATUS.PLANNING,
  COMPLETED: STATUS.COMPLETED,
  DROPPED: STATUS.DROPPED,
  PAUSED: STATUS.PAUSED,
  REPEATING: STATUS.REPEATING,
};
const TO_ANI = {
  [STATUS.WATCHING]: 'CURRENT',
  [STATUS.PLANNING]: 'PLANNING',
  [STATUS.COMPLETED]: 'COMPLETED',
  [STATUS.DROPPED]: 'DROPPED',
  [STATUS.PAUSED]: 'PAUSED',
  [STATUS.REPEATING]: 'REPEATING',
};

async function gql(query, variables) {
  const { anilistToken } = await storage.get('anilistToken');
  if (!anilistToken) throw new Error('No autenticado en AniList.');
  const res = await fetch(ANILIST.graphql, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${anilistToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors && json.errors.length) {
    const e = json.errors[0];
    if (e.status === 400 || /token/i.test(e.message || '')) {
      await storage.clearProvider('anilist');
      throw new Error('La sesión de AniList no es válida. Vuelve a conectar.');
    }
    throw new Error(e.message || 'Error de AniList');
  }
  return json.data;
}

export async function getViewer() {
  const data = await gql(`query { Viewer { id name } }`, {});
  await storage.set({ anilistUser: data.Viewer });
  return data.Viewer;
}

const LIST_QUERY = `
query ($userId: Int, $type: MediaType) {
  MediaListCollection(userId: $userId, type: $type, status_in: [CURRENT, REPEATING]) {
    lists {
      entries {
        id
        progress
        progressVolumes
        score(format: POINT_100)
        status
        media {
          id
          idMal
          status
          episodes
          chapters
          nextAiringEpisode { episode }
          title { userPreferred }
          coverImage { large }
        }
      }
    }
  }
}`;

// type: 'anime' | 'manga'
export async function getCurrent(type) {
  const viewer = await getViewer();
  const data = await gql(LIST_QUERY, { userId: viewer.id, type: type.toUpperCase() });
  const lists = data.MediaListCollection?.lists || [];
  const items = [];
  for (const list of lists) {
    for (const e of list.entries) {
      items.push({
        provider: 'anilist',
        id: e.media.id,
        idMal: e.media.idMal || null,
        listEntryId: e.id,
        title: e.media.title.userPreferred,
        total: (type === 'anime' ? e.media.episodes : e.media.chapters) || 0,
        image: e.media.coverImage?.large || '',
        status: FROM_ANI[e.status] || STATUS.WATCHING,
        // Estado de emisión/publicación del medio (no de mi lista).
        release: e.media.status === 'RELEASING' ? 'releasing'
          : e.media.status === 'FINISHED' ? 'finished' : 'other',
        // Último episodio emitido (el siguiente a emitir menos 1).
        airingEp: e.media.nextAiringEpisode ? e.media.nextAiringEpisode.episode - 1 : null,
        progress: e.progress || 0,
        score: e.score || 0,
      });
    }
  }
  return items;
}

// Escribe progreso/estado en AniList.
export async function save(mediaId, { progress, status }) {
  const query = `
    mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
      SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
        id status progress
      }
    }`;
  const variables = {
    mediaId,
    progress,
    status: TO_ANI[status] || 'CURRENT',
  };
  const data = await gql(query, variables);
  return data.SaveMediaListEntry;
}

// Busca un medio por id/idMal.
export async function lookup({ id, idMal, type }) {
  const selector = id ? `id: ${Number(id)}` : `idMal: ${Number(idMal)}`;
  const data = await gql(
    `query { Media(${selector}, type: ${type.toUpperCase()}) { id idMal title { userPreferred } } }`,
    {},
  );
  return data.Media;
}

function cap(s) {
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : '';
}
function fuzzyToStr(fd) {
  if (fd && fd.year && fd.month && fd.day) {
    return `${String(fd.year).padStart(4, '0')}-${String(fd.month).padStart(2, '0')}-${String(fd.day).padStart(2, '0')}`;
  }
  return '';
}
function strToFuzzy(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? { year: +m[1], month: +m[2], day: +m[3] } : { year: null, month: null, day: null };
}
function humanStatus(s) {
  return (
    {
      RELEASING: 'En emisión',
      FINISHED: 'Finalizado',
      NOT_YET_RELEASED: 'Sin estrenar',
      CANCELLED: 'Cancelado',
      HIATUS: 'En pausa',
    }[s] || s || '—'
  );
}

const DETAIL_QUERY = `
query ($id: Int, $type: MediaType) {
  Media(id: $id, type: $type) {
    id idMal type siteUrl
    title { userPreferred romaji english native }
    coverImage { large }
    bannerImage
    averageScore meanScore popularity favourites
    rankings { rank type allTime }
    status episodes chapters volumes format season seasonYear
    nextAiringEpisode { episode }
    genres
    description(asHtml: false)
    studios(isMain: true) { nodes { name } }
    externalLinks { site url type icon color }
    characters(sort: ROLE, perPage: 12) {
      edges { role node { name { userPreferred } image { medium } } }
    }
    mediaListEntry {
      score(format: POINT_100) progress status
      startedAt { year month day }
      completedAt { year month day }
    }
  }
}`;

// Detalle completo de un título.
export async function getDetail(id, type) {
  const data = await gql(DETAIL_QUERY, { id: Number(id), type: type.toUpperCase() });
  const m = data.Media;
  const ratedRank = (m.rankings || []).find((r) => r.type === 'RATED' && r.allTime)?.rank ?? null;
  const links = m.externalLinks || [];
  return {
    provider: 'anilist',
    id: m.id,
    type,
    siteUrl: m.siteUrl,
    title: m.title.userPreferred,
    titles: { romaji: m.title.romaji, english: m.title.english, native: m.title.native },
    image: m.coverImage?.large || '',
    banner: m.bannerImage || '',
    score: m.averageScore ?? m.meanScore ?? null,
    scoreMax: 100,
    rank: ratedRank,
    popularity: m.popularity ?? null,
    members: m.favourites ?? null,
    membersLabel: 'Favorites',
    status: humanStatus(m.status),
    airingEp: m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : null,
    episodes: (type === 'anime' ? m.episodes : m.chapters) ?? null,
    volumes: m.volumes ?? null,
    format: m.format || '',
    season: m.season ? `${cap(m.season)} ${m.seasonYear || ''}`.trim() : '',
    genres: m.genres || [],
    studios: (m.studios?.nodes || []).map((s) => s.name),
    source: '',
    description: m.description || '',
    externalLinks: links
      .filter((l) => l.type !== 'STREAMING')
      .map((l) => ({ site: l.site, url: l.url, icon: l.icon || '' })),
    streaming: links
      .filter((l) => l.type === 'STREAMING')
      .map((l) => ({ site: l.site, url: l.url, icon: l.icon || '' })),
    characters: (m.characters?.edges || []).map((e) => ({
      name: e.node.name.userPreferred,
      role: cap(e.role || ''),
      image: e.node.image?.medium || '',
    })),
    my: {
      status: FROM_ANI[m.mediaListEntry?.status] || null,
      score: m.mediaListEntry?.score || 0,
      scoreMax: 100,
      progress: m.mediaListEntry?.progress || 0,
      startDate: fuzzyToStr(m.mediaListEntry?.startedAt),
      finishDate: fuzzyToStr(m.mediaListEntry?.completedAt),
    },
  };
}

// Guarda la entrada completa de "My List".
export async function saveEntry(id, type, { status, score, progress, startDate, finishDate }) {
  const query = `
    mutation ($mediaId: Int, $status: MediaListStatus, $scoreRaw: Int, $progress: Int, $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput) {
      SaveMediaListEntry(mediaId: $mediaId, status: $status, scoreRaw: $scoreRaw, progress: $progress, startedAt: $startedAt, completedAt: $completedAt) {
        id
      }
    }`;
  const variables = {
    mediaId: Number(id),
    status: TO_ANI[status] || 'CURRENT',
    scoreRaw: Number(score) || 0,
    progress: Number(progress) || 0,
    startedAt: strToFuzzy(startDate),
    completedAt: strToFuzzy(finishDate),
  };
  return gql(query, variables);
}

const NOTIF_QUERY = `
query {
  Page(perPage: 25) {
    notifications(resetNotificationCount: false) {
      __typename
      ... on AiringNotification { id type episode createdAt media { title { userPreferred } siteUrl coverImage { medium } } }
      ... on FollowingNotification { id type createdAt user { name siteUrl avatar { medium } } }
      ... on ActivityMentionNotification { id type createdAt user { name avatar { medium } } }
      ... on ActivityReplyNotification { id type createdAt user { name avatar { medium } } }
      ... on ActivityLikeNotification { id type createdAt user { name avatar { medium } } }
      ... on ActivityReplyLikeNotification { id type createdAt user { name avatar { medium } } }
      ... on ThreadCommentReplyNotification { id type createdAt user { name avatar { medium } } thread { title siteUrl } }
      ... on RelatedMediaAdditionNotification { id type createdAt media { title { userPreferred } siteUrl coverImage { medium } } }
      ... on MediaDataChangeNotification { id type createdAt media { title { userPreferred } siteUrl coverImage { medium } } }
      ... on MediaMergeNotification { id type createdAt media { title { userPreferred } siteUrl coverImage { medium } } }
      ... on MediaDeletionNotification { id type createdAt deletedMediaTitle }
    }
  }
}`;

function notifText(n) {
  const user = n.user?.name || 'Someone';
  const media = n.media?.title?.userPreferred || '';
  const cover = n.media?.coverImage?.medium || '';
  const avatar = n.user?.avatar?.medium || '';
  switch (n.__typename) {
    case 'AiringNotification':
      return { text: `Episode ${n.episode} of ${media} aired`, url: n.media?.siteUrl, image: cover };
    case 'FollowingNotification':
      return { text: `${user} started following you`, url: n.user?.siteUrl, image: avatar };
    case 'ActivityMentionNotification':
      return { text: `${user} mentioned you`, url: '', image: avatar };
    case 'ActivityReplyNotification':
      return { text: `${user} replied to your activity`, url: '', image: avatar };
    case 'ActivityLikeNotification':
      return { text: `${user} liked your activity`, url: '', image: avatar };
    case 'ActivityReplyLikeNotification':
      return { text: `${user} liked your reply`, url: '', image: avatar };
    case 'ThreadCommentReplyNotification':
      return { text: `${user} replied in ${n.thread?.title || 'a thread'}`, url: n.thread?.siteUrl, image: avatar };
    case 'RelatedMediaAdditionNotification':
      return { text: `${media} was added to the site`, url: n.media?.siteUrl, image: cover };
    case 'MediaDataChangeNotification':
      return { text: `${media} had data changes`, url: n.media?.siteUrl, image: cover };
    case 'MediaMergeNotification':
      return { text: `${media} was merged`, url: n.media?.siteUrl, image: cover };
    case 'MediaDeletionNotification':
      return { text: `${n.deletedMediaTitle || 'An entry'} was deleted`, url: '', image: '' };
    default:
      return null;
  }
}

// Notificaciones recientes del usuario (requiere sesión AniList).
export async function getNotifications() {
  const data = await gql(NOTIF_QUERY, {});
  const list = data.Page?.notifications || [];
  return list
    .map((n) => {
      const m = notifText(n);
      if (!m) return null;
      return { id: n.id, text: m.text, url: m.url || '', image: m.image || '', createdAt: n.createdAt || 0 };
    })
    .filter(Boolean);
}
