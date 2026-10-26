import { send } from './api.js';

const $ = (sel) => document.querySelector(sel);
const content = $('#content');
const tabsEl = $('#tabs');

const TABS = [
  { id: 'mal', label: 'MyAnimeList', cls: 'mal' },
  { id: 'anilist', label: 'AniList', cls: 'ani' },
];

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function loadTab() {
  try {
    return localStorage.getItem('activeTab');
  } catch {
    return null;
  }
}
function saveTab(id) {
  try {
    localStorage.setItem('activeTab', id);
  } catch {
    /* no-op */
  }
}

let active = loadTab() || 'mal'; // MyAnimeList by default
let activeType =
  (() => {
    try {
      return localStorage.getItem('activeType');
    } catch {
      return null;
    }
  })() || 'anime';
function saveType(id) {
  try {
    localStorage.setItem('activeType', id);
  } catch {
    /* no-op */
  }
}
const cache = {}; // service -> data
let connected = { anilist: false, mal: false };
// Cada cambio de vista incrementa esto; las cargas asíncronas (p. ej. extras de
// Jikan) solo pintan si su token sigue siendo el actual. Evita que una petición
// lenta sobrescriba una vista posterior.
let viewToken = 0;

function visibleTabs() {
  return TABS.filter((t) => connected[t.id]); // ids 'mal'/'anilist' coinciden con STATUS
}

function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => (t.className = 'toast' + (isErr ? ' err' : '')), 2600);
}

function renderTabs() {
  const vis = visibleTabs();
  tabsEl.style.display = vis.length ? '' : 'none';
  tabsEl.innerHTML = vis
    .map(
      (t) => `<button class="tab ${t.cls} ${t.id === active ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`,
    )
    .join('');
  tabsEl.querySelectorAll('.tab').forEach((b) => {
    b.onclick = () => {
      if (active === b.dataset.tab) return;
      active = b.dataset.tab;
      saveTab(active);
      renderTabs();
      show();
    };
  });
}

async function show(forceReload = false) {
  viewToken++; // invalida cargas asíncronas de una vista anterior (detalle)
  if (forceReload) delete cache[active];
  renderTabs();
  if (!cache[active]) {
    content.innerHTML = '<div class="empty">Loading…</div>';
    try {
      cache[active] = await send('GET_SERVICE_LIST', { service: active });
    } catch (e) {
      content.innerHTML = `<div class="banner err">${escapeHtml(e.message)}</div>`;
      return;
    }
  }
  render(cache[active]);
}

function render(data) {
  if (!data.connected) {
    const name = active === 'mal' ? 'MyAnimeList' : 'AniList';
    content.innerHTML =
      `<div class="banner">You haven't connected ${name}.<br><br>
       <button class="btn-accent" id="go-options">Open Options to connect</button></div>`;
    $('#go-options').onclick = openOptions;
    return;
  }

  let html = '';
  if (data.errors?.length) {
    html += `<div class="banner err">${data.errors.map(escapeHtml).join('<br>')}</div>`;
  }
  html += subtabs(data);
  const items = data[activeType] || [];
  if (!items.length) {
    html += `<div class="empty">Nothing here.</div>`;
  } else {
    html += groupedByRelease(items, activeType);
  }
  content.innerHTML = html;
  bindSubtabs(data);
  bindCards();
}

function subtabs(data) {
  const tt = [
    { id: 'anime', label: `Anime · ${data.anime.length}` },
    { id: 'manga', label: `Manga · ${data.manga.length}` },
  ];
  return (
    '<div class="subtabs">' +
    tt
      .map(
        (t) => `<button class="subtab ${t.id === activeType ? 'active' : ''}" data-subtab="${t.id}">${t.label}</button>`,
      )
      .join('') +
    '</div>'
  );
}

function bindSubtabs(data) {
  content.querySelectorAll('.subtab').forEach((b) => {
    b.onclick = () => {
      if (activeType === b.dataset.subtab) return;
      activeType = b.dataset.subtab;
      saveType(activeType);
      render(data);
    };
  });
}

