#!/usr/bin/env bash
set -euo pipefail

php -l wp-content/mu-plugins/kp-word-history.php >/dev/null
php -l wp-content/mu-plugins/kp-unified-save-coverage.php >/dev/null
php -l wp-content/mu-plugins/kp-ai-direct-editor.php >/dev/null

SAVE='wp-content/mu-plugins/kp-unified-save-coverage.php'
HISTORY='wp-content/mu-plugins/kp-word-history.php'
AI='wp-content/mu-plugins/kp-ai-direct-editor.php'
CANVA='wp-content/mu-plugins/kp-canva-editor.js'

# One visible Save gesture must include every specialist draft.
grep -q 'KPCanvaLayoutRuntime.*flush' "$SAVE"
grep -q 'KPCanvaImageRuntime.*flush' "$SAVE"
grep -q 'KPAIEditorRuntime.*flush' "$SAVE"
grep -q 'kp_history_group' "$SAVE"

# Undo must cover direct image-position controls plus extensible specialist runtimes.
grep -q 'kp-image-position-controls' "$HISTORY"
grep -q 'register,push:pushSpecialist' "$HISTORY"
grep -q 'MAX=50' "$HISTORY"

# AI key must stay server-side and image edits must use Gemini's image endpoint.
grep -q 'KP_GEMINI_API_KEY' "$AI"
grep -q 'gemini-3.7-flash:generateContent' "$AI"
grep -q 'gemini-3.1-flash-image' "$AI"
grep -q 'KPAIEditorRuntime' "$AI"
grep -q 'kp_ai_draft_save' "$AI"

# Existing Canva runtime must still expose layout and image histories.
grep -q 'KPCanvaLayoutRuntime' "$CANVA"
grep -q 'KPCanvaImageRuntime' "$CANVA"

# Browser-level leave/reload confirmation is forbidden in the owner editor.
if grep -R --include='*.js' --include='*.php' -nE "event\.returnValue\s*=|returnValue\s*=\s*['\"]|onbeforeunload\s*=" wp-content/mu-plugins wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets | grep -v 'qa'; then
  echo 'Forbidden beforeunload confirmation found.' >&2
  exit 1
fi

echo 'PASS: unified Save/Undo/AI editor contract.'
