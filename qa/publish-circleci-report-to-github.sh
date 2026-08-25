#!/usr/bin/env bash
set -euo pipefail

REPORT_JSON='qa-results/circleci/report.json'
REPORT_MD='qa-results/circleci/report.md'
TARGET_JSON='qa-results/circleci-latest.json'
TARGET_MD='qa-results/circleci-latest.md'
TARGET_DIAG='qa-results/circleci-latest-diagnostics.txt'
REMOTE_REPORT='/wp-content/uploads/kp-homepage-lab/latest'
REPO="${CIRCLE_PROJECT_USERNAME:-sebastianmoschek-hash}/${CIRCLE_PROJECT_REPONAME:-koblenzer-puppenspiele-wordpress}"
SHA="${CIRCLE_SHA1:-unknown}"
# CircleCI run steps start fresh shells. circleci-homepage-lab*.sh exports this
# value only inside its own process, so restore it here before the standalone
# report-publish step tries to upload the handoff to staging.
export LFTP_PASSWORD="${STAGING_FTP_PASSWORD:-${LFTP_PASSWORD:-}}"

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

# The real text Save→Reload→DB readback runs after the main browser lab on the
# same staging deployment. Record its verdict independently from unrelated
# editor/touch/visual failures so persistence diagnostics stay trustworthy.
mode="$(jq -r '.mode // "full"' "$REPORT_JSON" 2>/dev/null || echo full)"
text_log='qa-results/circleci/text-save-staging.log'
if [[ "$mode" != 'pwa' ]]; then
  if [[ -s "$text_log" ]] && grep -q 'PASS: isolated staging text-save lab\.' "$text_log"; then
    tmp="$(mktemp)"
    jq '.checks.realTextSave="success"' "$REPORT_JSON" > "$tmp" && mv "$tmp" "$REPORT_JSON"
    printf '\n- Echter Text-Save → Reload → DB-Readback: success\n' >> "$REPORT_MD"
  else
    tmp="$(mktemp)"
    jq '.success=false | .checks.realTextSave="failure"' "$REPORT_JSON" > "$tmp" && mv "$tmp" "$REPORT_JSON"
    printf '\n- Echter Text-Save → Reload → DB-Readback: failure\n' >> "$REPORT_MD"
    printf '\nDer Gesamtstatus wurde auf **FAILURE** gesetzt, weil der echte Text-Save-Gate fehlgeschlagen ist oder kein vollständiges Ergebnis erzeugt hat.\n' >> "$REPORT_MD"
  fi
fi

# Build the handoff before checking for a GitHub PAT. The Staging copy is the
# source used by the repository's status-event handoff workflow and therefore
# must stay current even when GITHUB_REPORT_TOKEN is unavailable or races main.
cp "$REPORT_JSON" /tmp/kp-circleci-report.json
cp "$REPORT_MD" /tmp/kp-circleci-report.md

: > /tmp/kp-circleci-diagnostics.txt
for logfile in \
  install.log preflight-summary.log word-history-contract.log unified-contract.log \
  create-undo-contract.log calendar-undo-contract.log pipeline.log editor.log session-undo.log \
  persistence.log text-save-staging.log touch-slider.log touch-runtime.log visual.log php-syntax.log deploy.log; do
  src="qa-results/circleci/$logfile"
  if [[ -s "$src" ]]; then
    {
      printf '\n===== %s =====\n' "$logfile"
      tail -n 500 "$src"
    } >> /tmp/kp-circleci-diagnostics.txt
  fi
done

if [[ ! -s /tmp/kp-circleci-diagnostics.txt ]]; then
  printf 'No detailed contract log was produced. CircleCI failed before diagnostics were captured.\n' > /tmp/kp-circleci-diagnostics.txt
fi

if [[ -n "${STAGING_FTP_SERVER:-}" && -n "${STAGING_FTP_USERNAME:-}" && -n "${LFTP_PASSWORD:-}" ]]; then
  set +e
  lftp -c "set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; set net:max-retries 2; set net:timeout 20; open --user '$STAGING_FTP_USERNAME' --env-password -p 21 '$STAGING_FTP_SERVER'; mkdir -p '$REMOTE_REPORT'; put '/tmp/kp-circleci-report.json' -o '$REMOTE_REPORT/report.json'; put '/tmp/kp-circleci-report.md' -o '$REMOTE_REPORT/report.md'; put '/tmp/kp-circleci-diagnostics.txt' -o '$REMOTE_REPORT/diagnostics.txt'; bye" >/dev/null 2>&1
  remote_rc=$?
  set -e
  if [[ $remote_rc -ne 0 ]]; then
    echo "WARN: complete staging report handoff upload failed (exit $remote_rc)."
  fi
else
  echo 'WARN: staging report handoff skipped because staging FTP credentials are unavailable in this step.'
fi

if [[ -z "${GITHUB_REPORT_TOKEN:-}" ]]; then
  echo 'GITHUB_REPORT_TOKEN is not configured; complete report remains available via the staging handoff and CircleCI artifacts.'
  exit 0
fi

# Publishing diagnostics is useful, but it must never turn the staging runner
# red or prevent the component verdict jobs from consuming report.json. A report
# push can legitimately race another [skip ci] report commit on main. Keep the
# local report authoritative for this workflow and treat GitHub publication as
# best-effort.
set +e
git config user.name 'kp-circleci-report-bot'
git config user.email 'circleci-report@users.noreply.github.com'
git remote set-url origin "https://x-access-token:${GITHUB_REPORT_TOKEN}@github.com/${REPO}.git"
git fetch origin main --quiet
publish_rc=$?
if [[ $publish_rc -eq 0 ]]; then
  git checkout -B main origin/main --quiet
  publish_rc=$?
fi

if [[ $publish_rc -eq 0 ]]; then
  mkdir -p qa-results
  cp /tmp/kp-circleci-report.json "$TARGET_JSON"
  cp /tmp/kp-circleci-report.md "$TARGET_MD"
  cp /tmp/kp-circleci-diagnostics.txt "$TARGET_DIAG"
  git add "$TARGET_JSON" "$TARGET_MD" "$TARGET_DIAG"

  if git diff --cached --quiet; then
    echo 'CircleCI GitHub report is already current.'
    set -e
    exit 0
  fi

  git commit -m 'qa: update CircleCI homepage lab report [skip ci]' --quiet
  publish_rc=$?
fi
if [[ $publish_rc -eq 0 ]]; then
  git pull --rebase origin main --quiet
  publish_rc=$?
fi
if [[ $publish_rc -eq 0 ]]; then
  git push origin HEAD:main --quiet
  publish_rc=$?
fi
set -e

if [[ $publish_rc -ne 0 ]]; then
  echo "WARN: CircleCI report publication raced or failed (exit $publish_rc); workflow verdicts will continue using the local report artifact."
  exit 0
fi

echo 'PASS: CircleCI report and diagnostics published to qa-results/circleci-latest*.'
