#!/usr/bin/env bash
set -euo pipefail

DESKTOP='wp-content/mu-plugins/kp-local-ai-desktop.php'
ACCESS='wp-content/mu-plugins/kp-local-ai-desktop-access.php'
TAKEOVER='wp-content/mu-plugins/kp-local-ai-desktop-takeover.php'
ASSET='wp-content/mu-plugins/kp-local-ai-desktop-assets/takeover-v8.js'
BASE_FTP="ftp://${STAGING_FTP_SERVER:-}:21"

: "${STAGING_FTP_SERVER:?STAGING_FTP_SERVER fehlt}"
: "${STAGING_FTP_USERNAME:?STAGING_FTP_USERNAME fehlt}"
: "${STAGING_FTP_PASSWORD:?STAGING_FTP_PASSWORD fehlt}"
command -v php >/dev/null
command -v node >/dev/null
command -v curl >/dev/null

for file in "$DESKTOP" "$ACCESS" "$TAKEOVER" "$ASSET"; do
  [[ -f "$file" ]] || { echo "Fehlende Desktop-KI-Datei: $file" >&2; exit 1; }
done
for file in "$DESKTOP" "$ACCESS" "$TAKEOVER"; do php -l "$file" >/dev/null; done
node --check "$ASSET" >/dev/null
bash qa/local-ai-contract.sh

if grep -Eqi 'generativelanguage\.googleapis\.com|api\.openai\.com|@litert-lm/core' "$TAKEOVER" "$ASSET"; then
  echo 'FAIL desktop-ai-fast: Cloud-LLM-Fallback gefunden.' >&2
  exit 1
fi
grep -Fq 'Android-Schreibzugriff: AUS' "$ASSET"

auth="${STAGING_FTP_USERNAME}:${STAGING_FTP_PASSWORD}"
verify_directory="$(mktemp -d)"
trap 'rm -rf -- "$verify_directory"' EXIT
curl_ftps() {
  curl --fail --silent --show-error --ssl-reqd --ftp-create-dirs \
    --connect-timeout 10 --max-time 60 --retry 1 --user "$auth" "$@"
}

declare -A uploaded=()
upload_and_verify() {
  local file="$1" verify
  [[ -f "$file" ]] || { echo "Upload-Datei fehlt: $file" >&2; exit 1; }
  verify="$verify_directory/${file//\//__}"
  curl_ftps -T "$file" "$BASE_FTP/$file"
  curl_ftps "$BASE_FTP/$file" -o "$verify"
  cmp -s "$file" "$verify" || { echo "$file stimmt nach Upload nicht bytegenau mit Staging überein." >&2; exit 1; }
  uploaded["$file"]=1
  printf 'VERIFIED %s\n' "$file"
}

for file in "$DESKTOP" "$ACCESS" "$TAKEOVER" "$ASSET"; do upload_and_verify "$file"; done

# A Gemma patch may change an additional existing Website file. Only allowlisted
# WordPress paths from this exact commit are uploaded; Android/mobile/CI/qa stay out.
commit="${CIRCLE_SHA1:-HEAD}"
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  case "$file" in
    wp-content/mu-plugins/*|wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/*|wp-content/themes/koblenzer-puppenspiele-block-theme-phase1-7/*) ;;
    *) continue ;;
  esac
  if [[ "$file" =~ (^|/)(android|mobile)([-._/]|$) ]] || [[ "$file" == wp-content/mu-plugins/kp-mobile-* ]]; then
    echo "FAIL desktop-ai-fast: gesperrter Android/Mobile-Pfad im Commit: $file" >&2
    exit 1
  fi
  [[ -f "$file" ]] || { echo "FAIL desktop-ai-fast: Löschen wird nicht automatisch deployed: $file" >&2; exit 1; }
  case "$file" in
    *.php) php -l "$file" >/dev/null ;;
    *.js|*.mjs) node --check "$file" >/dev/null ;;
  esac
  [[ -n "${uploaded[$file]:-}" ]] || upload_and_verify "$file"
done < <(git diff-tree --no-commit-id --name-only --diff-filter=ACMRT -r "$commit")

printf 'PASS desktop-ai-fast: geprüfte Dateien bytegenau auf Staging aktualisiert; Production und Android unberührt.\n'
