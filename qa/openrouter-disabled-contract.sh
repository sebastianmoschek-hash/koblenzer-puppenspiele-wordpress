#!/usr/bin/env bash
set -euo pipefail

ANDROID_MAIN='android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/MainActivity.kt'
ANDROID_GRADLE='android/homepage-technician/app/build.gradle.kts'
ANDROID_FALLBACK='android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/OpenRouterFallback.kt'
REPAIR_LAB='wp-content/mu-plugins/kp-ai-repair-lab.php'
WEB_AGENT='wp-content/mu-plugins/kp-owner-web-agent.php'
BRIDGE='wp-content/mu-plugins/kp-openrouter-bridge.php'
DEPLOY_MOBILE='qa/deploy-mobile-live-circleci.sh'
DEPLOY_SMART='qa/circleci-homepage-lab-smart.sh'
DEPLOY_LAB='qa/circleci-homepage-lab.sh'
DEPLOY_TEXT='qa/text-save-staging-lab.sh'
DEPLOY_GITHUB='.github/workflows/deploy-staging.yml'

for file in "$ANDROID_MAIN" "$ANDROID_GRADLE" "$ANDROID_FALLBACK" "$REPAIR_LAB" "$WEB_AGENT" "$BRIDGE" "$DEPLOY_MOBILE" "$DEPLOY_SMART" "$DEPLOY_LAB" "$DEPLOY_TEXT" "$DEPLOY_GITHUB"; do
  [[ -f "$file" ]] || { echo "missing OpenRouter-disable contract file: $file" >&2; exit 1; }
done

# Android has neither a direct call nor build-time provider configuration.
if grep -q 'OpenRouterFallback\.' "$ANDROID_MAIN"; then
  echo 'FAIL: Android still invokes OpenRouterFallback.' >&2
  exit 1
fi
if grep -R -n -E 'openrouter\.ai|OPENROUTER_API_KEY|OPENROUTER_MODEL' android/homepage-technician/app; then
  echo 'FAIL: Android still contains an OpenRouter endpoint or build configuration.' >&2
  exit 1
fi
grep -Fq 'intentionally disabled' "$ANDROID_FALLBACK"
grep -Fq 'fun isConfigured(): Boolean = false' "$ANDROID_FALLBACK"

# WordPress keeps the old bridge only behind a deliberate server-side opt-in;
# routine chat and repair routes must never choose it automatically.
grep -Fq 'KP_OPENROUTER_MANUAL_ENABLED' "$BRIDGE"
if grep -Eq 'kp_openrouter_(ready|ask|ask_json|config)\(' "$REPAIR_LAB" "$WEB_AGENT"; then
  echo 'FAIL: a normal WordPress chat or repair path still invokes OpenRouter.' >&2
  exit 1
fi

# Every staging deploy path removes a stale MU-plugin and never uploads it.
grep -Fq 'rm -f /wp-content/mu-plugins/kp-openrouter-bridge.php' "$DEPLOY_MOBILE"
grep -Fq 'rm -f /wp-content/mu-plugins/kp-openrouter-bridge.php' "$DEPLOY_SMART"
grep -Fq -- "--exclude-glob 'kp-openrouter-bridge.php'" "$DEPLOY_SMART"
grep -Fq 'rm -f /wp-content/mu-plugins/kp-openrouter-bridge.php' "$DEPLOY_LAB"
grep -Fq -- "--exclude-glob 'kp-openrouter-bridge.php'" "$DEPLOY_LAB"
grep -Fq 'rm -f /wp-content/mu-plugins/kp-openrouter-bridge.php' "$DEPLOY_TEXT"
grep -Fq -- "--exclude-glob 'kp-openrouter-bridge.php'" "$DEPLOY_TEXT"
grep -Fq "rm -f '/wp-content/mu-plugins/kp-openrouter-bridge.php'" "$DEPLOY_GITHUB"
if grep -E 'put .*kp-openrouter-bridge\.php' "$DEPLOY_MOBILE" "$DEPLOY_SMART" "$DEPLOY_LAB" "$DEPLOY_TEXT" "$DEPLOY_GITHUB"; then
  echo 'FAIL: a staging deploy path still uploads the OpenRouter MU-plugin.' >&2
  exit 1
fi

echo 'PASS openrouter-disabled: Android has no runtime fallback, WordPress routes do not select it, and staging deploys remove rather than upload the legacy bridge.'
