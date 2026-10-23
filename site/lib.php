<?php
$CONFIG = require __DIR__ . '/config.php';
date_default_timezone_set($CONFIG['timezone'] ?? 'Europe/Moscow');

const XTV_DATA   = __DIR__ . '/data/channel.json';
const XTV_VIDEOS = __DIR__ . '/videos';
const XTV_VIDEO_EXT = ['mp4', 'webm', 'm4v', 'mov'];

function xtv_default_channel(): array {
    return [
        'epoch' => time(),       // момент, с которого крутится плейлист
        'items' => [],           // [{file, title, duration}]
        'live'  => ['enabled' => false, 'url' => '', 'title' => 'Прямой эфир'],
    ];
}

function xtv_load(): array {
    if (!is_file(XTV_DATA)) return xtv_default_channel();
    $data = json_decode((string)file_get_contents(XTV_DATA), true);
    return is_array($data) ? array_replace_recursive(xtv_default_channel(), $data) : xtv_default_channel();
}

function xtv_save(array $data): bool {
    $tmp = XTV_DATA . '.tmp';
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    return file_put_contents($tmp, $json, LOCK_EX) !== false && rename($tmp, XTV_DATA);
}

function xtv_safe_name(string $name): string {
    $ext  = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $base = pathinfo($name, PATHINFO_FILENAME);
    $base = preg_replace('/[^A-Za-z0-9_-]+/', '_', $base);
    $base = trim($base, '_') ?: 'video';
    return substr($base, 0, 80) . '.' . $ext;
}

function xtv_video_files(): array {
    $out = [];
    foreach (scandir(XTV_VIDEOS) ?: [] as $f) {
        $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
        if ($f[0] !== '.' && in_array($ext, XTV_VIDEO_EXT, true)) {
            $out[] = ['file' => $f, 'size' => filesize(XTV_VIDEOS . '/' . $f)];
        }
    }
    return $out;
}

function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
