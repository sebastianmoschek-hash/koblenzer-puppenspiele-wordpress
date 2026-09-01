[CmdletBinding()]
param(
    [ValidateSet('editor','session-undo','persistence','text-save','all')]
    [string]$Suite = 'all',
    [string]$BaseUrl = 'https://neu.koblenzer-puppenspiele.de'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:KP_E2E_TOKEN)) {
    throw 'KP_E2E_TOKEN fehlt. Nur einen kurzlebigen, staginggebundenen CircleCI-/Labor-Token verwenden; niemals ein Passwort im Skript speichern.'
}

$env:KP_E2E_BASE = $BaseUrl.TrimEnd('/')
$tests = switch ($Suite) {
    'editor'      { @('qa/homepage-editor-lab.mjs') }
    'session-undo'{ @('qa/editor-session-undo-e2e.mjs') }
    'persistence' { @('qa/owner-all-persistence-e2e.mjs') }
    'text-save'   { @('qa/text-save-staging-e2e.mjs') }
    default       { @('qa/homepage-editor-lab.mjs','qa/editor-session-undo-e2e.mjs','qa/owner-all-persistence-e2e.mjs','qa/text-save-staging-e2e.mjs') }
}

try {
    foreach ($test in $tests) {
        Write-Host "== $test =="
        & node $test
        if ($LASTEXITCODE -ne 0) { throw "E2E-Test fehlgeschlagen: $test (exit $LASTEXITCODE)" }
    }
    Write-Host "PASS: Staging-Editor-Suite '$Suite' abgeschlossen."
}
finally {
    Remove-Item Env:KP_E2E_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:KP_E2E_BASE -ErrorAction SilentlyContinue
}
