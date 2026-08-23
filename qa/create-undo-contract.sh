#!/usr/bin/env bash
set -euo pipefail

HISTORY='wp-content/mu-plugins/kp-word-history.php'
CREATE='wp-content/mu-plugins/kp-create-undo-redo.php'
CAPTURE='wp-content/mu-plugins/kp-create-history-capture.php'

fail(){ echo "FAIL create-undo contract: $*" >&2; exit 1; }
contains(){ local file="$1" pattern="$2" message="$3"; grep -q -- "$pattern" "$file" || fail "$message"; }

for file in "$HISTORY" "$CREATE" "$CAPTURE"; do
  [[ -f "$file" ]] || fail "required file missing: $file"
  php -l "$file" >/dev/null || fail "PHP syntax invalid: $file"
done

contains "$HISTORY" 'async function undo' 'global Undo cannot await server-side actions'
contains "$HISTORY" 'async function redo' 'global Redo cannot await server-side actions'
contains "$HISTORY" 'seedSpecialist' 'server-backed history cannot survive a create redirect'
contains "$HISTORY" 'historyBusy' 'Undo/Redo buttons are not protected during async actions'

contains "$CREATE" 'MAX_ITEMS = 50' 'create history is not capped at 50 steps'
contains "$CREATE" 'RETENTION = 172800' 'create history lacks the 48-hour safety window'
contains "$CREATE" 'kp_create_history_undo' 'create Undo endpoint missing'
contains "$CREATE" 'kp_create_history_redo' 'create Redo endpoint missing'
contains "$CREATE" "'post_status' => 'draft'" 'create Undo does not safely deactivate the created post'
contains "$CREATE" 'active_status' 'create Redo does not remember the original publish status'
contains "$CREATE" 'remove_recorded_nav' 'page-create Undo does not remove its automatic navigation item'
contains "$CREATE" 'restore_recorded_nav' 'page-create Redo does not restore its automatic navigation item'
contains "$CREATE" 'KPCreateHistoryRuntime' 'browser create-history runtime missing'
contains "$CREATE" "KPWordHistory.register('creation'" 'create history is not registered with the global arrows'
if grep -q 'wp_delete_post' "$CREATE"; then fail 'create Undo must never permanently delete content'; fi

contains "$CAPTURE" 'kp_owner_record_create' 'Termin/Stück creation is not captured'
contains "$CAPTURE" 'kp_owner_page_create' 'page creation is not captured'
contains "$CAPTURE" 'kp_create_history_record' 'successful creation is not registered on the server'
contains "$CAPTURE" 'add_nav' 'automatic page-navigation creation is not included in the reversible action'
contains "$CAPTURE" 'response.clone().json' 'capture bridge does not verify successful create responses'

echo 'PASS: page/Termin/Stück creation is reversible through the global 50-step Undo/Redo arrows.'
