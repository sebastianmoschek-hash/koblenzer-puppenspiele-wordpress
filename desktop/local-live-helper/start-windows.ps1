$ErrorActionPreference = 'Stop'

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDefault = Resolve-Path (Join-Path $Here '..\..')

Write-Host 'Homepage-Hilfe · Live lokal (Windows)' -ForegroundColor Cyan

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host 'Ollama fehlt. Installiere Ollama einmalig ...'
        winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements
    } else {
        throw 'Ollama ist nicht installiert und winget ist nicht verfügbar. Bitte Ollama einmalig installieren.'
    }
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python 3 wurde nicht gefunden. Bitte Python 3 installieren und dieses Skript danach erneut starten.'
}

Write-Host 'Prüfe lokales Vision-Modell gemma3:4b (~3,3 GB) ...'
$models = (& ollama list) | Out-String
if ($models -notmatch 'gemma3:4b|gemma3\s') {
    & ollama pull gemma3:4b
}

if (-not $env:KP_LOCAL_REPO) {
    $env:KP_LOCAL_REPO = $RepoDefault.Path
}
if (-not $env:KP_LOCAL_BRANCH) {
    $env:KP_LOCAL_BRANCH = 'feature/webapp-primary-agent'
}
if (-not $env:KP_LOCAL_AUTO_PUSH) {
    $env:KP_LOCAL_AUTO_PUSH = '1'
}

Write-Host "Git-Arbeitsordner: $env:KP_LOCAL_REPO"
Write-Host "Branch: $env:KP_LOCAL_BRANCH · Auto-Push: $env:KP_LOCAL_AUTO_PUSH"
Write-Host 'Chrome kann danach Live lokal direkt aus der Web-App starten.' -ForegroundColor Green

python (Join-Path $Here 'kp_local_live_helper.py')
