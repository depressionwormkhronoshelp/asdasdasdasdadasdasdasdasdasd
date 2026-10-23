// XTV — вход через Google и чат на Firebase (проект xtvv-b5221).
// Эти ключи не секретные: они всегда видны в браузере, защиту дают правила Firestore.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, addDoc, setDoc, getDoc, deleteDoc, serverTimestamp, query, orderBy, limitToLast, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyB7G0trSrDXhKcLV_6P2iI66jqXVmqN54Q',
  authDomain: 'xtvv-b5221.firebaseapp.com',
  projectId: 'xtvv-b5221',
  storageBucket: 'xtvv-b5221.firebasestorage.app',
  messagingSenderId: '276384524372',
  appId: '1:276384524372:web:5acc051f878528e54565c1',
});
const auth = getAuth(app);
const db = getFirestore(app);
const messages = collection(db, 'messages');

const $ = (id) => document.getElementById(id);
const btn = $('authBtn'), list = $('chatList'), form = $('chatForm'), input = $('chatInput');
let user = null, lastSent = 0, isAdmin = false, lastDocs = [], unsubBans = null;

async function login() {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    sys(e.code === 'auth/unauthorized-domain'
      ? 'Вход пока выключен: в Firebase не добавлен домен ' + location.hostname
      : 'Не получилось войти: ' + e.code);
  }
}

btn.hidden = false;
btn.onclick = () => {
  if (!user) login();
  else if (confirm('Выйти из аккаунта ' + (user.displayName || '') + '?')) signOut(auth);
};
form.onclick = () => { if (!user) login(); };

onAuthStateChanged(auth, (u) => {
  user = u;
  checkAdmin();
  btn.textContent = '';
  if (u) {
    if (safeUrl(u.photoURL)) { const img = document.createElement('img'); img.src = u.photoURL; img.alt = ''; img.referrerPolicy = 'no-referrer'; btn.append(img); }
    btn.append(document.createTextNode(u.displayName || 'Профиль'));
    input.readOnly = false;
  } else {
    btn.textContent = 'Войти через Google';
    input.readOnly = true;
  }
});

