<?php
// XTV на Render / Hugging Face: встроенный сервер PHP + этот роутер.
// Запуск: php -S 0.0.0.0:$PORT -t public router.php
$root = __DIR__ . '/public';
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
if (strpos($path, '..') !== false || preg_match('~/\.~', $path)) { http_response_code(404); return true; }

// Приём и раздача прямого эфира
if ($path === '/live/ingest.php' || $path === '/live/playlist.php') { require $root . $path; return true; }
if (substr($path, -4) === '.php') { http_response_code(404); return true; }

if (preg_match('~^/live/stream/seg_\d+\.ts$~', $path)) {
    $file = $root . $path;
    if (!is_file($file)) { http_response_code(404); return true; }
    header('Content-Type: video/mp2t');
    header('Cache-Control: public, max-age=60');
    header('Content-Length: ' . filesize($file));
    readfile($file);
    return true;
}

// Записи: отдаём кусками (Range), иначе плеер не перемотает ролик на нужное место эфира
if (preg_match('~^/videos/[^/]+$~', $path)) {
    $file = $root . $path;
    if (!is_file($file)) { http_response_code(404); return true; }
    $types = ['mp4' => 'video/mp4', 'm4v' => 'video/mp4', 'webm' => 'video/webm', 'mov' => 'video/quicktime'];
    $size = filesize($file);
    $start = 0; $end = $size - 1;
    header('Accept-Ranges: bytes');
    header('Content-Type: ' . ($types[strtolower(pathinfo($file, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
    if (preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'] ?? '', $m)) {
        if ($m[1] === '') { $start = max(0, $size - (int)$m[2]); }
        else { $start = (int)$m[1]; if ($m[2] !== '') $end = min((int)$m[2], $end); }
        if ($start > $end) { http_response_code(416); header("Content-Range: bytes */$size"); return true; }
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    }
    header('Content-Length: ' . ($end - $start + 1));
    $h = fopen($file, 'rb');
    fseek($h, $start);
    $left = $end - $start + 1;
    while ($left > 0 && !feof($h)) {
        $chunk = fread($h, min(1 << 20, $left));
        echo $chunk; flush();
        $left -= strlen($chunk);
    }
    fclose($h);
    return true;
}

if ($path === '/' || $path === '/index.html') header('Cache-Control: no-cache');
return false;   // остальное (assets, index.html) — обычная статика
