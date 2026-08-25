#!/usr/bin/env bash
set -euo pipefail

APP='android/homepage-technician/app/src/main'
KOTLIN="$APP/java/de/koblenzerpuppenspiele/techniker"
MAIN="$KOTLIN/MainActivity.kt"
LOCAL="$KOTLIN/LocalAiTechnician.kt"
VOICE="$KOTLIN/LocalVoiceController.kt"
WEB="$KOTLIN/WebRepairBridge.kt"
GRADLE='android/homepage-technician/app/build.gradle.kts'
MANIFEST="$APP/AndroidManifest.xml"
REPAIR_HISTORY='wp-content/mu-plugins/kp-ai-repair-history.php'
REPAIR_LAB='wp-content/mu-plugins/kp-ai-repair-lab.php'
LOCAL_REPAIR='wp-content/mu-plugins/kp-mobile-local-ai-repair.php'
EMERGENCY_GEMINI='wp-content/mu-plugins/kp-mobile-emergency-gemini.php'
CIRCLE_CONFIG='.circleci/config.yml'
ANDROID_REPORT='qa/publish-android-build-report.sh'

php -l "$REPAIR_HISTORY" >/dev/null
php -l "$REPAIR_LAB" >/dev/null
php -l "$LOCAL_REPAIR" >/dev/null
php -l "$EMERGENCY_GEMINI" >/dev/null

test -f "$LOCAL"
test -f "$VOICE"
test -f "$LOCAL_REPAIR"
test -f "$EMERGENCY_GEMINI"
test ! -e "$KOTLIN/GeminiLiveTechnician.kt"
test ! -e "$KOTLIN/ScreenCaptureService.kt"

# Primary UI: manual editor + real readable local AI chat + optional local Live + protected in-chat emergency Gemini.
grep -q 'text = "✎ Bearbeiten"' "$MAIN"
grep -q 'text = "✦ KI"' "$MAIN"
grep -q 'text = "Lokale KI"' "$MAIN"
grep -q 'Nachricht an die lokale KI' "$MAIN"
grep -q 'messageList' "$MAIN"
grep -q 'addChatBubble' "$MAIN"
grep -q 'Verstanden:' "$MAIN"
grep -q 'transcriptScroll.fullScroll' "$MAIN"
grep -q 'SOFT_INPUT_ADJUST_RESIZE' "$MAIN"
grep -q 'android:windowSoftInputMode="adjustResize"' "$MANIFEST"
grep -q 'text = "🎤 Live lokal"' "$MAIN"
grep -q 'showVoicePicker' "$MAIN"
grep -q 'queuedLiveRequest' "$MAIN"
grep -q 'stopSpeakingForBargeIn' "$MAIN"
grep -q 'Notfall Gemini (Cloud)' "$MAIN"
grep -q 'Gemini (Notfall)' "$MAIN"
grep -q 'repairBridge.emergencyGemini' "$MAIN"
grep -q 'repairBridge.createEmergencyGeminiBranch' "$MAIN"
grep -q 'waitForEmergencyCi' "$MAIN"
grep -q 'CI grün – Gemini-Fix übernehmen?' "$MAIN"
grep -q 'localAi.downloadModel' "$MAIN"
grep -q 'localAi.send(clean)' "$MAIN"
grep -q 'voiceController.speak(reply)' "$MAIN"
grep -q 'processLocalRequest' "$MAIN"
grep -q 'KoblenzerPuppenspieleTechnician/0.6-chatwindow' "$MAIN"
grep -q 'wordpress_logged_in_' "$MAIN"
grep -q 'wp-login.php' "$MAIN"
grep -q 'endsWith(".koblenzer-puppenspiele.de")' "$MAIN"
if grep -q 'gemini.google.com/app\|ClipboardManager\|ClipData.newPlainText' "$MAIN"; then
  echo 'FAIL emergency-gemini: Android must keep the fallback inside Homepage-Hilfe instead of launching/copying to the external Gemini app.' >&2
  exit 1
fi
# Composer stays usable before the large local model download; sending must preserve the draft.
grep -q 'Writing a task must stay possible before the 2.6 GB model is installed' "$MAIN"
grep -q 'Deine Nachricht bleibt im Eingabefeld' "$MAIN"
grep -q 'Nachricht gespeichert · lokale KI bitte einmalig installieren' "$MAIN"
grep -q 'installButton.requestFocus()' "$MAIN"
if grep -q 'voiceMode[[:space:]]*=' "$MAIN"; then
  echo 'FAIL local-ai: obsolete voiceMode planner parameter remains in MainActivity.' >&2
  exit 1
fi

