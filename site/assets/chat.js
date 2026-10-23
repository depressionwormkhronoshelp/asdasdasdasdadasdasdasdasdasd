// XTV — вход через Google и чат на Firebase (проект xtvv-b5221).
// Эти ключи не секретные: они всегда видны в браузере, защиту дают правила Firestore.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, limitToLast, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
let user = null, lastSent = 0;

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
  } catch (err) { input.value = text; sys('Сообщение не отправилось: ' + err.code); }
};

function safeUrl(u) { return typeof u === 'string' && u.startsWith('https://'); }

function sys(text) {
  const li = document.createElement('li');
  const s = document.createElement('span'); s.className = 'sys'; s.textContent = text;
  li.append(s); list.append(li); list.scrollTop = list.scrollHeight;
}

function render(docs) {
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
    list.append(li);
  }
  if (atBottom) list.scrollTop = list.scrollHeight;
}

onSnapshot(query(messages, orderBy('createdAt'), limitToLast(100)),
  (snap) => render(snap.docs),
  (err) => sys(err.code === 'permission-denied' ? 'Чат пока закрыт: в Firebase не опубликованы правила' : 'Чат не отвечает (' + err.code + ')'));
