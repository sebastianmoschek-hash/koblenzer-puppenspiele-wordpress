#!/usr/bin/env bash
set -euo pipefail

APP='android/homepage-technician/app/src/main'
KOTLIN="$APP/java/de/koblenzerpuppenspiele/techniker"
BRIDGE='wp-content/mu-plugins/kp-mobile-live-bridge.php'
REPAIR_HISTORY='wp-content/mu-plugins/kp-ai-repair-history.php'
REPAIR_LAB='wp-content/mu-plugins/kp-ai-repair-lab.php'

php -l "$BRIDGE" >/dev/null
php -l "$REPAIR_HISTORY" >/dev/null
php -l "$REPAIR_LAB" >/dev/null

grep -q 'FOREGROUND_SERVICE_MEDIA_PROJECTION' "$APP/AndroidManifest.xml"
grep -q 'android:foregroundServiceType="mediaProjection|microphone"' "$APP/AndroidManifest.xml"
grep -q 'createScreenCaptureIntent' "$KOTLIN/MainActivity.kt"
grep -q 'KoblenzerPuppenspieleTechnician/0.2-directlive' "$KOTLIN/MainActivity.kt"
grep -q 'endsWith(".koblenzer-puppenspiele.de")' "$KOTLIN/MainActivity.kt"
grep -q 'editButton.setOnClickListener' "$KOTLIN/MainActivity.kt"
grep -q 'liveButton.setOnClickListener' "$KOTLIN/MainActivity.kt"
grep -q 'text = "✎ Bearbeiten"' "$KOTLIN/MainActivity.kt"
grep -q 'text = "✦ KI"' "$KOTLIN/MainActivity.kt"
grep -q 'wp-login.php' "$KOTLIN/MainActivity.kt"
grep -q 'wordpress_logged_in_' "$KOTLIN/MainActivity.kt"

# Direct Gemini Live: ephemeral server token, v1beta constrained WebSocket, audio/video and true barge-in.
grep -q 'kp_mobile_live_bootstrap' "$BRIDGE"
grep -q 'generativelanguage.googleapis.com/v1beta/auth_tokens' "$BRIDGE"
grep -q "'uses'[[:space:]]*=>[[:space:]]*1" "$BRIDGE"
grep -q 'KoblenzerPuppenspieleTechnician/' "$BRIDGE"
grep -q 'bridge.bootstrap()' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'liveProtocol' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'v1beta-u1' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'v1beta.GenerativeService.BidiGenerateContentConstrained' "$KOTLIN/GeminiLiveTechnician.kt"
if grep -q 'v1alpha.GenerativeService.BidiGenerateContentConstrained' "$KOTLIN/GeminiLiveTechnician.kt"; then
  echo 'FAIL mobile-live: obsolete v1alpha WebSocket endpoint is still present.' >&2
  exit 1
fi
grep -q 'access_token=' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'START_OF_ACTIVITY_INTERRUPTS' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'serverContent' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'interrupted' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'turnComplete' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'AudioRecord' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'AudioTrack' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'audio/pcm;rate=16000' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'ScreenFrameBus.jpegFrames' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'image/jpeg' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'realtime.put("audio", blob)' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'realtime.put("video", blob)' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'put("type", "object")' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'put("type", "string")' "$KOTLIN/GeminiLiveTechnician.kt"
if grep -q 'mediaChunks' "$KOTLIN/GeminiLiveTechnician.kt"; then
  echo 'FAIL mobile-live: deprecated mediaChunks payload is still present.' >&2
  exit 1
fi

# Gemini speech uses loudspeaker/media and can be interrupted locally as well as server-side.
grep -q 'setUsage(AudioAttributes.USAGE_MEDIA)' "$KOTLIN/GeminiLiveTechnician.kt"
if grep -q 'setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)' "$KOTLIN/GeminiLiveTechnician.kt"; then
  echo 'FAIL mobile-live: Gemini playback must not use telephony output.' >&2
  exit 1
fi
grep -q 'AudioDeviceInfo.TYPE_BUILTIN_SPEAKER' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'track.setPreferredDevice(speaker)' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'volumeControlStream = AudioManager.STREAM_MUSIC' "$KOTLIN/MainActivity.kt"
grep -q 'playbackQueue' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'triggerLocalBargeIn' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'averageAbsolutePcm16' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'LOCAL_BARGE_IN_LEVEL' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'drainPlaybackQueue' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'Unterbrechung erkannt' "$KOTLIN/GeminiLiveTechnician.kt"

