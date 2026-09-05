#!/usr/bin/env bash
set -euo pipefail

REPORT_DIR='qa-results/circleci'
EDITOR_DIR='qa-artifacts/homepage-lab'
REMOTE_REPORT='/wp-content/uploads/kp-homepage-lab/latest'
SHA="${CIRCLE_SHA1:-unknown}"
mkdir -p "$REPORT_DIR"

# Run the real staging lab from a temporary copy so the safety bounds can be
# tuned independently from the test implementation. The old 18-minute E2E
# bridge could expire while the deliberately bounded editor/session/persistence
# phases were still running, which made later DB readback look like a product
# failure. Keep the bridge valid for the whole bounded lab, while cleanup in the
# real script still removes it immediately when the run finishes.
tmp_lab="$(mktemp /tmp/kp-circleci-homepage-lab.XXXXXX.sh)"
cp qa/circleci-homepage-lab.sh "$tmp_lab"
sed -i \
  -e "s/editor|persistence) limit='9m' ;;/editor) limit='12m' ;; persistence) limit='15m' ;;/" \
  -e "s/session-undo|touch-slider|touch-runtime) limit='6m' ;;/session-undo) limit='12m' ;; touch-slider|touch-runtime) limit='6m' ;;/" \
  -e 's/+ 1100 ))/+ 4200 ))/' \
  "$tmp_lab"

set +e
timeout --foreground --signal=TERM --kill-after=20s 65m bash "$tmp_lab"
rc=$?
set -e
rm -f "$tmp_lab"

publish_remote_diagnostics(){
  [[ -n "${STAGING_FTP_SERVER:-}" && -n "${STAGING_FTP_USERNAME:-}" && -n "${LFTP_PASSWORD:-}" ]] || return 0
  local diag="$REPORT_DIR/diagnostics.txt"
  : > "$diag"
  for logfile in pipeline.log editor.log section-actions.log ai-chat.log session-undo.log persistence.log touch-slider.log touch-runtime.log visual.log php-syntax.log deploy.log; do
    local src="$REPORT_DIR/$logfile"
    if [[ -s "$src" ]]; then
      {
        printf '\n===== %s =====\n' "$logfile"
        tail -n 500 "$src"
      } >> "$diag"
    fi
  done
  [[ -s "$diag" ]] || printf 'No detailed browser diagnostics were produced.\n' > "$diag"

  lftp -c "set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; set net:max-retries 2; set net:timeout 20; open --user '$STAGING_FTP_USERNAME' --env-password -p 21 '$STAGING_FTP_SERVER'; mkdir -p '$REMOTE_REPORT'; put '$REPORT_DIR/report.json' -o '$REMOTE_REPORT/report.json'; put '$REPORT_DIR/report.md' -o '$REMOTE_REPORT/report.md'; put '$diag' -o '$REMOTE_REPORT/diagnostics.txt'; bye" >/dev/null 2>&1 || true
  if [[ -s "$EDITOR_DIR/report.json" ]]; then
    lftp -c "set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; set net:max-retries 2; set net:timeout 20; open --user '$STAGING_FTP_USERNAME' --env-password -p 21 '$STAGING_FTP_SERVER'; mkdir -p '$REMOTE_REPORT/editor'; put '$EDITOR_DIR/report.json' -o '$REMOTE_REPORT/editor/report.json'; bye" >/dev/null 2>&1 || true
  fi
}

# Add granular phase verdicts to every completed report. The public status jobs
# can still keep their compact groups, but diagnostics now say whether the
# editor viewport test or the session Undo test was the failing half.
if [[ -s "$REPORT_DIR/report.json" ]]; then
  phase_state(){
    local name="$1"
    if grep -q "^PASS $name$" "$REPORT_DIR/pipeline.log" 2>/dev/null; then echo success
    elif grep -q "^FAIL $name" "$REPORT_DIR/pipeline.log" 2>/dev/null; then echo failure
    else echo unknown
    fi
  }
  editor_browser="$(phase_state editor)"
  session_undo="$(phase_state session-undo)"
  persistence="$(phase_state persistence)"
  tmp_json="$(mktemp)"
  jq --arg eb "$editor_browser" --arg su "$session_undo" --arg pe "$persistence" \
    '.checks.editorBrowser=$eb | .checks.sessionUndo=$su | .checks.persistenceBrowser=$pe' \
    "$REPORT_DIR/report.json" > "$tmp_json" && mv "$tmp_json" "$REPORT_DIR/report.json"

  publish_remote_diagnostics

  # A completed red report is still a valid hand-off to the independent verdict
  # jobs. Return success here so the following real text Save→Reload→DB gate is
  # always executed on the same staging deployment. The component verdict jobs
  # remain authoritative and will keep the workflow red for any failed check.
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
    "editorBrowser":"unknown",
    "sessionUndo":"unknown",
    "saveReloadDbUndo48h":"unknown",
    "persistenceBrowser":"unknown",
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

publish_remote_diagnostics
exit "$rc"
