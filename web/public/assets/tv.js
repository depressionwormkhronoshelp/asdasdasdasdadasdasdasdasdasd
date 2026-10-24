// XTV — плеер «эфира». Все зрители видят одно и то же: позиция в плейлисте
// считается от времени (часы зрителя), а не от момента открытия страницы.
(function () {
  const $ = (id) => document.getElementById(id);
  const video = $('video'), msg = $('msg'), osd = $('osd'), bar = $('bar');
  const guideEl = $('guide'), clockEl = $('clock'), badge = $('badge');

  let data = null, dataKey = '';
  let clockOffset = 0;          // серверное время − локальное, мс
  let mode = null;              // 'live' | 'vod'
  let current = null;           // {index, start, src}
  let userPaused = false;
  let hls = null, liveRetryAt = 0;

  const now = () => (Date.now() + clockOffset) / 1000;
  const hhmm = (t) => new Date(t * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const show = (text) => { msg.textContent = text; msg.hidden = !text; };

  // Настройки канала приходят из Firestore (settings/channel) через chat.js
  window.XTV_setChannel = (ch) => {
    ch = ch || {};
    const live = ch.live && ch.live.enabled && ch.live.url ? { url: ch.live.url, title: ch.live.title || 'Прямой эфир' } : null;
    const json = {
      channel: ch.channel || 'XTV',
      epoch: +ch.epoch || 0,
      items: (Array.isArray(ch.items) ? ch.items : []).filter((i) => i && i.src && i.duration > 0),
      live,
    };
    const key = JSON.stringify([json.epoch, json.items, json.live]);
    if (key === dataKey) return;
    const sameLive = data && data.live && live && data.live.url === live.url && mode === 'live';
    data = json; dataKey = key;
    if (!sameLive) { current = null; mode = null; }
    else { osd.textContent = live.title; renderGuide(); }
    decide();
  };

  // Что сейчас должно идти по сетке
  function slotAt(t) {
    const items = data.items;
    const total = items.reduce((s, i) => s + i.duration, 0);
    if (!total) return null;
    let e = ((t - data.epoch) % total + total) % total;
    for (let i = 0; i < items.length; i++) {
      if (e < items[i].duration) return { index: i, pos: e, start: t - e };
      e -= items[i].duration;
    }
    return { index: 0, pos: 0, start: t };
  }

  function stopHls() { if (hls) { hls.destroy(); hls = null; } }

  function playSafe() {
    const p = video.play();
    if (p && p.catch) p.catch(() => {
      show('Нажми, чтобы смотреть эфир');
      msg.onclick = () => { msg.onclick = null; show(''); video.play(); };
    });
  }

  // ---------- Живой эфир (HLS) ----------
  // Эфир льётся с компа через обычный хостинг, поэтому связь может моргать.
  // Плеер не бросает эфир при первой ошибке: пишет «переподключаюсь» и пробует снова.
  // На записи уходим, только если эфир не поднимается дольше 30 сек (и записи есть).
  let liveDownSince = 0, reconnectTimer = null;

  // Ссылку из админки превращаем в плеер: .m3u8 играем сами, остальное встраиваем (VK, Twitch, YouTube)
  function liveSource(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.replace(/^(www|m)\./, '');
    if (/\.m3u8$/i.test(u.pathname) || /\/live\/playlist\.php$/.test(u.pathname)) return { hls: url };
    if (host === 'twitch.tv') return { embed: 'https://player.twitch.tv/?channel=' + encodeURIComponent(u.pathname.split('/')[1] || '') + '&parent=' + location.hostname + '&muted=true' };
    if (host === 'player.twitch.tv') { u.searchParams.set('parent', location.hostname); return { embed: u.href }; }
    if (host === 'youtube.com' && u.searchParams.get('v')) return { embed: 'https://www.youtube.com/embed/' + encodeURIComponent(u.searchParams.get('v')) + '?autoplay=1&mute=1' };
    if (host === 'youtube.com' && u.pathname.startsWith('/live/')) return { embed: 'https://www.youtube.com/embed/' + encodeURIComponent(u.pathname.split('/')[2]) + '?autoplay=1&mute=1' };
    if (host === 'youtu.be') return { embed: 'https://www.youtube.com/embed/' + encodeURIComponent(u.pathname.slice(1)) + '?autoplay=1&mute=1' };
    const vk = /^\/video(-?\d+)_(\d+)/.exec(u.pathname);
    if ((host === 'vk.com' || host === 'vkvideo.ru' || host === 'vk.ru') && vk) return { embed: 'https://vk.com/video_ext.php?oid=' + vk[1] + '&id=' + vk[2] + '&hd=2&autoplay=1' };
    return { embed: u.href };   // уже готовая embed-ссылка (video_ext.php, player.* и т.п.)
  }

  function setEmbed(src) {
    const f = $('liveFrame');
    if (src) { if (f.src !== src) f.src = src; f.hidden = false; video.hidden = true; $('screen').classList.add('is-embed'); }
    else { f.hidden = true; f.removeAttribute('src'); video.hidden = false; $('screen').classList.remove('is-embed'); }
  }

  function startLive() {
    mode = 'live'; current = null;
    badge.textContent = 'LIVE';
    osd.textContent = data.live.title;
    video.onloadedmetadata = null; video.onerror = null;
    const src = liveSource(data.live.url);
    if (src && src.embed) { stopHls(); video.removeAttribute('src'); video.load(); setEmbed(src.embed); show(''); }
    else if (src && src.hls) { setEmbed(null); connectLive(); }
    else { setEmbed(null); show('Неправильная ссылка на эфир'); }
    renderGuide();
  }

  function connectLive() {
    clearTimeout(reconnectTimer); reconnectTimer = null;
    stopHls();
    const url = liveSource(data.live.url).hls;
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({
        liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 8, maxLiveSyncPlaybackRate: 1.3,
        manifestLoadingMaxRetry: 4, levelLoadingMaxRetry: 8, fragLoadingMaxRetry: 8,
      });
      hls.on(Hls.Events.ERROR, (_, err) => {
        if (!err.fatal) return;
        if (err.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else liveTrouble();
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => { liveDownSince = 0; show(''); });
      hls.on(Hls.Events.MANIFEST_PARSED, () => playSafe());
      hls.loadSource(url);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.onerror = liveTrouble;
      video.onplaying = () => { liveDownSince = 0; show(''); };
      video.src = url;
      playSafe();
    } else {
      liveDownSince = 1; liveFallback();
    }
  }

  // Связь моргнула — переподключаемся через 3 сек
  function liveTrouble() {
    if (mode !== 'live') return;
    stopHls();
    if (!liveDownSince) liveDownSince = Date.now();
    if (Date.now() - liveDownSince > 30000 && data.items.length) return liveFallback();
    show('Связь с эфиром прервалась, переподключаюсь…');
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => { if (mode === 'live') connectLive(); }, 3000);
  }

  // Эфир долго не поднимается — крутим записи, через 20 сек пробуем снова
  function liveFallback() {
    clearTimeout(reconnectTimer); reconnectTimer = null;
    stopHls(); show('');
    liveDownSince = 0;
    liveRetryAt = Date.now() + 20000;
    startVod();
  }

  // ---------- Эфир из записей ----------
  function startVod() {
    mode = 'vod';
    setEmbed(null);
    badge.textContent = 'ЭФИР';
    tune(true);
  }

  function tune(force) {
    if (!data.items.length) { show('Эфир скоро начнётся'); current = null; renderGuide(); return; }
    const slot = slotAt(now());
    const item = data.items[slot.index];
    const same = current && current.index === slot.index && Math.abs(current.start - slot.start) < 1 && current.src === item.src;
    if (same && !force) {
      if (Math.abs(video.currentTime - slot.pos) > 3) video.currentTime = slot.pos;
      return;
    }
    current = { index: slot.index, start: slot.start, src: item.src };
    video.onerror = () => { show('Не удалось загрузить «' + item.title + '»'); setTimeout(() => tune(true), 5000); };
    video.src = item.src;
    video.onloadedmetadata = () => {
      // за время загрузки эфир ушёл вперёд — пересчитываем
      const s = slotAt(now());
      video.currentTime = s.index === current.index ? Math.min(s.pos, video.duration - 0.5) : 0;
      show(''); playSafe();
    };
    osd.textContent = item.title;
    osd.classList.add('show'); setTimeout(() => osd.classList.remove('show'), 4000);
    renderGuide();
  }

  function renderGuide() {
    const nowTitle = $('nowTitle');
    if (nowTitle) nowTitle.textContent = mode === 'live' ? data.live.title : (current ? data.items[current.index].title : 'Эфир скоро начнётся');
    if (!guideEl) return;
    guideEl.innerHTML = '';
    const add = (t, title, isNow) => {
      const li = document.createElement('li');
      if (isNow) li.className = 'now';
      const tm = document.createElement('time'); tm.textContent = t;
      li.append(tm, document.createTextNode(title));
      guideEl.append(li);
    };
    if (mode === 'live') { add('сейчас', data.live.title, true); return; }
    if (!data.items.length) { add('—', 'Программа пока пуста', false); return; }
    let slot = slotAt(now()), t = slot.start, i = slot.index;
    for (let n = 0; n < 10; n++) {
      const it = data.items[i];
      add(hhmm(t), it.title, n === 0);
      t += it.duration; i = (i + 1) % data.items.length;
    }
  }

  function decide() {
    const wantLive = !!data.live && Date.now() >= liveRetryAt;
    if (wantLive && mode !== 'live') startLive();
    else if (!wantLive && mode !== 'vod') { stopHls(); startVod(); }
  }

  // ---------- Управление ----------
  video.addEventListener('ended', () => { if (mode === 'vod') tune(true); });
  video.addEventListener('playing', () => { $('unmute').hidden = !video.muted; $('btnPlay').textContent = '⏸'; });
  video.addEventListener('pause', () => { $('btnPlay').textContent = '▶'; });
  video.addEventListener('volumechange', () => {
    $('btnMute').textContent = video.muted ? '🔇' : '🔊';
    $('unmute').hidden = !video.muted;
  });

  $('unmute').onclick = () => { video.muted = false; video.volume = +$('vol').value; };
  $('btnMute').onclick = () => { video.muted = !video.muted; };
  $('vol').oninput = (e) => { video.volume = +e.target.value; video.muted = false; };
  $('btnPlay').onclick = () => {
    if (video.paused) { goLive(); } else { userPaused = true; video.pause(); $('golive').hidden = false; }
  };
  $('golive').onclick = goLive;
  function goLive() {
    userPaused = false; $('golive').hidden = true;
    if (mode === 'vod') tune(true); else { if (hls) hls.startLoad(); playSafe(); }
  }
  $('btnFs').onclick = () => {
    const el = $('screen');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  };

  // ---------- Таймеры ----------
  setInterval(() => {
    if (clockEl) clockEl.textContent = new Date((now()) * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (mode === 'vod' && current) {
      const d = data.items[current.index].duration;
      bar.style.width = Math.min(100, (now() - current.start) / d * 100) + '%';
    } else bar.style.width = mode === 'live' ? '100%' : '0';
  }, 1000);

  setInterval(() => { if (mode === 'vod' && !userPaused && !video.seeking && video.readyState >= 2) tune(false); }, 15000);

  // Картинка в эфире замерла на 10 сек — переподключаемся
  let liveLastT = -1, liveStuck = 0;
  setInterval(() => {
    if (mode !== 'live' || userPaused || reconnectTimer || video.hidden) { liveStuck = 0; return; }
    liveStuck = video.currentTime === liveLastT ? liveStuck + 1 : 0;
    liveLastT = video.currentTime;
    if (liveStuck >= 10) { liveStuck = 0; liveTrouble(); }
  }, 1000);

  // Если настройки ещё не пришли — просто ждём chat.js
})();
