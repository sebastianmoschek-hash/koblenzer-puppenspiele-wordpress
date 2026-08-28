#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS="$ROOT/android/homepage-technician/app/src/main/assets"
VOICE_DIR="$ASSETS/vits-piper-de_DE-thorsten-high"
ARCHIVE="$ROOT/qa-results/vits-piper-de_DE-thorsten-high.tar.bz2"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-de_DE-thorsten-high.tar.bz2"

if [[ -s "$VOICE_DIR/de_DE-thorsten-high.onnx" && -s "$VOICE_DIR/tokens.txt" && -d "$VOICE_DIR/espeak-ng-data" ]]; then
  echo "Natural voice assets already prepared."
  bash "$ROOT/qa/android-natural-voice-contract.sh"
  exit 0
fi

mkdir -p "$ASSETS" "$ROOT/qa-results"
rm -rf "$VOICE_DIR"
if [[ ! -s "$ARCHIVE" ]]; then
  echo "Downloading bundled natural male voice (Piper Thorsten High) ..."
  curl -fL --retry 3 --retry-delay 2 -o "$ARCHIVE" "$URL"
fi
tar -xjf "$ARCHIVE" -C "$ASSETS"

if [[ ! -s "$VOICE_DIR/de_DE-thorsten-high.onnx" || ! -s "$VOICE_DIR/tokens.txt" || ! -d "$VOICE_DIR/espeak-ng-data" ]]; then
  echo "Natural voice archive did not contain the expected sherpa-onnx Piper layout." >&2
  find "$ASSETS" -maxdepth 3 -type f | head -80 >&2 || true
  exit 1
fi

size="$(du -h "$VOICE_DIR/de_DE-thorsten-high.onnx" | awk '{print $1}')"
echo "Natural voice prepared: Thorsten High ($size model)."
bash "$ROOT/qa/android-natural-voice-contract.sh"
