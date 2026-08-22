#!/usr/bin/env bash
set -euo pipefail

for file in \
  wp-content/mu-plugins/kp-word-history.php \
  wp-content/mu-plugins/kp-unified-save-coverage.php \
  wp-content/mu-plugins/kp-ai-direct-editor.php \
  wp-content/mu-plugins/kp-synthetic-control-history.php \
  wp-content/mu-plugins/kp-record-draft-runtime.php \
  wp-content/mu-plugins/kp-header-image-draft-runtime.php; do
  php -l "$file" >/dev/null
done

SAVE='wp-content/mu-plugins/kp-unified-save-coverage.php'
HISTORY='wp-content/mu-plugins/kp-word-history.php'
AI='wp-content/mu-plugins/kp-ai-direct-editor.php'
CANVA='wp-content/mu-plugins/kp-canva-editor.js'
CARD='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-card-controls.js'
SYNTH='wp-content/mu-plugins/kp-synthetic-control-history.php'
RECORD='wp-content/mu-plugins/kp-record-draft-runtime.php'
HEADER='wp-content/mu-plugins/kp-header-image-draft-runtime.php'

# One visible Save gesture must include every specialist draft.
grep -q 'KPCanvaLayoutRuntime.*flush' "$SAVE"
grep -q 'KPCanvaImageRuntime.*flush' "$SAVE"
grep -q 'KPCardDraftRuntime.*flush' "$SAVE"
grep -q 'KPRecordDraftRuntime.*flush' "$SAVE"
grep -q 'KPHeaderImageDraftRuntime.*flush' "$SAVE"
grep -q 'KPAIEditorRuntime.*flush' "$SAVE"
grep -q 'kp_history_group' "$SAVE"
grep -q 'kp-oa-design-save,.kp-oa-size-save' "$SAVE"

# Undo must cover direct image-position controls plus extensible specialist runtimes.
grep -q 'kp-image-position-controls' "$HISTORY"
grep -q 'register,push:pushSpecialist' "$HISTORY"
grep -q 'MAX=50' "$HISTORY"

# Card, record and header-image changes are drafts until central Save and have Undo.
grep -q 'KPCardDraftRuntime' "$CARD"
grep -q "KPWordHistory.*push.*card" "$CARD"
grep -q 'KPRecordDraftRuntime' "$RECORD"
grep -q "KPWordHistory.*push.*record" "$RECORD"
grep -q 'KPHeaderImageDraftRuntime' "$HEADER"
grep -q "KPWordHistory.*push.*header-image" "$HEADER"

# Programmatic AI changes to owner controls must receive an Undo marker too.
grep -q 'synthetic-controls' "$SYNTH"
grep -q "KPWordHistory.*push.*synthetic-controls" "$SYNTH"

# AI key must stay server-side and image edits must use Gemini's image endpoint.
grep -q 'KP_GEMINI_API_KEY' "$AI"
grep -q 'gemini-3.7-flash:generateContent' "$AI"
grep -q 'gemini-3.1-flash-image' "$AI"
grep -q 'KPAIEditorRuntime' "$AI"
grep -q 'kp_ai_draft_save' "$AI"

# Existing Canva runtime must still expose layout and image histories.
grep -q 'KPCanvaLayoutRuntime' "$CANVA"
grep -q 'KPCanvaImageRuntime' "$CANVA"

# Browser-level leave/reload confirmations are forbidden. The dedicated guard
# intentionally assigns onbeforeunload=null, so only actual returnValue prompts
# are considered violations here.
if grep -R --include='*.js' --include='*.php' -nE "event\.returnValue\s*=|returnValue\s*=\s*['\"]" wp-content/mu-plugins wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets; then
  echo 'Forbidden beforeunload confirmation found.' >&2
  exit 1
fi

echo 'PASS: unified Save/Undo/AI editor contract.'
