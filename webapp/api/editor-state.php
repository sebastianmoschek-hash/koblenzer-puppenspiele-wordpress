<?php
declare(strict_types=1);

// This endpoint is intentionally deployed only below neu.koblenzer-puppenspiele.de.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = strtolower($_SERVER['HTTP_HOST'] ?? '');
if ($host !== 'neu.koblenzer-puppenspiele.de' || ($origin !== '' && $origin !== 'https://neu.koblenzer-puppenspiele.de')) {
    http_response_code(403); echo json_encode(['error'=>'forbidden']); exit;
}
$file = __DIR__ . '/.editor-state.json';
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!is_file($file)) { http_response_code(404); exit; }
    $raw = file_get_contents($file);
    $data = json_decode((string)$raw, true);
    if (!is_array($data)) { http_response_code(500); echo json_encode(['error'=>'invalid state']); exit; }
    echo json_encode($data, JSON_UNESCAPED_UNICODE); exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'PUT') { http_response_code(405); exit; }
$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input) || !is_string($input['html'] ?? null) || strlen($input['html']) > 2000000) {
    http_response_code(422); echo json_encode(['error'=>'invalid payload']); exit;
}
$data = ['version'=>1, 'savedAt'=>gmdate('c'), 'html'=>$input['html']];
$tmp = $file . '.tmp';
if (file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), LOCK_EX) === false || !rename($tmp, $file)) {
    http_response_code(500); echo json_encode(['error'=>'save failed']); exit;
}
echo json_encode(['ok'=>true, 'savedAt'=>$data['savedAt']]);

