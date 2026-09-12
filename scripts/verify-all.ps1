param([int]$Port = 8090)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$server = Start-Process -FilePath 'php' -ArgumentList '-S', "127.0.0.1:$Port", '-t', 'webapp' -PassThru -WindowStyle Hidden
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try { $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { $ready = $true; break } } catch {}
    Start-Sleep -Milliseconds 200
  }
  if (-not $ready) { throw 'Lokaler Webserver wurde nicht rechtzeitig erreichbar.' }
  & "$PSScriptRoot\test-web.ps1" -BaseUrl "http://127.0.0.1:$Port"
  & "$PSScriptRoot\build-android.ps1"
  Write-Host 'Editor V2: lokale Gesamtprüfung erfolgreich.' -ForegroundColor Green
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id }
}
