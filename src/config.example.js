// PLANTILLA. Copia este archivo como `config.js` (en la misma carpeta) y rellena
// DEFAULT_CLIENT_IDS con las credenciales de TUS apps de AniList y MyAnimeList.
//
//   cp src/config.example.js src/config.js   (o cópialo a mano)
//
// `config.js` está en .gitignore: NUNCA se sube al repositorio, así el Client
// Secret de MAL no queda expuesto. El usuario final no toca nada de esto: el
// desarrollador pone aquí las credenciales y distribuye la extensión; el usuario
// solo pulsa "Connect".
//
// Registra tus apps (ver README) usando como Redirect URL el que muestra la
// extensión (depende de la "key" del manifest, que fija el ID).

export const ANILIST = {
  authorize: 'https://anilist.co/api/v2/oauth/authorize',
  graphql: 'https://graphql.anilist.co',
};

export const MAL = {
  authorize: 'https://myanimelist.net/v1/oauth2/authorize',
  token: 'https://myanimelist.net/v1/oauth2/token',
  api: 'https://api.myanimelist.net/v2',
};

// Credenciales de las apps (las pone el desarrollador, NO el usuario final).
//
// Para MAL hay dos modos (elige uno):
//  A) PUBLICAR (recomendado): despliega el Worker de `worker/` y pon su URL en
//     `malWorker`; deja `malSecret` vacío. El secret vive en el Worker y NO
//     viaja en la extensión.
//  B) DEV local: deja `malWorker` vacío y pon `malSecret`. El secret quedará
//     embebido en la build (no publiques así).
export const DEFAULT_CLIENT_IDS = {
  anilist: '', // AniList Client ID (público, numérico)
  mal: '', // MyAnimeList Client ID
  malSecret: '', // MAL Client Secret — solo en modo B (dev local)
  malWorker: '', // modo A: 'https://anihub-oauth.TU-SUBDOMINIO.workers.dev' (sin barra final)
};

// Estados canónicos internos (vocabulario neutral).
export const STATUS = {
  WATCHING: 'WATCHING',
  PLANNING: 'PLANNING',
  COMPLETED: 'COMPLETED',
  DROPPED: 'DROPPED',
  PAUSED: 'PAUSED',
  REPEATING: 'REPEATING',
};