# Local model runtime: LiteRT-LM, Android-sized KV cache, bounded prompt, fresh CPU retry, no cloud AI SDK.
grep -q 'com.google.ai.edge.litertlm:litertlm-android:0.16.0' "$GRADLE"
if grep -q 'firebase-ai\|firebase-appcheck\|google-services' "$GRADLE"; then
  echo 'FAIL local-ai: cloud Firebase AI/AppCheck dependency remains in Android app.' >&2
  exit 1
fi
grep -q 'gemma-4-E2B-it-litert-lm' "$LOCAL"
grep -q 'gemma-4-E2B-it.litertlm' "$LOCAL"
grep -q 'EngineConfig' "$LOCAL"
grep -q 'Backend.GPU()' "$LOCAL"
grep -q 'Backend.CPU(' "$LOCAL"
grep -q 'maxNumTokens = LOCAL_MAX_TOKENS' "$LOCAL"
grep -q 'LOCAL_MAX_TOKENS = 2048' "$LOCAL"
grep -q 'MAX_OUTPUT_TOKENS = 256' "$LOCAL"
grep -q 'MAX_MODEL_PROMPT_CHARS = 3600' "$LOCAL"
grep -q 'MAX_CPU_FALLBACK_PROMPT_CHARS = 2400' "$LOCAL"
grep -q 'ThinkingConfig(enableThinking = false' "$LOCAL"
grep -q 'compactEditableElements' "$LOCAL"
grep -q 'CPU wird frisch gestartet' "$LOCAL"
grep -q 'rebuilding CPU engine once' "$LOCAL"
grep -q 'LiteRtLmJniException' "$LOCAL"
grep -q 'resetEngine()' "$LOCAL"
grep -q 'friendlyNativeFailure' "$LOCAL"
grep -q 'isNativeInferenceFailure' "$LOCAL"
grep -q 'Log.w(TAG' "$LOCAL"
grep -q 'filesDir' "$LOCAL"
grep -q 'REQUIRED_FREE_BYTES' "$LOCAL"
grep -q 'ARM-Handy' "$LOCAL"
grep -q 'downloadModel' "$LOCAL"

# Deterministic editor actions are chosen by the local model; save remains explicit.
grep -q 'PLANNER_SYSTEM' "$LOCAL"
grep -q 'conversation.sendMessage(prompt).text' "$LOCAL"
grep -q 'parseJsonObjectOrNull' "$LOCAL"
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

# Natural Live speech: explicit on-device ASR only, partial/segmented turns, barge-in and persisted offline TTS voices.
grep -q 'android.permission.RECORD_AUDIO' "$MANIFEST"
grep -q 'SpeechRecognizer.isOnDeviceRecognitionAvailable' "$VOICE"
grep -q 'SpeechRecognizer.createOnDeviceSpeechRecognizer' "$VOICE"
grep -q 'RecognizerIntent.EXTRA_PREFER_OFFLINE' "$VOICE"
grep -q 'RecognizerIntent.EXTRA_PARTIAL_RESULTS' "$VOICE"
grep -q 'RecognizerIntent.EXTRA_SEGMENTED_SESSION' "$VOICE"
grep -q 'onSegmentResults' "$VOICE"
grep -q 'BARGE_IN_LISTEN_DELAY_MS' "$VOICE"
grep -q 'looksLikeOwnVoice' "$VOICE"
grep -q 'stopSpeakingForBargeIn' "$VOICE"
grep -q '!voice.isNetworkConnectionRequired' "$VOICE"
grep -q 'voiceOptions' "$VOICE"
grep -q 'previewVoice' "$VOICE"
grep -q 'kp-local-voice' "$VOICE"
grep -q 'voice_name' "$VOICE"
grep -q 'setSpeechRate' "$VOICE"
grep -q 'setPitch' "$VOICE"
grep -q 'Audio wird nicht an Gemini/OpenAI gesendet' "$MAIN"
if grep -q 'SpeechRecognizer.createSpeechRecognizer' "$VOICE"; then
  echo 'FAIL local-ai: Live speech must not fall back to potentially remote SpeechRecognizer.' >&2
  exit 1
fi
if grep -q 'MEDIA_PROJECTION\|FOREGROUND_SERVICE_MEDIA_PROJECTION\|FOREGROUND_SERVICE_MICROPHONE' "$MANIFEST"; then
  echo 'FAIL local-ai: local Live mode must not request screen-share/foreground projection permissions.' >&2
  exit 1
fi
if grep -R -n -E 'GenerativeService|generativelanguage\.googleapis\.com|auth_tokens|MediaProjectionManager|ScreenFrameBus' "$KOTLIN"; then
  echo 'FAIL local-ai: Android source still contains old Gemini Live/cloud screen transport.' >&2
  exit 1
