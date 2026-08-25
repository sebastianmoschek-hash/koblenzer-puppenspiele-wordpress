#requires -Version 5.1
$ErrorActionPreference = 'Stop'

$agentDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = (Resolve-Path (Join-Path $agentDirectory '..\..')).Path
$modelName = if ($env:KP_GEMMA_MODEL) { $env:KP_GEMMA_MODEL } else { 'gemma3:4b' }

Write-Host ''
Write-Host 'Koblenzer Puppenspiele – Homepage-Agent wird vorbereitet' -ForegroundColor Cyan
Write-Host "Repository: $repositoryRoot"

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw 'Node.js 20 oder neuer fehlt. Bitte zuerst https://nodejs.org/ installieren.'
}
$nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { throw "Node.js ist zu alt (gefunden: $(& node --version)). Benötigt wird Version 20 oder neuer." }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git fehlt. Bitte Git für Windows installieren.' }
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Host 'Ollama fehlt. Installation wird über winget versucht …' -ForegroundColor Yellow
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw 'Ollama und winget fehlen. Bitte Ollama von https://ollama.com/download/windows installieren.'
    }
    & winget install --id Ollama.Ollama --exact --accept-package-agreements --accept-source-agreements
    $ollamaPath = Join-Path $env:LOCALAPPDATA 'Programs\Ollama'
    if (Test-Path $ollamaPath) { $env:Path = "$ollamaPath;$env:Path" }
    if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { throw 'Ollama wurde installiert. Bitte dieses Fenster schließen und das Startskript erneut öffnen.' }
}

try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 | Out-Null }
catch {
    Write-Host 'Ollama wird im Hintergrund gestartet …'
    Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden
    $ollamaReady = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 | Out-Null; $ollamaReady = $true; break } catch {}
    }
    if (-not $ollamaReady) { throw 'Ollama konnte nicht gestartet werden.' }
}

$installedModels = (& ollama list 2>$null | Out-String)
if ($installedModels -notmatch [regex]::Escape($modelName)) {
    Write-Host "Das lokale Modell $modelName wird einmalig geladen. Das kann etwas dauern …" -ForegroundColor Yellow
    & ollama pull $modelName
    if ($LASTEXITCODE -ne 0) { throw "Das Modell $modelName konnte nicht geladen werden." }
}

$branch = (& git -C $repositoryRoot branch --show-current).Trim()
if ($branch -ne 'desktop-ai-fast') {
    Write-Host "Hinweis: Aktueller Branch ist '$branch'. Unterhaltung funktioniert; Codeänderungen sind nur auf 'desktop-ai-fast' erlaubt." -ForegroundColor Yellow
}
if (-not (Get-Command php -ErrorAction SilentlyContinue)) { Write-Host 'Hinweis: PHP CLI fehlt; PHP-Codeänderungen werden deshalb sicher abgelehnt.' -ForegroundColor Yellow }
if (-not (Get-Command bash -ErrorAction SilentlyContinue)) { Write-Host 'Hinweis: Bash/Git Bash fehlt; Codeänderungen werden deshalb sicher abgelehnt.' -ForegroundColor Yellow }

$env:KP_REPO_ROOT = $repositoryRoot
Set-Location $repositoryRoot
Write-Host ''
Write-Host 'Der Agent startet jetzt. Den sechsstelligen KOPPLUNGSCODE im Homepage-Fenster eingeben.' -ForegroundColor Green
Write-Host 'Dieses Fenster offen lassen. Beenden mit Strg+C.'
Write-Host ''
& node (Join-Path $agentDirectory 'server.mjs')