// Group the list into sections by airing/publishing status.
function groupedByRelease(items, type) {
  const buckets = { releasing: [], finished: [], other: [] };
  items.forEach((it, i) => buckets[it.release || 'other'].push({ it, i }));

  const order =
    type === 'anime'
      ? [['releasing', 'Airing'], ['finished', 'Finished Airing'], ['other', 'Other']]
      : [['releasing', 'Publishing'], ['finished', 'Finished'], ['other', 'Other']];

  let html = '';
  for (const [key, label] of order) {
    const arr = buckets[key];
    if (!arr.length) continue;
    html += `<div class="section-title">${label} · ${arr.length}</div>`;
    html += `<div class="grid">` + arr.map(({ it, i }) => tile(it, i, type)).join('') + `</div>`;
  }
  return html;
}

// Episodios de atraso para un anime en emisión (0 si al día o no aplica).
function behindCount(it) {
  return it.airingEp != null && it.airingEp > it.progress ? it.airingEp - it.progress : 0;
}

function siteName() {
  return active === 'mal' ? 'MyAnimeList' : 'AniList';
}
function siteUrl(it, type) {
  const base = active === 'mal' ? 'https://myanimelist.net' : 'https://anilist.co';
  return `${base}/${type}/${it.id}`;
}

// Tile tipo póster: portada de fondo, info superpuesta sobre un degradado.
function tile(it, idx, type) {
  const total = it.total ? `/ ${it.total}` : '';
  const b = behindCount(it);
  return `
    <div class="tile ${b ? 'is-behind' : ''}" data-type="${type}" data-idx="${idx}" title="View details">
      <img class="tile-img cover" src="${it.image || ''}" alt="" />
      <div class="tile-top">
        <a class="tile-open" href="${siteUrl(it, type)}" target="_blank" rel="noopener" title="Open on ${siteName()}" aria-label="Open on ${siteName()}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg></a>
        <span class="tile-chip behind-chip" data-role="behind" title="Episodes behind" style="${b ? '' : 'display:none'}">⏳ ${b}</span>
        ${it.score ? `<span class="tile-chip tile-score">★ ${it.score}</span>` : ''}
      </div>
      <div class="tile-bottom">
        <div class="tile-title">${escapeHtml(it.title)}</div>
        <div class="tile-row">
          <span class="tile-progress"><b data-role="progress">${it.progress}</b> ${total}</span>
          <div class="tile-steps">
            <button data-act="dec" title="Remove 1">−</button>
            <button data-act="inc" title="Add 1">+1</button>
          </div>
        </div>
      </div>
    </div>`;
}

function hideBrokenImages() {
  content.querySelectorAll('img').forEach((img) => {
    if (!img.getAttribute('src')) {
      img.style.visibility = 'hidden';
      return;
    }
    img.addEventListener('error', () => {
      img.style.visibility = 'hidden';
    });
  });
}

// Enlace con icono + texto (como las extensiones originales).
function linkChip(l) {
  let host = '';
  try {
    host = new URL(l.url).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }
  const icon = l.icon || (host ? `https://www.google.com/s2/favicons?sz=64&domain=${host}` : '');
  return `<a href="${l.url}" target="_blank" rel="noopener" class="link-chip">
    ${icon ? `<img class="link-ico" src="${icon}" alt="" />` : ''}<span>${escapeHtml(l.site)}</span></a>`;
}

function bindCards() {
  hideBrokenImages();
  content.querySelectorAll('.tile').forEach((el) => {
    const type = el.dataset.type;
    const idx = Number(el.dataset.idx);
    el.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation(); // no abrir el detalle al pulsar +1/−1
        step(type, idx, btn.dataset.act === 'inc' ? 1 : -1, el);
      };
    });
    // El enlace "Open" abre el sitio sin disparar el detalle.
    el.querySelector('.tile-open')?.addEventListener('click', (e) => e.stopPropagation());
    el.addEventListener('click', () => openDetail(type, idx));
  });
}

