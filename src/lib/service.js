// Listas por servicio, independientes. Cada pestaña del popup usa esto para su
// propio sitio. El +1 escribe solo en el servicio indicado (sin sincronizar).

import * as anilist from '../providers/anilist.js';
import * as mal from '../providers/mal.js';
import * as auth from './auth.js';
import { computeStatus } from './model.js';

function providerOf(service) {
  return service === 'mal' ? mal : anilist;
}

// Devuelve la lista actual (anime viendo + manga leyendo) de un servicio.
export async function getList(service) {
  const st = await auth.status();
  const out = { service, connected: !!st[service], anime: [], manga: [], errors: [] };
  if (!out.connected) return out;

  const provider = providerOf(service);
  for (const type of ['anime', 'manga']) {
    try {
      out[type] = await provider.getCurrent(type);
    } catch (e) {
      out.errors.push(`${type}: ${e.message}`);
    }
  }

  return out;
}

// Detalle de un título en el servicio indicado (rápido, datos oficiales).
export async function getDetail({ service, type, id }) {
  return providerOf(service).getDetail(id, type);
}

// Extras lentos (personajes/streaming/externos). Solo MAL los pide (vía Jikan);
// AniList ya los trae en getDetail, así que devuelve null.
export async function getExtras({ service, type, id }) {
  if (service === 'mal') return mal.getExtras(id, type);
  return null;
}

// Escribe progreso/estado en un único servicio.
export async function setProgress({ service, type, id, progress, total }) {
  const status = computeStatus(progress, Number(total) || 0);
  if (service === 'anilist') {
    await anilist.save(Number(id), { progress, status });
  } else {
    await mal.save(Number(id), type, { progress, status });
  }
  return { progress, status };
}

// Guarda la entrada completa (status, score, progress, fechas) en un servicio.
export async function setEntry({ service, type, id, entry }) {
  return providerOf(service).saveEntry(id, type, entry);
}

// Notificaciones de cada sitio (sin mezclar). MAL no tiene API de notificaciones.
export async function getNotifications() {
  const st = await auth.status();
  const out = {
    anilist: { connected: st.anilist, items: [], error: null },
    mal: { connected: st.mal },
  };
  if (st.anilist) {
    try {
      out.anilist.items = await anilist.getNotifications();
    } catch (e) {
      out.anilist.error = e.message;
    }
  }
  return out;
}
