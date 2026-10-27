# AniHub — tracker MyAnimeList + AniList

Extensión de navegador (Manifest V3, para Chrome/Edge) que conecta tus cuentas de
**MyAnimeList** y **AniList** y te deja ver y actualizar tu progreso desde un solo
lugar.

- Dos pestañas (una por sitio) con tu lista **actual** en cuadrícula de pósters:
  anime (viendo) y manga (leyendo), separadas por estado de emisión.
- Botón **+1 / −1** que guarda el progreso **solo en el servicio de la pestaña**.
- **Detalle** dentro de la extensión: score, ranking, estado, episodios, sinopsis,
  géneros, estudios, **personajes** y **enlaces de streaming/externos** (en MAL vía
  la API no oficial Jikan).
- Edición de **My List**: estado, score, progreso y fechas de inicio/fin.
- Indicador de **atraso** (⏳) en animes en emisión (AniList).
- **Notificaciones** de AniList.

> Cada servicio es independiente: la extensión **no mezcla** datos entre MAL y
> AniList ni sincroniza de uno a otro.

---

## Para el usuario final

No tienes que registrar nada ni poner ninguna clave. Solo:

1. Instala la extensión (ver *Instalación*).
2. Abre sus **Opciones** y pulsa **Connect** en MyAnimeList y/o AniList.
3. Inicia sesión con tu cuenta en la ventana que se abre (si ya tienes sesión en
   el navegador, solo autoriza).
4. ¡Listo! Abre el popup y usa tus listas.

---

## Instalación

1. Descarga/clona el proyecto.
2. Abre `chrome://extensions` (o `edge://extensions`) y activa **Modo de desarrollador**.
3. **Cargar descomprimida / Load unpacked** → selecciona la carpeta con `manifest.json`.

> Si clonaste el repositorio, antes necesitas crear `src/config.js` (ver abajo);
> de lo contrario la extensión no cargará.

---

## Para el desarrollador (configurar las credenciales)

Las credenciales de las apps viven **en código**, en `src/config.js`, que está en
`.gitignore` y **no se sube** al repositorio. El repo solo incluye la plantilla
`src/config.example.js`.

### 1. Crea tu `config.js`

```bash
cp src/config.example.js src/config.js
```

### 2. Registra las apps y pega sus credenciales en `config.js`

El **Redirect URL** lo fija la `key` del manifest (el ID de la extensión es fijo).
Con la `key` incluida en este repo, el Redirect URL es:

```
https://ndknemiipkmnopdklkgojkdbgnpjpgdj.chromiumapp.org/
```

> Si generas tu propia `key`, ese ID (y por tanto el Redirect URL) cambia; cárgala
> sin empaquetar y mira el ID en `chrome://extensions`.

**AniList** — <https://anilist.co> → Settings → Developer → *Create New Client*:
- Redirect URL: el de arriba.
- Copia el **Client ID** (numérico) → `DEFAULT_CLIENT_IDS.anilist`.

**MyAnimeList** — <https://myanimelist.net/apiconfig> → *Create ID*:
- App Type: `web`. Homepage URL: cualquiera válida.
- **App Redirect URL**: depende del modo de MAL (ver abajo).
- Copia el **Client ID** → `DEFAULT_CLIENT_IDS.mal`.

MAL **exige un Client Secret** en el intercambio de token (incluso con PKCE). Hay
dos formas de manejarlo:

**Modo A — con proxy (recomendado para publicar).** Un Cloudflare Worker hace el
intercambio y guarda el secret en el servidor, así **nunca viaja en la
extensión** (igual que `malsync.moe` en MAL-Sync). Pasos en
[`worker/README.md`](worker/README.md). Resumen:
- Despliega el Worker; obtienes una URL `https://anihub-oauth.<sub>.workers.dev`.
- **App Redirect URL** en MAL = `https://anihub-oauth.<sub>.workers.dev/mal/callback`.
- En `config.js`: `malWorker: 'https://anihub-oauth.<sub>.workers.dev'` y deja
  `malSecret` vacío.

**Modo B — directo (solo desarrollo local).** El secret va embebido en la build.
- **App Redirect URL** en MAL = el Redirect URL de la extensión (el de arriba).
- En `config.js`: `malSecret: '<tu secret>'` y deja `malWorker` vacío.

### 3. Carga la extensión y distribúyela

Una vez con `config.js` listo, cárgala sin empaquetar. Como el ID es fijo (por la
`key`), el mismo Redirect URL sirve en cualquier equipo, así que puedes empaquetar
y compartir la extensión y los usuarios solo tendrán que pulsar **Connect**.

> Para una versión pública usa el **Modo A**: el Client Secret no queda dentro de
> la build. En Modo B el secret es extraíble de la build; si se filtra, regéneralo
> en myanimelist.net/apiconfig. Nunca subas `config.js` al repo en ningún caso.

---

## Estructura

```
.
├─ manifest.json
├─ src/
│  ├─ background.js         # service worker: OAuth, fetch, mensajería
│  ├─ config.example.js     # plantilla de credenciales (se sube al repo)
│  ├─ config.js             # credenciales reales (gitignored, local)
│  ├─ lib/                  # auth, storage, model, service
│  ├─ providers/            # anilist.js (GraphQL) y mal.js (REST + Jikan)
│  └─ ui/                   # popup y options (HTML/JS/CSS)
├─ worker/                  # proxy OAuth de MAL (Cloudflare Worker, opcional)
└─ README.md
```

---

## Notas técnicas

- **AniList**: OAuth2 implicit grant (`chrome.identity.launchWebAuthFlow`) +
  GraphQL (`graphql.anilist.co`). El Client ID es público (no hay secret).
- **MyAnimeList**: OAuth2 authorization code + PKCE + API v2
  (`api.myanimelist.net`). Personajes/streaming/externos se obtienen de **Jikan**
  (`api.jikan.moe`) porque la API oficial de MAL no los expone.
- **Proxy de MAL** (opcional, `worker/`): Cloudflare Worker que hace el
  intercambio/refresh de token con el Client Secret del lado del servidor. La
  extensión lo usa si `malWorker` está definido; si no, va directo con `malSecret`.
- Tokens en `chrome.storage.local`.

## Seguridad

- `src/config.js` (con el Client Secret) está en `.gitignore`: nunca al repo.
- La clave privada de la `key` (`.pem`) debe quedar **fuera** del repositorio.

## Limitaciones

- Solo lista los estados "viendo"/"leyendo"; no gestiona el resto de listas.
- El indicador de atraso solo aplica a AniList (MAL no expone el episodio actual).
- Pensada para Chromium (MV3 + `chromiumapp.org`); Firefox requeriría ajustes.
