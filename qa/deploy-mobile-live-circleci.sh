#!/usr/bin/env bash
set -euo pipefail

STAGING_BASE="${STAGING_BASE:-https://neu.koblenzer-puppenspiele.de}"
MU='wp-content/mu-plugins'
export LFTP_PASSWORD="${STAGING_FTP_PASSWORD:-${LFTP_PASSWORD:-}}"

: "${STAGING_FTP_SERVER:?STAGING_FTP_SERVER fehlt}"
: "${STAGING_FTP_USERNAME:?STAGING_FTP_USERNAME fehlt}"
: "${LFTP_PASSWORD:?STAGING_FTP_PASSWORD fehlt}"

files=(
  'kp-mobile-live-bridge.php'
  'kp-mobile-live-bootstrap-v2.php'
  'kp-mobile-live-protocol-marker.php'
  'kp-mobile-live-image-tools.php'
  'kp-mobile-live-image-adapter.php'
  'kp-mobile-local-ai-repair.php'
  'kp-mobile-local-image-tools.php'
  'kp-local-ai-desktop.php'
  'kp-local-ai-marker.php'
  'kp-owner-web-agent.php'
  'kp-ai-repair-lab.php'
)

for name in "${files[@]}"; do
  test -f "$MU/$name"
  php -l "$MU/$name" >/dev/null
done

lftp -c "
set ftp:ssl-force true;
set ftp:ssl-protect-data true;
set ssl:verify-certificate true;
set net:max-retries 2;
set net:timeout 20;
open --user '$STAGING_FTP_USERNAME' --env-password -p 21 '$STAGING_FTP_SERVER';
mkdir -p /wp-content/mu-plugins;
rm -f /wp-content/mu-plugins/kp-openrouter-bridge.php;
put '$MU/kp-mobile-live-bridge.php' -o '/wp-content/mu-plugins/kp-mobile-live-bridge.php';
put '$MU/kp-mobile-live-bootstrap-v2.php' -o '/wp-content/mu-plugins/kp-mobile-live-bootstrap-v2.php';
put '$MU/kp-mobile-live-protocol-marker.php' -o '/wp-content/mu-plugins/kp-mobile-live-protocol-marker.php';
put '$MU/kp-mobile-live-image-tools.php' -o '/wp-content/mu-plugins/kp-mobile-live-image-tools.php';
put '$MU/kp-mobile-live-image-adapter.php' -o '/wp-content/mu-plugins/kp-mobile-live-image-adapter.php';
put '$MU/kp-mobile-local-ai-repair.php' -o '/wp-content/mu-plugins/kp-mobile-local-ai-repair.php';
put '$MU/kp-mobile-local-image-tools.php' -o '/wp-content/mu-plugins/kp-mobile-local-image-tools.php';
put '$MU/kp-local-ai-desktop.php' -o '/wp-content/mu-plugins/kp-local-ai-desktop.php';
put '$MU/kp-local-ai-marker.php' -o '/wp-content/mu-plugins/kp-local-ai-marker.php';
put '$MU/kp-owner-web-agent.php' -o '/wp-content/mu-plugins/kp-owner-web-agent.php';
put '$MU/kp-ai-repair-lab.php' -o '/wp-content/mu-plugins/kp-ai-repair-lab.php';
bye
"

marker="$(mktemp)"
diagnostics_dir="qa-results/mobile-live"
mkdir -p "$diagnostics_dir"
: > "$diagnostics_dir/marker-attempts.log"
for attempt in $(seq 1 12); do
  if curl --fail --silent --show-error --location \
      -H 'Cache-Control: no-cache, no-store' \
      "$STAGING_BASE/?kp_mobile_live_protocol=1&kp_ci=${CIRCLE_SHA1:-manual}-$attempt" \
      -o "$marker" \
    && jq -e '.success == true and .data.protocol == "v1beta-u1" and .data.tokenMode == "ephemeral-one-use-unconstrained" and .data.agentMode == "single-live-direct-editor" and .data.directEditor == true and .data.directImage == true' "$marker" >/dev/null; then
    echo 'PASS legacy mobile-live marker remains healthy'
    break
  fi
  if [[ "$attempt" -eq 12 ]]; then
    echo 'FAIL mobile-live staging marker did not reach expected generation.' >&2
    cat "$marker" >&2 || true
    cp "$diagnostics_dir/marker-attempts.log" "$diagnostics_dir/marker-last.log" || true
    exit 1
  fi
  {
    printf "\n=== mobile-live marker attempt %s ===\n" "$attempt"
    sed -n "1,120p" "$marker"
  } >> "$diagnostics_dir/marker-attempts.log"
  sleep 2
done

local_marker="$(mktemp)"
for attempt in $(seq 1 12); do
  if curl --fail --silent --show-error --location \
      -H 'Cache-Control: no-cache, no-store' \
      "$STAGING_BASE/?kp_local_ai_marker=1&kp_ci=${CIRCLE_SHA1:-manual}-$attempt" \
      -o "$local_marker" \
    && jq -e '.version == "local-first-v1" and .primaryMode == "local-chat" and .desktopLocalAi == true and .androidLocalAi == true and .cloudModel == false and .emergencyGemini == "handoff-only"' "$local_marker" >/dev/null; then
    echo 'PASS local-ai staging marker: local chat / cloudModel=false / emergency handoff'
    break
  fi
  if [[ "$attempt" -eq 12 ]]; then
    echo 'FAIL local-ai staging marker did not reach local-first-v1.' >&2
    cat "$local_marker" >&2 || true
    exit 1
  fi
  sleep 2
done

bootstrap="$(mktemp)"
http_code="$(curl --silent --show-error --location \
  -A 'KoblenzerPuppenspieleTechnician/0.6-chatwindow' \
  -o "$bootstrap" -w '%{http_code}' \
  -X POST -d 'action=kp_mobile_local_bootstrap' \
  "$STAGING_BASE/wp-admin/admin-ajax.php")"

if [[ "$http_code" != '401' ]] || ! jq -e '.success == false and (.data.message | contains("Bitte zuerst bei WordPress anmelden"))' "$bootstrap" >/dev/null; then
  echo "FAIL local-ai unauthenticated bootstrap gate: HTTP $http_code" >&2
  cat "$bootstrap" >&2 || true
  exit 1
fi

echo 'PASS local-ai bootstrap auth gate: HTTP 401'
