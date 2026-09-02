#!/usr/bin/env bash
set -uo pipefail

REPORT_DIR='qa-results/circleci'
mkdir -p "$REPORT_DIR"
SUMMARY="$REPORT_DIR/preflight-summary.log"
: > "$SUMMARY"
failed=0

run_contract(){
  local name="$1" script="$2" logfile="$3"
  echo "===== $name =====" | tee -a "$SUMMARY"
  set +e
  bash "$script" 2>&1 | tee "$REPORT_DIR/$logfile"
  local rc=${PIPESTATUS[0]}
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "PASS $name" | tee -a "$SUMMARY"
  else
    echo "FAIL $name (exit $rc)" | tee -a "$SUMMARY"
    failed=1
  fi
}

set -e
run_contract 'word-history' 'qa/word-history-contract.sh' 'word-history-contract.log'
run_contract 'unified-editor' 'qa/unified-editor-contract.sh' 'unified-contract.log'
run_contract 'create-undo-redo' 'qa/create-undo-contract.sh' 'create-undo-contract.log'
run_contract 'calendar-undo-redo' 'qa/calendar-undo-contract.sh' 'calendar-undo-contract.log'
run_contract 'ai-repair-safety' 'qa/ai-repair-contract.sh' 'ai-repair-contract.log'
run_contract 'openrouter-disabled' 'qa/openrouter-disabled-contract.sh' 'openrouter-disabled-contract.log'

if [[ $failed -ne 0 ]]; then
  echo 'PRECHECK FAILURE: at least one deterministic editor contract failed.' | tee -a "$SUMMARY"
  exit 1
fi

echo 'PRECHECK PASS: all deterministic editor contracts passed.' | tee -a "$SUMMARY"