form.onsubmit = async (e) => {
  e.preventDefault();
  const text = input.value.trim().slice(0, 300);
  if (!user || !text) return;
  if (Date.now() - lastSent < 2000) return;          // без флуда
  lastSent = Date.now();
  input.value = '';
  try {
    await addDoc(messages, {
      uid: user.uid,
      name: (user.displayName || 'Зритель').slice(0, 40),
      photo: safeUrl(user.photoURL) ? user.photoURL.slice(0, 500) : '',
      text,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    input.value = text;
    sys(err.code === 'permission-denied' ? 'Ты забанен в чате' : 'Сообщение не отправилось: ' + err.code);
  }
};

function safeUrl(u) { return typeof u === 'string' && u.startsWith('https://'); }

function sys(text) {
  const li = document.createElement('li');
  const s = document.createElement('span'); s.className = 'sys'; s.textContent = text;
  li.append(s); list.append(li); list.scrollTop = list.scrollHeight;
}

function render(docs) {
  lastDocs = docs;
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  list.textContent = '';
  if (!docs.length) sys('Тут пока тихо. Напиши первым!');
  for (const d of docs) {
    const m = d.data();
    const li = document.createElement('li');
    const ava = document.createElement(safeUrl(m.photo) ? 'img' : 'span');
    ava.className = 'ava';
    if (safeUrl(m.photo)) { ava.src = m.photo; ava.alt = ''; ava.referrerPolicy = 'no-referrer'; ava.loading = 'lazy'; }
    const body = document.createElement('div');
    const nick = document.createElement('div'); nick.className = 'nick'; nick.textContent = m.name || 'Зритель';
    const text = document.createElement('div'); text.className = 'text'; text.textContent = m.text || '';
    body.append(nick, text);
    li.append(ava, body);
    if (isAdmin) li.append(modButtons(d.id, m));
    list.append(li);
  }
  if (atBottom) list.scrollTop = list.scrollHeight;
}

onSnapshot(query(messages, orderBy('createdAt'), limitToLast(100)),
  (snap) => render(snap.docs),
  (err) => sys(err.code === 'permission-denied' ? 'Чат пока закрыт: в Firebase не опубликованы правила' : 'Чат не отвечает (' + err.code + ')'));

// ---------- Админка ----------
// Админ = документ admins/<почта> в Firestore (создаётся вручную в консоли Firebase).
const adminBtn = $('adminBtn'), panel = $('adminPanel');
const apMsg = (t) => { $('apMsg').textContent = t || ''; };

async function checkAdmin() {
  let ok = false;
  if (user && user.email) {
    try { ok = (await getDoc(doc(db, 'admins', user.email.toLowerCase()))).exists(); } catch (e) { ok = false; }
  }
  if (ok === isAdmin) return;
  isAdmin = ok;
  adminBtn.hidden = !ok;
  if (!ok) { panel.hidden = true; if (unsubBans) { unsubBans(); unsubBans = null; } }
  else watchBans();
  render(lastDocs);
}

async function api(action, data = {}) {
  const body = new FormData();
  body.append('action', action);
  body.append('token', await user.getIdToken());
  for (const [k, v] of Object.entries(data)) body.append(k, v);
  const res = await fetch('admin_api.php', { method: 'POST', body });
  const json = await res.json().catch(() => ({ error: 'HTTP ' + res.status }));
  if (!res.ok || json.error) throw new Error(json.error || 'HTTP ' + res.status);
  return json;
}

adminBtn.onclick = async () => {
  panel.hidden = !panel.hidden;
  if (panel.hidden) return;
  apMsg('Загружаю…'); $('apKey').hidden = true;
  try {
    const st = await api('state');
    $('apLive').checked = !!st.live.enabled;
    $('apTitle').value = st.live.title || '';
    $('apKeyHint').textContent = st.key_hint ? 'Сейчас ключ заканчивается на ' + st.key_hint : 'Ключ не задан, приём эфира выключен';
    apMsg('');
  } catch (e) { apMsg('Ошибка: ' + e.message); }
};
$('apClose').onclick = () => { panel.hidden = true; };

$('apSaveLive').onclick = async () => {
  apMsg('Сохраняю…');
  try {
    await api('save_live', { enabled: $('apLive').checked ? '1' : '0', title: $('apTitle').value });
    apMsg('Сохранено. Зрители увидят изменения в течение 10 сек.');
  } catch (e) { apMsg('Ошибка: ' + e.message); }
};

function showKey(key, note) {
  const el = $('apKey'); el.textContent = key; el.hidden = false;
  $('apKeyHint').textContent = 'Сейчас ключ заканчивается на …' + key.slice(-4);
  apMsg(note);
}
$('apShowKey').onclick = async () => {
  try { showKey((await api('show_key')).key, 'Никому не показывай этот ключ.'); } catch (e) { apMsg('Ошибка: ' + e.message); }
};
$('apNewKey').onclick = async () => {
  if (!confirm('Сделать новый ключ? Старый сразу перестанет работать, его надо будет заменить в push.ps1 у всех, кто стримит.')) return;
  try { showKey((await api('new_key')).key, 'Готово. Впиши этот ключ в push.ps1 ($Key = \'…\') и перезапусти start-live.bat.'); }
  catch (e) { apMsg('Ошибка: ' + e.message); }
};

function modButtons(id, m) {
  const box = document.createElement('div'); box.className = 'mod';
  const del = document.createElement('button'); del.textContent = 'удалить'; del.title = 'Удалить сообщение';
  del.onclick = () => deleteDoc(doc(db, 'messages', id)).catch((e) => sys('Не удалилось: ' + e.code));
  box.append(del);
  if (m.uid && (!user || m.uid !== user.uid)) {
    const ban = document.createElement('button'); ban.textContent = 'бан'; ban.title = 'Забанить в чате';
    ban.onclick = () => {
      if (!confirm('Забанить ' + (m.name || 'пользователя') + ' в чате?')) return;
      setDoc(doc(db, 'bans', m.uid), { name: (m.name || '').slice(0, 40), at: serverTimestamp() })
        .then(() => sys((m.name || 'Пользователь') + ' забанен'))
        .catch((e) => sys('Не получилось забанить: ' + e.code));
    };
    box.append(ban);
  }
  return box;
}

function watchBans() {
  if (unsubBans) return;
  const ul = $('apBans');
  unsubBans = onSnapshot(collection(db, 'bans'), (snap) => {
    ul.textContent = '';
    if (snap.empty) { const li = document.createElement('li'); li.textContent = 'Никто не забанен'; ul.append(li); }
    snap.forEach((d) => {
      const li = document.createElement('li');
      const name = document.createElement('span'); name.textContent = d.data().name || d.id;
      const un = document.createElement('button'); un.textContent = 'разбанить';
      un.onclick = () => deleteDoc(doc(db, 'bans', d.id)).catch((e) => apMsg('Ошибка: ' + e.code));
      li.append(name, un); ul.append(li);
    });
  }, (e) => { ul.textContent = 'Не читается: ' + e.code; });
}
