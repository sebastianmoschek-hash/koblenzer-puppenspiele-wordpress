#!/usr/bin/env bash
set -euo pipefail

STAGING_BASE="${STAGING_BASE:-https://neu.koblenzer-puppenspiele.de}"
DESKTOP='wp-content/mu-plugins/kp-local-ai-desktop.php'
ACCESS='wp-content/mu-plugins/kp-local-ai-desktop-access.php'
TAKEOVER='wp-content/mu-plugins/kp-local-ai-desktop-takeover.php'
BASE_FTP="ftp://${STAGING_FTP_SERVER:-}:21/wp-content/mu-plugins"

: "${STAGING_FTP_SERVER:?STAGING_FTP_SERVER fehlt}"
: "${STAGING_FTP_USERNAME:?STAGING_FTP_USERNAME fehlt}"
: "${STAGING_FTP_PASSWORD:?STAGING_FTP_PASSWORD fehlt}"
command -v php >/dev/null
command -v curl >/dev/null

for file in "$DESKTOP" "$ACCESS" "$TAKEOVER"; do
  [[ -f "$file" ]] || { echo "Fehlende Desktop-KI-Datei: $file" >&2; exit 1; }
  php -l "$file" >/dev/null
done

for file in "$DESKTOP" "$TAKEOVER"; do
  grep -Fq 'http://127.0.0.1:8765' "$file"
  grep -Fq 'gemma3:4b' "$file"
  if grep -Eqi 'generativelanguage\.googleapis\.com|api\.openai\.com|@litert-lm/core' "$file"; then
    echo "FAIL desktop-ai-fast: Cloud-LLM-Fallback in $file gefunden." >&2
    exit 1
  fi
done
grep -Fq 'Android-Schreibzugriff: AUS' "$TAKEOVER"

auth="${STAGING_FTP_USERNAME}:${STAGING_FTP_PASSWORD}"
curl_ftps(){
  curl --fail --silent --show-error --ssl-reqd --ftp-create-dirs \
    --connect-timeout 10 --max-time 45 --retry 1 \
    --user "$auth" "$@"
}

for file in "$DESKTOP" "$ACCESS" "$TAKEOVER"; do
  base="$(basename "$file")"
  curl_ftps -T "$file" "$BASE_FTP/$base"
  curl_ftps "$BASE_FTP/$base" -o "/tmp/$base"
  cmp -s "$file" "/tmp/$base" || { echo "$base stimmt nach Upload nicht bytegenau mit Staging überein." >&2; exit 1; }
done

probe=''
for attempt in 1 2 3 4 5 6; do
  probe="$(curl --fail --silent --show-error --location \
    --connect-timeout 5 --max-time 15 \
    -H 'Cache-Control: no-cache, no-store' \
    "$STAGING_BASE/?kp_desktop_ai_probe=1&kp_ci=${CIRCLE_SHA1:-manual}-$attempt" || true)"
  if printf '%s' "$probe" | grep -Fq '"loaded":true' \
    && printf '%s' "$probe" | grep -Fq '"version":"desktop-ai-fast-v7"' \
    && printf '%s' "$probe" | grep -Fq '"desktopFile":true' \
    && printf '%s' "$probe" | grep -Fq '"takeoverFile":true'; then
    echo "PASS desktop-ai-runtime: $probe"
    printf 'PASS desktop-ai-fast: %s aktualisiert; Takeover verifiziert; Android unberührt.\n' "$STAGING_BASE"
    exit 0
  fi
  sleep 1
done

echo 'FAIL desktop-ai-runtime: FTP ist aktuell, aber WordPress meldet den Desktop-Takeover nicht.' >&2
printf 'Probe response: %s\n' "$probe" >&2
exit 1
