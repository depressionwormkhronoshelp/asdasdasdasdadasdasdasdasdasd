<?php
require __DIR__ . '/lib.php';
// ?embed=1 — только плеер, без сетки (для вставки в iframe)
$embed = isset($_GET['embed']);
?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h($CONFIG['channel_name']) ?> — эфир</title>
<link rel="stylesheet" href="assets/tv.css">
</head>
<body class="<?= $embed ? 'embed' : '' ?>">
<main class="tv">
  <?php if (!$embed): ?>
  <header class="tv-head">
    <div class="logo"><?= h($CONFIG['channel_name']) ?></div>
    <div class="clock" id="clock">--:--</div>
  </header>
  <?php endif; ?>

  <div class="screen" id="screen">
    <video id="video" playsinline muted preload="auto"></video>
    <div class="bug"><span class="dot"></span><span id="badge">ЭФИР</span></div>
    <div class="osd" id="osd"></div>
    <div class="msg" id="msg">Подключаемся к эфиру…</div>
    <button class="unmute" id="unmute" hidden>🔊 Включить звук</button>
    <button class="golive" id="golive" hidden>⟳ Вернуться в эфир</button>
    <div class="controls">
      <button id="btnPlay" title="Пауза">⏸</button>
      <button id="btnMute" title="Звук">🔇</button>
      <input id="vol" type="range" min="0" max="1" step="0.05" value="1" aria-label="Громкость">
      <span class="spacer"></span>
      <button id="btnFs" title="Во весь экран">⛶</button>
    </div>
    <div class="progress"><div id="bar"></div></div>
  </div>

  <?php if (!$embed): ?>
  <section class="guide">
    <h2>Программа передач</h2>
    <ol id="guide"></ol>
  </section>
  <?php endif; ?>
</main>
<script src="assets/hls.min.js"></script>
<script src="assets/tv.js"></script>
</body>
</html>
