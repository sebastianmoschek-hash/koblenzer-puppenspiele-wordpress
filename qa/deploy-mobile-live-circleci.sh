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
put '$MU/kp-mobile-live-bridge.php' -o '/wp-content/mu-plugins/kp-mobile-live-bridge.php';
put '$MU/kp-mobile-live-bootstrap-v2.php' -o '/wp-content/mu-plugins/kp-mobile-live-bootstrap-v2.php';
put '$MU/kp-mobile-live-protocol-marker.php' -o '/wp-content/mu-plugins/kp-mobile-live-protocol-marker.php';
put '$MU/kp-mobile-live-image-tools.php' -o '/wp-content/mu-plugins/kp-mobile-live-image-tools.php';
bye
"

marker="$(mktemp)"
for attempt in $(seq 1 12); do
  if curl --fail --silent --show-error --location \
      -H 'Cache-Control: no-cache, no-store' \
      "$STAGING_BASE/?kp_mobile_live_protocol=1&kp_ci=${CIRCLE_SHA1:-manual}-$attempt" \
      -o "$marker" \
    && jq -e '.success == true and .data.protocol == "v1beta-u1" and .data.tokenMode == "ephemeral-one-use-unconstrained"' "$marker" >/dev/null; then
    echo 'PASS mobile-live staging marker: v1beta-u1 / ephemeral-one-use-unconstrained'
    break
  fi
  if [[ "$attempt" -eq 12 ]]; then
    echo 'FAIL mobile-live staging marker did not reach v1beta-u1.' >&2
    cat "$marker" >&2 || true
    exit 1
  fi
  sleep 2
done

bootstrap="$(mktemp)"
http_code="$(curl --silent --show-error --location \
  -A 'KoblenzerPuppenspieleTechnician/0.2-directlive' \
  -o "$bootstrap" -w '%{http_code}' \
  -X POST -d 'action=kp_mobile_live_bootstrap' \
  "$STAGING_BASE/wp-admin/admin-ajax.php")"

if [[ "$http_code" != '401' ]] || ! jq -e '.success == false and (.data.message | contains("Bitte zuerst bei WordPress anmelden"))' "$bootstrap" >/dev/null; then
  echo "FAIL mobile-live unauthenticated bootstrap gate: HTTP $http_code" >&2
  cat "$bootstrap" >&2 || true
  exit 1
fi

echo 'PASS mobile-live bootstrap auth gate: HTTP 401'
