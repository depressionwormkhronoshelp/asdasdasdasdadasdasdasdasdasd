<?php
require __DIR__ . '/lib.php';
// ?embed=1 — только плеер, без чата и сетки (для вставки в iframe)
$embed = isset($_GET['embed']);
// ?v=время файла — браузер сразу берёт новую версию после обновления сайта
$v = fn($f) => $f . '?v=' . @filemtime(__DIR__ . '/' . $f);
?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h($CONFIG['channel_name']) ?> — эфир</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;500;600&family=Manrope:wght@400;600;700&display=swap">
<link rel="stylesheet" href="<?= $v('assets/tv.css') ?>">
</head>
<body class="<?= $embed ? 'embed' : '' ?>">
<?php if (!$embed): ?>
<header class="top">
  <div class="logo"><?= h($CONFIG['channel_name']) ?></div>
  <div class="top-right">
    <button class="pill" id="authBtn" hidden>Войти через Google</button>
    <button class="pill" id="adminBtn" hidden>Админ</button>
  </div>
</header>

<div class="admin-panel" id="adminPanel" hidden>
  <div class="ap-head"><b>Админ-панель</b><button class="ap-x" id="apClose" title="Закрыть">✕</button></div>
  <section>
    <h3>Сейчас</h3>
    <p class="ap-hint" id="apStatus">…</p>
  </section>
  <section>
    <h3>Прямой эфир</h3>
    <label class="ap-check"><input type="checkbox" id="apLive"> Эфир включён</label>
    <input class="ap-input" id="apTitle" maxlength="200" placeholder="Название передачи">
    <div class="ap-row">
      <button class="ap-btn" id="apSaveLive">Сохранить</button>
      <button class="ap-btn danger" id="apStopStream">Сбросить эфир</button>
    </div>
  </section>
  <section>
    <h3>Чат</h3>
    <label class="ap-check"><input type="checkbox" id="apLocked"> Чат закрыт (писать могут только админы)</label>
    <label class="ap-check">Медленный режим
      <select class="ap-select" id="apSlow">
        <option value="0">выкл</option><option value="5">5 сек</option><option value="10">10 сек</option>
        <option value="30">30 сек</option><option value="60">1 мин</option><option value="300">5 мин</option>
      </select>
    </label>
    <input class="ap-input" id="apPinned" maxlength="200" placeholder="Закреп сверху чата (пусто = нет)">
    <div class="ap-row">
      <button class="ap-btn" id="apSaveChat">Сохранить</button>
      <button class="ap-btn danger" id="apClearChat">Очистить чат</button>
    </div>
  </section>
  <section>
    <h3>Ключ для push.ps1</h3>
    <p class="ap-hint" id="apKeyHint"></p>
    <code class="ap-key" id="apKey" hidden></code>
    <div class="ap-row">
      <button class="ap-btn" id="apShowKey">Показать</button>
      <button class="ap-btn danger" id="apNewKey">Новый ключ</button>
    </div>
  </section>
  <section>
    <h3>Баны в чате</h3>
    <ul class="ap-bans" id="apBans"></ul>
  </section>
  <section>
    <h3>Видео и сетка</h3>
    <div class="ap-row">
      <button class="ap-btn" id="apRestart">Сетку с начала</button>
      <a class="ap-btn" href="admin.php" target="_blank">Админка видео ↗</a>
    </div>
  </section>
  <p class="ap-msg" id="apMsg"></p>
</div>
<?php endif; ?>

<main class="layout">
  <div class="stage">
    <div class="screen" id="screen">
      <video id="video" playsinline muted preload="auto"></video>
      <div class="bug"><span class="dot"></span><span id="badge">ЭФИР</span><span id="viewers"></span></div>
      <div class="osd" id="osd"></div>
      <div class="msg" id="msg">Подключаемся к эфиру…</div>
      <button class="unmute" id="unmute" hidden>🔊 Включить звук</button>
      <button class="golive" id="golive" hidden>⟳ Вернуться в эфир</button>
      <div class="controls">
        <button id="btnPlay" title="Пауза">⏸</button>
        <button id="btnMute" title="Звук">🔇</button>
        <input id="vol" type="range" min="0" max="1" step="0.05" value="1" aria-label="Громкость">
        <span class="spacer"></span>
        <span class="clock" id="clock">--:--</span>
        <button id="btnFs" title="Во весь экран">⛶</button>
      </div>
      <div class="progress"><div id="bar"></div></div>
    </div>

    <?php if (!$embed): ?>
    <section class="info">
      <h1 id="nowTitle">&nbsp;</h1>
      <p class="label">Передачи:</p>
      <ol id="guide"></ol>
    </section>
    <?php endif; ?>
  </div>

  <?php if (!$embed): ?>
  <aside class="chat" id="chat">
    <div class="chat-pin" id="chatPin" hidden></div>
    <ul class="chat-list" id="chatList"></ul>
    <form class="chat-form" id="chatForm" autocomplete="off">
      <input id="chatInput" maxlength="300" placeholder="Поле ввода" readonly>
    </form>
    <p class="chat-err" id="chatErr" hidden></p>
  </aside>
  <?php endif; ?>
</main>
<script src="<?= $v('assets/hls.min.js') ?>"></script>
<script src="<?= $v('assets/tv.js') ?>"></script>
<?php if (!$embed): ?><script type="module" src="<?= $v('assets/chat.js') ?>"></script><?php endif; ?>
</body>
</html>
