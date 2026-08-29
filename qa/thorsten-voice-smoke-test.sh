#!/usr/bin/env bash
set -euo pipefail

# Thorsten Natural Voice Smoke & Contract Check
# Verifies presence of ONNX model, tokens, eSpeak NG dictionary, and Java/Kotlin runtime integration.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS="$ROOT/android/homepage-technician/app/src/main/assets/vits-piper-de_DE-thorsten-high"
VOICE="$ROOT/android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/LocalNaturalVoice.kt"
CONTROLLER="$ROOT/android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/LocalVoiceController.kt"

echo "== Thorsten Voice Smoke Test =="

[[ -d "$ASSETS" ]] || { echo "FAIL: Assets directory missing"; exit 1; }
[[ -s "$ASSETS/de_DE-thorsten-high.onnx" ]] || { echo "FAIL: ONNX model missing"; exit 1; }
[[ -s "$ASSETS/tokens.txt" ]] || { echo "FAIL: tokens.txt missing"; exit 1; }
[[ -d "$ASSETS/espeak-ng-data" ]] || { echo "FAIL: espeak-ng-data missing"; exit 1; }
[[ -s "$VOICE" ]] || { echo "FAIL: LocalNaturalVoice.kt missing"; exit 1; }
[[ -s "$CONTROLLER" ]] || { echo "FAIL: LocalVoiceController.kt missing"; exit 1; }

# Contract checks
bash "$ROOT/qa/android-natural-voice-contract.sh"

echo "PASS: Thorsten voice smoke test successful!"