async function step(type, idx, delta, el) {
  const item = cache[active][type][idx];
  const next = Math.max(0, item.progress + delta);
  const buttons = el.querySelectorAll('button[data-act]');
  buttons.forEach((b) => (b.disabled = true));
  try {
    await send('SET_PROGRESS', { service: active, type, id: item.id, progress: next, total: item.total });
    item.progress = next;
    el.querySelector('[data-role="progress"]').textContent = next;
    const bEl = el.querySelector('[data-role="behind"]');
    if (bEl) {
      const b = behindCount(item);
      bEl.textContent = `⏳ ${b}`;
      bEl.style.display = b ? '' : 'none';
      el.classList.toggle('is-behind', b > 0);
    }
    toast(`Saved on ${siteName()} (${next})`);
  } catch (e) {
    toast(e.message, true);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

// --- Detail view ----------------------------------------------------------

function statusOptions(type, current) {
  const opts = [
    ['WATCHING', type === 'anime' ? 'Watching' : 'Reading'],
    ['PLANNING', type === 'anime' ? 'Plan to Watch' : 'Plan to Read'],
    ['COMPLETED', 'Completed'],
    ['PAUSED', 'On Hold'],
    ['DROPPED', 'Dropped'],
    ['REPEATING', type === 'anime' ? 'Rewatching' : 'Rereading'],
  ];
  return opts
    .map(([v, l]) => `<option value="${v}" ${v === current ? 'selected' : ''}>${l}</option>`)
    .join('');
}

async function openDetail(type, idx) {
  const myToken = ++viewToken;
  const svc = active;
  const item = cache[active][type][idx];
  content.innerHTML = '<div class="empty">Loading details…</div>';
  let d;
  try {
    d = await send('GET_DETAIL', { service: svc, type, id: item.id });
  } catch (e) {
    if (myToken !== viewToken) return;
    content.innerHTML =
      `<div class="banner err">${escapeHtml(e.message)}</div>` +
      `<button class="back" id="back">← Back</button>`;
    $('#back').onclick = () => show();
    return;
  }
  if (myToken !== viewToken) return; // el usuario ya navegó a otra vista
  // MAL trae personajes/streaming/externos aparte (Jikan, lento): mostramos ya
  // el detalle y los cargamos en segundo plano.
  const needExtras = d.provider === 'mal';
  renderDetail(d, needExtras);
  if (needExtras) {
    try {
      const ex = await send('GET_DETAIL_EXTRAS', { service: svc, type, id: item.id });
      if (myToken !== viewToken) return;
      if (ex) {
        d.characters = ex.characters || [];
        d.streaming = ex.streaming || [];
        d.externalLinks = ex.externalLinks || [];
      }
    } catch {
      if (myToken !== viewToken) return;
    }
    if (myToken !== viewToken) return;
    renderDetail(d, false);
  }
}

function renderDetail(d, loadingExtras = false) {
  const siteLabel = d.provider === 'mal' ? 'MyAnimeList' : 'AniList';
  const totalLabel = d.type === 'anime' ? 'Episodes' : 'Chapters';
  const stat = (k, v) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const scoreStr = d.score ? `${d.score}${d.scoreMax === 10 ? ' /10' : ' /100'}` : '—';

  let html = `<div class="detail-topbar">
    <button class="back" id="back">← Back</button>
    <a class="open-link" href="${d.siteUrl}" target="_blank" rel="noopener">↗ Open on ${siteLabel}</a>
  </div>`;

  html += `<div class="detail-head">
    <img class="cover zoomable" src="${d.image || ''}" alt="" title="View full image" />
    <div class="detail-headinfo">
      <div class="detail-title">${escapeHtml(d.title)}</div>
      ${d.titles?.english && d.titles.english !== d.title ? `<div class="muted">${escapeHtml(d.titles.english)}</div>` : ''}
      <div class="meta" style="margin-top:6px;">
        ${d.format ? `<span class="tag">${escapeHtml(d.format)}</span>` : ''}
        <span class="tag">${escapeHtml(d.status)}</span>
        ${d.season ? `<span class="tag">${escapeHtml(d.season)}</span>` : ''}
        ${d.airingEp != null && d.airingEp > (d.my.progress || 0)
          ? `<span class="tag behind-tag">⏳ ${d.airingEp - (d.my.progress || 0)} behind</span>`
          : ''}
      </div>
    </div>
  </div>`;

  html += `<div class="stats">`;
  html += stat('Score', scoreStr);
  html += stat('Ranked', d.rank ? `#${d.rank}` : '—');
  html += stat('Popularity', d.popularity ? `#${d.popularity}` : '—');
  html += stat(d.membersLabel || 'Members', d.members != null ? d.members.toLocaleString() : '—');
  html += stat(totalLabel, d.episodes ?? '—');
  if (d.type === 'manga') html += stat('Volumes', d.volumes ?? '—');
  if (d.airingEp != null) {
    html += stat('Aired', d.airingEp);
    html += stat('Behind', Math.max(0, d.airingEp - (d.my.progress || 0)));
  }
  html += `</div>`;

  // Editable "My List" form
  html += `<div class="section-title">My List</div>
    <div class="edit">
      <label>Status
        <select id="f-status">${statusOptions(d.type, d.my.status)}</select>
      </label>
      <div class="edit-row">
        <label>My Score (0–${d.my.scoreMax})
          <input type="number" id="f-score" min="0" max="${d.my.scoreMax}" value="${d.my.score || 0}" />
        </label>
        <label>Progress${d.episodes ? ` (/${d.episodes})` : ''}
          <input type="number" id="f-progress" min="0" value="${d.my.progress || 0}" />
        </label>
      </div>
      <div class="edit-row">
        <label>Start Date
          <input type="date" id="f-start" value="${d.my.startDate || ''}" />
        </label>
        <label>Finish Date
          <input type="date" id="f-finish" value="${d.my.finishDate || ''}" />
        </label>
      </div>
      <button class="btn-accent" id="f-save">Save</button>
    </div>`;

  if (d.genres?.length) {
    html += `<div class="section-title">Genres</div><div class="chips">` +
      d.genres.map((g) => `<span class="chip">${escapeHtml(g)}</span>`).join('') + `</div>`;
  }
  if (d.studios?.length) {
    html += `<div class="section-title">Studios</div><div class="chips">` +
      d.studios.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join('') + `</div>`;
  }
  if (d.source) {
    html += `<div class="section-title">Source</div><div class="desc">${escapeHtml(d.source)}</div>`;
  }
  if (d.description) {
    html += `<div class="section-title">Synopsis</div><div class="desc">${escapeHtml(d.description).replace(/\n/g, '<br>')}</div>`;
  }
  if (d.streaming?.length) {
    html += `<div class="section-title">Streaming</div><div class="links">` +
      d.streaming.map(linkChip).join('') + `</div>`;
  }
  if (d.externalLinks?.length) {
    html += `<div class="section-title">External Links</div><div class="links">` +
      d.externalLinks.map(linkChip).join('') + `</div>`;
  }
  if (d.characters?.length) {
    html += `<div class="section-title">Characters</div><div class="chars">` +
      d.characters.map((c) => `<div class="char">
        <img class="cover" src="${c.image || ''}" alt="" />
        <div class="char-name">${escapeHtml(c.name)}</div>
        ${c.role ? `<div class="muted" style="font-size:11px">${escapeHtml(c.role)}</div>` : ''}
      </div>`).join('') + `</div>`;
  }

  if (loadingExtras) {
    html += `<div class="notif-empty">Loading characters &amp; links…</div>`;
  }

  content.innerHTML = html;
  $('#back').onclick = () => show();
  $('#f-save').onclick = () => saveDetail(d);
  hideBrokenImages();
  const cover = content.querySelector('.detail-head img.zoomable');
  if (cover && d.image) cover.onclick = () => openLightbox(d.image, d.title);
}

// Vista previa de la portada a tamaño completo; se cierra con clic fuera o Esc.
function openLightbox(src, title) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" />
    <button class="lightbox-close" aria-label="Close">✕</button>`;
  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => e.key === 'Escape' && close();
  box.onclick = close;
  box.querySelector('img').onclick = (e) => e.stopPropagation();
  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
}

async function saveDetail(d) {
  const entry = {
    status: $('#f-status').value,
    score: Number($('#f-score').value) || 0,
    progress: Number($('#f-progress').value) || 0,
    startDate: $('#f-start').value || '',
    finishDate: $('#f-finish').value || '',
  };
  const btn = $('#f-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await send('SET_ENTRY', { service: active, type: d.type, id: d.id, entry });
    Object.assign(d.my, entry);
    // Keep the list cache in sync so the card reflects the change on Back.
    const it = cache[active]?.[d.type]?.find((x) => x.id === d.id);
    if (it) {
      it.progress = entry.progress;
      it.score = entry.score;
    }
    toast(`Saved on ${siteName()}`);
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

// --- Notifications --------------------------------------------------------

function timeAgo(unix) {
  if (!unix) return '';
  const s = Math.floor(Date.now() / 1000) - unix;
  if (s < 60) return `${Math.max(s, 0)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function notifRow(n) {
  const img = n.image ? `<img class="notif-img" src="${n.image}" alt="" />` : '';
  const inner =
    `${img}<div class="notif-body">` +
    `<span class="notif-text">${escapeHtml(n.text)}</span>` +
    `<span class="notif-time">${timeAgo(n.createdAt)}</span></div>`;
  return n.url
    ? `<a class="notif" href="${n.url}" target="_blank" rel="noopener">${inner}</a>`
    : `<div class="notif">${inner}</div>`;
}

// Solo AniList (MyAnimeList no tiene API de notificaciones, así que no se muestra).
async function openNotifications() {
  viewToken++;
  content.innerHTML = '<div class="empty">Loading notifications…</div>';
  let data;
  try {
    data = await send('GET_NOTIFICATIONS');
  } catch (e) {
    content.innerHTML =
      `<div class="banner err">${escapeHtml(e.message)}</div>` +
      `<button class="back" id="back">← Back</button>`;
    $('#back').onclick = () => show();
    return;
  }
  const a = data.anilist;
  let html = `<button class="back" id="back">← Back</button>`;
  if (!a.connected) {
    html += `<div class="notif-empty">No notifications.</div>`;
  } else {
    html += `<div class="notif-source ani">AniList${a.items.length ? ` · ${a.items.length}` : ''}</div>`;
    if (a.error) {
      html += `<div class="banner err">${escapeHtml(a.error)}</div>`;
    } else if (!a.items.length) {
      html += `<div class="notif-empty">No notifications.</div>`;
    } else {
      html += `<div class="notif-list">${a.items.map(notifRow).join('')}</div>`;
    }
  }
  content.innerHTML = html;
  $('#back').onclick = () => show();
  hideBrokenImages();
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

$('#notifs').onclick = openNotifications;
$('#refresh').onclick = () => {
  for (const k in cache) delete cache[k];
  boot();
};
$('#options').onclick = openOptions;

// Arranque: averigua qué sitios están conectados y muestra solo esas pestañas.
async function boot() {
  try {
    connected = await send('STATUS');
  } catch {
    connected = { anilist: false, mal: false };
  }
  // La campana (notificaciones) es de AniList; ocúltala si no está conectado.
  $('#notifs').style.display = connected.anilist ? '' : 'none';

  const vis = visibleTabs();
  renderTabs();
  if (!vis.length) {
    content.innerHTML =
      `<div class="banner">No accounts connected.<br><br>
       <button class="btn-accent" id="go-options">Open Options to connect</button></div>`;
    $('#go-options').onclick = openOptions;
    return;
  }
  if (!vis.find((t) => t.id === active)) {
    active = vis[0].id;
    saveTab(active);
    renderTabs();
  }
  show();
}

boot();
