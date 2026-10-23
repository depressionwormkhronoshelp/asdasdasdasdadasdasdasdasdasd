<?php
// Действия админ-панели на главной странице. Доступ: вход через Google + документ admins/<почта> в Firestore.
require __DIR__ . '/lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'POST only'], 405);
$admin = xtv_google_admin((string)($_POST['token'] ?? ''));
if (!$admin) out(['error' => 'not admin'], 403);

$base = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '') . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\') . '/';
$ch = xtv_load();
$action = (string)($_POST['action'] ?? '');

if ($action === 'state') {
    $key = xtv_push_key();
    $m3u8 = __DIR__ . '/live/stream/index.m3u8';
    out([
        'admin'      => $admin,
        'live'       => $ch['live'],
        'key_hint'   => $key === '' ? '' : '…' . substr($key, -4),
        'viewers'    => xtv_viewers(false),
        'stream_age' => is_file($m3u8) ? time() - filemtime($m3u8) : null,
        'items'      => count($ch['items']),
    ]);
}

if ($action === 'save_live') {
    $ch['live']['enabled'] = ($_POST['enabled'] ?? '') === '1';
    $ch['live']['title'] = mb_substr(trim((string)($_POST['title'] ?? '')) ?: 'Прямой эфир', 0, 200);
    if ($ch['live']['url'] === '') $ch['live']['url'] = $base . 'live/playlist.php';
    if (!xtv_save($ch)) out(['error' => 'Не получилось записать data/channel.json'], 500);
    out(['ok' => true, 'live' => $ch['live']]);
}

// Сетка записей начнётся с первого ролика прямо сейчас
if ($action === 'restart_schedule') {
    $ch['epoch'] = time();
    if (!xtv_save($ch)) out(['error' => 'Не получилось записать data/channel.json'], 500);
    out(['ok' => true]);
}

// Сбросить зависший эфир: удалить залитые куски, зрители сразу вернутся к записям
if ($action === 'stop_stream') {
    foreach (glob(__DIR__ . '/live/stream/{index.m3u8,seg_*.ts}', GLOB_BRACE) ?: [] as $f) @unlink($f);
    out(['ok' => true]);
}

if ($action === 'show_key') out(['key' => xtv_push_key()]);

if ($action === 'new_key') {
    $key = bin2hex(random_bytes(16));
    if (!xtv_set_push_key($key)) out(['error' => 'Не получилось записать data/secrets.json'], 500);
    out(['key' => $key]);
}

out(['error' => 'unknown action'], 400);
