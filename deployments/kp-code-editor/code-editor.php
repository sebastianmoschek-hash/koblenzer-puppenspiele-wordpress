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
if (strtolower((string)($_SERVER['HTTP_HOST'] ?? '')) !== 'neu.koblenzer-puppenspiele.de') code_fail(403, 'Nur auf der Testseite verfügbar.');
if (!current_admin_username()) code_fail(401, 'Admin-Anmeldung erforderlich.');
$root = realpath(dirname(__DIR__));
if (!$root || basename($root) !== 'neu') code_fail(500, 'Testverzeichnis nicht erkannt.');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && ($_GET['action'] ?? '') === 'session') {\n  if (empty($_SESSION['studio_csrf'])) $_SESSION['studio_csrf'] = bin2hex(random_bytes(32));\n  echo json_encode(['ok'=>true,'csrf'=>$_SESSION['studio_csrf']]); exit;\n}\n$allowed = ['modern.html', 'kp-inline.css', 'kp-inline.js'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
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
if (!is_string($content) || strlen($content) > 1000000 || str_contains($content, "\0") || !preg_match('/^[a-f0-9]{64}$/', $expected)) code_fail(400, 'Ungültige Datei.');
if ($content === '') code_fail(400, 'Leere Datei nicht erlaubt.');
$lockPath = $root . '/.kp-code-editor.lock';
$lock = fopen($lockPath, 'c');
if (!$lock || !flock($lock, LOCK_EX)) code_fail(503, 'Datei gerade gesperrt.');
$current = file_get_contents($file);
if ($current === false) code_fail(500, 'Lesen fehlgeschlagen.');
$sha = hash('sha256', $current);
if (!hash_equals($sha, $expected)) code_fail(409, 'Datei wurde inzwischen geändert. Neu laden.');
$proposedSha = hash('sha256', $content);
if ($action === 'preview') {
  flock($lock, LOCK_UN); fclose($lock);
  echo json_encode(['ok'=>true,'file'=>$path,'beforeSha256'=>$sha,'afterSha256'=>$proposedSha,'beforeBytes'=>strlen($current),'afterBytes'=>strlen($content)]);
  exit;
}
$backupDir = dirname($root) . '/.koblenzer-studio/code-history';
if (!is_dir($backupDir) && !mkdir($backupDir, 0700, true) && !is_dir($backupDir)) code_fail(500, 'Sicherung nicht möglich.');
$backup = $backupDir . '/' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '-' . $path;
if (file_put_contents($backup, $current, LOCK_EX) !== strlen($current)) code_fail(500, 'Sicherung fehlgeschlagen.');
chmod($backup, 0600);
$tmp = tempnam($root, '.kp-code-');
if (!$tmp || file_put_contents($tmp, $content, LOCK_EX) !== strlen($content)) code_fail(500, 'Schreiben fehlgeschlagen.');
chmod($tmp, fileperms($file) & 0777);
if (!rename($tmp, $file)) { @unlink($tmp); code_fail(500, 'Veröffentlichen fehlgeschlagen.'); }
flock($lock, LOCK_UN); fclose($lock);
echo json_encode(['ok'=>true,'file'=>$path,'sha256'=>$proposedSha,'backup'=>basename($backup)]);
