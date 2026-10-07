<?php
declare(strict_types=1);
require_once __DIR__ . '/auth.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
function ai_fail(int $status, string $message): never {
  http_response_code($status);
  echo json_encode(['error'=>$message], JSON_UNESCAPED_UNICODE);
  exit;
}
if (strtolower((string)($_SERVER['HTTP_HOST'] ?? '')) !== 'neu.koblenzer-puppenspiele.de'
    || empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') ai_fail(403, 'Nur auf der HTTPS-Testseite verfügbar.');
if (!current_admin_username()) ai_fail(401, 'Admin-Anmeldung erforderlich.');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') ai_fail(405, 'Methode nicht erlaubt.');
if (empty($_SESSION['studio_csrf']) || !hash_equals((string)$_SESSION['studio_csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) ai_fail(403, 'Sitzung erneuern.');
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 6000) ai_fail(413, 'Anfrage zu groß.');
$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body)) ai_fail(400, 'Ungültige Anfrage.');
// Private server storage: never write the credential into the website or repository.
$privateBase = realpath(sys_get_temp_dir());
$documentRoot = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
if (!$privateBase || !$documentRoot || $privateBase === $documentRoot || str_starts_with($privateBase . '/', $documentRoot . '/')) ai_fail(503, 'Privater Schlüsselspeicher nicht verfügbar.');
$privateDir = $privateBase . '/kp-ai-' . hash('sha256', __DIR__);
$keyFile = $privateDir . '/gemini-key';
$action = (string)($body['action'] ?? '');
if ($action === 'save-key') {
  $candidate = trim((string)($body['key'] ?? ''));
  if (!preg_match('/^[A-Za-z0-9_-]{20,200}$/', $candidate)) ai_fail(400, 'Schlüssel hat ein ungültiges Format.');
  if (is_link($privateDir) || is_link($keyFile)) ai_fail(503, 'Privater Speicher nicht verfügbar.');
  $oldMask = umask(0077);
  if (!is_dir($privateDir) && !mkdir($privateDir, 0700)) ai_fail(503, 'Privater Speicher kann nicht angelegt werden.');
  if (!chmod($privateDir, 0700)) ai_fail(503, 'Speicherrechte konnten nicht gesetzt werden.');
  $temporary = tempnam($privateDir, 'key-');
  if (!$temporary || file_put_contents($temporary, $candidate, LOCK_EX) !== strlen($candidate) || !chmod($temporary, 0600) || !rename($temporary, $keyFile)) {
    if ($temporary) @unlink($temporary);
    ai_fail(503, 'Schlüssel konnte nicht gespeichert werden.');
  }
  umask($oldMask);
  echo json_encode(['saved'=>true]);
  exit;
}
$file = (string)($body['file'] ?? '');
if (!in_array($file, ['modern.html','kp-inline.css','kp-inline.js'], true)) ai_fail(400, 'Datei nicht freigegeben.');
$prompt = trim((string)($body['prompt'] ?? ''));
if ($prompt === '' || mb_strlen($prompt) > 1800) ai_fail(400, 'Bitte einen kurzen Änderungswunsch eingeben.');
$root = realpath(dirname(__DIR__));
if (!$root || basename($root) !== 'neu') ai_fail(500, 'Testverzeichnis nicht erkannt.');
$path = realpath($root . '/' . $file);
if (!$path || dirname($path) !== $root) ai_fail(404, 'Datei nicht vorhanden.');
$original = file_get_contents($path);
if ($original === false || strlen($original) > 250000) ai_fail(413, 'Datei kann nicht als Ganzes verarbeitet werden.');
$key = getenv('GEMINI_API_KEY');
if (!$key && !is_link($privateDir) && !is_link($keyFile) && is_file($keyFile)) $key = trim((string)file_get_contents($keyFile));
if (!$key) ai_fail(503, 'KI-Schlüssel auf dem Testserver noch nicht eingerichtet.');
$model = getenv('KP_GEMINI_MODEL') ?: 'gemini-2.5-flash';
if (!preg_match('/^[a-zA-Z0-9._-]+$/', $model)) ai_fail(500, 'KI-Modell ungültig.');
if (!function_exists('curl_init')) ai_fail(503, 'KI-Verbindung auf dem Server nicht verfügbar.');
$instruction = 'Du bearbeitest ausschließlich eine Datei der privaten Testseite. Gib ausschließlich JSON mit den Feldern message (kurze deutsche Erklärung) und content (vollständiger geänderter Dateiinhalt) zurück. Behalte alle nicht angeforderten Inhalte und Funktionen unverändert. Wenn die Anweisung unklar ist, gib den ursprünglichen Inhalt unverändert zurück und erkläre die Rückfrage in message. Füge keine Markdown-Codeblöcke hinzu.';
$payload = json_encode([
  'systemInstruction'=>['parts'=>[['text'=>$instruction]]],
  'contents'=>[['role'=>'user','parts'=>[['text'=>"Datei: $file\nWunsch: $prompt\n\nAktueller Dateiinhalt:\n$original"]]]],
  'generationConfig'=>['responseMimeType'=>'application/json','maxOutputTokens'=>65536]
], JSON_INVALID_UTF8_SUBSTITUTE);
$ch = curl_init('https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent');
curl_setopt_array($ch, [
  CURLOPT_POST=>true, CURLOPT_POSTFIELDS=>$payload, CURLOPT_HTTPHEADER=>['Content-Type: application/json','x-goog-api-key: ' . $key],
  CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>90, CURLOPT_CONNECTTIMEOUT=>10, CURLOPT_MAXREDIRS=>0
]);
$response = curl_exec($ch); $http = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $curlCode = curl_errno($ch); curl_close($ch);
if (!is_string($response)) ai_fail(502, 'Serververbindung zu Google fehlgeschlagen (cURL ' . $curlCode . ').');
if ($http !== 200) {
  $errorBody = json_decode($response, true);
  $googleStatus = (string)($errorBody['error']['status'] ?? '');
  $reason = '';
  foreach (($errorBody['error']['details'] ?? []) as $detail) {
    if (($detail['reason'] ?? '') === 'API_KEY_INVALID') $reason = 'API_KEY_INVALID';
  }
  if ($reason === 'API_KEY_INVALID') ai_fail(502, 'Google lehnt den API-Schlüssel als ungültig ab. Bitte Schlüssel und Projekt prüfen.');
  if ($http === 429) ai_fail(502, 'Google meldet ein Nutzungslimit oder fehlendes Kontingent (HTTP 429). Free-Tier-Limits im AI Studio prüfen.');
  if ($http === 403) ai_fail(502, 'Google verweigert den Zugriff (HTTP 403). API-Aktivierung und Schlüsselbeschränkungen prüfen.');
  if ($http === 404) ai_fail(502, 'Das konfigurierte Gemini-Modell ist nicht verfügbar (HTTP 404).');
  if ($http === 400) ai_fail(502, 'Google lehnt die Anfrageparameter ab (HTTP 400). Modellkonfiguration muss geprüft werden.');
  if ($http >= 500) ai_fail(502, 'Google meldet eine Dienststörung (HTTP ' . $http . ').');
  ai_fail(502, 'Google hat die Anfrage abgelehnt (HTTP ' . $http . ').');
}
$remote = json_decode($response, true);
$text = $remote['candidates'][0]['content']['parts'][0]['text'] ?? '';
$result = is_string($text) ? json_decode($text, true) : null;
$content = $result['content'] ?? null;
if (!is_string($content) || $content === '' || strlen($content) > 1000000 || str_contains($content, "\0")) ai_fail(502, 'KI hat keinen gültigen Entwurf geliefert.');
echo json_encode(['file'=>$file,'expectedSha256'=>hash('sha256',$original),'content'=>$content,
  'message'=>(string)($result['message'] ?? 'Entwurf erstellt.')], JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);
