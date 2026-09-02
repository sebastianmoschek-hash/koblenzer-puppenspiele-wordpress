<#
  Local, read-only observer for the staging delivery loop.
  It never writes to WordPress, GitHub, Git, or production.
#>
[CmdletBinding()]
param(
  [int]$IntervalSeconds = 30,
  [int]$Cycles = 0,
  [string]$LogPath = "$PSScriptRoot\staging-workflow-watch.log"
)

$ErrorActionPreference = 'Continue'
$base = 'https://neu.koblenzer-puppenspiele.de'
$repo = 'C:/dev/koblenzer-puppenspiele-wordpress'
$cycle = 0

function Write-Observation([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'), $Message
  Add-Content -LiteralPath $LogPath -Value $line
  Write-Output $line
}

Write-Observation 'watch started (read-only; staging only)'
while ($Cycles -eq 0 -or $cycle -lt $Cycles) {
  $cycle++
  try {
    $status = git -C $repo status --short --branch 2>&1
    $branch = ($status | Select-Object -First 1)
    $dirty = @($status | Select-Object -Skip 1 | Where-Object { $_ -and $_.Trim() }).Count
    Write-Observation ("git branch={0}; dirty_entries={1}" -f $branch, $dirty)
  } catch {
    Write-Observation ("git check failed: {0}" -f $_.Exception.Message)
  }

  try {
    $health = Invoke-WebRequest -UseBasicParsing -MaximumRedirection 3 -TimeoutSec 20 "$base/?kp_staging_bridge_health=1&kp_watch=$([Guid]::NewGuid().ToString('N'))"
    $body = $health.Content | ConvertFrom-Json
    Write-Observation ("staging health http={0}; active={1}; version={2}" -f $health.StatusCode, $body.success, $body.data.version)
  } catch {
    Write-Observation ("staging health failed: {0}" -f $_.Exception.Message)
  }

  try {
    $runs = gh run list --limit 8 --json name,status,conclusion,databaseId,updatedAt 2>$null | ConvertFrom-Json
    $interesting = @($runs | Where-Object { $_.name -match 'Deploy staging|Owner all-controls|CircleCI staging report|Homepage' } | Select-Object -First 4)
    foreach ($run in $interesting) {
      Write-Observation ("run id={0}; name={1}; status={2}; conclusion={3}; updated={4}" -f $run.databaseId, $run.name, $run.status, $run.conclusion, $run.updatedAt)
    }
  } catch {
    Write-Observation ("GitHub run check failed: {0}" -f $_.Exception.Message)
  }

  try {
    $report = Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 "$base/wp-content/uploads/kp-homepage-lab/latest/report.json?watch=$([Guid]::NewGuid().ToString('N'))"
    $json = $report.Content | ConvertFrom-Json
    Write-Observation ("latest lab report http={0}; success={1}; commit={2}" -f $report.StatusCode, $json.success, $json.commit)
  } catch {
    Write-Observation ("latest lab report unavailable: {0}" -f $_.Exception.Message)
  }

  if ($Cycles -eq 0 -or $cycle -lt $Cycles) {
    Start-Sleep -Seconds ([Math]::Max(10, $IntervalSeconds))
  }
}
Write-Observation 'watch stopped'
