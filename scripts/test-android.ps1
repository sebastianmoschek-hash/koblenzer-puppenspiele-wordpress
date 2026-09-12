$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path -LiteralPath $adb)) { throw 'ADB wurde nicht gefunden.' }
$devices = & $adb devices | Select-String '\tdevice$'
if (-not $devices) { throw 'Kein Android-Emulator und kein freigegebenes Gerät erkannt.' }
& $adb logcat -c
& "$PSScriptRoot\install-android.ps1"
Start-Sleep -Seconds 5
$pidText = (& $adb shell pidof de.koblenzerpuppenspiele.techniker).Trim()
if (-not $pidText) { throw 'Android-App-Prozess läuft nach dem Start nicht.' }
$fatal = & $adb logcat -d -t 500 | Select-String 'FATAL EXCEPTION|Process: de.koblenzerpuppenspiele.techniker'
if ($fatal) { throw "Android-Absturz in Logcat erkannt: $fatal" }
$resultDir = Join-Path $projectRoot 'test-results'
New-Item -ItemType Directory -Force -Path $resultDir | Out-Null
& $adb shell screencap -p /sdcard/kp-editor-v2-test.png
& $adb pull /sdcard/kp-editor-v2-test.png (Join-Path $resultDir 'android-editor-v2-latest.png') | Out-Null
Write-Host "Android-Emulatortest erfolgreich (PID $pidText)." -ForegroundColor Green
