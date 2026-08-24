#!/usr/bin/env bash
set -euo pipefail

APP='android/homepage-technician/app/src/main'
KOTLIN="$APP/java/de/koblenzerpuppenspiele/techniker"
MAIN="$KOTLIN/MainActivity.kt"
LOCAL="$KOTLIN/LocalAiTechnician.kt"
WEB="$KOTLIN/WebRepairBridge.kt"
GRADLE='android/homepage-technician/app/build.gradle.kts'
MANIFEST="$APP/AndroidManifest.xml"
REPAIR_HISTORY='wp-content/mu-plugins/kp-ai-repair-history.php'
REPAIR_LAB='wp-content/mu-plugins/kp-ai-repair-lab.php'

php -l "$REPAIR_HISTORY" >/dev/null
php -l "$REPAIR_LAB" >/dev/null

test -f "$LOCAL"
test ! -e "$KOTLIN/GeminiLiveTechnician.kt"
test ! -e "$KOTLIN/ScreenCaptureService.kt"

# Primary UI is manual edit + one local AI chat with explicit emergency Gemini handoff.
grep -q 'text = "✎ Bearbeiten"' "$MAIN"
grep -q 'text = "✦ KI"' "$MAIN"
grep -q 'Änderungswunsch schreiben' "$MAIN"
grep -q 'Notfall Gemini' "$MAIN"
grep -q 'localAi.send(message)' "$MAIN"
grep -q 'localAi.downloadModel' "$MAIN"
grep -q 'gemini.google.com/app' "$MAIN"
grep -q 'ClipboardManager' "$MAIN"
grep -q 'KoblenzerPuppenspieleTechnician/0.3-localai' "$MAIN"
grep -q 'wordpress_logged_in_' "$MAIN"
grep -q 'wp-login.php' "$MAIN"
grep -q 'endsWith(".koblenzer-puppenspiele.de")' "$MAIN"

# Local model runtime: LiteRT-LM, on-device file, GPU with CPU fallback and no cloud AI SDK.
grep -q 'com.google.ai.edge.litertlm:litertlm-android:0.16.0' "$GRADLE"
if grep -q 'firebase-ai\|firebase-appcheck\|google-services' "$GRADLE"; then
  echo 'FAIL local-ai: cloud Firebase AI/AppCheck dependency remains in Android app.' >&2
  exit 1
fi
grep -q 'gemma-4-E2B-it-litert-lm' "$LOCAL"
grep -q 'gemma-4-E2B-it.litertlm' "$LOCAL"
grep -q 'EngineConfig' "$LOCAL"
grep -q 'Backend.GPU()' "$LOCAL"
grep -q 'Backend.CPU()' "$LOCAL"
grep -q 'filesDir' "$LOCAL"
grep -q 'REQUIRED_FREE_BYTES' "$LOCAL"
grep -q 'ARM-Handy' "$LOCAL"
grep -q 'downloadModel' "$LOCAL"

# The local model is a JSON planner; deterministic website tools execute the plan.
grep -q 'PLANNER_SYSTEM' "$LOCAL"
grep -q '"edit_element"' "$LOCAL"
grep -q '"set_global_design"' "$LOCAL"
grep -q '"request_code_change"' "$LOCAL"
grep -q 'bridge.context()' "$LOCAL"
grep -q 'bridge.editableElements()' "$LOCAL"
grep -q 'bridge.editorCapabilities()' "$LOCAL"
grep -q 'bridge.editElement' "$LOCAL"
grep -q 'bridge.setGlobalDesign' "$LOCAL"
grep -q 'bridge.undoEditorChange' "$LOCAL"
grep -q 'bridge.redoEditorChange' "$LOCAL"
grep -q 'explicitSaveRequested' "$LOCAL"
grep -q 'bridge.saveEditorChanges' "$LOCAL"

# Technical code repair is also model-local, server-validated and CI/confirmation gated.
grep -q 'localRepairContext' "$LOCAL"
grep -q 'localRepairFiles' "$LOCAL"
grep -q 'submitLocalRepairProposal' "$LOCAL"
grep -q 'Prüfbranch erstellen?' "$LOCAL"
grep -q 'bridge.createRepairBranch' "$LOCAL"
grep -q 'CI grün' "$LOCAL"
grep -q 'kp_mobile_local_bootstrap' "$WEB"
grep -q 'kp_local_ai_repair_context' "$WEB"
grep -q 'kp_local_ai_repair_files' "$WEB"
grep -q 'kp_local_ai_repair_proposal' "$WEB"
grep -q 'kp_ai_repair_create_pr' "$WEB"
grep -q 'kp_ai_repair_status' "$WEB"
grep -q 'kp_ai_repair_merge' "$WEB"
grep -q 'if (repairNonce.isBlank()) localBootstrap()' "$WEB"
grep -q "ai-repair/rollback-" "$REPAIR_HISTORY"
grep -q 'kp_ai_repair_health_for_sha' "$REPAIR_LAB"

# Local-first APK no longer asks for microphone, screen capture or foreground media projection.
if grep -q 'RECORD_AUDIO\|MEDIA_PROJECTION\|FOREGROUND_SERVICE_MICROPHONE' "$MANIFEST"; then
  echo 'FAIL local-ai: obsolete Gemini Live capture permission remains.' >&2
  exit 1
fi
if grep -R -n -E 'GenerativeService|generativelanguage\.googleapis\.com|auth_tokens|AudioRecord|MediaProjectionManager' "$KOTLIN"; then
  echo 'FAIL local-ai: Android source still contains the old cloud/live AI transport.' >&2
  exit 1
fi

# Durable privileged credentials never enter Android.
if grep -R -n -E 'api\.github\.com|github_pat_|gh[pousr]_[A-Za-z0-9_\-]{12,}' android/homepage-technician/app/src/main; then
  echo 'FAIL local-ai: Android must not contain GitHub credentials/API directly.' >&2
  exit 1
fi
if grep -R -n -E 'AIza[A-Za-z0-9_\-]{20,}|GEMINI_API_KEY|OPENAI_API_KEY|x-goog-api-key' android/homepage-technician/app/src/main; then
  echo 'FAIL local-ai: durable cloud AI credentials must not enter Android.' >&2
  exit 1
fi
if grep -Eq 'file_put_contents|WP_Filesystem|unlink\(' "$REPAIR_HISTORY"; then
  echo 'FAIL local-ai: repair history must not mutate live website files directly.' >&2
  exit 1
fi

echo 'PASS local-ai: free on-device chat, deterministic editor control, local code planning, emergency Gemini handoff and protected CI-gated repair are present.'
