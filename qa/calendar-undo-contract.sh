#!/usr/bin/env bash
set -euo pipefail

HISTORY='wp-content/mu-plugins/kp-word-history.php'
CAL='wp-content/mu-plugins/kp-calendar-undo-redo.php'
GUARD='wp-content/mu-plugins/kp-calendar-history-conflict-guard.php'
COORD='wp-content/mu-plugins/kp-server-history-coordinator.php'
UI='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/calendar-owner-ui.js'
SERVER='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/includes/class-kp-calendar-owner-ui.php'
IMPORTER='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/includes/class-kp-google-calendar-import.php'

fail(){ echo "FAIL calendar-undo contract: $*" >&2; exit 1; }
contains(){ local file="$1" pattern="$2" message="$3"; grep -Fq -- "$pattern" "$file" || fail "$message"; }

for file in "$HISTORY" "$CAL" "$GUARD" "$COORD" "$SERVER" "$IMPORTER"; do
  [[ -f "$file" ]] || fail "required file missing: $file"
  php -l "$file" >/dev/null || fail "PHP syntax invalid: $file"
done
[[ -f "$UI" ]] || fail "required file missing: $UI"
node --check "$UI" >/dev/null || fail 'calendar owner JavaScript syntax is invalid'

contains "$HISTORY" 'async function undo' 'global Undo cannot await calendar server actions'
contains "$HISTORY" 'async function redo' 'global Redo cannot await calendar server actions'
contains "$HISTORY" 'seedSpecialist' 'calendar history cannot survive a sheet/page rebuild'

contains "$CAL" 'MAX_ITEMS = 50' 'calendar server history is not capped at 50 steps'
contains "$CAL" 'RETENTION = 172800' 'calendar history lacks the 48-hour safety window'
contains "$CAL" 'kp_calendar_owner_save_feed' 'calendar connection is not reversible'
contains "$CAL" 'kp_calendar_owner_sync' 'manual calendar sync is not reversible'
contains "$CAL" 'kp_calendar_owner_update_draft' 'calendar draft editing is not reversible'
contains "$CAL" 'kp_calendar_owner_publish' 'calendar publishing is not reversible'
contains "$CAL" 'kp_calendar_history_begin' 'calendar pre-mutation snapshot endpoint missing'
contains "$CAL" 'kp_calendar_history_commit' 'calendar history commit endpoint missing'
contains "$CAL" 'kp_calendar_history_rollback' 'failed history commit cannot roll the calendar mutation back'
contains "$CAL" 'kp_calendar_history_undo' 'calendar Undo endpoint missing'
contains "$CAL" 'kp_calendar_history_redo' 'calendar Redo endpoint missing'
contains "$CAL" "KPWordHistory.register('calendar'" 'calendar history is not registered with global arrows'
contains "$CAL" "KPWordHistory?.push?.('calendar')" 'successful calendar mutations do not create a global Undo marker'
contains "$CAL" 'window.fetch=async' 'calendar mutations are not protected before their original request'
contains "$CAL" 'await rollback(token)' 'calendar mutation failure/commit failure does not restore the previous state'
contains "$CAL" 'sync_snapshot' 'calendar sync does not snapshot imported WordPress records'
contains "$CAL" 'kp_auftritte_last_sync' 'calendar sync history omits last-sync state'
contains "$CAL" "0 !== strpos( (string) \$key, '_kp_' )" 'calendar history does not preserve imported Termin metadata'

contains "$GUARD" 'wp_ajax_kp_calendar_history_undo' 'calendar Undo conflict guard missing'
contains "$GUARD" 'wp_ajax_kp_calendar_history_redo' 'calendar Redo conflict guard missing'
contains "$GUARD" 'self::same( $current, $expected )' 'calendar history does not protect newer external/tab changes'
contains "$GUARD" 'Neuere Änderungen bleiben unangetastet' 'calendar conflict behavior is not explicit'

contains "$COORD" "creation:{undo:'kp-create-undo-v1'" 'created-content history is missing from the shared server timeline'
contains "$COORD" "calendar:{undo:'kp-calendar-undo-v1'" 'calendar history is missing from the shared server timeline'
contains "$COORD" "history.register('server-history'" 'shared server timeline is not registered with global arrows'
contains "$COORD" "history.seedSpecialist('creation',0,0)" 'legacy creation marker blocks are not replaced after navigation'
contains "$COORD" "history.seedSpecialist('calendar',0,0)" 'legacy calendar marker blocks are not replaced after navigation'
contains "$COORD" "originalPush('server-history')" 'new server actions do not append to one chronological global lane'
contains "$COORD" 'redoSeq=[]' 'new server actions do not clear shared Redo'
contains "$COORD" "cfg.runtime?.()?.clearRedo?.()" 'new edits do not clear underlying server Redo stores'
contains "$COORD" 'lastUnderlying(item.kind,stack)!==item.id' 'shared history can call the wrong subsystem entry out of order'

contains "$SERVER" 'wp_ajax_kp_calendar_owner_update_draft' 'calendar draft endpoint missing'
contains "$SERVER" 'wp_ajax_kp_calendar_owner_publish' 'calendar publish endpoint missing'
contains "$IMPORTER" 'wp_safe_remote_get' 'Google calendar importer is no longer explicitly read-only GET'
if grep -Eq 'wp_(safe_)?remote_(post|request).*method.*(POST|PUT|PATCH|DELETE)' "$IMPORTER"; then
  fail 'Google calendar importer contains a write request path'
fi

if grep -Eq 'wp_delete_post|wp_delete_attachment' "$CAL" "$GUARD" "$COORD"; then
  fail 'calendar/server Undo must not permanently delete WordPress content'
fi

echo 'PASS: calendar actions are reversible/conflict-safe, server history stays chronological, and Google remains read-only.'
