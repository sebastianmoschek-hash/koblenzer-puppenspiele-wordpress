#!/usr/bin/env bash
set -euo pipefail

REPORT_DIR='qa-results/circleci'
mkdir -p "$REPORT_DIR"
LOG="$REPORT_DIR/unified-contract.log"
exec > >(tee "$LOG") 2>&1

fail(){ echo "FAIL unified-editor contract: $*" >&2; exit 1; }
contains(){ local file="$1" pattern="$2" message="$3"; grep -q -- "$pattern" "$file" || fail "$message"; }

PHP_FILES=(
  wp-content/mu-plugins/kp-word-history.php
  wp-content/mu-plugins/kp-unified-save-coverage.php
  wp-content/mu-plugins/kp-navigation-draft-runtime.php
  wp-content/mu-plugins/kp-ai-direct-editor.php
  wp-content/mu-plugins/kp-ai-plan-interactions.php
  wp-content/mu-plugins/kp-ai-image-draft-safety.php
  wp-content/mu-plugins/kp-synthetic-control-history.php
  wp-content/mu-plugins/kp-record-draft-runtime.php
  wp-content/mu-plugins/kp-header-image-draft-runtime.php
  wp-content/mu-plugins/kp-owner-history-extension.php
  wp-content/mu-plugins/kp-social-history-bridge.php
)
for file in "${PHP_FILES[@]}"; do
  [[ -f "$file" ]] || fail "required file missing: $file"
  if command -v php >/dev/null 2>&1; then
    php -l "$file" >/dev/null || fail "PHP syntax invalid: $file"
  fi
done

SAVE='wp-content/mu-plugins/kp-unified-save-coverage.php'
HISTORY='wp-content/mu-plugins/kp-word-history.php'
NAV='wp-content/mu-plugins/kp-navigation-draft-runtime.php'
AI='wp-content/mu-plugins/kp-ai-direct-editor.php'
AI_PLAN='wp-content/mu-plugins/kp-ai-plan-interactions.php'
AI_IMAGE_SAFE='wp-content/mu-plugins/kp-ai-image-draft-safety.php'
HISTORY_EXT='wp-content/mu-plugins/kp-owner-history-extension.php'
SOCIAL_HISTORY='wp-content/mu-plugins/kp-social-history-bridge.php'
CANVA='wp-content/mu-plugins/kp-canva-editor.js'
CARD='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-card-controls.js'
SYNTH='wp-content/mu-plugins/kp-synthetic-control-history.php'
RECORD='wp-content/mu-plugins/kp-record-draft-runtime.php'
HEADER='wp-content/mu-plugins/kp-header-image-draft-runtime.php'
IMAGE_POS='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/image-position.js'
SOCIAL='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/owner-web-app-extensions.js'
PRESETS='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/design-presets.js'

node --check "$IMAGE_POS" >/dev/null || fail 'image-position JavaScript syntax is invalid'
node --check "$SOCIAL" >/dev/null || fail 'social draft JavaScript syntax is invalid'
node --check "$PRESETS" >/dev/null || fail 'design preset JavaScript syntax is invalid'

contains "$SAVE" 'KPCanvaLayoutRuntime.*flush' 'unified Save does not flush layout drafts'
contains "$SAVE" 'KPCanvaImageRuntime.*flush' 'unified Save does not flush image drafts'
contains "$SAVE" 'KPNavigationDraftRuntime.*flush' 'unified Save does not flush navigation drafts'
contains "$SAVE" 'KPCardDraftRuntime.*flush' 'unified Save does not flush repertoire-card drafts'
contains "$SAVE" 'KPRecordDraftRuntime.*flush' 'unified Save does not flush Termin/Stück drafts'
contains "$SAVE" 'KPHeaderImageDraftRuntime.*flush' 'unified Save does not flush header-image drafts'
contains "$SAVE" 'KPAIEditorRuntime.*flush' 'unified Save does not flush AI drafts'
contains "$SAVE" 'kp_history_group' 'unified Save transaction/history group missing'
contains "$SAVE" 'social_menu' 'social Save is not attached to the unified history group'
contains "$SAVE" 'mainSave.click' 'contextual design/size Save is not routed through the main Save gesture'

contains "$HISTORY" 'register,push:pushSpecialist' 'extensible specialist Undo registry missing'
contains "$HISTORY" 'MAX=50' 'global Undo history is not capped at 50'

contains "$NAV" 'KPNavigationDraftRuntime' 'navigation draft runtime missing'
contains "$NAV" 'KPWordHistory.*push.*navigation' 'navigation changes do not create an Undo marker'
contains "$NAV" 'kp_owner_nav_save' 'navigation draft persistence missing'
contains "$NAV" 'data-kp-word-history-new="navigation"' 'navigation controls are not isolated from duplicate generic Undo capture'

