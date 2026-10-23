// XTV — вход через Google и чат на Firebase (проект xtvv-b5221).
// Эти ключи не секретные: они всегда видны в браузере, защиту дают правила Firestore.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, writeBatch, serverTimestamp, query, where, orderBy, limit, limitToLast, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
let chatSettings = { locked: false, slow: 0, pinned: '' };

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
  if (chatSettings.locked && !isAdmin) return sys('Чат закрыт админом');
  const wait = Math.max(2, isAdmin ? 0 : chatSettings.slow) * 1000 - (Date.now() - lastSent);
  if (wait > 0) return sys('Медленный режим: подожди ещё ' + Math.ceil(wait / 1000) + ' сек');
  lastSent = Date.now();
  input.value = '';
  // сообщение и отметка «когда писал» уходят вместе: так правила Firestore проверяют медленный режим
  const batch = writeBatch(db);
  const msg = {
    uid: user.uid,
    name: (user.displayName || 'Зритель').slice(0, 40),
    photo: safeUrl(user.photoURL) ? user.photoURL.slice(0, 500) : '',
    text,
    createdAt: serverTimestamp(),
  };
  if (isAdmin) msg.admin = true;
  batch.set(doc(messages), msg);
  batch.set(doc(db, 'last', user.uid), { at: serverTimestamp() });
  try { await batch.commit(); }
  catch (err) {
    input.value = text;
    sys(err.code !== 'permission-denied' ? 'Сообщение не отправилось: ' + err.code
      : chatSettings.locked ? 'Чат закрыт админом'
      : chatSettings.slow ? 'Медленный режим: подожди немного' : 'Ты забанен в чате');
  }
};

onSnapshot(doc(db, 'settings', 'chat'), (d) => {
  chatSettings = Object.assign({ locked: false, slow: 0, pinned: '' }, d.exists() ? d.data() : {});
  const pin = $('chatPin');
  pin.textContent = chatSettings.pinned || '';
  pin.hidden = !chatSettings.pinned;
  input.placeholder = chatSettings.locked ? 'Чат закрыт' : chatSettings.slow ? 'Поле ввода · раз в ' + chatSettings.slow + ' сек' : 'Поле ввода';
}, () => {});

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
    const nick = document.createElement('div'); nick.className = 'nick';
    const name = document.createElement('span'); name.className = 'name'; name.textContent = m.name || 'Зритель';
    nick.append(name);
    if (m.admin === true) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'админ'; nick.append(b); }
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
    const age = st.stream_age;
    $('apStatus').textContent = 'Зрителей: ' + st.viewers + ' · Эфир с компа: '
      + (age === null ? 'не идёт' : age <= 30 ? 'идёт ✅' : 'молчит ' + fmtAge(age))
      + ' · Роликов в сетке: ' + st.items;
    $('apLocked').checked = !!chatSettings.locked;
    $('apSlow').value = String(chatSettings.slow || 0);
    $('apPinned').value = chatSettings.pinned || '';
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
        .then(() => deleteAll(query(messages, where('uid', '==', m.uid), limit(400))))
        .then((n) => sys((m.name || 'Пользователь') + ' забанен, удалено сообщений: ' + n))
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

function fmtAge(s) { return s < 120 ? s + ' сек' : s < 7200 ? Math.round(s / 60) + ' мин' : Math.round(s / 3600) + ' ч'; }

$('apStopStream').onclick = async () => {
  if (!confirm('Сбросить эфир? Залитые куски удалятся, зрители вернутся к записям. Если push.ps1 ещё работает, эфир снова появится.')) return;
  try { await api('stop_stream'); apMsg('Эфир сброшен.'); } catch (e) { apMsg('Ошибка: ' + e.message); }
};

$('apRestart').onclick = async () => {
  if (!confirm('Запустить сетку записей с первого ролика прямо сейчас?')) return;
  try { await api('restart_schedule'); apMsg('Сетка начата заново.'); } catch (e) { apMsg('Ошибка: ' + e.message); }
};

$('apSaveChat').onclick = async () => {
  try {
    await setDoc(doc(db, 'settings', 'chat'), {
      locked: $('apLocked').checked,
      slow: parseInt($('apSlow').value, 10) || 0,
      pinned: $('apPinned').value.trim().slice(0, 200),
    });
    apMsg('Настройки чата сохранены.');
  } catch (e) { apMsg('Ошибка: ' + e.code); }
};

async function deleteAll(q) {
  let n = 0;
  for (;;) {
    const snap = await getDocs(q);
    if (snap.empty) return n;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    n += snap.size;
    if (snap.size < 400) return n;
  }
}

$('apClearChat').onclick = async () => {
  if (!confirm('Удалить ВСЕ сообщения в чате? Это не отменить.')) return;
  apMsg('Удаляю…');
  try { apMsg('Удалено сообщений: ' + await deleteAll(query(messages, limit(400)))); }
  catch (e) { apMsg('Ошибка: ' + e.code); }
};
