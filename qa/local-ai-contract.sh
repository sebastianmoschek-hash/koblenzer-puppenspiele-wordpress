#!/usr/bin/env bash
set -euo pipefail

DESKTOP='wp-content/mu-plugins/kp-local-ai-desktop.php'
SERVER='wp-content/mu-plugins/kp-mobile-local-ai-repair.php'
BRIDGE='wp-content/mu-plugins/kp-mobile-live-bridge.php'
REPAIR='wp-content/mu-plugins/kp-ai-repair-lab.php'

php -l "$DESKTOP" >/dev/null
php -l "$SERVER" >/dev/null
php -l "$BRIDGE" >/dev/null
php -l "$REPAIR" >/dev/null

# Cloud-free bootstrap and local repair proposals.
grep -q 'wp_ajax_kp_mobile_local_bootstrap' "$SERVER"
grep -q "'cloudModel'[[:space:]]*=>[[:space:]]*false" "$SERVER"
grep -q 'wp_ajax_kp_local_ai_repair_context' "$SERVER"
grep -q 'wp_ajax_kp_local_ai_repair_files' "$SERVER"
grep -q 'wp_ajax_kp_local_ai_repair_proposal' "$SERVER"
grep -q 'kp_ai_repair_apply_operations' "$SERVER"
grep -q 'kp_ai_repair_store_proposal' "$SERVER"

# Desktop local model UI and deterministic homepage tools.
grep -q 'Lokale PC-KI laden' "$DESKTOP"
grep -q 'Notfall Gemini' "$DESKTOP"
grep -q '@litert-lm/core' "$DESKTOP"
grep -q 'gemma-4-E2B-it-web.litertlm' "$DESKTOP"
grep -q 'navigator.gpu' "$DESKTOP"
grep -q 'Engine.create' "$DESKTOP"
grep -q 'KPRepairMobile' "$DESKTOP"
grep -q 'kp.editElement' "$DESKTOP"
grep -q 'kp.setDesign' "$DESKTOP"
grep -q 'kp.saveChanges' "$DESKTOP"
grep -q 'explicitSave' "$DESKTOP"
grep -q 'request_code_change' "$DESKTOP"
grep -q 'kp_local_ai_repair_context' "$DESKTOP"
grep -q 'kp_local_ai_repair_files' "$DESKTOP"
grep -q 'kp_local_ai_repair_proposal' "$DESKTOP"
grep -q 'kp_ai_repair_create_pr' "$DESKTOP"
grep -q 'kp_ai_repair_status' "$DESKTOP"
grep -q 'kp_ai_repair_merge' "$DESKTOP"
grep -q 'gemini.google.com/app' "$DESKTOP"

# Do not route desktop local chat through the old cloud planner.
if grep -q 'kp_ai_plan\|gemini-3\.7-flash\|generativelanguage.googleapis.com' "$DESKTOP"; then
  echo 'FAIL local-ai: desktop local chat still contains a cloud planner/API route.' >&2
  exit 1
fi

# Consequential code writes remain in the existing protected GitHub/CI flow.
grep -q 'check_ajax_referer' "$REPAIR"
grep -q 'current_user_can' "$REPAIR"
grep -q 'kp_ai_repair_allowed_path' "$REPAIR"
grep -q 'kp_ai_repair_safe_added_text' "$REPAIR"
grep -q 'kp_ai_repair_create_pr' "$REPAIR"
grep -q 'kp_ai_repair_merge' "$REPAIR"

echo 'PASS local-ai: browser-local chat, cloud-free repair bootstrap, deterministic editor actions and CI-gated code repair are present.'
