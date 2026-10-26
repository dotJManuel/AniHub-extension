// Service worker (module). Centraliza OAuth, llamadas a las APIs y escritura.
// La UI (popup/opciones) solo manda mensajes; aquí viven los tokens y el fetch
// (el host_permissions de MAL evita problemas de CORS desde este contexto).

import * as auth from './lib/auth.js';
import * as service from './lib/service.js';
import * as storage from './lib/storage.js';

const handlers = {
  async STATUS() {
    return auth.status();
  },
  async REDIRECT_INFO() {
    return { redirectUri: auth.redirectUri(), clientIds: await auth.getClientIds() };
  },
  async SET_CLIENT_IDS({ anilistClientId, malClientId, malClientSecret }) {
    return storage.setSettings({ anilistClientId, malClientId, malClientSecret });
  },
  async LOGIN_ANILIST() {
    return auth.loginAnilist();
  },
  async LOGIN_MAL() {
    return auth.loginMal();
  },
  async LOGOUT({ provider }) {
    return auth.logout(provider);
  },
  async GET_SERVICE_LIST({ service: svc }) {
    return service.getList(svc);
  },
  async GET_DETAIL({ service: svc, type, id }) {
    return service.getDetail({ service: svc, type, id });
  },
  async GET_DETAIL_EXTRAS({ service: svc, type, id }) {
    return service.getExtras({ service: svc, type, id });
  },
  async GET_NOTIFICATIONS() {
    return service.getNotifications();
  },
  async SET_PROGRESS({ service: svc, type, id, progress, total }) {
    return service.setProgress({ service: svc, type, id, progress, total });
  },
  async SET_ENTRY({ service: svc, type, id, entry }) {
    return service.setEntry({ service: svc, type, id, entry });
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.cmd];
  if (!handler) {
    sendResponse({ ok: false, error: `Comando desconocido: ${msg?.cmd}` });
    return false;
  }
  handler(msg)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true; // respuesta asíncrona
});

chrome.runtime.onInstalled.addListener(async () => {
  const s = await storage.getSettings();
  await storage.setSettings(s);
});
