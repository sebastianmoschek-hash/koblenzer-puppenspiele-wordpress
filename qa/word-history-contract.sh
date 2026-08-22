#!/usr/bin/env bash
set -euo pipefail

FRONTEND='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-editor-v2.js'
RUNTIME='wp-content/mu-plugins/kp-word-history.php'
CANVA_JS='wp-content/mu-plugins/kp-canva-editor.js'
CANVA_KEYS='wp-content/mu-plugins/kp-canva-keys.js'
CANVA_PHP='wp-content/mu-plugins/kp-canva-editor.php'
CANVA_CSS='wp-content/mu-plugins/kp-canva-editor.css'

fail(){ echo "FAIL word-history contract: $*" >&2; exit 1; }

for file in "$FRONTEND" "$RUNTIME" "$CANVA_JS" "$CANVA_KEYS" "$CANVA_PHP" "$CANVA_CSS"; do
  [[ -f "$file" ]] || fail "required editor file missing: $file"
done

# Catch malformed code before any browser/staging work consumes credits.
node --check "$FRONTEND" >/dev/null || fail 'frontend editor JavaScript syntax is invalid'
node --check "$CANVA_JS" >/dev/null || fail 'Canva editor JavaScript syntax is invalid'
node --check "$CANVA_KEYS" >/dev/null || fail 'Canva key bridge JavaScript syntax is invalid'
php -l "$CANVA_PHP" >/dev/null || fail 'Canva editor PHP syntax is invalid'
php -l "$RUNTIME" >/dev/null || fail 'Word history PHP syntax is invalid'

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
grep -Fq "kp:canva-layout-history-push" "$RUNTIME" || fail 'drag/pinch changes are not connected to global undo/redo'
grep -Fq "kp:canva-image-history-push" "$RUNTIME" || fail 'image edits are not connected to global undo/redo'

grep -Fq 'window.KPCanvaLayoutRuntime' "$CANVA_JS" || fail 'shared drag/pinch runtime missing'
grep -Fq 'window.KPCanvaImageRuntime' "$CANVA_JS" || fail 'image editing runtime missing'
grep -Fq 'kp-canva-preview' "$CANVA_JS" || fail 'preview mode missing'
grep -Fq 'kp-canva-discard' "$CANVA_JS" || fail 'discard X missing'
grep -Fq 'kp_touch_gesture_save' "$CANVA_JS" || fail 'generic drag persistence missing'
grep -Fq 'kp_touch_free_layout_save' "$CANVA_JS" || fail 'menu/header drag persistence missing'
grep -Fq 'kp_canva_image_save' "$CANVA_JS" || fail 'image edit persistence missing'
grep -Fq 'brightness' "$CANVA_JS" || fail 'image brightness tool missing'
grep -Fq 'rotation' "$CANVA_JS" || fail 'image rotation tool missing'

echo 'PASS: Word-style arrows + Canva drag/preview/discard/image editing are syntax-valid, client-side, 50-step, and separated from 48-hour versions.'
