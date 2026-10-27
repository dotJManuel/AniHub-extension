# AniHub OAuth proxy (MyAnimeList)

Cloudflare Worker que hace el intercambio de token de MyAnimeList **en el
servidor**, para que el **Client Secret nunca viaje dentro de la extensión**
(mismo patrón que `malsync.moe` en MAL-Sync). AniList no lo usa: su implicit
grant no tiene secret.

Ventajas:

- El secret vive cifrado en Cloudflare, no en la build que distribuyes.
- El Redirect URL que registras en MAL es **fijo** (la URL del Worker), así que
  no se rompe aunque el ID de la extensión cambie al publicarla en la store.

---

## Requisitos

- Cuenta de Cloudflare (plan gratis sirve).
- Node.js y `npm`.
- Wrangler: `npm install -g wrangler` (o usa `npx wrangler ...`).

## Despliegue

```bash
cd worker
wrangler login
```

1. Pon tu **MAL Client ID** en `wrangler.toml` (`MAL_CLIENT_ID`).
2. Guarda el **Client Secret** como secreto (no se sube a ningún repo):

```bash
wrangler secret put MAL_CLIENT_SECRET
```

3. Publica:

```bash
wrangler deploy
```

Wrangler te dará una URL tipo `https://anihub-oauth.TU-SUBDOMINIO.workers.dev`.

## Conectar con MAL y con la extensión

1. En <https://myanimelist.net/apiconfig>, en tu app, pon **App Redirect URL**:

   ```
   https://anihub-oauth.TU-SUBDOMINIO.workers.dev/mal/callback
   ```

2. En `src/config.js` de la extensión, rellena:

   ```js
   export const DEFAULT_CLIENT_IDS = {
     anilist: '55009',
     mal: 'TU_MAL_CLIENT_ID',
     malWorker: 'https://anihub-oauth.TU-SUBDOMINIO.workers.dev', // sin barra final
     // malSecret ya NO hace falta aquí: vive en el Worker.
   };
   ```

3. En `manifest.json`, asegúrate de que `host_permissions` incluye el dominio del
   Worker (por defecto está `https://*.workers.dev/*`; si usas dominio propio,
   añádelo).

Con `malWorker` definido, la extensión usa el proxy automáticamente. Si lo dejas
vacío, vuelve al flujo directo con `malSecret` (útil para desarrollo local).

## Prueba rápida

Abrir `https://anihub-oauth.TU-SUBDOMINIO.workers.dev/` debe responder
`AniHub OAuth proxy is running.`

## Desarrollo local

```bash
# crea worker/.dev.vars (gitignored) con:
#   MAL_CLIENT_SECRET=...
wrangler dev
```
