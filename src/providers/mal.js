// Provider de MyAnimeList (API v2 REST). Lee la lista actual y escribe progreso.
import { MAL, STATUS } from '../config.js';
import { ensureMalToken } from '../lib/auth.js';

const FROM_MAL = {
  watching: STATUS.WATCHING,
  reading: STATUS.WATCHING,
  completed: STATUS.COMPLETED,
  on_hold: STATUS.PAUSED,
  dropped: STATUS.DROPPED,
  plan_to_watch: STATUS.PLANNING,
  plan_to_read: STATUS.PLANNING,
};

function toMalStatus(canonical, type) {
  switch (canonical) {
    case STATUS.WATCHING:
    case STATUS.REPEATING:
      return type === 'anime' ? 'watching' : 'reading';
    case STATUS.COMPLETED:
      return 'completed';
    case STATUS.PAUSED:
      return 'on_hold';
    case STATUS.DROPPED:
      return 'dropped';
    case STATUS.PLANNING:
    default:
      return type === 'anime' ? 'plan_to_watch' : 'plan_to_read';
  }
}

async function apiFetch(path, { method = 'GET', body } = {}) {
  const token = await ensureMalToken();
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = body;
  }
  const res = await fetch(`${MAL.api}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Respuesta inesperada de MyAnimeList.');
  }
  if (json.error) throw new Error(json.message || json.error);
  return json;
}

// type: 'anime' | 'manga'
export async function getCurrent(type) {
  const listPath = type === 'anime' ? 'animelist' : 'mangalist';
  const status = type === 'anime' ? 'watching' : 'reading';
  const fields =
    type === 'anime'
      ? 'list_status,num_episodes,status,main_picture,alternative_titles'
      : 'list_status,num_chapters,status,main_picture,alternative_titles';
  const data = await apiFetch(
    `/users/@me/${listPath}?status=${status}&limit=1000&nsfw=true&fields=${fields}`,
  );
  const items = [];
  for (const row of data.data || []) {
    const node = row.node;
    const ls = row.list_status || {};
    items.push({
      provider: 'mal',
      id: node.id,
      title: node.title,
      total: (type === 'anime' ? node.num_episodes : node.num_chapters) || 0,
      image: node.main_picture?.large || node.main_picture?.medium || '',
      status: FROM_MAL[ls.status] || STATUS.WATCHING,
      // Lo rellena la capa de servicio cruzando con AniList por idMal.
      airingEp: null,
      // Estado de emisión/publicación del medio (currently_airing / finished_airing
      // para anime; currently_publishing / finished para manga).
      release:
        node.status === 'currently_airing' || node.status === 'currently_publishing'
          ? 'releasing'
          : node.status === 'finished_airing' || node.status === 'finished'
          ? 'finished'
          : 'other',
      progress: (type === 'anime' ? ls.num_episodes_watched : ls.num_chapters_read) || 0,
      score: ls.score || 0,
    });
  }
  return items;
}

// Escribe progreso/estado en MAL.
export async function save(id, type, { progress, status }) {
  const field = type === 'anime' ? 'num_watched_episodes' : 'num_chapters_read';
  const body = new URLSearchParams({
    status: toMalStatus(status, type),
    [field]: String(progress),
  }).toString();
  return apiFetch(`/${type}/${id}/my_list_status`, { method: 'PUT', body });
}

// Busca un título por id.
export async function lookup(id, type) {
  return apiFetch(`/${type}/${id}?fields=id,title`);
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
function humanStatus(s) {
  return (
    {
      currently_airing: 'En emisión',
      finished_airing: 'Finalizado',
      not_yet_aired: 'Sin estrenar',
      currently_publishing: 'Publicándose',
      finished: 'Finalizado',
      on_hiatus: 'En pausa',
      discontinued: 'Discontinuado',
      not_yet_published: 'Sin publicar',
    }[s] || s || '—'
  );
}

// Jikan: API no oficial de MAL (scrapea MAL). La API oficial de MAL no expone
// personajes ni enlaces de streaming/externos, así que los tomamos de Jikan.
async function jikan(path) {
  const res = await fetch(`https://api.jikan.moe/v4${path}`);
  if (!res.ok) throw new Error(`Jikan ${res.status}`);
  return res.json();
}

