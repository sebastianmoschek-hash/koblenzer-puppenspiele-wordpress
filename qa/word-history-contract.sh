#!/usr/bin/env bash
set -euo pipefail

FRONTEND='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-editor-v2.js'
RUNTIME='wp-content/mu-plugins/kp-word-history.php'

fail(){ echo "FAIL word-history contract: $*" >&2; exit 1; }

[[ -f "$FRONTEND" ]] || fail 'frontend editor runtime missing'
[[ -f "$RUNTIME" ]] || fail 'Word history runtime missing'

for obsolete in \
  wp-content/mu-plugins/kp-owner-history-toolbar-fix.php \
  wp-content/mu-plugins/kp-owner-undo-redo.php \
  wp-content/mu-plugins/z-kp-owner-undo-redo-bootstrap.php \
  wp-content/mu-plugins/zz-kp-owner-undo-redo-bootstrap.php; do
  [[ ! -e "$obsolete" ]] || fail "obsolete reload/server-history module still present: $obsolete"
done

grep -Fq 'const HISTORY_LIMIT = 50;' "$FRONTEND" || fail 'frontend history is not capped at 50 steps'
grep -Fq 'window.KPFrontendEditorHistory' "$FRONTEND" || fail 'frontend instant history API missing'
grep -Fq 'captureHistoryDom' "$FRONTEND" || fail 'exact DOM snapshot support missing'
if grep -Fq 'kpFe2Restore' "$FRONTEND"; then
  fail 'legacy sessionStorage + reload undo path still present'
fi

if grep -Fq 'location.reload' "$RUNTIME"; then
  fail 'global arrow runtime must never reload the page'
fi
if grep -Eq 'kp_owner_history_(undo|redo|restore)' "$RUNTIME"; then
  fail 'global arrows must never call 48-hour server history endpoints'
fi

grep -Fq 'const MAX=50;' "$RUNTIME" || fail 'global history is not capped at 50 steps'
grep -Fq "data-kp-word-history-new" "$RUNTIME" || fail 'compact arrow controls missing'
grep -Fq '48 Stunden' "$RUNTIME" || fail 'version-history separation copy missing'

echo 'PASS: Word-style arrows are client-side, instant, 50-step, and separated from 48-hour versions.'
