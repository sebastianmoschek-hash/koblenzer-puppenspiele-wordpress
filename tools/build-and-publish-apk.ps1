param(
    [string]$DriveApkPath = 'G:\Meine Ablage\Koblenzer-Puppenspiele\Android\koblenzer-puppenspiele-debug.apk'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$project = Join-Path $repo 'android\homepage-technician'
$apk = Join-Path $project 'app\build\outputs\apk\debug\app-debug.apk'
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot'
$env:ANDROID_HOME = 'C:\Users\egvgv\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

if (-not (Test-Path -LiteralPath (Split-Path -Parent $DriveApkPath))) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $DriveApkPath) -Force | Out-Null
}

Push-Location $project
try {
    & .\gradlew.bat --no-daemon :app:assembleDebug --console=plain
    if ($LASTEXITCODE -ne 0) { throw "Gradle-Build fehlgeschlagen (Exit $LASTEXITCODE)." }
} finally {
    Pop-Location
}

Copy-Item -LiteralPath $apk -Destination $DriveApkPath -Force
Get-Item -LiteralPath $DriveApkPath | Select-Object FullName, Length, LastWriteTime
