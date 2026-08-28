#!/usr/bin/env bash
set -euo pipefail

APP='android/homepage-technician/app/src/main'
KOTLIN="$APP/java/de/koblenzerpuppenspiele/techniker"
MAIN="$KOTLIN/MainActivity.kt"
LOCAL="$KOTLIN/LocalAiTechnician.kt"
VISION="$KOTLIN/LocalVisualAgent.kt"
LIVE="$KOTLIN/LiveLocalActivity.kt"
SCREEN="$KOTLIN/ScreenCaptureService.kt"
VOICE="$KOTLIN/LocalVoiceController.kt"
NATURAL_VOICE="$KOTLIN/LocalNaturalVoice.kt"
WEB="$KOTLIN/WebRepairBridge.kt"
GRADLE='android/homepage-technician/app/build.gradle.kts'
MANIFEST="$APP/AndroidManifest.xml"
REPAIR_HISTORY='wp-content/mu-plugins/kp-ai-repair-history.php'
REPAIR_LAB='wp-content/mu-plugins/kp-ai-repair-lab.php'
LOCAL_REPAIR='wp-content/mu-plugins/kp-mobile-local-ai-repair.php'
EMERGENCY_GEMINI='wp-content/mu-plugins/kp-mobile-emergency-gemini.php'
CIRCLE_CONFIG='.circleci/config.yml'
ANDROID_REPORT='qa/publish-android-build-report.sh'

for f in "$MAIN" "$LOCAL" "$VISION" "$LIVE" "$SCREEN" "$VOICE" "$NATURAL_VOICE" "$WEB" "$GRADLE" "$MANIFEST" "$REPAIR_HISTORY" "$REPAIR_LAB" "$LOCAL_REPAIR" "$EMERGENCY_GEMINI"; do
  [[ -f "$f" ]] || { echo "missing required local-live file: $f" >&2; exit 1; }
done

php -l "$REPAIR_HISTORY" >/dev/null
php -l "$REPAIR_LAB" >/dev/null
php -l "$LOCAL_REPAIR" >/dev/null
php -l "$EMERGENCY_GEMINI" >/dev/null

# Existing Android helper remains available as the text/editor fallback.
grep -q 'text = "✎ Bearbeiten"' "$MAIN"
grep -q 'text = "✦ KI"' "$MAIN"
grep -q 'text = "🎤 Live lokal"' "$MAIN"
grep -q 'Notfall Gemini (Cloud)' "$MAIN"
grep -q 'localAi.downloadModel' "$MAIN"
grep -q 'localAi.send(clean)' "$MAIN"
grep -q 'wordpress_logged_in_' "$MAIN"
grep -q 'endsWith(".koblenzer-puppenspiele.de")' "$MAIN"
if grep -q 'gemini.google.com/app\|ClipboardManager\|ClipData.newPlainText' "$MAIN"; then
  echo 'FAIL: Android must not launch/copy tasks into the external Gemini app.' >&2
  exit 1
fi

# Local text/code model stays pinned, bounded and free of cloud AI SDKs.
grep -q 'com.google.ai.edge.litertlm:litertlm-android:0.16.0' "$GRADLE"
if grep -q 'firebase-ai\|firebase-appcheck\|google-services' "$GRADLE"; then
  echo 'FAIL: cloud Firebase AI/AppCheck dependency entered Android.' >&2
  exit 1
fi
grep -q 'gemma-4-E2B-it-litert-lm' "$LOCAL"
grep -q 'gemma-4-E2B-it.litertlm' "$LOCAL"
grep -q 'LOCAL_MAX_TOKENS = 2048' "$LOCAL"
grep -q 'MAX_OUTPUT_TOKENS = 256' "$LOCAL"
grep -q 'MAX_MODEL_PROMPT_CHARS = 3600' "$LOCAL"
grep -q 'ThinkingConfig(enableThinking = false' "$LOCAL"
grep -q 'rebuilding CPU engine once' "$LOCAL"
grep -q 'resetEngine()' "$LOCAL"
grep -q 'explicitSaveRequested' "$LOCAL"
grep -q 'bridge.saveEditorChanges' "$LOCAL"

# New local visual companion reuses the SAME downloaded Gemma file and sends
# the latest local screenshot to LiteRT-LM as image input. No second cloud/model API.
grep -q 'gemma-4-E2B-it.litertlm' "$VISION"
grep -q 'Content.ImageFile' "$VISION"
grep -q 'Content.Text' "$VISION"
grep -q 'visionBackend = visionBackend' "$VISION"
grep -q 'Backend.GPU()' "$VISION"
grep -q 'Backend.CPU(' "$VISION"
grep -q 'MAX_TOKENS = 2048' "$VISION"
grep -q 'No screen frame leaves the device' "$VISION"
grep -q 'handoff' "$VISION"
grep -q 'localAi.send(visual.handoff)' "$LIVE"
grep -q 'visualAi.release()' "$LIVE"
grep -q 'localAi.release()' "$LIVE"

# Android supplies the one capability Chrome/PWA on Android cannot supply:
# explicit MediaProjection screen sharing into an app-private, throttled frame cache.
grep -q 'android.permission.FOREGROUND_SERVICE' "$MANIFEST"
grep -q 'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION' "$MANIFEST"
grep -q 'android:foregroundServiceType="mediaProjection"' "$MANIFEST"
grep -q 'android:name=".ScreenCaptureService"' "$MANIFEST"
grep -q 'android:name=".LiveLocalActivity"' "$MANIFEST"
grep -q 'android:host="vision"' "$MANIFEST"
grep -q 'MediaProjectionManager' "$LIVE"
grep -q 'createScreenCaptureIntent' "$LIVE"
grep -q 'ScreenCaptureService.start' "$LIVE"
grep -q 'ScreenCaptureService.latestFrame' "$LIVE"
grep -q 'MediaProjectionManager' "$SCREEN"
grep -q 'ImageReader' "$SCREEN"
grep -q 'FRAME_INTERVAL_MS = 900L' "$SCREEN"
grep -q 'MAX_FRAME_SIDE = 768' "$SCREEN"
grep -q 'latest.jpg' "$SCREEN"
grep -q 'Nothing is uploaded by this service' "$SCREEN"

