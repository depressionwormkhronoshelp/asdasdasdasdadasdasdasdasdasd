(function () {
  const $ = (id) => document.getElementById(id);
  const S = window.XTV;
  const CHUNK = 1.9 * 1024 * 1024; // меньше самого жёсткого лимита хостинга (2 МБ)
  let files = S.files;
  let items = S.items.map((i) => ({ ...i }));
  const durations = {}; // file -> секунды (из метаданных)
  items.forEach((i) => { if (i.duration) durations[i.file] = i.duration; });

  const fmt = (s) => {
    s = Math.round(s || 0);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
  };
  const mb = (b) => (b / 1048576).toFixed(1) + ' МБ';
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

  async function post(data, file) {
    const fd = new FormData();
    fd.append('csrf', S.csrf);
    for (const k in data) fd.append(k, data[k]);
    if (file) fd.append('chunk', file, 'chunk');
    const r = await fetch('admin.php', { method: 'POST', body: fd });
    let j; try { j = await r.json(); } catch (e) { throw new Error('Сервер ответил ошибкой ' + r.status); }
    if (!r.ok || j.error) throw new Error(j.error || r.status);
    return j;
  }

  // Длительность берём из самого видео прямо в браузере
  function probe(file) {
    if (durations[file]) return Promise.resolve(durations[file]);
    return new Promise((res) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { durations[file] = v.duration; res(v.duration); v.src = ''; };
      v.onerror = () => res(0);
      v.src = 'videos/' + encodeURIComponent(file);
    });
  }

  // ---------- Файлы ----------
  function renderFiles() {
    const t = $('files'); t.innerHTML = '';
    if (!files.length) { t.append(el('tr', {}, el('td', { className: 'muted', textContent: 'Пока пусто' }))); return; }
    files.forEach((f) => {
      const dur = el('td', { className: 'muted', textContent: durations[f.file] ? fmt(durations[f.file]) : '…' });
      probe(f.file).then((d) => { dur.textContent = d ? fmt(d) : 'не читается браузером'; });
      const add = el('button', { textContent: '+ в эфир', onclick: async () => {
        const d = await probe(f.file);
        if (!d) return alert('Браузер не может прочитать это видео. Перекодируй в mp4 (H.264).');
        items.push({ file: f.file, title: f.file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), duration: d });
        renderPlaylist();
      } });
      const del = el('button', { className: 'ghost', textContent: 'Удалить', onclick: async () => {
        if (!confirm('Удалить файл ' + f.file + ' с сервера?')) return;
        await post({ action: 'delete_file', file: f.file });
        files = files.filter((x) => x.file !== f.file);
        items = items.filter((x) => x.file !== f.file);
        renderFiles(); renderPlaylist();
      } });
      t.append(el('tr', {}, el('td', { textContent: f.file }), dur, el('td', { className: 'muted', textContent: mb(f.size) }), el('td', { className: 'act' }, add, del)));
    });
  }

  // ---------- Загрузка ----------
  async function upload(file) {
    const row = el('div', { className: 'up' });
    const bar = el('progress', { max: 100, value: 0 });
    const label = el('span', { textContent: file.name });
    row.append(label, bar); $('uploads').append(row);
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const total = Math.max(1, Math.ceil(file.size / CHUNK));
    try {
      let res;
      for (let i = 0; i < total; i++) {
        const blob = file.slice(i * CHUNK, (i + 1) * CHUNK);
        for (let attempt = 0; ; attempt++) {
          try { res = await post({ action: 'chunk', upload_id: id, index: i, total, name: file.name }, blob); break; }
          catch (e) { if (attempt >= 3) throw e; await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); }
        }
        bar.value = (i + 1) / total * 100;
      }
      files.push({ file: res.file, size: file.size });
      label.textContent = '✓ ' + res.file;
      setTimeout(() => row.remove(), 3000);
      renderFiles();
    } catch (e) {
      label.textContent = '✗ ' + file.name + ': ' + e.message;
      row.classList.add('err');
    }
  }
  async function uploadAll(list) { for (const f of list) await upload(f); }

  $('fileInput').onchange = (e) => { uploadAll([...e.target.files]); e.target.value = ''; };
  const drop = $('drop');
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); uploadAll([...e.dataTransfer.files]); };

  // ---------- Плейлист ----------
  function renderPlaylist() {
    const ol = $('playlist'); ol.innerHTML = '';
    items.forEach((it, idx) => {
      const title = el('input', { value: it.title, oninput: (e) => { it.title = e.target.value; } });
      const move = (d) => () => { const j = idx + d; if (j < 0 || j >= items.length) return; [items[idx], items[j]] = [items[j], items[idx]]; renderPlaylist(); };
      ol.append(el('li', {},
        title,
        el('span', { className: 'muted', textContent: fmt(it.duration) }),
        el('button', { className: 'ghost', textContent: '↑', title: 'Выше', onclick: move(-1) }),
        el('button', { className: 'ghost', textContent: '↓', title: 'Ниже', onclick: move(1) }),
        el('button', { className: 'ghost', textContent: '✕', title: 'Убрать из эфира', onclick: () => { items.splice(idx, 1); renderPlaylist(); } })
      ));
    });
    const sum = items.reduce((s, i) => s + (i.duration || 0), 0);
    $('total').textContent = items.length ? 'Роликов: ' + items.length + ', круг эфира: ' + fmt(sum) : 'Добавь ролики кнопкой «+ в эфир» выше.';
  }

  $('save').onclick = async () => {
    const m = $('saveMsg');
    const liveUrl = $('liveUrl').value.trim();
    if ($('liveOn').checked && location.protocol === 'https:' && /^http:/i.test(liveUrl)) {
      m.textContent = '✗ Сайт открыт по https, поэтому ссылка на поток тоже должна быть https://, иначе браузер её заблокирует.';
      return;
    }
    m.textContent = 'Сохраняю…';
    try {
      await post({ action: 'save', payload: JSON.stringify({
        items, restart: $('restart').checked,
        live: { enabled: $('liveOn').checked, url: $('liveUrl').value, title: $('liveTitle').value },
      }) });
      $('restart').checked = false;
      m.textContent = '✓ Сохранено. Зрители переключатся в течение минуты.';
    } catch (e) { m.textContent = '✗ ' + e.message; }
  };

  renderFiles(); renderPlaylist();
})();
