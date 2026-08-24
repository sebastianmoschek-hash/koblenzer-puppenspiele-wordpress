#!/usr/bin/env bash
set -uo pipefail

OUT_DIR='qa-results/android'
TARGET_JSON='qa-results/android-latest.json'
TARGET_DIAG='qa-results/android-latest-diagnostics.txt'
REPO="${CIRCLE_PROJECT_USERNAME:-sebastianmoschek-hash}/${CIRCLE_PROJECT_REPONAME:-koblenzer-puppenspiele-wordpress}"
SHA="${CIRCLE_SHA1:-unknown}"
mkdir -p "$OUT_DIR"

install_rc="$(cat "$OUT_DIR/install.rc" 2>/dev/null || echo 999)"
contract_rc="$(cat "$OUT_DIR/contract.rc" 2>/dev/null || echo 999)"
build_rc="$(cat "$OUT_DIR/build.rc" 2>/dev/null || echo 999)"
if [[ "$install_rc" == '0' && "$contract_rc" == '0' && "$build_rc" == '0' ]]; then
  state='success'
else
  state='failure'
fi

cat > /tmp/kp-android-report.json <<JSON
{
  "generatedAt":"$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "commit":"$SHA",
  "state":"$state",
  "checks":{
    "toolchain":$install_rc,
    "securityContract":$contract_rc,
    "androidBuild":$build_rc
  }
}
JSON

: > /tmp/kp-android-diagnostics.txt
for file in install.log contract.log build.log; do
  src="$OUT_DIR/$file"
  if [[ -s "$src" ]]; then
    {
      printf '\n===== %s =====\n' "$file"
      tail -n 700 "$src"
    } >> /tmp/kp-android-diagnostics.txt
  fi
done
if [[ ! -s /tmp/kp-android-diagnostics.txt ]]; then
  printf 'No Android build diagnostics were produced.\n' > /tmp/kp-android-diagnostics.txt
fi

if [[ -z "${GITHUB_REPORT_TOKEN:-}" ]]; then
  echo 'GITHUB_REPORT_TOKEN is unavailable; Android diagnostics stay in CircleCI.'
  exit 0
fi

set +e
git config user.name 'kp-android-build-bot'
git config user.email 'android-build@users.noreply.github.com'
git remote set-url origin "https://x-access-token:${GITHUB_REPORT_TOKEN}@github.com/${REPO}.git"
git fetch origin main --quiet
rc=$?
if [[ $rc -eq 0 ]]; then git checkout -B main origin/main --quiet; rc=$?; fi
if [[ $rc -eq 0 ]]; then
  mkdir -p qa-results
  cp /tmp/kp-android-report.json "$TARGET_JSON"
  cp /tmp/kp-android-diagnostics.txt "$TARGET_DIAG"
  git add "$TARGET_JSON" "$TARGET_DIAG"
  if git diff --cached --quiet; then
    echo 'Android build report is already current.'
    set -e
    exit 0
  fi
  git commit -m 'qa: update Android build diagnostics [skip ci]' --quiet
  rc=$?
fi
if [[ $rc -eq 0 ]]; then git pull --rebase origin main --quiet; rc=$?; fi
if [[ $rc -eq 0 ]]; then git push origin HEAD:main --quiet; rc=$?; fi
set -e

if [[ $rc -ne 0 ]]; then
  echo "WARN: Android diagnostics publication failed (exit $rc)."
  exit 0
fi

echo 'PASS: Android build diagnostics published.'
