#!/usr/bin/env bash
set -euo pipefail

SHA="${CIRCLE_SHA1:-}"
BASH_ENV_FILE="${BASH_ENV:-/tmp/kp-circleci-bash-env}"

if [[ -n "$SHA" ]]; then
  latest="$(git ls-remote origin refs/heads/main 2>/dev/null | awk '{print $1}' | head -1 || true)"
  if [[ -n "$latest" && "$latest" != "$SHA" ]]; then
    echo "CircleCI: commit $SHA is already superseded by $latest; saving credits."
    circleci-agent step halt
    exit 0
  fi
fi

changed="$(git diff-tree --no-commit-id --name-only -r "${SHA:-HEAD}" 2>/dev/null || true)"
if [[ -z "$changed" ]]; then
  changed="$(git show --pretty='' --name-only "${SHA:-HEAD}" 2>/dev/null || true)"
fi

meaningful="$(printf '%s\n' "$changed" | sed '/^$/d' | grep -Ev '^(qa-results/|README\.md$|AGENTS\.md$)' || true)"
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
