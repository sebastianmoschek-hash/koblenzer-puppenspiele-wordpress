#!/usr/bin/env bash
set -euo pipefail

SHA="${CIRCLE_SHA1:-}"
BASH_ENV_FILE="${BASH_ENV:-/tmp/kp-circleci-bash-env}"

meaningful_files(){
  local commit="$1"
  local changed
  changed="$(git diff-tree --no-commit-id --name-only -r "$commit" 2>/dev/null || true)"
  if [[ -z "$changed" ]]; then
    changed="$(git show --pretty='' --name-only "$commit" 2>/dev/null || true)"
  fi
  printf '%s\n' "$changed" | sed '/^$/d' | grep -Ev '^(qa-results/|README\.md$|AGENTS\.md$)' || true
}

# Report commits are pushed back to main with [skip ci]. They must never make a
# still-valid code pipeline look superseded. Resolve the newest *meaningful*
# main commit instead of comparing against the raw branch head.
if [[ -n "$SHA" ]]; then
  git fetch origin main --quiet --depth=80 2>/dev/null || true
  latest_meaningful=''
  while IFS= read -r candidate; do
    [[ -z "$candidate" ]] && continue
    if [[ -n "$(meaningful_files "$candidate")" ]]; then
      latest_meaningful="$candidate"
      break
    fi
  done < <(git rev-list --max-count=80 origin/main 2>/dev/null || true)

  if [[ -n "$latest_meaningful" && "$latest_meaningful" != "$SHA" ]]; then
    echo "CircleCI: commit $SHA is superseded by meaningful commit $latest_meaningful; saving credits."
    circleci-agent step halt
    exit 0
  fi
fi

meaningful="$(meaningful_files "${SHA:-HEAD}")"
if [[ -z "$meaningful" ]]; then
  echo 'CircleCI: report/docs-only commit; no staging lab needed.'
  circleci-agent step halt
  exit 0
fi

mode='pwa'
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  case "$file" in
    wp-content/mu-plugins/kp-webapp-branding.php|\
    wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/includes/class-kp-owner-web-app.php|\
    wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/kp-app-icon.svg)
      ;;
    *)
      mode='full'
      break
      ;;
  esac
done <<< "$meaningful"

{
  printf 'export KP_CI_MODE=%q\n' "$mode"
  printf 'export KP_CI_CHANGED_FILES=%q\n' "$meaningful"
} >> "$BASH_ENV_FILE"

echo "CircleCI smart mode: $mode"
printf '%s\n' "$meaningful" | sed 's/^/  - /'
