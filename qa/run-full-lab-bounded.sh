#!/usr/bin/env bash
set -euo pipefail

REPORT_DIR='qa-results/circleci'
SHA="${CIRCLE_SHA1:-unknown}"
mkdir -p "$REPORT_DIR"

set +e
timeout --foreground --signal=TERM --kill-after=20s 50m bash qa/circleci-homepage-lab.sh
rc=$?
set -e

if [[ $rc -eq 0 ]]; then
  exit 0
fi

# The normal lab writes a complete report on ordinary test failures. Only
# synthesize a report when the runner was interrupted before it could do that.
if [[ ! -s "$REPORT_DIR/report.json" ]]; then
  stage='unknown'
  if [[ -s "$REPORT_DIR/pipeline.log" ]]; then
    stage="$(sed -n 's/^== \(.*\) ==$/\1/p' "$REPORT_DIR/pipeline.log" | tail -1)"
    [[ -n "$stage" ]] || stage='pre-browser-or-deploy'
  fi
  generated="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  reason='lab-failed-before-report'
  if [[ $rc -eq 124 || $rc -eq 137 || $rc -eq 143 ]]; then
    reason='lab-timeout'
  fi
  cat > "$REPORT_DIR/report.json" <<JSON
{
  "generatedAt":"$generated",
  "provider":"CircleCI Free",
  "mode":"${KP_CI_MODE:-full}",
  "commit":"$SHA",
  "staging":"${STAGING_BASE:-https://neu.koblenzer-puppenspiele.de}",
  "success":false,
  "failureReason":"$reason",
  "failureStage":"$stage",
  "exitCode":$rc,
  "checks":{
    "deploy":"unknown",
    "stagingReady":"unknown",
    "temporaryBridge":"unknown",
    "editorMobileTabletDesktop":"unknown",
    "saveReloadDbUndo48h":"unknown",
    "nativeTouchSliderSaveReset":"unknown",
    "touchRuntime":"unknown",
    "visual50Views":"unknown"
  }
}
JSON
  cat > "$REPORT_DIR/report.md" <<MD
# CircleCI Staging-Labor – Diagnose

Erzeugt: $generated  
Commit: $SHA  
Gesamtstatus: **FAILURE**  
Grund: **$reason**  
Letzte gestartete Phase: **$stage**  
Exit-Code: **$rc**

Der Lauf wurde absichtlich begrenzt, damit ein hängender Browser-/Visual-Schritt nicht wieder den gesamten Diagnosebericht verschluckt. Produktion wurde nicht verändert.
MD
fi

exit "$rc"
