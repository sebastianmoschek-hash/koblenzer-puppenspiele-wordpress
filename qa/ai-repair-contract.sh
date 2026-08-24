#!/usr/bin/env bash
set -euo pipefail

FILE='wp-content/mu-plugins/kp-ai-repair-lab.php'
[[ -f "$FILE" ]] || { echo 'missing AI repair lab'; exit 1; }

if command -v php >/dev/null 2>&1; then
  php -l "$FILE" >/dev/null
fi

grep -q "Homepage-Techniker" "$FILE"
grep -q "kp_ai_repair_code" "$FILE"
grep -q "kp_ai_repair_merge" "$FILE"
grep -q "ai-repair/" "$FILE"
grep -q "kp_ai_repair_health_for_sha" "$FILE"
grep -q "'success' !== \$health\['health'\]" "$FILE"
grep -q "current_user_can( 'manage_options' )" "$FILE"
grep -q "check_ajax_referer( KP_AI_REPAIR_NONCE" "$FILE"
grep -q "Gemini never edits live files" "$FILE"
grep -q "Keine eval/shell_exec/exec/system/passthru/proc_open/popen" "$FILE"

DIRECT='wp-content/mu-plugins/kp-ai-direct-editor.php'
grep -q "Keine PHP-, JavaScript- oder Plugin-Code-Aktion erzeugen" "$DIRECT"

if grep -Eq "file_put_contents\(|WP_Filesystem\(|unlink\(" "$FILE"; then
  echo 'AI repair lab contains direct filesystem mutation primitive'
  exit 1
fi

# The local browser/phone planner must preserve the same protected repair boundary.
bash qa/local-ai-contract.sh

echo 'AI repair lab contract PASS'
