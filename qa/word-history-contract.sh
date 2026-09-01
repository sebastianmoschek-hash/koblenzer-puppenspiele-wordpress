#!/usr/bin/env bash
set -euo pipefail

FRONTEND='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-editor-v2.js'
IMAGE_POS='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/image-position.js'
RUNTIME='wp-content/mu-plugins/kp-word-history.php'
CANVA_JS='wp-content/mu-plugins/kp-canva-editor.js'
CANVA_KEYS='wp-content/mu-plugins/kp-canva-keys.js'
CANVA_PHP='wp-content/mu-plugins/kp-canva-editor.php'
CANVA_CSS='wp-content/mu-plugins/kp-canva-editor.css'
TOUCH_FREE='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/touch-free-layout.js'
NO_UNLOAD='wp-content/mu-plugins/kp-editor-no-beforeunload.php'

fail(){ echo "FAIL word-history contract: $*" >&2; exit 1; }

for file in "$FRONTEND" "$IMAGE_POS" "$RUNTIME" "$CANVA_JS" "$CANVA_KEYS" "$CANVA_PHP" "$CANVA_CSS" "$TOUCH_FREE" "$NO_UNLOAD"; do
  [[ -f "$file" ]] || fail "required editor file missing: $file"
done

node --check "$FRONTEND" >/dev/null || fail 'frontend editor JavaScript syntax is invalid'
node --check "$IMAGE_POS" >/dev/null || fail 'image-position JavaScript syntax is invalid'
node --check "$CANVA_JS" >/dev/null || fail 'Canva editor JavaScript syntax is invalid'
node --check "$CANVA_KEYS" >/dev/null || fail 'Canva key bridge JavaScript syntax is invalid'
node --check "$TOUCH_FREE" >/dev/null || fail 'legacy touch-free JavaScript syntax is invalid'
if command -v php >/dev/null 2>&1; then
  php -l "$CANVA_PHP" >/dev/null || fail 'Canva editor PHP syntax is invalid'
  php -l "$RUNTIME" >/dev/null || fail 'Word history PHP syntax is invalid'
  php -l "$NO_UNLOAD" >/dev/null || fail 'no-beforeunload guard PHP syntax is invalid'
fi

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
if grep -Fq 'kpFe2Restore' "$FRONTEND"; then fail 'legacy sessionStorage + reload undo path still present'; fi
if grep -Fq "addEventListener('beforeunload'" "$FRONTEND" || grep -Fq 'returnValue=' "$FRONTEND"; then fail 'frontend editor must never trigger a browser reload/leave confirmation'; fi
grep -Fq "String(type || '').toLowerCase() === 'beforeunload'" "$NO_UNLOAD" || fail 'central beforeunload blocker missing'

if grep -Fq 'location.reload' "$RUNTIME"; then fail 'global arrow runtime must never reload the page'; fi
if grep -Eq 'kp_owner_history_(undo|redo|restore)' "$RUNTIME"; then fail 'global arrows must never call 48-hour server history endpoints'; fi

grep -Fq 'const MAX=50' "$RUNTIME" || fail 'global history is not capped at 50 steps'
grep -Fq "data-kp-word-history-new" "$RUNTIME" || fail 'compact arrow controls missing'
grep -Fq '48 Stunden' "$RUNTIME" || fail 'version-history separation copy missing'
grep -Fq "kp:canva-layout-history-push" "$RUNTIME" || fail 'drag/pinch changes are not connected to global undo/redo'
grep -Fq "kp:canva-image-history-push" "$RUNTIME" || fail 'image edits are not connected to global undo/redo'
grep -Fq 'register,push:pushSpecialist' "$RUNTIME" || fail 'extensible specialist undo registry missing'

grep -Fq "KPWordHistory?.push?.('image-position')" "$IMAGE_POS" || fail 'image-position controls are not connected to global undo/redo'
grep -Fq 'targetForEntry' "$IMAGE_POS" || fail 'image-position history is not tied to the originally edited image'
grep -Fq 'undo, redo:redoStep' "$IMAGE_POS" || fail 'image-position specialist undo/redo missing'

grep -Fq 'window.KPCanvaLayoutRuntime' "$CANVA_JS" || fail 'shared drag/pinch runtime missing'
grep -Fq 'window.KPCanvaImageRuntime' "$CANVA_JS" || fail 'image editing runtime missing'
grep -Fq '}, 1000 );' "$CANVA_PHP" || fail 'Canva enqueue callback must run after all legacy gesture and persistence priorities'
for legacy_handle in kp-touch-persistence kp-touch-editor-bridge kp-touch-gesture-safety kp-touch-free-layout kp-touch-gestures; do
  grep -Fq "'$legacy_handle'" "$CANVA_PHP" || fail "edit mode does not dequeue legacy observer runtime: $legacy_handle"
done
grep -Fq 'const hasCanvasAddition' "$CANVA_KEYS" || fail 'owner-sheet insertions can still trigger a full Canva key pass'
grep -Fq "classList.contains('kp-has-gesture-transform')" "$CANVA_JS" || fail 'saved-layout replay still emits unchanged class removals'
grep -Fq 'const hasLayoutAddition' "$TOUCH_FREE" || fail 'owner-sheet insertions can still trigger a legacy layout replay'
grep -Fq 'kp-canva-preview' "$CANVA_JS" || fail 'preview mode missing'
grep -Fq 'kp-canva-discard' "$CANVA_JS" || fail 'discard X missing'
grep -Fq 'kp_touch_gesture_save' "$CANVA_JS" || fail 'generic drag persistence missing'
grep -Fq 'kp_touch_free_layout_save' "$CANVA_JS" || fail 'menu/header drag persistence missing'
grep -Fq 'kp_canva_image_save' "$CANVA_JS" || fail 'image edit persistence missing'
grep -Fq 'brightness' "$CANVA_JS" || fail 'image brightness tool missing'
grep -Fq 'rotation' "$CANVA_JS" || fail 'image rotation tool missing'

echo 'PASS: Word-style arrows + Canva editing are syntax-valid, 50-step, no-reload-prompt, and separated from 48-hour versions.'