fi

# Technical repair stays local-planned, server-validated and CI/confirmation gated. Red CI may feed bounded diagnostics into at most two replacement rounds.
grep -q 'localRepairContext' "$LOCAL"
grep -q 'localRepairFiles' "$LOCAL"
grep -q 'submitLocalRepairProposal' "$LOCAL"
grep -q 'Autonome Reparatur starten?' "$LOCAL"
grep -q 'MAX_AUTO_REPAIR_ROUNDS = 3' "$LOCAL"
grep -q 'waitForRepairCi' "$LOCAL"
grep -q 'CI grün – Fix übernehmen?' "$LOCAL"
grep -q 'bridge.createRepairBranch' "$LOCAL"
grep -q 'bridge.localRepairCiDiagnostics' "$LOCAL"
grep -q 'bridge.status' "$LOCAL"
grep -q 'bridge.merge' "$LOCAL"
grep -q 'kp_mobile_local_bootstrap' "$WEB"
grep -q 'kp_local_ai_repair_context' "$WEB"
grep -q 'kp_local_ai_repair_files' "$WEB"
grep -q 'kp_local_ai_repair_proposal' "$WEB"
grep -q 'kp_local_ai_repair_create_pr' "$WEB"
grep -q 'kp_local_ai_repair_ci_diagnostics' "$WEB"
grep -q 'kp_mobile_emergency_gemini' "$WEB"
grep -q 'kp_mobile_emergency_gemini_create_pr' "$WEB"
grep -q 'emergencyGeminiServerFallback:true' "$WEB"
grep -q 'localAndroidSelfRepair:true' "$WEB"
grep -q 'kp_ai_repair_status' "$WEB"
grep -q 'kp_ai_repair_merge' "$WEB"
grep -q 'if (repairNonce.isBlank()) localBootstrap()' "$WEB"
grep -q 'wp_ajax_kp_local_ai_repair_ci_diagnostics' "$LOCAL_REPAIR"
grep -q 'ai-repair/local-' "$LOCAL_REPAIR"
grep -q 'kp-local-ai-ci-diagnostics' "$LOCAL_REPAIR"
grep -q 'wp_ajax_kp_mobile_emergency_gemini' "$EMERGENCY_GEMINI"
grep -q 'wp_ajax_kp_mobile_emergency_gemini_create_pr' "$EMERGENCY_GEMINI"
grep -q 'emergency_gemini' "$EMERGENCY_GEMINI"
grep -q 'ai-repair/local-gemini-' "$EMERGENCY_GEMINI"
grep -q 'kp_mobile_emergency_allowed_path' "$EMERGENCY_GEMINI"
grep -q 'kp-mobile-emergency-gemini.php' "$EMERGENCY_GEMINI"
grep -q 'kp-mobile-local-ai-repair.php' "$EMERGENCY_GEMINI"
grep -q 'kp-local-ai-ci-diagnostics' "$ANDROID_REPORT"
grep -q 'CIRCLE_BRANCH.*ai-repair/local-' "$ANDROID_REPORT"
grep -q '/ai-repair\\/local-.*/' "$CIRCLE_CONFIG"
grep -q "ai-repair/rollback-" "$REPAIR_HISTORY"
grep -q 'kp_ai_repair_health_for_sha' "$REPAIR_LAB"

# Durable privileged credentials never enter Android. Emergency Gemini may call the cloud only through WordPress.
if grep -R -n -E 'api\.github\.com|github_pat_|gh[pousr]_[A-Za-z0-9_\-]{12,}' android/homepage-technician/app/src/main; then
  echo 'FAIL local-ai: Android must not contain GitHub credentials/API directly.' >&2
  exit 1
fi
if grep -R -n -E 'AIza[A-Za-z0-9_\-]{20,}|GEMINI_API_KEY|OPENAI_API_KEY|x-goog-api-key|generativelanguage\.googleapis\.com' android/homepage-technician/app/src/main; then
  echo 'FAIL local-ai: durable cloud AI credentials/endpoints must not enter Android.' >&2
  exit 1
fi
if grep -Eq 'file_put_contents|WP_Filesystem|unlink\(' "$REPAIR_HISTORY"; then
  echo 'FAIL local-ai: repair history must not mutate live website files directly.' >&2
  exit 1
fi

echo 'PASS local-ai: writable preinstall chat, bounded LiteRT inference, offline Live speech, protected local self-repair and in-chat server-side emergency Gemini with PR/CI/explicit merge gate are present.'
