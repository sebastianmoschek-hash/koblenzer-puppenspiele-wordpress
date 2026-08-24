#!/usr/bin/env bash
set -euo pipefail

APP='android/homepage-technician/app/src/main'
KOTLIN="$APP/java/de/koblenzerpuppenspiele/techniker"
BRIDGE='wp-content/mu-plugins/kp-mobile-live-bridge.php'

php -l "$BRIDGE" >/dev/null

grep -q 'FOREGROUND_SERVICE_MEDIA_PROJECTION' "$APP/AndroidManifest.xml"
grep -q 'android:foregroundServiceType="mediaProjection|microphone"' "$APP/AndroidManifest.xml"
grep -q 'createScreenCaptureIntent' "$KOTLIN/MainActivity.kt"
grep -q 'KoblenzerPuppenspieleTechnician/0.1' "$KOTLIN/MainActivity.kt"
grep -q 'endsWith(".koblenzer-puppenspiele.de")' "$KOTLIN/MainActivity.kt"
grep -q 'sendVideoRealtime' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'create_repair_branch' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'merge_repair' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'confirm("Prüfbranch erstellen?' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'confirm("Geprüften Fix übernehmen?' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'KPRepairMobile={ready:true' "$BRIDGE"
grep -q 'koblenzerpuppenspiele://live?url=' "$BRIDGE"
grep -q 'kp_ai_repair_analyze' "$BRIDGE"
grep -q 'kp_ai_repair_create_pr' "$BRIDGE"
grep -q 'kp_ai_repair_status' "$BRIDGE"
grep -q 'kp_ai_repair_merge' "$BRIDGE"

if grep -R -n 'api.github.com' android/homepage-technician/app/src/main; then
  echo 'FAIL mobile-live: Android must not call GitHub directly.' >&2
  exit 1
fi

echo 'PASS mobile-live: screen sharing, Gemini tools, server bridge and confirmation gates are present.'
