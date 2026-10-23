<?php
require __DIR__ . '/lib.php';
session_start();

function json_out($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
$authed = !empty($_SESSION['xtv_admin']);
$action = $_POST['action'] ?? '';

if ($action === 'login') {
    if (hash_equals((string)$CONFIG['admin_password'], (string)($_POST['password'] ?? ''))) {
        session_regenerate_id(true);
        $_SESSION['xtv_admin'] = true;
    } else {
        sleep(1);
        $loginError = 'Неверный пароль';
    }
    if (empty($loginError)) { header('Location: admin.php'); exit; }
}
if (($_GET['logout'] ?? '') !== '') { session_destroy(); header('Location: admin.php'); exit; }

// ---------- AJAX-действия админки ----------
if ($action !== '' && $action !== 'login') {
    if (!$authed) json_out(['error' => 'Нужно войти заново'], 401);
    if (!hash_equals($_SESSION['csrf'], (string)($_POST['csrf'] ?? ''))) json_out(['error' => 'csrf'], 403);

    if ($action === 'chunk') {
        // Загрузка кусками по несколько МБ — обходит лимит upload_max_filesize хостинга
        $id    = preg_replace('/[^a-z0-9]/', '', (string)($_POST['upload_id'] ?? ''));
        $index = (int)($_POST['index'] ?? -1);
        $total = (int)($_POST['total'] ?? 0);
        $name  = xtv_safe_name((string)($_POST['name'] ?? ''));
        $ext   = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if ($id === '' || $index < 0 || $total < 1 || !in_array($ext, XTV_VIDEO_EXT, true)) json_out(['error' => 'Неподходящий файл (нужен mp4/webm)'], 400);
        if (empty($_FILES['chunk']) || $_FILES['chunk']['error'] !== UPLOAD_ERR_OK) json_out(['error' => 'Кусок не дошёл, код ' . ($_FILES['chunk']['error'] ?? '?')], 400);

        $part = XTV_VIDEOS . '/.part-' . $id;
        if ($index === 0 && is_file($part)) unlink($part);
        $in = fopen($_FILES['chunk']['tmp_name'], 'rb');
        $out = fopen($part, 'ab');
        stream_copy_to_stream($in, $out);
        fclose($in); fclose($out);

        if ($index === $total - 1) {
            $final = $name; $n = 1;
            while (is_file(XTV_VIDEOS . '/' . $final)) {
                $final = pathinfo($name, PATHINFO_FILENAME) . '-' . (++$n) . '.' . $ext;
            }
            rename($part, XTV_VIDEOS . '/' . $final);
            json_out(['done' => true, 'file' => $final]);
        }
        json_out(['ok' => true]);
    }

    if ($action === 'delete_file') {
        $f = basename((string)($_POST['file'] ?? ''));
        $p = XTV_VIDEOS . '/' . $f;
        if ($f !== '' && $f[0] !== '.' && is_file($p)) unlink($p);
        $ch = xtv_load();
        $ch['items'] = array_values(array_filter($ch['items'], fn($i) => $i['file'] !== $f));
        xtv_save($ch);
        json_out(['ok' => true]);
    }

    if ($action === 'save') {
        $in = json_decode((string)($_POST['payload'] ?? ''), true);
        if (!is_array($in)) json_out(['error' => 'bad payload'], 400);
        $ch = xtv_load();
        $items = [];
        foreach ($in['items'] ?? [] as $i) {
            $f = basename((string)($i['file'] ?? ''));
            if ($f === '' || !is_file(XTV_VIDEOS . '/' . $f)) continue;
            $items[] = [
                'file'     => $f,
                'title'    => mb_substr(trim((string)($i['title'] ?? '')) ?: $f, 0, 200),
                'duration' => max(0, round((float)($i['duration'] ?? 0), 2)),
            ];
        }
        $ch['items'] = $items;
        $url = trim((string)($in['live']['url'] ?? ''));
        if ($url !== '' && !preg_match('~^https?://~i', $url)) json_out(['error' => 'Ссылка на поток должна начинаться с http(s)://'], 400);
        if (!empty($in['live']['enabled']) && $url === '') json_out(['error' => 'Включён прямой эфир, но ссылка на поток пустая'], 400);
        $ch['live'] = [
            'enabled' => !empty($in['live']['enabled']),
            'url'     => $url,
            'title'   => mb_substr(trim((string)($in['live']['title'] ?? '')) ?: 'Прямой эфир', 0, 200),
        ];
        if (!empty($in['restart'])) $ch['epoch'] = time();
        if (!xtv_save($ch)) json_out(['error' => 'Не получилось записать data/channel.json — проверь права на папку data'], 500);
        json_out(['ok' => true]);
    }
    json_out(['error' => 'unknown action'], 400);
}

$ch = xtv_load();
$files = xtv_video_files();
$base = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'example.ru') . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\') . '/';
?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Админка <?= h($CONFIG['channel_name']) ?></title>
<link rel="stylesheet" href="assets/admin.css">
</head>
<body>
<?php if (!$authed): ?>
  <form class="login card" method="post">
    <h1><?= h($CONFIG['channel_name']) ?> · админка</h1>
    <?php if (!empty($loginError)): ?><p class="err"><?= h($loginError) ?></p><?php endif; ?>
    <input type="hidden" name="action" value="login">
    <input type="password" name="password" placeholder="Пароль" autofocus required>
    <button>Войти</button>
  </form>
