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
grep -q 'wp-login.php' "$KOTLIN/MainActivity.kt"
grep -q 'wordpress_logged_in_' "$KOTLIN/MainActivity.kt"

# Direct Gemini Live: ephemeral server token, current v1beta WebSocket, microphone/video and true barge-in.
grep -q 'kp_mobile_live_bootstrap' "$BRIDGE"
grep -q 'generativelanguage.googleapis.com/v1beta/auth_tokens' "$BRIDGE"
grep -q "'uses'[[:space:]]*=>[[:space:]]*1" "$BRIDGE"
grep -q 'KoblenzerPuppenspieleTechnician/' "$BRIDGE"
grep -q 'bridge.bootstrap()' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'v1beta.GenerativeService.BidiGenerateContent' "$KOTLIN/GeminiLiveTechnician.kt"
if grep -q 'BidiGenerateContentConstrained' "$KOTLIN/GeminiLiveTechnician.kt"; then
  echo 'FAIL mobile-live: obsolete constrained Gemini Live WebSocket endpoint is still present.' >&2
  exit 1
fi
grep -q 'access_token=' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'START_OF_ACTIVITY_INTERRUPTS' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'serverContent' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'interrupted' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'AudioRecord' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'AudioTrack' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'audio/pcm;rate=16000' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'ScreenFrameBus.jpegFrames' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'image/jpeg' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'mediaChunks' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'startBackgroundRepair' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'SYSTEMSTATUS:' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'du kannst weiterreden' "$KOTLIN/GeminiLiveTechnician.kt"

# Repair calls must survive a broken page footer by using authenticated admin-ajax directly.
grep -q 'kp_mobile_live_bootstrap' "$KOTLIN/WebRepairBridge.kt"
grep -q '/wp-admin/admin-ajax.php' "$KOTLIN/WebRepairBridge.kt"
grep -q 'repairNonce' "$KOTLIN/WebRepairBridge.kt"
grep -q 'kp_ai_repair_analyze' "$KOTLIN/WebRepairBridge.kt"
grep -q 'kp_ai_repair_create_pr' "$KOTLIN/WebRepairBridge.kt"
grep -q 'kp_ai_repair_status' "$KOTLIN/WebRepairBridge.kt"
grep -q 'kp_ai_repair_merge' "$KOTLIN/WebRepairBridge.kt"
grep -q 'kp_ai_repair_history' "$KOTLIN/WebRepairBridge.kt"
grep -q 'kp_ai_repair_rollback' "$KOTLIN/WebRepairBridge.kt"

# Consequential code changes remain confirmation gated and CI protected.
grep -q 'create_repair_branch' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'merge_repair' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'rollback_technical_repair' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'confirm("Prüfbranch erstellen?' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'confirm("Geprüften Fix übernehmen?' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'confirm("Technik-Reparatur zurücknehmen?' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q "ai-repair/rollback-" "$REPAIR_HISTORY"
grep -q 'wurde nach dieser Reparatur erneut geändert' "$REPAIR_HISTORY"
grep -q 'kp_ai_repair_health_for_sha' "$REPAIR_LAB"

# Durable privileged credentials must never be embedded in the Android project.
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

echo 'PASS mobile-live: current v1beta ephemeral Gemini Live, mediaChunks, barge-in, continuous microphone/video, background repair analysis and protected CI-gated code repair are present.'
