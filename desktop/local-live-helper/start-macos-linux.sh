#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_DEFAULT="$(cd "$HERE/../.." && pwd)"

echo 'Homepage-Hilfe · Live lokal (macOS/Linux)'

if ! command -v ollama >/dev/null 2>&1; then
  echo 'Ollama wurde nicht gefunden.' >&2
  echo 'Bitte Ollama einmalig installieren und dieses Skript danach erneut starten.' >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Python 3 wurde nicht gefunden.' >&2
  exit 1
fi

echo 'Prüfe lokales Vision-Modell gemma3:4b (~3,3 GB) ...'
if ! ollama list | grep -Eq 'gemma3:4b|gemma3[[:space:]]'; then
  ollama pull gemma3:4b
fi

export KP_LOCAL_REPO="${KP_LOCAL_REPO:-$REPO_DEFAULT}"
export KP_LOCAL_BRANCH="${KP_LOCAL_BRANCH:-feature/webapp-primary-agent}"
export KP_LOCAL_AUTO_PUSH="${KP_LOCAL_AUTO_PUSH:-1}"

echo "Git-Arbeitsordner: $KP_LOCAL_REPO"
echo "Branch: $KP_LOCAL_BRANCH · Auto-Push: $KP_LOCAL_AUTO_PUSH"
echo 'Chrome kann danach Live lokal direkt aus der Web-App starten.'

exec python3 "$HERE/kp_local_live_helper.py"
