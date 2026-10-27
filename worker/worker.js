// AniHub — proxy OAuth para MyAnimeList (Cloudflare Worker).
//
// Mantiene el Client Secret de MAL en el servidor (igual que malsync.moe en
// MAL-Sync), para que la extensión publicada NUNCA lo lleve dentro. AniList no
// necesita proxy: usa implicit grant y no tiene secret.
//
// Rutas:
//   GET  /mal/callback  MAL redirige aquí con ?code&state. El Worker intercambia
//                       el code (client_id + client_secret + verifier PKCE) y
//                       reenvía (302) a la URL chromiumapp.org de la extensión
//                       con los tokens en el fragmento (#access_token=...).
//   POST /mal/refresh   { refresh_token } -> tokens nuevos en JSON (el secret se
//                       queda aquí).
//   GET  /              estado / info.
//
// Variables (ver wrangler.toml / README.md):
//   MAL_CLIENT_ID      (var)    Client ID de MAL (público).
//   MAL_CLIENT_SECRET  (secret) Client Secret de MAL -> `wrangler secret put`.

const MAL_TOKEN = 'https://myanimelist.net/v1/oauth2/token';

// Solo aceptamos reenviar a una URL chromiumapp.org real (ID de 32 letras a-p),
// para que el Worker no pueda usarse como "open redirect".
const CHROMIUMAPP = /^https:\/\/[a-p]{32}\.chromiumapp\.org\//;

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function redirectWithHash(base, params) {
  const frag = new URLSearchParams(params).toString();
  const sep = base.includes('#') ? '&' : '#';
  return Response.redirect(base + sep + frag, 302);
}

async function exchange(env, extra) {
  const body = new URLSearchParams({
    client_id: env.MAL_CLIENT_ID,
    client_secret: env.MAL_CLIENT_SECRET,
    ...extra,
  });
  const res = await fetch(MAL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return res.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request.headers.get('Origin')) });
    }

    // 1) Callback de OAuth: MAL -> Worker -> extensión.
    if (pathname === '/mal/callback' && request.method === 'GET') {
      let st;
      try {
        st = JSON.parse(b64urlDecode(url.searchParams.get('state') || ''));
      } catch {
        return new Response('Bad state', { status: 400 });
      }
      const finalRedirect = st.r; // https://<ext-id>.chromiumapp.org/
      if (!finalRedirect || !CHROMIUMAPP.test(finalRedirect)) {
        return new Response('Bad redirect', { status: 400 });
      }

      const err = url.searchParams.get('error');
      if (err) return redirectWithHash(finalRedirect, { error: err, state: st.n || '' });

      const code = url.searchParams.get('code');
      if (!code) return redirectWithHash(finalRedirect, { error: 'no_code', state: st.n || '' });

      const json = await exchange(env, {
        grant_type: 'authorization_code',
        code,
        code_verifier: st.v,
        redirect_uri: url.origin + '/mal/callback',
      });
      if (!json.access_token) {
        return redirectWithHash(finalRedirect, {
          error: json.error || 'exchange_failed',
          state: st.n || '',
        });
      }
      return redirectWithHash(finalRedirect, {
        access_token: json.access_token,
        refresh_token: json.refresh_token || '',
        expires_in: String(json.expires_in || ''),
        token_type: json.token_type || 'Bearer',
        state: st.n || '',
      });
    }

    // 2) Refresh: la extensión manda el refresh_token; el secret se queda aquí.
    if (pathname === '/mal/refresh' && request.method === 'POST') {
      const origin = request.headers.get('Origin');
      let refresh_token = '';
      try {
        ({ refresh_token } = await request.json());
      } catch {
        // cuerpo inválido -> refresh_token queda vacío
      }
      if (!refresh_token) {
        return new Response(JSON.stringify({ error: 'missing_refresh_token' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }
      const json = await exchange(env, { grant_type: 'refresh_token', refresh_token });
      return new Response(JSON.stringify(json), {
        status: json.access_token ? 200 : 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    if (pathname === '/') {
      return new Response('AniHub OAuth proxy is running.', {
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
