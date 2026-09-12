$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$apk = Join-Path $projectRoot 'android\homepage-technician\app\build\outputs\apk\debug\app-debug.apk'
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path -LiteralPath $adb)) { throw 'ADB wurde nicht im lokalen Android SDK gefunden.' }
if (-not (Test-Path -LiteralPath $apk)) { & "$PSScriptRoot\build-android.ps1" }
$devices = & $adb devices | Select-String '\tdevice$'
if (-not $devices) { throw 'Kein gestarteter Android-Emulator und kein freigegebenes Gerät erkannt.' }
& $adb install -r $apk
if ($LASTEXITCODE -ne 0) { throw "APK-Installation fehlgeschlagen ($LASTEXITCODE)" }
& $adb shell am start -n 'de.koblenzerpuppenspiele.techniker/.MainActivity'
