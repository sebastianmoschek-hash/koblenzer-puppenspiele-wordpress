#!/usr/bin/env bash
set -euo pipefail

REPORT_JSON='qa-results/circleci/report.json'
REPORT_MD='qa-results/circleci/report.md'
TARGET_JSON='qa-results/circleci-latest.json'
TARGET_MD='qa-results/circleci-latest.md'
REPO="${CIRCLE_PROJECT_USERNAME:-sebastianmoschek-hash}/${CIRCLE_PROJECT_REPONAME:-koblenzer-puppenspiele-wordpress}"

if [[ ! -s "$REPORT_JSON" || ! -s "$REPORT_MD" ]]; then
  echo 'CircleCI report files are missing; nothing to publish.' >&2
  exit 1
fi

if [[ -z "${GITHUB_REPORT_TOKEN:-}" ]]; then
  echo 'GITHUB_REPORT_TOKEN is not configured; report remains available as CircleCI artifact/staging copy.'
  exit 0
fi

cp "$REPORT_JSON" /tmp/kp-circleci-report.json
cp "$REPORT_MD" /tmp/kp-circleci-report.md

git config user.name 'kp-circleci-report-bot'
git config user.email 'circleci-report@users.noreply.github.com'
git remote set-url origin "https://x-access-token:${GITHUB_REPORT_TOKEN}@github.com/${REPO}.git"
git fetch origin main --quiet
git checkout -B main origin/main --quiet

mkdir -p qa-results
cp /tmp/kp-circleci-report.json "$TARGET_JSON"
cp /tmp/kp-circleci-report.md "$TARGET_MD"
git add "$TARGET_JSON" "$TARGET_MD"

if git diff --cached --quiet; then
  echo 'CircleCI GitHub report is already current.'
  exit 0
fi

git commit -m 'qa: update CircleCI homepage lab report [skip ci]' --quiet

# A repair commit can land while the browser lab is running. Rebase once so the
# report commit never overwrites newer application code.
git pull --rebase origin main --quiet
git push origin HEAD:main --quiet

echo 'PASS: CircleCI report published to qa-results/circleci-latest.{json,md}.'
