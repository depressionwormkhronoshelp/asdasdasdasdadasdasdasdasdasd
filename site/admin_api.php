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
    out(['admin' => $admin, 'live' => $ch['live'], 'key_hint' => $key === '' ? '' : '…' . substr($key, -4)]);
}

if ($action === 'save_live') {
    $ch['live']['enabled'] = ($_POST['enabled'] ?? '') === '1';
    $ch['live']['title'] = mb_substr(trim((string)($_POST['title'] ?? '')) ?: 'Прямой эфир', 0, 200);
    if ($ch['live']['url'] === '') $ch['live']['url'] = $base . 'live/playlist.php';
    if (!xtv_save($ch)) out(['error' => 'Не получилось записать data/channel.json'], 500);
    out(['ok' => true, 'live' => $ch['live']]);
}

if ($action === 'show_key') out(['key' => xtv_push_key()]);

if ($action === 'new_key') {
    $key = bin2hex(random_bytes(16));
    if (!xtv_set_push_key($key)) out(['error' => 'Не получилось записать data/secrets.json'], 500);
    out(['key' => $key]);
}

out(['error' => 'unknown action'], 400);
