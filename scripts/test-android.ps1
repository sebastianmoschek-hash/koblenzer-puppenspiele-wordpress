$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path -LiteralPath $adb)) { throw 'ADB wurde nicht gefunden.' }
$devices = & $adb devices | Select-String '\tdevice$'
if (-not $devices) { throw 'Kein Android-Emulator und kein freigegebenes Gerät erkannt.' }
& $adb logcat -c
& $adb reverse tcp:8080 tcp:8080
if ($LASTEXITCODE -ne 0) { throw 'ADB-Portweiterleitung zum lokalen Webserver fehlgeschlagen.' }
& "$PSScriptRoot\install-android.ps1"
Start-Sleep -Seconds 8
$pidText = (& $adb shell pidof de.koblenzerpuppenspiele.techniker).Trim()
if (-not $pidText) { throw 'Android-App-Prozess läuft nach dem Start nicht.' }
& $adb forward tcp:9225 "localabstract:webview_devtools_remote_$pidText" | Out-Null
$env:ANDROID_WEBVIEW_CDP_PORT = '9225'
node (Join-Path $projectRoot 'qa\android-webview-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw "Android-WebView-Test fehlgeschlagen ($LASTEXITCODE)" }
$fatal = & $adb logcat -d -t 500 | Select-String 'FATAL EXCEPTION|Process: de.koblenzerpuppenspiele.techniker'
if ($fatal) { throw "Android-Absturz in Logcat erkannt: $fatal" }
$resultDir = Join-Path $projectRoot 'test-results'
New-Item -ItemType Directory -Force -Path $resultDir | Out-Null
& $adb shell screencap -p /sdcard/kp-editor-v2-test.png
& $adb pull /sdcard/kp-editor-v2-test.png (Join-Path $resultDir 'android-editor-v2-latest.png') | Out-Null
Write-Host "Android-Emulatortest erfolgreich (PID $pidText)." -ForegroundColor Green
