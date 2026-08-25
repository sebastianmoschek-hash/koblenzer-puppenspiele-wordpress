#!/usr/bin/env bash
set -euo pipefail

STAGING_BASE="${STAGING_BASE:-https://neu.koblenzer-puppenspiele.de}"
REMOTE_MU='/wp-content/mu-plugins'
DESKTOP='wp-content/mu-plugins/kp-local-ai-desktop.php'
ACCESS='wp-content/mu-plugins/kp-local-ai-desktop-access.php'

export LFTP_PASSWORD="${STAGING_FTP_PASSWORD:-${LFTP_PASSWORD:-}}"
: "${STAGING_FTP_SERVER:?STAGING_FTP_SERVER fehlt}"
: "${STAGING_FTP_USERNAME:?STAGING_FTP_USERNAME fehlt}"
: "${LFTP_PASSWORD:?STAGING_FTP_PASSWORD fehlt}"

for file in "$DESKTOP" "$ACCESS"; do
  [[ -f "$file" ]] || { echo "Fehlende Desktop-KI-Datei: $file" >&2; exit 1; }
  php -l "$file" >/dev/null
done

# The local contract also validates the loopback agent and explicitly blocks
# Android/mobile paths. It performs no network calls.
bash qa/local-ai-contract.sh

lftp -c "
  set ftp:ssl-force true;
  set ftp:ssl-protect-data true;
  set ssl:verify-certificate true;
  set net:max-retries 2;
  set net:timeout 20;
  open --user '$STAGING_FTP_USERNAME' --env-password -p 21 '$STAGING_FTP_SERVER';
  mkdir -p '$REMOTE_MU';
  put '$DESKTOP' -o '$REMOTE_MU/kp-local-ai-desktop.php';
  put '$ACCESS' -o '$REMOTE_MU/kp-local-ai-desktop-access.php';
  get '$REMOTE_MU/kp-local-ai-desktop.php' -o /tmp/kp-local-ai-desktop.remote.php;
  get '$REMOTE_MU/kp-local-ai-desktop-access.php' -o /tmp/kp-local-ai-desktop-access.remote.php;
  bye
"

cmp -s "$DESKTOP" /tmp/kp-local-ai-desktop.remote.php || {
  echo 'Desktop-KI-Datei stimmt nach Upload nicht bytegenau mit Staging überein.' >&2
  exit 1
}
cmp -s "$ACCESS" /tmp/kp-local-ai-desktop-access.remote.php || {
  echo 'Desktop-Zugriffsdatei stimmt nach Upload nicht bytegenau mit Staging überein.' >&2
  exit 1
}

printf 'PASS desktop-ai-fast: Desktop-KI auf %s deployt und bytegenau verifiziert. Android blieb unberührt.\n' "$STAGING_BASE"