// Extras de Jikan (personajes, streaming, enlaces externos). Se piden aparte del
// detalle principal porque Jikan es lento y tiene rate-limit; así el detalle se
// muestra al instante y esto llega después.
export async function getExtras(id, type) {
  const out = { characters: [], streaming: [], externalLinks: [] };
  const [chars, stream, ext] = await Promise.allSettled([
    jikan(`/${type}/${id}/characters`),
    type === 'anime' ? jikan(`/anime/${id}/streaming`) : Promise.resolve(null),
    jikan(`/${type}/${id}/external`),
  ]);
  if (chars.status === 'fulfilled' && chars.value?.data) {
    out.characters = chars.value.data.slice(0, 12).map((c) => ({
      name: c.character?.name || '',
      role: c.role || '',
      image: c.character?.images?.jpg?.image_url || '',
    }));
  }
  if (stream.status === 'fulfilled' && stream.value?.data) {
    out.streaming = stream.value.data.map((s) => ({ site: s.name, url: s.url, icon: '' }));
  }
  if (ext.status === 'fulfilled' && ext.value?.data) {
    out.externalLinks = ext.value.data.map((e) => ({ site: e.name, url: e.url, icon: '' }));
  }
  return out;
}

// Detalle principal (rápido). Los extras (Jikan) se piden con getExtras.
export async function getDetail(id, type) {
  const common =
    'id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,' +
    'popularity,num_list_users,genres,media_type,status,rating,source,studios,my_list_status';
  const fields =
    type === 'anime'
      ? `${common},num_episodes,start_season`
      : `${common},num_chapters,num_volumes`;
  const m = await apiFetch(`/${type}/${id}?fields=${fields}`);
  const ls = m.my_list_status || {};
  const detail = {
    provider: 'mal',
    id: m.id,
    type,
    siteUrl: `https://myanimelist.net/${type}/${m.id}`,
    title: m.title,
    titles: {
      romaji: m.alternative_titles?.ja || '',
      english: m.alternative_titles?.en || '',
      native: '',
    },
    image: m.main_picture?.large || m.main_picture?.medium || '',
    banner: '',
    score: m.mean ?? null,
    scoreMax: 10,
    rank: m.rank ?? null,
    popularity: m.popularity ?? null,
    members: m.num_list_users ?? null,
    membersLabel: 'Members',
    status: humanStatus(m.status),
    airingEp: null,
    episodes: (type === 'anime' ? m.num_episodes : m.num_chapters) || null,
    volumes: m.num_volumes || null,
    format: m.media_type ? m.media_type.toUpperCase() : '',
    season: m.start_season ? `${cap(m.start_season.season)} ${m.start_season.year}` : '',
    genres: (m.genres || []).map((g) => g.name),
    studios: (m.studios || []).map((s) => s.name),
    source: m.source ? m.source.replace(/_/g, ' ') : '',
    description: m.synopsis || '',
    externalLinks: [],
    streaming: [],
    characters: [],
    my: {
      status: FROM_MAL[ls.status] || null,
      score: ls.score || 0,
      scoreMax: 10,
      progress: (type === 'anime' ? ls.num_episodes_watched : ls.num_chapters_read) || 0,
      startDate: ls.start_date || '',
      finishDate: ls.finish_date || '',
    },
  };
  return detail;
}

// Guarda la entrada completa de "My List".
export async function saveEntry(id, type, { status, score, progress, startDate, finishDate }) {
  const field = type === 'anime' ? 'num_watched_episodes' : 'num_chapters_read';
  const body = new URLSearchParams({
    status: toMalStatus(status, type),
    score: String(Number(score) || 0),
    [field]: String(Number(progress) || 0),
    start_date: startDate || '',
    finish_date: finishDate || '',
  }).toString();
  return apiFetch(`/${type}/${id}/my_list_status`, { method: 'PUT', body });
}
