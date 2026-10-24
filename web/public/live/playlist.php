<?php
// Отдаёт плейлист прямого эфира без кэша (статику nginx на хостинге может закэшировать).
$file = __DIR__ . '/stream/index.m3u8';
header('Content-Type: application/vnd.apple.mpegurl');
header('Cache-Control: no-cache, no-store, must-revalidate');
if (!is_file($file) || time() - filemtime($file) > 30) { http_response_code(404); exit; }
// Куски лежат в stream/, а плейлист отдаётся из live/.
// Кусок не долетел до хостинга — помечаем его пропуском (EXT-X-GAP), плеер его перескочит.
echo preg_replace_callback('/^(seg_\d+\.ts)\r?$/m', function ($m) {
    $gap = is_file(__DIR__ . '/stream/' . $m[1]) ? '' : "#EXT-X-GAP\n";
    return $gap . 'stream/' . $m[1];
}, (string)file_get_contents($file));