contains "$CARD" 'KPCardDraftRuntime' 'card draft runtime missing'
contains "$CARD" 'KPWordHistory.*push.*card' 'card changes do not create an Undo marker'
if grep -q 'temporarilyShieldLink' "$CARD"; then fail 'repertoire links are still temporarily rewritten while editing'; fi
contains "$RECORD" 'KPRecordDraftRuntime' 'record draft runtime missing'
contains "$RECORD" 'KPWordHistory.*push.*record' 'record changes do not create an Undo marker'
contains "$HEADER" 'KPHeaderImageDraftRuntime' 'header-image draft runtime missing'
contains "$HEADER" 'KPWordHistory.*push.*header-image' 'header-image changes do not create an Undo marker'
contains "$HEADER" "removeAttribute('src')" 'header-image Undo cannot restore an empty prior image state'

contains "$SYNTH" 'synthetic-controls' 'semantic owner-control Undo runtime missing'
contains "$SYNTH" 'KPWordHistory.*push.*synthetic-controls' 'programmatic/AI controls do not create an Undo marker'
contains "$SYNTH" 'topDetachedRoot' 'owner-control Undo does not survive a rebuilt/closed panel'
contains "$SYNTH" 'programBatch' 'preset/AI multi-control changes are not grouped into one Undo step'
contains "$SYNTH" 'kp-oa-size-reset' 'responsive size reset is not captured as one semantic Undo step'

contains "$IMAGE_POS" 'targetForEntry' 'image-position Undo is not bound to the originally edited image'
contains "$IMAGE_POS" 'KPWordHistory.*push.*image-position' 'image-position changes do not create a specialist Undo marker'
contains "$IMAGE_POS" 'undo, redo:redoStep' 'image-position runtime lacks Undo/Redo'

contains "$SOCIAL" 'KPSocialDraftRuntime' 'social settings still lack a draft runtime'
contains "$SOCIAL" "KPOwnerSaveRegistry.register('social'" 'social settings are not included in the orange unified Save'
contains "$SOCIAL" "KPWordHistory.register('social'" 'social settings are not included in global Undo/Redo'
contains "$SOCIAL" 'data-social-done' 'social dialog still uses an immediate standalone Save action'
if grep -q 'data-social-save' "$SOCIAL"; then fail 'legacy immediate Social Save button is still present'; fi
contains "$SOCIAL_HISTORY" 'kp_owner_social_menu_save' 'Social-only Save does not create a 48-hour history checkpoint'
contains "$SOCIAL_HISTORY" 'KP_Owner_History::checkpoint' 'Social history checkpoint is not linked to owner history'
contains "$PRESETS" 'resetHorizontalMenuPosition' 'factory design reset does not include horizontal menu position'

contains "$AI" 'KP_GEMINI_API_KEY' 'Gemini server-side API key support missing'
contains "$AI_PLAN" 'gemini-3.7-flash' 'current Gemini planning model missing'
contains "$AI_PLAN" '/v1beta/interactions' 'Gemini Interactions planning endpoint missing'
contains "$AI" 'gemini-3.1-flash-image' 'Gemini image-edit model missing'
contains "$AI" 'KPAIEditorRuntime' 'AI draft runtime missing'
contains "$AI" 'kp_ai_draft_save' 'AI persistence endpoint missing'
contains "$AI_IMAGE_SAFE" 'kp_ai_temp_image_cleanup' 'discarded Gemini image attachment cleanup missing'
contains "$AI_IMAGE_SAFE" 'runtime.undo' 'Gemini image Undo safety wrapper missing'
contains "$AI_IMAGE_SAFE" 'runtime.discard' 'Gemini image Discard safety wrapper missing'
contains "$AI_IMAGE_SAFE" 'savedVisual' 'Gemini saved-image visual baseline missing'
contains "$AI_IMAGE_SAFE" 'kp-canva-discard' 'global X does not explicitly discard AI image drafts'
contains "$AI_IMAGE_SAFE" 'keepalive:true' 'AI image cleanup is not protected across the discard reload'

contains "$HISTORY_EXT" 'kp_ai_image_replacements_global_v1' 'AI image state is missing from 48-hour versions'
contains "$HISTORY_EXT" 'kp_ai_elements_pages_v1' 'AI generated elements are missing from 48-hour versions'
contains "$HISTORY_EXT" "state\['entities'\]" 'multi-record grouped snapshots are missing'
contains "$HISTORY_EXT" 'kp_history_ext_restore_state' 'extended 48-hour restore path missing'
contains "$HISTORY_EXT" 'kp_fe_v2_record_save' 'record saves are not accumulated into grouped 48-hour history'
contains "$HISTORY_EXT" 'kp_frontend_card_image_save' 'card image saves are not accumulated into grouped 48-hour history'
contains "$HISTORY_EXT" "checkpoint( 'KI-Bearbeitung geändert' )" 'AI drafts are not checkpointed before history augmentation'

contains "$CANVA" 'KPCanvaLayoutRuntime' 'Canva layout runtime missing'
contains "$CANVA" 'KPCanvaImageRuntime' 'Canva image runtime missing'

if grep -R --include='*.js' --include='*.php' -nE "event\.returnValue\s*=|returnValue\s*=\s*['\"]" wp-content/mu-plugins wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets; then
  fail 'browser-level reload/leave confirmation code found'
fi

echo 'PASS: unified Save/Undo/navigation/social/AI editor contract.'
