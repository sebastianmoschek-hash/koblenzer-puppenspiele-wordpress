#!/usr/bin/env bash
set -euo pipefail

REPORT_JSON='qa-results/circleci/report.json'
REPORT_MD='qa-results/circleci/report.md'
TARGET_JSON='qa-results/circleci-latest.json'
TARGET_MD='qa-results/circleci-latest.md'
TARGET_DIAG='qa-results/circleci-latest-diagnostics.txt'
REPO="${CIRCLE_PROJECT_USERNAME:-sebastianmoschek-hash}/${CIRCLE_PROJECT_REPONAME:-koblenzer-puppenspiele-wordpress}"
SHA="${CIRCLE_SHA1:-unknown}"

mkdir -p qa-results/circleci

# If a preflight/contract step failed before the full browser lab could create
# its normal report, still publish a useful failure report instead of going
# silent. This makes every red CircleCI run diagnosable from GitHub alone.
if [[ ! -s "$REPORT_JSON" || ! -s "$REPORT_MD" ]]; then
  generated="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  cat > "$REPORT_JSON" <<JSON
{
  "generatedAt":"$generated",
  "provider":"CircleCI Free",
  "commit":"$SHA",
  "success":false,
  "phase":"preflight",
  "checks":{
    "preflight":"failure",
    "browserLab":"not-started"
  }
}
JSON
  cat > "$REPORT_MD" <<MD
# CircleCI Preflight-Fehler

Erzeugt: $generated  
Commit: $SHA  
Gesamtstatus: **FAILURE**

Der vollständige Staging-Browserlauf wurde nicht gestartet. Die genaue Ursache steht in den veröffentlichten Diagnosen unter **preflight / contract logs**.
MD
fi

if [[ -z "${GITHUB_REPORT_TOKEN:-}" ]]; then
  echo 'GITHUB_REPORT_TOKEN is not configured; report remains available as CircleCI artifact/staging copy.'
  exit 0
fi

cp "$REPORT_JSON" /tmp/kp-circleci-report.json
cp "$REPORT_MD" /tmp/kp-circleci-report.md

: > /tmp/kp-circleci-diagnostics.txt
for logfile in \
  install.log preflight-summary.log word-history-contract.log unified-contract.log \
  create-undo-contract.log calendar-undo-contract.log pipeline.log editor.log session-undo.log \
  persistence.log touch-slider.log touch-runtime.log visual.log php-syntax.log deploy.log; do
  src="qa-results/circleci/$logfile"
  if [[ -s "$src" ]]; then
    {
      printf '\n===== %s =====\n' "$logfile"
      tail -n 500 "$src"
    } >> /tmp/kp-circleci-diagnostics.txt
  fi
done

# Never publish an empty diagnostics file: it would hide that an early step
# failed before it could write its own log.
if [[ ! -s /tmp/kp-circleci-diagnostics.txt ]]; then
  printf 'No detailed contract log was produced. CircleCI failed before diagnostics were captured.\n' > /tmp/kp-circleci-diagnostics.txt
fi

git config user.name 'kp-circleci-report-bot'
git config user.email 'circleci-report@users.noreply.github.com'
git remote set-url origin "https://x-access-token:${GITHUB_REPORT_TOKEN}@github.com/${REPO}.git"
git fetch origin main --quiet
git checkout -B main origin/main --quiet

mkdir -p qa-results
cp /tmp/kp-circleci-report.json "$TARGET_JSON"
cp /tmp/kp-circleci-report.md "$TARGET_MD"
cp /tmp/kp-circleci-diagnostics.txt "$TARGET_DIAG"
git add "$TARGET_JSON" "$TARGET_MD" "$TARGET_DIAG"

if git diff --cached --quiet; then
  echo 'CircleCI GitHub report is already current.'
  exit 0
fi

git commit -m 'qa: update CircleCI homepage lab report [skip ci]' --quiet
git pull --rebase origin main --quiet
git push origin HEAD:main --quiet

echo 'PASS: CircleCI report and diagnostics published to qa-results/circleci-latest*.'
