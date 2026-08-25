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

# Primary owner web app: two-button browser shell, fast chat, direct draft editing and protected code-repair flow.
WEB_BOOT='wp-content/mu-plugins/kp-owner-web-agent.php'
WEB_JS='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/owner-web-agent.js'
WEB_FAST_JS='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/owner-web-agent-fast-chat.js'
WEB_CSS='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/owner-web-agent.css'
EMERGENCY='wp-content/mu-plugins/kp-mobile-emergency-gemini.php'
FAST_REPAIR='wp-content/mu-plugins/kp-owner-web-repair-fast.php'
DEV_LOADER='wp-content/mu-plugins/kp-owner-web-dev-loader.php'

for web_file in "$WEB_BOOT" "$WEB_JS" "$WEB_FAST_JS" "$WEB_CSS" "$EMERGENCY" "$FAST_REPAIR" "$DEV_LOADER"; do
  [[ -f "$web_file" ]] || { echo "missing web-agent file: $web_file"; exit 1; }
done

if command -v php >/dev/null 2>&1; then
  php -l "$WEB_BOOT" >/dev/null
  php -l "$EMERGENCY" >/dev/null
  php -l "$FAST_REPAIR" >/dev/null
  php -l "$DEV_LOADER" >/dev/null
fi
if command -v node >/dev/null 2>&1; then
  node --check "$WEB_JS"
  node --check "$WEB_FAST_JS"
fi

grep -q "window.KPOwnerWebAgent" "$WEB_BOOT"
grep -q "wp_create_nonce( KP_AI_NONCE" "$WEB_BOOT"
grep -q "wp_create_nonce( KP_AI_REPAIR_NONCE" "$WEB_BOOT"
grep -q "wp_ajax_kp_owner_web_agent_chat" "$WEB_BOOT"
grep -q "gemini-3.5-flash-lite" "$WEB_BOOT"
grep -q "generativelanguage.googleapis.com/v1/interactions" "$WEB_BOOT"
grep -q "CURL_IPRESOLVE_V4" "$WEB_BOOT"
grep -q "CURLOPT_CONNECTTIMEOUT" "$WEB_BOOT"
grep -q "kp-owner-web-agent-fast-chat" "$WEB_BOOT"
grep -q "✎ Bearbeiten" "$WEB_JS"
grep -q "✦ KI" "$WEB_JS"
grep -q "Was soll ich erklären, ändern oder reparieren?" "$WEB_JS"
grep -q "kp_mobile_emergency_gemini" "$WEB_JS"
grep -q "kp_mobile_emergency_gemini_create_pr" "$WEB_JS"
grep -q "kp_ai_repair_status" "$WEB_JS"
grep -q "kp_local_ai_repair_ci_diagnostics" "$WEB_JS"
grep -q "kp_ai_repair_merge" "$WEB_JS"
grep -q "Grünen Fix übernehmen" "$WEB_JS"
grep -q "Du kannst währenddessen weiter mit mir schreiben" "$WEB_JS"
grep -q "sessionStorage" "$WEB_JS"
grep -q "kp-ai-trigger" "$WEB_JS"
grep -q "Noch wurde kein Code übernommen" "$WEB_JS"
grep -q "kp_owner_web_agent_chat" "$WEB_FAST_JS"
grep -q "schnellen Web-Chat" "$WEB_FAST_JS"
grep -q "kp-web-agent-active .kp-ai-trigger" "$WEB_CSS"

# Explicit code tasks are intercepted before the old 55-second router and use the proven fast transport.
grep -Fq "wp_ajax_kp_mobile_emergency_gemini" "$FAST_REPAIR"
grep -Fq "}, 1 );" "$FAST_REPAIR"
grep -Fq "gemini-3.5-flash-lite" "$FAST_REPAIR"
grep -Fq "generativelanguage.googleapis.com/v1/interactions" "$FAST_REPAIR"
grep -Fq "thinking_level' => 'low" "$FAST_REPAIR"
grep -Fq "array_slice( (array) ( \$selection['files'] ?? array() ), 0, 2" "$FAST_REPAIR"
grep -Fq "emergency_gemini' => true" "$FAST_REPAIR"
grep -Fq "fast_web_repair'  => true" "$FAST_REPAIR"
grep -Fq "kp_ai_repair_store_proposal" "$FAST_REPAIR"
grep -Fq "eine weitere Chat-oder-Reparatur-Entscheidung ist nicht nötig" "$FAST_REPAIR"

# Staging-only live asset loader: routine JS/CSS iterations come straight from the private feature branch.
grep -Fq "feature/webapp-primary-agent" "$DEV_LOADER"
grep -Fq "neu.koblenzer-puppenspiele.de" "$DEV_LOADER"
grep -Fq "current_user_can( 'edit_pages' )" "$DEV_LOADER"
grep -Fq "check_ajax_referer( KP_OWNER_WEB_DEV_NONCE" "$DEV_LOADER"
grep -Fq "script_loader_src" "$DEV_LOADER"
grep -Fq "style_loader_src" "$DEV_LOADER"
grep -Fq "owner-web-agent.js" "$DEV_LOADER"
grep -Fq "owner-web-agent-fast-chat.js" "$DEV_LOADER"
grep -Fq "owner-web-agent.css" "$DEV_LOADER"
grep -Fq "kp_ai_repair_gh(" "$DEV_LOADER"
grep -Fq "Cache-Control: private, no-store" "$DEV_LOADER"
grep -Fq "X-Content-Type-Options: nosniff" "$DEV_LOADER"

if grep -Eq "AIza[A-Za-z0-9_-]{20,}|github_pat_|gh[pousr]_[A-Za-z0-9_-]{12,}" "$WEB_JS" "$WEB_FAST_JS" "$WEB_BOOT" "$FAST_REPAIR" "$DEV_LOADER"; then
  echo 'Owner web agent must not contain durable Gemini/GitHub credentials'
  exit 1
fi

if grep -Eq "file_put_contents\(|WP_Filesystem\(|unlink\(" "$FILE" "$FAST_REPAIR" "$DEV_LOADER"; then
  echo 'AI repair/dev-loader path contains direct filesystem mutation primitive'
  exit 1
fi

echo 'AI repair + primary owner web-agent + staging live-loader contract PASS'
