<?php
// Приём кусков прямого эфира с компа стримера (скрипт push.ps1).
// Ключ: из админ-панели (data/secrets.json) или config.php → live_push_key. Пустой = приём выключен.
require __DIR__ . '/../lib.php';
header('Content-Type: text/plain; charset=utf-8');

$key = xtv_push_key();
if ($key === '' || !hash_equals($key, (string)($_POST['key'] ?? ''))) { http_response_code(403); exit('bad key'); }

$f = $_FILES['file'] ?? null;
if (!$f || $f['error'] !== UPLOAD_ERR_OK) { http_response_code(400); exit('no file, code ' . ($f['error'] ?? '?')); }

$name = basename((string)$f['name']);
if (!preg_match('/^(index\.m3u8|seg_\d{1,20}\.ts)$/', $name)) { http_response_code(400); exit('bad name'); }

$dir = __DIR__ . '/stream';
if (!is_dir($dir)) mkdir($dir, 0755, true);
$tmp = $dir . '/.' . $name . '.part';
if (!move_uploaded_file($f['tmp_name'], $tmp) || !rename($tmp, $dir . '/' . $name)) { http_response_code(500); exit('cannot write'); }

// Старые куски больше не нужны
foreach (glob($dir . '/seg_*.ts') ?: [] as $old) {
    if (time() - filemtime($old) > 120) @unlink($old);
}
echo 'ok';
