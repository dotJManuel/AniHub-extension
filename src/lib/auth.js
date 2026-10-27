// OAuth para ambos servicios. Corre en el service worker (necesita `identity`).
//
// - AniList: OAuth2 "implicit grant" (response_type=token). El token llega en el
//   fragmento (#access_token=...) de la redirección. No expira (~1 año).
// - MAL: OAuth2 "authorization code" + PKCE con method=plain (MAL solo soporta
//   plain, es decir code_verifier === code_challenge). Devuelve access_token +
//   refresh_token con expiración (~31 días). Se renueva con grant_type=refresh_token.

import { ANILIST, MAL, DEFAULT_CLIENT_IDS } from '../config.js';
import * as storage from './storage.js';

export function redirectUri() {
  // https://<extension-id>.chromiumapp.org/
  return chrome.identity.getRedirectURL();
}

export async function getClientIds() {
  const s = await storage.getSettings();
  return {
    anilist: s.anilistClientId || DEFAULT_CLIENT_IDS.anilist,
    mal: s.malClientId || DEFAULT_CLIENT_IDS.mal,
    // MAL emite un Client Secret para todos los tipos de app y su endpoint de
    // token lo exige (incluso con PKCE). Dos modos:
    //  - Con proxy (malWorker): el secret vive en el Worker; aquí NO se embebe.
    //  - Directo (malSecret): el secret va en la build (solo dev / sin publicar).
    malSecret: s.malClientSecret || DEFAULT_CLIENT_IDS.malSecret || '',
    malWorker: (s.malWorker || DEFAULT_CLIENT_IDS.malWorker || '').replace(/\/+$/, ''),
  };
}

// Codifica el `state` del flujo con proxy en base64url (JSON seguro para URL).
function encodeState(obj) {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomString(length = 64) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i++) out += charset[bytes[i] % charset.length];
  return out;
}

function launch(url) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!responseUrl) return reject(new Error('Login cancelado'));
      resolve(responseUrl);
    });
  });
}

// --- AniList --------------------------------------------------------------

export async function loginAnilist() {
  const { anilist: clientId } = await getClientIds();
  if (!clientId) throw new Error('Falta el Client ID de AniList (configúralo en Opciones).');

  // Implicit grant: AniList toma el Redirect URL de la configuración de la app.
  // Pasarlo como parámetro hace que AniList devuelva un error JSON y
  // launchWebAuthFlow falle con "Authorization page could not be loaded".
  const url =
    `${ANILIST.authorize}?client_id=${encodeURIComponent(clientId)}&response_type=token`;

  const responseUrl = await launch(url);
  const hash = responseUrl.split('#')[1] || '';
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  if (!token) throw new Error('AniList no devolvió un token.');
  await storage.setAnilistToken(token);
  return true;
}

// --- MyAnimeList (PKCE plain) --------------------------------------------

export async function loginMal() {
  const { mal: clientId, malSecret, malWorker } = await getClientIds();
  if (!clientId) throw new Error('Falta el Client ID de MyAnimeList (configúralo en config.js).');

  const verifier = randomString(96); // PKCE plain: challenge === verifier
  const nonce = randomString(16);

  // --- Modo proxy: el Worker intercambia el code con el secret (server-side) ---
  if (malWorker) {
    const finalRedirect = redirectUri();
    // El redirect_uri registrado en MAL es el del Worker; llevamos a dónde volver
    // (chromiumapp.org), el verifier y el nonce dentro del `state`.
    const state = encodeState({ r: finalRedirect, v: verifier, n: nonce });
    const callback = `${malWorker}/mal/callback`;

    const url =
      `${MAL.authorize}?response_type=code&client_id=${encodeURIComponent(clientId)}` +
      `&code_challenge=${verifier}&code_challenge_method=plain` +
      `&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(callback)}`;

    const responseUrl = await launch(url);
    const frag = new URLSearchParams(responseUrl.split('#')[1] || '');
    if (frag.get('state') !== nonce) throw new Error('State de OAuth no coincide (posible CSRF).');
    if (frag.get('error')) throw new Error(`MyAnimeList: ${frag.get('error')}`);
    const access_token = frag.get('access_token');
    if (!access_token) throw new Error('MyAnimeList no devolvió un token.');

    await storage.setMalTokens({
      access_token,
      refresh_token: frag.get('refresh_token') || '',
      expires_in: frag.get('expires_in'),
    });
    return true;
  }

  // --- Modo directo: el secret se usa aquí (queda en la build) ---
  const redirect = redirectUri();
  const url =
    `${MAL.authorize}?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&code_challenge=${verifier}&code_challenge_method=plain` +
    `&state=${nonce}&redirect_uri=${encodeURIComponent(redirect)}`;

  const responseUrl = await launch(url);
  const query = new URLSearchParams((responseUrl.split('?')[1] || '').split('#')[0]);
  if (query.get('state') !== nonce) throw new Error('State de OAuth no coincide (posible CSRF).');
  const code = query.get('code');
  if (!code) throw new Error('MyAnimeList no devolvió un code.');

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: redirect,
  });
  if (malSecret) body.set('client_secret', malSecret);

  const res = await fetch(MAL.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(json.message || json.error || 'Fallo al obtener token MAL.');
  await storage.setMalTokens(json);
  return true;
}

export async function refreshMal() {
  const { malRefresh } = await storage.get('malRefresh');
  if (!malRefresh) return false;
  const { mal: clientId, malSecret, malWorker } = await getClientIds();

  let json;
  if (malWorker) {
    // El Worker vuelve a usar el secret para renovar.
    const res = await fetch(`${malWorker}/mal/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: malRefresh }),
    });
    json = await res.json();
  } else {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: malRefresh,
    });
    if (malSecret) body.set('client_secret', malSecret);
    const res = await fetch(MAL.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    json = await res.json();
  }

  if (!json.access_token) {
    await storage.clearProvider('mal');
    return false;
  }
  await storage.setMalTokens(json);
  return true;
}

// Devuelve un access_token de MAL válido (renueva si está por expirar).
export async function ensureMalToken() {
  const { malToken, malExpires } = await storage.get(['malToken', 'malExpires']);
  if (!malToken) throw new Error('No autenticado en MyAnimeList.');
  // Renueva con 1 día de margen.
  if (malExpires && Date.now() > malExpires - 24 * 60 * 60 * 1000) {
    const ok = await refreshMal();
    if (!ok) throw new Error('La sesión de MyAnimeList expiró. Vuelve a conectar.');
    const { malToken: fresh } = await storage.get('malToken');
    return fresh;
  }
  return malToken;
}

export async function status() {
  const { anilistToken, malToken } = await storage.get(['anilistToken', 'malToken']);
  return { anilist: !!anilistToken, mal: !!malToken };
}

export async function logout(provider) {
  await storage.clearProvider(provider);
  return true;
}
