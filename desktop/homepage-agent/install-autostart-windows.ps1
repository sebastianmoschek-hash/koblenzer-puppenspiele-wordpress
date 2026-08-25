#requires -Version 5.1
$ErrorActionPreference = 'Stop'

$agentDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$startScript = Join-Path $agentDirectory 'start-windows.ps1'
if (-not (Test-Path $startScript)) { throw "Startskript fehlt: $startScript" }

$startupDirectory = [Environment]::GetFolderPath('Startup')
$launcher = Join-Path $startupDirectory 'KP-Homepage-Agent.cmd'
$quotedScript = $startScript.Replace('"', '""')
$content = "@echo off`r`nstart `"Homepage-Agent`" powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$quotedScript`"`r`n"
[IO.File]::WriteAllText($launcher, $content, [Text.UTF8Encoding]::new($false))

Write-Host ''
Write-Host 'Autostart ist eingerichtet.' -ForegroundColor Green
Write-Host "Datei: $launcher"
Write-Host 'Beim nächsten Windows-Login öffnet sich das Agentfenster automatisch.'
Write-Host 'Zum Entfernen einfach KP-Homepage-Agent.cmd aus dem Windows-Autostartordner löschen.'

