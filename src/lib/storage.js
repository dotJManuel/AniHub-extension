// Wrapper fino sobre chrome.storage.local.
// Tokens se guardan en claves de primer nivel; preferencias en `settings`.

export function get(keys) {
  return chrome.storage.local.get(keys);
}

export function set(obj) {
  return chrome.storage.local.set(obj);
}

export function remove(keys) {
  return chrome.storage.local.remove(keys);
}

export async function getSettings() {
  const { settings } = await get('settings');
  return settings || {};
}

export async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await set({ settings: next });
  return next;
}

// Tokens -----------------------------------------------------------------

export async function getTokens() {
  return get(['anilistToken', 'malToken', 'malRefresh', 'malExpires']);
}

export async function setAnilistToken(token) {
  await set({ anilistToken: token });
}

export async function setMalTokens({ access_token, refresh_token, expires_in }) {
  await set({
    malToken: access_token,
    malRefresh: refresh_token,
    malExpires: Date.now() + (Number(expires_in) || 0) * 1000,
  });
}

export async function clearProvider(provider) {
  if (provider === 'anilist') {
    await remove(['anilistToken', 'anilistUser']);
  } else if (provider === 'mal') {
    await remove(['malToken', 'malRefresh', 'malExpires']);
  }
}