# One AI agent: Live Gemini inspects elements and drives the existing editor directly.
grep -q 'inspect_editable_elements' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'edit_element' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'set_global_design' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'save_homepage' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'undo_homepage' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'redo_homepage' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'bridge.editableElements()' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'bridge.editElement' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'bridge.setGlobalDesign' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'bridge.saveEditorChanges' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'bridge.editorCapabilities' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'secondGeminiPlanner:false' "$KOTLIN/WebRepairBridge.kt"
grep -q 'window.KPRepairMobile.editableElements' "$KOTLIN/WebRepairBridge.kt"
grep -q 'window.KPRepairMobile.editElement' "$KOTLIN/WebRepairBridge.kt"
grep -q 'window.KPRepairMobile.setDesign' "$KOTLIN/WebRepairBridge.kt"
grep -q 'window.KPRepairMobile.saveChanges' "$KOTLIN/WebRepairBridge.kt"
if grep -q 'bridge.visualEdit' "$KOTLIN/GeminiLiveTechnician.kt"; then
  echo 'FAIL mobile-live: Live must not route normal editing through the legacy second-Gemini planner.' >&2
  exit 1
fi
if grep -q 'kp_ai_plan\|\.kp-ai-run' "$KOTLIN/WebRepairBridge.kt"; then
  echo 'FAIL mobile-live: Android bridge must not invoke the legacy Gemini planning UI.' >&2
  exit 1
fi

# Long-running Live conversations use compression, session resumption and automatic reconnect.
grep -q 'contextWindowCompression' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'slidingWindow' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'sessionResumption' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'sessionResumptionUpdate' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'newHandle' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'goAway' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'requestReconnect' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'Random.nextLong' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'refreshBootstrap()' "$KOTLIN/GeminiLiveTechnician.kt"

# Transient WordPress/API overload retries with exponential backoff + jitter.
grep -q 'attempt<4' "$KOTLIN/WebRepairBridge.kt"
grep -q 'Math.pow(2' "$KOTLIN/WebRepairBridge.kt"
grep -q 'Math.random()' "$KOTLIN/WebRepairBridge.kt"
grep -q 'RESOURCE_EXHAUSTED' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'UNAVAILABLE' "$KOTLIN/GeminiLiveTechnician.kt"

grep -q 'startBackgroundRepair' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'SYSTEMSTATUS:' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'du kannst weiterreden' "$KOTLIN/GeminiLiveTechnician.kt"

# Repair calls use authenticated admin-ajax and consequential code changes stay confirmation/CI gated.
grep -q 'kp_mobile_live_bootstrap' "$KOTLIN/WebRepairBridge.kt"
grep -q '/wp-admin/admin-ajax.php' "$KOTLIN/WebRepairBridge.kt"
grep -q 'repairNonce' "$KOTLIN/WebRepairBridge.kt"
grep -q 'kp_ai_repair_analyze' "$KOTLIN/WebRepairBridge.kt"
grep -q 'kp_ai_repair_create_pr' "$KOTLIN/WebRepairBridge.kt"
grep -q 'kp_ai_repair_status' "$KOTLIN/WebRepairBridge.kt"
grep -q 'kp_ai_repair_merge' "$KOTLIN/WebRepairBridge.kt"
grep -q 'kp_ai_repair_history' "$KOTLIN/WebRepairBridge.kt"
grep -q 'kp_ai_repair_rollback' "$KOTLIN/WebRepairBridge.kt"
grep -q 'create_repair_branch' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'merge_repair' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'rollback_technical_repair' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'Prüfbranch erstellen?' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'Geprüften Fix übernehmen?' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'Technik-Reparatur zurücknehmen?' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q "ai-repair/rollback-" "$REPAIR_HISTORY"
grep -q 'wurde nach dieser Reparatur erneut geändert' "$REPAIR_HISTORY"
grep -q 'kp_ai_repair_health_for_sha' "$REPAIR_LAB"

# Durable privileged credentials never enter Android.
if grep -R -n -E 'api\.github\.com|github_pat_|gh[pousr]_[A-Za-z0-9_\-]{12,}' android/homepage-technician/app/src/main; then
  echo 'FAIL mobile-live: Android must not contain or call GitHub credentials/API directly.' >&2
  exit 1
fi
if grep -R -n -E 'AIza[A-Za-z0-9_\-]{20,}|GEMINI_API_KEY|x-goog-api-key' android/homepage-technician/app/src/main; then
  echo 'FAIL mobile-live: durable Gemini API credentials must stay server-side.' >&2
  exit 1
fi
if grep -Eq 'file_put_contents|WP_Filesystem|unlink\(' "$REPAIR_HISTORY"; then
  echo 'FAIL mobile-live: repair history must not mutate live website files directly.' >&2
  exit 1
fi

echo 'PASS mobile-live: one Gemini Live agent, deterministic editor control, loudspeaker + barge-in, session resumption/reconnect and protected CI-gated code repair are present.'
