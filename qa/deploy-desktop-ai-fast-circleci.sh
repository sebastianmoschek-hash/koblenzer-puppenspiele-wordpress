#!/usr/bin/env bash
set -euo pipefail

STAGING_BASE="${STAGING_BASE:-https://neu.koblenzer-puppenspiele.de}"
DESKTOP='wp-content/mu-plugins/kp-local-ai-desktop.php'
ACCESS='wp-content/mu-plugins/kp-local-ai-desktop-access.php'
BASE_FTP="ftp://${STAGING_FTP_SERVER:-}:21/wp-content/mu-plugins"

: "${STAGING_FTP_SERVER:?STAGING_FTP_SERVER fehlt}"
: "${STAGING_FTP_USERNAME:?STAGING_FTP_USERNAME fehlt}"
: "${STAGING_FTP_PASSWORD:?STAGING_FTP_PASSWORD fehlt}"
command -v php >/dev/null
command -v curl >/dev/null

for file in "$DESKTOP" "$ACCESS"; do
  [[ -f "$file" ]] || { echo "Fehlende Desktop-KI-Datei: $file" >&2; exit 1; }
  php -l "$file" >/dev/null
done

grep -Fq 'http://127.0.0.1:8765' "$DESKTOP"
grep -Fq 'gemma3:4b' "$DESKTOP"
grep -Fq 'Android-Schreibzugriff: AUS' "$DESKTOP"
if grep -Eqi 'generativelanguage\.googleapis\.com|api\.openai\.com|@litert-lm/core' "$DESKTOP"; then
  echo 'FAIL desktop-ai-fast: Cloud-LLM-Fallback in Desktop-Datei gefunden.' >&2
  exit 1
fi

curl_ftps(){
  curl --fail --silent --show-error --ssl-reqd --ftp-create-dirs \
    --connect-timeout 10 --max-time 45 --retry 1 \
    --user "$STAGING_FTP_USERNAME:$STAGING_FTP_PASSWORD" "$@"
}

curl_ftps -T "$DESKTOP" "$BASE_FTP/kp-local-ai-desktop.php"
curl_ftps -T "$ACCESS" "$BASE_FTP/kp-local-ai-desktop-access.php"
curl_ftps "$BASE_FTP/kp-local-ai-desktop.php" -o /tmp/kp-local-ai-desktop.remote.php
curl_ftps "$BASE_FTP/kp-local-ai-desktop-access.php" -o /tmp/kp-local-ai-desktop-access.remote.php

cmp -s "$DESKTOP" /tmp/kp-local-ai-desktop.remote.php || {
  echo 'Desktop-KI-Datei stimmt nach Upload nicht bytegenau mit Staging überein.' >&2
  exit 1
}
cmp -s "$ACCESS" /tmp/kp-local-ai-desktop-access.remote.php || {
  echo 'Desktop-Zugriffsdatei stimmt nach Upload nicht bytegenau mit Staging überein.' >&2
  exit 1
}

printf 'PASS desktop-ai-fast: %s aktualisiert; keine Paketinstallation, Android unberührt.\n' "$STAGING_BASE"