# The web app remains the UI. Native capability is exposed only to trusted
# Koblenzer pages through the KPLocalLive JavaScript bridge.
grep -q 'addJavascriptInterface(LocalLiveBridge(), "KPLocalLive")' "$LIVE"
grep -q 'KoblenzerPuppenspieleLocalLive/1.0' "$LIVE"
grep -q "CustomEvent('kp:local-live'" "$LIVE"
grep -q 'kp-wa-local-live' "$LIVE"
grep -q 'Live lokal · Bildschirm + Sprache + Gemma auf dem Gerät' "$LIVE"
grep -q 'fun isAvailable(): Boolean = currentPageTrusted' "$LIVE"
grep -q 'fun ask(requestId: String, text: String)' "$LIVE"
grep -q 'fun installModel()' "$LIVE"
grep -q 'endsWith(".koblenzer-puppenspiele.de")' "$LIVE"

# Speech recognition remains explicitly on-device. Output is exclusively the
# bundled Thorsten High engine; Android/Google system TTS must not re-enter.
grep -q 'android.permission.RECORD_AUDIO' "$MANIFEST"
grep -q 'SpeechRecognizer.isOnDeviceRecognitionAvailable' "$VOICE"
grep -q 'SpeechRecognizer.createOnDeviceSpeechRecognizer' "$VOICE"
grep -q 'RecognizerIntent.EXTRA_PREFER_OFFLINE' "$VOICE"
grep -q 'LocalNaturalVoice' "$VOICE"
grep -q 'naturalVoice.speak' "$VOICE"
grep -q 'keine Systemstimme verwendet' "$VOICE"
grep -q 'Thorsten High' "$NATURAL_VOICE"
grep -q 'OfflineTts' "$NATURAL_VOICE"
grep -q 'stopSpeakingForBargeIn' "$VOICE"
if grep -q 'SpeechRecognizer.createSpeechRecognizer' "$VOICE"; then
  echo 'FAIL: local Live speech must not fall back to potentially remote SpeechRecognizer.' >&2
  exit 1
fi
if grep -R -n -E 'android\.speech\.tts\.TextToSpeech|\bTextToSpeech\s*\(' "$KOTLIN" >/tmp/kp-system-tts.txt 2>/dev/null; then
  cat /tmp/kp-system-tts.txt >&2
  echo 'FAIL: Android/Google system TTS fallback re-entered the local voice path.' >&2
  exit 1
fi

# Technical changes still use the existing deterministic editor/server repair
# path with bounded autonomous rounds and explicit green-CI merge confirmation.
grep -q 'localRepairContext' "$LOCAL"
grep -q 'localRepairFiles' "$LOCAL"
grep -q 'submitLocalRepairProposal' "$LOCAL"
grep -q 'MAX_AUTO_REPAIR_ROUNDS = 3' "$LOCAL"
grep -q 'CI grün – Fix übernehmen?' "$LOCAL"
grep -q 'bridge.createRepairBranch' "$LOCAL"
grep -q 'bridge.localRepairCiDiagnostics' "$LOCAL"
grep -q 'bridge.merge' "$LOCAL"
grep -q 'kp_local_ai_repair_context' "$WEB"
grep -q 'kp_local_ai_repair_files' "$WEB"
grep -q 'kp_local_ai_repair_proposal' "$WEB"
grep -q 'kp_local_ai_repair_create_pr' "$WEB"
grep -q 'kp_local_ai_repair_ci_diagnostics' "$WEB"
grep -q 'ai-repair/local-' "$LOCAL_REPAIR"
grep -q 'kp-local-ai-ci-diagnostics' "$ANDROID_REPORT"
grep -q '/ai-repair\\/local-.*/' "$CIRCLE_CONFIG"
grep -q 'kp_ai_repair_health_for_sha' "$REPAIR_LAB"

# Durable credentials and cloud model endpoints must never enter the native
# local-live implementation. Screen pixels stay local; only the pre-existing
# WordPress repair bridge may use the network for Git/CI after a textual handoff.
if grep -R -n -E 'api\.github\.com|github_pat_|gh[pousr]_[A-Za-z0-9_\-]{12,}' "$APP"; then
  echo 'FAIL: Android contains GitHub credential/API material.' >&2
  exit 1
fi
if grep -R -n -E 'AIza[A-Za-z0-9_\-]{20,}|GEMINI_API_KEY|OPENAI_API_KEY|x-goog-api-key|generativelanguage\.googleapis\.com' "$APP"; then
  echo 'FAIL: durable cloud AI credentials/endpoints entered Android local-live code.' >&2
  exit 1
fi
if grep -Eq 'file_put_contents|WP_Filesystem|unlink\(' "$REPAIR_HISTORY"; then
  echo 'FAIL: repair history must not mutate live website files directly.' >&2
  exit 1
fi

echo 'PASS local-live: same-device Gemma vision + MediaProjection + on-device recognition + Thorsten High local TTS + web bridge are present; cloud screen transport/system TTS are absent and code repair remains CI-gated.'
