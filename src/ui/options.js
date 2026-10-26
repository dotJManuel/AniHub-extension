import { send } from './api.js';

const $ = (s) => document.querySelector(s);

function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => (t.className = 'toast' + (isErr ? ' err' : '')), 3000);
}

async function refreshStatus() {
  const st = await send('STATUS');
  $('#pill-ani').className = 'pill ' + (st.anilist ? 'on' : 'off');
  $('#pill-mal').className = 'pill ' + (st.mal ? 'on' : 'off');
  $('#st-ani').textContent = st.anilist ? 'Connected' : 'Not connected';
  $('#st-mal').textContent = st.mal ? 'Connected' : 'Not connected';
  return st;
}

async function connect(cmd, label) {
  $('#auth-msg').textContent = `Opening ${label} login…`;
  try {
    await send(cmd);
    $('#auth-msg').textContent = `${label} connected ✓`;
    await refreshStatus();
  } catch (e) {
    $('#auth-msg').textContent = '';
    toast(e.message, true);
  }
}

$('#login-ani').onclick = () => connect('LOGIN_ANILIST', 'AniList');
$('#login-mal').onclick = () => connect('LOGIN_MAL', 'MyAnimeList');
$('#logout-ani').onclick = async () => { await send('LOGOUT', { provider: 'anilist' }); await refreshStatus(); };
$('#logout-mal').onclick = async () => { await send('LOGOUT', { provider: 'mal' }); await refreshStatus(); };

refreshStatus();
