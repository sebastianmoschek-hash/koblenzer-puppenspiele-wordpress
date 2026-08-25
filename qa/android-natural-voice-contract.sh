#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VOICE="$ROOT/android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/LocalNaturalVoice.kt"
JAVA_DIR="$ROOT/android/homepage-technician/app/src/main/java"
ASSETS="$ROOT/android/homepage-technician/app/src/main/assets/vits-piper-de_DE-thorsten-high"

fail() {
  echo "FAIL android-natural-voice: $*" >&2
  exit 1
}

[[ -s "$VOICE" ]] || fail "LocalNaturalVoice.kt fehlt"
[[ -s "$ASSETS/de_DE-thorsten-high.onnx" ]] || fail "Thorsten-ONNX-Modell fehlt/ist leer"
[[ -s "$ASSETS/tokens.txt" ]] || fail "Thorsten tokens.txt fehlt/ist leer"
[[ -d "$ASSETS/espeak-ng-data" ]] || fail "eSpeak-Daten fehlen"
find "$ASSETS/espeak-ng-data" -type f -print -quit | grep -q . || fail "eSpeak-Daten sind leer"

grep -q 'engine.sampleRate()' "$VOICE" || fail "Samplerate wird nicht aus dem TTS-Modell gelesen"
grep -q 'check(sampleRate > 0)' "$VOICE" || fail "Samplerate wird nicht validiert"
grep -q 'AudioTrack.getMinBufferSize' "$VOICE" || fail "Android-Minimalpuffer wird nicht abgefragt"
grep -q 'AudioFormat.ENCODING_PCM_16BIT' "$VOICE" || fail "Thorsten-Ausgabe ist nicht PCM16"
grep -q 'Short.SIZE_BYTES' "$VOICE" || fail "PCM16-Puffer wird nicht frame-aligned ausgerichtet"
grep -q 'AudioTrack.STATE_INITIALIZED' "$VOICE" || fail "AudioTrack-Initialisierung wird nicht geprüft"
grep -q 'AudioTrack.WRITE_BLOCKING' "$VOICE" || fail "Streaming-Ausgabe ist nicht blockierend abgesichert"
grep -q 'check(written == pcm16.size)' "$VOICE" || fail "partielle AudioTrack-Schreibvorgänge werden nicht erkannt"
grep -q 'sampleChunks > 0 && sampleCount > 0' "$VOICE" || fail "TTS-Audioerzeugung wird nicht auf echte Samples geprüft"

if grep -q 'ENCODING_PCM_FLOAT' "$VOICE"; then
  fail "PCM_FLOAT ist im Thorsten-Ausgabepfad noch aktiv"
fi

if grep -R -n -E 'android\.speech\.tts\.TextToSpeech|\bTextToSpeech\s*\(' "$JAVA_DIR" >/tmp/kp-system-tts.txt 2>/dev/null; then
  cat /tmp/kp-system-tts.txt >&2
  fail "System-TTS-Fallback gefunden"
fi

echo "PASS android-natural-voice"
echo "- model assets: present"
echo "- samplerate: model-derived + validated"
echo "- playback: PCM16, frame-aligned Android minimum buffer"
echo "- AudioTrack: initialized + blocking/full-write checks"
echo "- generated audio: non-empty callback samples required"
echo "- fallback: no Android system TextToSpeech path"
