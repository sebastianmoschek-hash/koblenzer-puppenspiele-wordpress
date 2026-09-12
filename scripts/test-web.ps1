param([string]$BaseUrl = 'http://127.0.0.1:8080')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$env:STANDALONE_BASE_URL = $BaseUrl
npm run test:e2e:standalone-v2
if ($LASTEXITCODE -ne 0) { throw "Standalone-Browsertest fehlgeschlagen ($LASTEXITCODE)" }
