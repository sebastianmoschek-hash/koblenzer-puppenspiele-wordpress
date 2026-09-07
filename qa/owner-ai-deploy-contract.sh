#!/usr/bin/env bash
set -euo pipefail

DIRECT='kp-ai-direct-editor.php'
MOBILE='qa/deploy-mobile-live-circleci.sh'
WORKFLOW='.github/workflows/deploy-staging.yml'

fail(){ printf 'FAIL owner AI deploy contract: %s\n' "$*" >&2; exit 1; }
for file in "$MOBILE" "$WORKFLOW" "wp-content/mu-plugins/$DIRECT" "wp-content/mu-plugins/kp-owner-web-agent.php"; do [[ -f "$file" ]] || fail "missing $file"; done

# Every selective path that deploys kp-owner-web-agent.php must also validate,
# trigger on, upload and verify the module that provides kp_ai_key/KP_AI_NONCE.
grep -Fq "'$DIRECT'" "$MOBILE" || fail "$MOBILE file list omits $DIRECT"
grep -Fq "put '\$MU/$DIRECT'" "$MOBILE" || fail "$MOBILE does not upload $DIRECT"
grep -Fq "wp-content/mu-plugins/$DIRECT" "$WORKFLOW" || fail "$WORKFLOW trigger/syntax scope omits $DIRECT"
grep -Fq "put 'wp-content/mu-plugins/$DIRECT'" "$WORKFLOW" || fail "$WORKFLOW does not upload $DIRECT"
OWNER='wp-content/mu-plugins/kp-owner-web-agent.php'
grep -Fq "wp_ajax_nopriv_kp_owner_web_agent_health" "$OWNER" || fail 'data-free WordPress runtime health endpoint missing'
grep -Fq "function_exists( 'kp_ai_key' )" "$OWNER" || fail 'runtime health endpoint does not inspect kp_ai_key'
grep -Fq 'action=kp_owner_web_agent_health' "$MOBILE" || fail "$MOBILE does not query WordPress runtime health"
grep -Fq 'action=kp_owner_web_agent_health' "$WORKFLOW" || fail "$WORKFLOW does not query WordPress runtime health"
if grep -Fq 'kp-ai-direct-editor.php?kp_ai_dep' "$MOBILE" "$WORKFLOW"; then fail 'direct PHP URL is still accepted as a runtime proof'; fi

echo 'PASS owner AI deploy dependency: direct editor is validated, uploaded and runtime-verified by every selective owner-agent deployment.'
