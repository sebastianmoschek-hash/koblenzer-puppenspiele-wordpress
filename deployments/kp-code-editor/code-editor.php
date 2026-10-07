<?php
declare(strict_types=1);
require_once __DIR__ . '/auth.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
function code_fail(int $status, string $message): never {
  http_response_code($status);
  echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
  exit;
}
if (strtolower((string)($_SERVER['HTTP_HOST'] ?? '')) !== 'neu.koblenzer-puppenspiele.de'
    || empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') code_fail(403, 'Nur auf der HTTPS-Testseite verfügbar.');
if (!current_admin_username()) code_fail(401, 'Admin-Anmeldung erforderlich.');
$root = realpath(dirname(__DIR__));
if (!$root || basename($root) !== 'neu') code_fail(500, 'Testverzeichnis nicht erkannt.');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && ($_GET['action'] ?? '') === 'session') {
  if (empty($_SESSION['studio_csrf'])) $_SESSION['studio_csrf'] = bin2hex(random_bytes(32));
  echo json_encode(['ok'=>true,'csrf'=>$_SESSION['studio_csrf']]); exit;
}
$allowed = ['modern.html', 'kp-inline.css', 'kp-inline.js'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
// Only the staging tree. The site's .htaccess denies direct .bak requests.
$backupDir = $root . '/api/data/code-history';
$path = (string)($method === 'GET' ? ($_GET['file'] ?? '') : '');
if ($method === 'POST') {
  if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 1200000) code_fail(413, 'Datei zu groß.');
  $body = json_decode((string)file_get_contents('php://input'), true);
  if (!is_array($body)) code_fail(400, 'Ungültige Anfrage.');
  $path = (string)($body['file'] ?? '');
}
if (!in_array($path, $allowed, true)) code_fail(400, 'Datei nicht freigegeben.');
$file = realpath($root . '/' . $path);
if (!$file || dirname($file) !== $root || !is_file($file)) code_fail(404, 'Datei nicht vorhanden.');
if ($method === 'GET') {
  if (($_GET['action'] ?? '') === 'history') {
    $history = [];
    foreach (glob($backupDir . '/*-' . $path . '.bak') ?: [] as $item) {
      $name = basename($item);
      if (preg_match('/^\\d{8}-\\d{6}-[a-f0-9]{12}-' . preg_quote($path, '/') . '\\.bak$/', $name) && is_file($item)) $history[] = $name;
    }
    rsort($history, SORT_STRING);
    echo json_encode(['file'=>$path, 'history'=>array_slice($history, 0, 10)]); exit;
  }
  if (($_GET['action'] ?? '') === 'backup') {
    $name = (string)($_GET['backup'] ?? '');
    if (!preg_match('/^\\d{8}-\\d{6}-[a-f0-9]{12}-' . preg_quote($path, '/') . '\\.bak$/', $name)) code_fail(400, 'Ungültige Sicherung.');
    $candidate = realpath($backupDir . '/' . $name);
    if (!$candidate || dirname($candidate) !== realpath($backupDir) || !is_file($candidate)) code_fail(404, 'Sicherung nicht vorhanden.');
    $saved = file_get_contents($candidate);
    if ($saved === false) code_fail(500, 'Sicherung nicht lesbar.');
    echo json_encode(['file'=>$path,'backup'=>$name,'content'=>$saved], JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE); exit;
  }
  $source = file_get_contents($file);
  if ($source === false) code_fail(500, 'Lesen fehlgeschlagen.');
  echo json_encode(['file'=>$path,'sha256'=>hash('sha256',$source),'content'=>$source], JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);
  exit;
}
if ($method !== 'POST') code_fail(405, 'Methode nicht erlaubt.');
if (empty($_SESSION['studio_csrf']) || !hash_equals((string)$_SESSION['studio_csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) code_fail(403, 'Sitzung erneuern.');
$action = (string)($body['action'] ?? '');
if (!in_array($action, ['preview','publish'], true)) code_fail(400, 'Unbekannte Aktion.');
$content = $body['content'] ?? null;
$expected = (string)($body['expectedSha256'] ?? '');
if (!preg_match('/^[a-f0-9]{64}$/', $expected)) code_fail(400, 'Ungültiger Versionsstand.');
if (!is_string($content) || strlen($content) > 1000000 || str_contains($content, "\0") || $content === '') code_fail(400, 'Ungültige Datei.');
$lockPath = $root . '/.kp-code-editor.lock';
$lock = fopen($lockPath, 'c');
if (!$lock || !flock($lock, LOCK_EX)) code_fail(503, 'Datei gerade gesperrt.');
$current = file_get_contents($file);
if ($current === false) code_fail(500, 'Lesen fehlgeschlagen.');
$sha = hash('sha256', $current);
if (!hash_equals($sha, $expected)) code_fail(409, 'Datei wurde inzwischen geändert. Neu laden.');
$proposedSha = hash('sha256', $content);
if ($action === 'preview') {
  $_SESSION['kp_code_preview'] = ['file'=>$path,'before'=>$sha,'after'=>$proposedSha,'until'=>time()+900];
  flock($lock, LOCK_UN); fclose($lock);
  echo json_encode(['ok'=>true,'file'=>$path,'beforeSha256'=>$sha,'afterSha256'=>$proposedSha,'beforeBytes'=>strlen($current),'afterBytes'=>strlen($content)]);
  exit;
}
if ($action === 'publish') {
  $preview = $_SESSION['kp_code_preview'] ?? [];
  if (($preview['file'] ?? '') !== $path || ($preview['before'] ?? '') !== $sha
      || ($preview['after'] ?? '') !== $proposedSha || ($preview['until'] ?? 0) < time())
    code_fail(409, 'Änderung zuerst erneut prüfen.');
}
if (!is_dir($backupDir) && !mkdir($backupDir, 0700, true) && !is_dir($backupDir)) code_fail(500, 'Sicherung nicht möglich.');
$backup = $backupDir . '/' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '-' . $path . '.bak';
if (file_put_contents($backup, $current, LOCK_EX) !== strlen($current)) code_fail(500, 'Sicherung fehlgeschlagen.');
chmod($backup, 0600);
$tmp = tempnam($root, '.kp-code-');
if (!$tmp || file_put_contents($tmp, $content, LOCK_EX) !== strlen($content)) code_fail(500, 'Schreiben fehlgeschlagen.');
chmod($tmp, fileperms($file) & 0777);
if (!rename($tmp, $file)) { @unlink($tmp); code_fail(500, 'Veröffentlichen fehlgeschlagen.'); }
unset($_SESSION['kp_code_preview']);
flock($lock, LOCK_UN); fclose($lock);
echo json_encode(['ok'=>true,'file'=>$path,'sha256'=>$proposedSha,'backup'=>basename($backup)]);

