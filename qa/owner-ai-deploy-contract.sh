#!/usr/bin/env bash
set -euo pipefail

DIRECT='kp-ai-direct-editor.php'
MOBILE='qa/deploy-mobile-live-circleci.sh'
WORKFLOW='.github/workflows/deploy-staging.yml'

fail(){ printf 'FAIL owner AI deploy contract: %s\n' "$*" >&2; exit 1; }
for file in "$MOBILE" "$WORKFLOW" "wp-content/mu-plugins/$DIRECT"; do [[ -f "$file" ]] || fail "missing $file"; done

# Every selective path that deploys kp-owner-web-agent.php must also validate,
# trigger on, upload and verify the module that provides kp_ai_key/KP_AI_NONCE.
grep -Fq "'$DIRECT'" "$MOBILE" || fail "$MOBILE file list omits $DIRECT"
grep -Fq "put '\$MU/$DIRECT'" "$MOBILE" || fail "$MOBILE does not upload $DIRECT"
grep -Fq "wp-content/mu-plugins/$DIRECT" "$WORKFLOW" || fail "$WORKFLOW trigger/syntax scope omits $DIRECT"
grep -Fq "put 'wp-content/mu-plugins/$DIRECT'" "$WORKFLOW" || fail "$WORKFLOW does not upload $DIRECT"
grep -Fq "kp_ai_key" "$MOBILE" || fail "$MOBILE does not verify runtime dependency after deploy"
grep -Fq "kp_ai_key" "$WORKFLOW" || fail "$WORKFLOW does not verify runtime dependency after deploy"

echo 'PASS owner AI deploy dependency: direct editor is validated, uploaded and runtime-verified by every selective owner-agent deployment.'
