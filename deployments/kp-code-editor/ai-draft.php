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
$response = curl_exec($ch); $http = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
if (!is_string($response) || $http !== 200) ai_fail(502, 'KI-Dienst nicht erreichbar oder Anfrage abgelehnt.');
$remote = json_decode($response, true);
$text = $remote['candidates'][0]['content']['parts'][0]['text'] ?? '';
$result = is_string($text) ? json_decode($text, true) : null;
$content = $result['content'] ?? null;
if (!is_string($content) || $content === '' || strlen($content) > 1000000 || str_contains($content, "\0")) ai_fail(502, 'KI hat keinen gültigen Entwurf geliefert.');
echo json_encode(['file'=>$file,'expectedSha256'=>hash('sha256',$original),'content'=>$content,
  'message'=>(string)($result['message'] ?? 'Entwurf erstellt.')], JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);
