#!/usr/bin/env bash
set -euo pipefail

FAST='wp-content/mu-plugins/kp-fast-frontend-history.php'
BRIDGE='wp-content/mu-plugins/kp-frontend-native-save-bridge.php'
TOUCH='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/touch-editor-bridge.js'

fail(){ echo "FAIL text-save contract: $*" >&2; exit 1; }
contains(){ local file="$1" pattern="$2" message="$3"; grep -q -- "$pattern" "$file" || fail "$message"; }

for file in "$FAST" "$BRIDGE"; do
  [[ -f "$file" ]] || fail "required file missing: $file"
  php -l "$file" >/dev/null || fail "PHP syntax invalid: $file"
done
[[ -f "$TOUCH" ]] || fail "required file missing: $TOUCH"
node --check "$TOUCH" >/dev/null || fail 'touch save bridge JavaScript syntax invalid'

contains "$FAST" "wp_ajax_kp_fe_v2_save.*kp_fast_fe_history_checkpoint.*0" 'lightweight FE2 history checkpoint is not installed before core history'
contains "$FAST" 'frontend_page_delta' 'FE2 history does not store the affected page as a small delta'
contains "$FAST" 'KP_FAST_FE_MAX_ITEMS      = 80' 'lightweight history no longer respects the 80-version cap'
contains "$FAST" 'KP_FAST_FE_RETENTION      = 172800' 'lightweight history no longer respects the 48-hour window'
contains "$FAST" 'kp_fast_fe_history_restore_page_delta' 'lightweight FE2 page state cannot be restored'
if grep -q "KP_FAST_FE_PAGES_OPTION => kp_fast_fe_history_option_state" "$FAST"; then
  fail 'text history regressed to copying the complete all-pages option'
fi

contains "$BRIDGE" 'KPFrontendEditorNativeSave' 'native FE2 Save handler is not exposed for direct invocation'
contains "$BRIDGE" 'EventTarget.prototype.addEventListener=nativeAdd' 'temporary listener capture is not restored immediately'
contains "$TOUCH" 'SAVE_TIMEOUT_MS = 12000' 'text Save lacks a finite watchdog'
contains "$TOUCH" "requestAction(init?.body) !== 'kp_fe_v2_save'" 'FE2 text request is not protected by the watchdog'
contains "$TOUCH" 'const nativeSave = window.KPFrontendEditorNativeSave' 'text Save still relies on a synthetic DOM replay instead of the native handler'
contains "$TOUCH" 'await withTimeout(' 'unified/text Save can still wait forever'
if grep -q 'saveButton\.click()' "$TOUCH"; then
  fail 'text Save still replays a second DOM click through the editor stack'
fi

# The unified registry already owns all specialist flushes. The compatibility
# fallback may use the old runtimes only when that registry is unavailable.
contains "$TOUCH" 'if (owner?.flushAll)' 'central Save registry is not the authoritative specialist flush path'
contains "$TOUCH" 'free !== generic' 'aliased Canva/touch layout runtime can still be flushed twice in fallback mode'

echo 'PASS: text Save uses lightweight history, one native save call and finite watchdogs.'
