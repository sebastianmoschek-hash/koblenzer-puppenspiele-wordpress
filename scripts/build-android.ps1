$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot 'android\homepage-technician'
Push-Location $androidRoot
try {
  & .\gradlew.bat assembleDebug
  if ($LASTEXITCODE -ne 0) { throw "Android-Build fehlgeschlagen ($LASTEXITCODE)" }
  $apk = Join-Path $androidRoot 'app\build\outputs\apk\debug\app-debug.apk'
  if (-not (Test-Path -LiteralPath $apk)) { throw 'Debug-APK wurde nicht erzeugt.' }
  Write-Host "Debug-APK: $apk" -ForegroundColor Green
} finally { Pop-Location }
