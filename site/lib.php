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

// ---------- Ключ эфира и админы через Google ----------
const XTV_SECRETS = __DIR__ . '/data/secrets.json';
const XTV_FIREBASE_PROJECT = 'xtvv-b5221';

// Ключ, сгенерированный в админ-панели, важнее ключа из config.php
function xtv_push_key(): string {
    global $CONFIG;
    $s = is_file(XTV_SECRETS) ? json_decode((string)file_get_contents(XTV_SECRETS), true) : null;
    if (is_array($s) && !empty($s['live_push_key'])) return (string)$s['live_push_key'];
    return (string)($CONFIG['live_push_key'] ?? '');
}

function xtv_set_push_key(string $key): bool {
    $s = is_file(XTV_SECRETS) ? (json_decode((string)file_get_contents(XTV_SECRETS), true) ?: []) : [];
    $s['live_push_key'] = $key;
    $tmp = XTV_SECRETS . '.tmp';
    return file_put_contents($tmp, json_encode($s), LOCK_EX) !== false && rename($tmp, XTV_SECRETS);
}

// Возвращает почту, если токен Firebase принадлежит админу, иначе null.
// Подпись токена проверяет сам Firestore: документ admins/<почта> по правилам
// отдаётся только владельцу этой почты.
function xtv_google_admin(string $token): ?string {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    $payload = json_decode((string)base64_decode(strtr($parts[1], '-_', '+/')), true);
    $email = strtolower((string)($payload['email'] ?? ''));
    if ($email === '' || ($payload['aud'] ?? '') !== XTV_FIREBASE_PROJECT) return null;
    $url = 'https://firestore.googleapis.com/v1/projects/' . XTV_FIREBASE_PROJECT
         . '/databases/(default)/documents/admins/' . rawurlencode($email);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,
    ]);
    curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code === 200 ? $email : null;
}

// ---------- Счётчик зрителей ----------
// Зритель = браузер, который спрашивал api.php последние 35 сек (храним только хэш IP+браузера).
const XTV_VIEWERS = __DIR__ . '/data/viewers.json';

function xtv_viewers(bool $touch): int {
    $fp = @fopen(XTV_VIEWERS, 'c+');
    if (!$fp) return 0;
    flock($fp, LOCK_EX);
    $v = json_decode((string)stream_get_contents($fp), true) ?: [];
    $now = time();
    foreach ($v as $k => $t) if ($now - $t > 35) unset($v[$k]);
    if ($touch) {
        $id = substr(hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . ($_SERVER['HTTP_USER_AGENT'] ?? '')), 0, 16);
        $v[$id] = $now;
        ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($v));
    }
    flock($fp, LOCK_UN); fclose($fp);
    return count($v);
}
