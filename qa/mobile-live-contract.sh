#!/usr/bin/env bash
set -euo pipefail

APP='android/homepage-technician/app/src/main'
KOTLIN="$APP/java/de/koblenzerpuppenspiele/techniker"
BRIDGE='wp-content/mu-plugins/kp-mobile-live-bridge.php'
REPAIR_HISTORY='wp-content/mu-plugins/kp-ai-repair-history.php'

php -l "$BRIDGE" >/dev/null
php -l "$REPAIR_HISTORY" >/dev/null

grep -q 'FOREGROUND_SERVICE_MEDIA_PROJECTION' "$APP/AndroidManifest.xml"
grep -q 'android:foregroundServiceType="mediaProjection|microphone"' "$APP/AndroidManifest.xml"
grep -q 'createScreenCaptureIntent' "$KOTLIN/MainActivity.kt"
grep -q 'KoblenzerPuppenspieleTechnician/0.1' "$KOTLIN/MainActivity.kt"
grep -q 'endsWith(".koblenzer-puppenspiele.de")' "$KOTLIN/MainActivity.kt"
grep -q 'sendVideoRealtime' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'create_repair_branch' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'merge_repair' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'undo_last_editor_change' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'redo_last_editor_change' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'rollback_technical_repair' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'confirm("Prüfbranch erstellen?' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'confirm("Technik-Reparatur zurücknehmen?' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'confirm("Geprüfte Änderung übernehmen?' "$KOTLIN/GeminiLiveTechnician.kt"
grep -q 'KPRepairMobile={ready:true' "$BRIDGE"
grep -q 'koblenzerpuppenspiele://live?url=' "$BRIDGE"
grep -q 'KPWordHistory.undo' "$BRIDGE"
grep -q 'KPWordHistory.redo' "$BRIDGE"
grep -q 'kp_ai_repair_analyze' "$BRIDGE"
grep -q 'kp_ai_repair_create_pr' "$BRIDGE"
grep -q 'kp_ai_repair_status' "$BRIDGE"
grep -q 'kp_ai_repair_merge' "$BRIDGE"
grep -q 'kp_ai_repair_history' "$BRIDGE"
grep -q 'kp_ai_repair_rollback' "$BRIDGE"
grep -q "ai-repair/rollback-" "$REPAIR_HISTORY"
grep -q 'wurde nach dieser Reparatur erneut geändert' "$REPAIR_HISTORY"
grep -q "kp_ai_repair_health_for_sha" 'wp-content/mu-plugins/kp-ai-repair-lab.php'

if grep -R -n 'api.github.com' android/homepage-technician/app/src/main; then
  echo 'FAIL mobile-live: Android must not call GitHub directly.' >&2
  exit 1
fi

if grep -Eq 'file_put_contents|WP_Filesystem|unlink\(' "$REPAIR_HISTORY"; then
  echo 'FAIL mobile-live: repair history must not mutate live website files directly.' >&2
  exit 1
fi

echo 'PASS mobile-live: screen sharing, reversible editor history, protected rollback and confirmation gates are present.'
