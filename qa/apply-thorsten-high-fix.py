#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_or_keep(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"{path}: neither old nor new text found: {old[:100]!r}")
    path.write_text(text.replace(old, new))


voice = ROOT / "android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/LocalNaturalVoice.kt"
replace_or_keep(voice, 'fun label(): String = "Thorsten · natürlich · lokal"', 'fun label(): String = "Thorsten High · natürlich · lokal"')
replace_or_keep(voice, 'val root = File(context.filesDir, "natural-voice/$ESPEAK_DIR")', 'val root = File(context.filesDir, "natural-voice/$MODEL_DIR/$ESPEAK_DIR")')
replace_or_keep(voice, 'private const val MODEL_DIR = "vits-piper-de_DE-thorsten-medium"', 'private const val MODEL_DIR = "vits-piper-de_DE-thorsten-high"')
replace_or_keep(voice, 'private const val MODEL_FILE = "de_DE-thorsten-medium.onnx"', 'private const val MODEL_FILE = "de_DE-thorsten-high.onnx"')

controller = ROOT / "android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/LocalVoiceController.kt"
replace_or_keep(controller, 'onStatus("Live lokal · Thorsten antwortet · Mikrofon ist kurz pausiert")', 'onStatus("Live lokal · Thorsten High antwortet · Mikrofon ist kurz pausiert")')
replace_or_keep(
    controller,
    'onStatus("Natürliche Stimme konnte nicht starten · Systemstimme als Fallback")',
    'onStatus("Thorsten High konnte nicht starten: ${error.message ?: error.javaClass.simpleName}")',
)
replace_or_keep(
    controller,
    '                        speakWithSystemVoice(spoken, error)',
    '                        if (active) continueListening(ECHO_RELEASE_MS)',
)
replace_or_keep(
    controller,
    '        speakWithSystemVoice(spoken, null)',
    '        speaking = false\n        spokenAssistantNormalized = ""\n        onStatus("Thorsten High fehlt in dieser APK · keine Systemstimme verwendet")\n        if (active) continueListening(ECHO_RELEASE_MS)',
)

prepare = ROOT / "qa/prepare-android-natural-voice.sh"
replace_or_keep(prepare, 'vits-piper-de_DE-thorsten-medium', 'vits-piper-de_DE-thorsten-high')
replace_or_keep(prepare, 'de_DE-thorsten-medium.onnx', 'de_DE-thorsten-high.onnx')
replace_or_keep(prepare, 'Thorsten medium', 'Thorsten High')

gradle = ROOT / "android/homepage-technician/app/build.gradle.kts"
replace_or_keep(gradle, 'versionCode = 7', 'versionCode = 8')
replace_or_keep(gradle, 'versionName = "0.7.0-natural-voice"', 'versionName = "0.8.0-thorsten-high"')

activity = ROOT / "android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/LiveLocalActivity.kt"
replace_or_keep(activity, '🔊 Thorsten · ', '🔊 Thorsten High · ')

print("Thorsten High fix applied: high model, model-specific cache, version 8, no live system-TTS fallback.")
