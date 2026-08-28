#!/usr/bin/env bash
set -uo pipefail

OUT_DIR='qa-results/android'
TARGET_JSON='qa-results/android-latest.json'
TARGET_DIAG='qa-results/android-latest-diagnostics.txt'
APK_SOURCE='android/homepage-technician/app/build/outputs/apk/debug/app-debug.apk'
APK_ARTIFACT="$OUT_DIR/homepage-hilfe-debug.apk"
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

apk_ready=false
if [[ "$state" == 'success' && -s "$APK_SOURCE" ]]; then
  cp "$APK_SOURCE" "$APK_ARTIFACT"
  apk_ready=true
  echo "APK artifact prepared: $APK_ARTIFACT"
fi

cat > /tmp/kp-android-report.json <<JSON
{
  "generatedAt":"$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "commit":"$SHA",
  "state":"$state",
  "apkArtifact":$apk_ready,
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
  echo 'GITHUB_REPORT_TOKEN is unavailable; Android diagnostics and APK stay in CircleCI artifacts.'
  exit 0
fi

# Failed local-AI repair branches publish a short, redacted compiler trace on the
# exact commit. WordPress can read this comment later and feed only that bounded
# diagnostic back to the on-device model for the next correction round.
if [[ "$state" == 'failure' && "${CIRCLE_BRANCH:-}" == ai-repair/local-* && "$SHA" =~ ^[a-f0-9]{40}$ ]]; then
  sed -E \
    -e 's/(Authorization:[[:space:]]*Bearer[[:space:]]+)[^[:space:]]+/\1[REDACTED]/Ig' \
    -e 's#https://x-access-token:[^@[:space:]]+@github\.com#https://x-access-token:[REDACTED]@github.com#g' \
    -e 's/(AIza|gh[pousr]_|github_pat_)[A-Za-z0-9_\-]{12,}/[REDACTED]/g' \
    /tmp/kp-android-diagnostics.txt | tail -c 12000 > /tmp/kp-android-diagnostics-redacted.txt
  {
    printf '<!-- kp-local-ai-ci-diagnostics -->\n'
    printf 'Local AI Android CI diagnostics for `%s` (CircleCI build %s).\n\n' "$SHA" "${CIRCLE_BUILD_NUM:-unknown}"
    printf 'Checks: toolchain=%s, contract=%s, androidBuild=%s\n\n```text\n' "$install_rc" "$contract_rc" "$build_rc"
    cat /tmp/kp-android-diagnostics-redacted.txt
    printf '\n```\n'
  } > /tmp/kp-android-commit-comment.md
  comment_payload="$(php -r '$b=file_get_contents("/tmp/kp-android-commit-comment.md");echo json_encode(array("body"=>$b),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);')"
  if curl -fsS -X POST \
      -H 'Accept: application/vnd.github+json' \
      -H "Authorization: Bearer ${GITHUB_REPORT_TOKEN}" \
      -H 'X-GitHub-Api-Version: 2022-11-28' \
      -H 'Content-Type: application/json' \
      "https://api.github.com/repos/${REPO}/commits/${SHA}/comments" \
      -d "$comment_payload" >/tmp/kp-android-comment-response.json 2>/dev/null; then
    echo 'PASS: redacted Android failure diagnostics attached to local repair commit.'
  else
    echo 'WARN: could not attach Android failure diagnostics to local repair commit.'
  fi
fi

# Publish a successful test APK as a private prerelease asset. The repository is private,
# so the release remains access-controlled and the binary does not enter Git history.
if [[ "$apk_ready" == 'true' ]]; then
  tag="homepage-hilfe-test-${SHA:0:8}"
  release_payload="$(printf '{"tag_name":"%s","target_commitish":"%s","name":"Homepage-Hilfe Test APK %s","body":"Automatisch gebaute Firebase-Test-APK. Nicht als Produktionsrelease verwenden.","draft":false,"prerelease":true}' "$tag" "$SHA" "${SHA:0:8}")"
  release_json="$(curl -fsS -X POST \
    -H 'Accept: application/vnd.github+json' \
    -H "Authorization: Bearer ${GITHUB_REPORT_TOKEN}" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'Content-Type: application/json' \
    "https://api.github.com/repos/${REPO}/releases" \
    -d "$release_payload" 2>/dev/null || true)"
  release_id="$(printf '%s' "$release_json" | php -r '$j=json_decode(stream_get_contents(STDIN),true); echo is_array($j)&&isset($j["id"])?$j["id"]:"";' 2>/dev/null)"
  if [[ -n "$release_id" ]]; then
    if curl -fsS -X POST \
      -H 'Accept: application/vnd.github+json' \
      -H "Authorization: Bearer ${GITHUB_REPORT_TOKEN}" \
      -H 'X-GitHub-Api-Version: 2022-11-28' \
      -H 'Content-Type: application/vnd.android.package-archive' \
      --data-binary @"$APK_ARTIFACT" \
      "https://uploads.github.com/repos/${REPO}/releases/${release_id}/assets?name=Homepage-Hilfe-debug.apk" \
      >/tmp/kp-apk-release-upload.json 2>/dev/null; then
      echo "PASS: private prerelease APK uploaded for tag $tag."
    else
      echo 'WARN: APK prerelease asset upload failed; CircleCI artifact remains available.'
    fi
  else
    echo 'WARN: APK prerelease creation failed; CircleCI artifact remains available.'
  fi
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