<?php else: ?>
<main class="wrap">
  <header class="top">
    <h1><?= h($CONFIG['channel_name']) ?> · админка</h1>
    <nav><a href="./" target="_blank">Смотреть эфир ↗</a> · <a href="?logout=1">Выйти</a></nav>
  </header>

  <?php if ($CONFIG['admin_password'] === 'change-me-123'): ?>
    <p class="warn">⚠️ Пароль стандартный. Поменяй его в <code>config.php</code>.</p>
  <?php endif; ?>

  <section class="card">
    <h2>1. Видео на сервере</h2>
    <p class="hint">Лучше всего mp4 (H.264 + AAC). Большие файлы грузятся кусками, лимит хостинга не мешает. Можно и закинуть по FTP в папку <code>videos/</code>.</p>
    <label class="drop" id="drop">
      <input type="file" id="fileInput" accept="video/mp4,video/webm,.mp4,.webm,.m4v,.mov" multiple hidden>
      Перетащи видео сюда или <u>выбери файлы</u>
    </label>
    <div id="uploads"></div>
    <table class="list" id="files"></table>
  </section>

  <section class="card">
    <h2>2. Сетка эфира</h2>
    <p class="hint">Ролики идут по кругу в этом порядке. Все зрители видят одно и то же место, как по телику.</p>
    <ol class="playlist" id="playlist"></ol>
    <p class="muted" id="total"></p>
    <label class="chk"><input type="checkbox" id="restart"> Начать эфир с первого ролика прямо сейчас</label>
  </section>

  <section class="card">
    <h2>3. Прямой эфир (по желанию)</h2>
    <p class="hint">Если есть HLS-поток (.m3u8) — например из OBS через VK Видео, Restream или свой сервер — он пойдёт вместо записей. Упал поток — автоматически вернутся записи.</p>
    <label class="chk"><input type="checkbox" id="liveOn" <?= $ch['live']['enabled'] ? 'checked' : '' ?>> Включить прямой эфир</label>
    <p class="hint">Стримишь с компа через <code>push/start-live.bat</code>? Тогда ссылка такая: <code><?= h($base) ?>live/playlist.php</code></p>
    <input type="url" id="liveUrl" placeholder="https://…/stream.m3u8" value="<?= h($ch['live']['url']) ?>">
    <input type="text" id="liveTitle" placeholder="Название передачи" value="<?= h($ch['live']['title']) ?>">
  </section>

  <div class="savebar"><button id="save">Сохранить эфир</button><span id="saveMsg"></span></div>

  <section class="card">
    <h2>4. Вставить на сайт</h2>
    <p class="hint">Скопируй этот код в любую страницу сайта:</p>
    <textarea readonly rows="3" onclick="this.select()"><div style="position:relative;aspect-ratio:16/9"><iframe src="<?= h($base) ?>?embed=1" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="autoplay; fullscreen" allowfullscreen></iframe></div></textarea>
    <p class="hint">Или просто дай ссылку: <a href="<?= h($base) ?>" target="_blank"><?= h($base) ?></a></p>
  </section>
</main>
<script>
window.XTV = <?= json_encode([
    'csrf'  => $_SESSION['csrf'],
    'files' => $files,
    'items' => $ch['items'],
], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;
</script>
<script src="assets/admin.js"></script>
<?php endif; ?>
</body>
</html>
