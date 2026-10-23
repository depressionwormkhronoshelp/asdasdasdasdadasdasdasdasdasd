<?php
// Публичное API для плеера: серверное время + сетка + настройки живого эфира
require __DIR__ . '/lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$ch = xtv_load();
// Эфир, который заливается на этот же хостинг (live/playlist.php): если куски
// перестали приходить, считаем, что эфира нет, и плеер вернётся к записям.
$live = $ch['live']['enabled'] && $ch['live']['url'] !== '' ? $ch['live'] : null;
if ($live && strpos($live['url'], 'live/playlist.php') !== false) {
    $m3u8 = __DIR__ . '/live/stream/index.m3u8';
    if (!is_file($m3u8) || time() - filemtime($m3u8) > 30) $live = null;
}

$items = array_values(array_filter($ch['items'], fn($i) => ($i['duration'] ?? 0) > 0));

echo json_encode([
    'now'     => microtime(true),
    'channel' => $CONFIG['channel_name'],
    'epoch'   => (float)$ch['epoch'],
    'items'   => array_map(fn($i) => [
        'title'    => $i['title'],
        'src'      => 'videos/' . rawurlencode($i['file']),
        'duration' => (float)$i['duration'],
    ], $items),
    'live'    => $live ? ['url' => $live['url'], 'title' => $live['title']] : null,
    'viewers' => xtv_viewers(true),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
