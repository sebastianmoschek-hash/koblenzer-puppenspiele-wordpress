#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:80]!r}")
    path.write_text(text.replace(old, new, 1))


voice = ROOT / "android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/LocalNaturalVoice.kt"
replace_once(voice, 'fun label(): String = "Thorsten · natürlich · lokal"', 'fun label(): String = "Thorsten High · natürlich · lokal"')
replace_once(voice, 'val root = File(context.filesDir, "natural-voice/$ESPEAK_DIR")', 'val root = File(context.filesDir, "natural-voice/$MODEL_DIR/$ESPEAK_DIR")')
replace_once(voice, 'private const val MODEL_DIR = "vits-piper-de_DE-thorsten-medium"', 'private const val MODEL_DIR = "vits-piper-de_DE-thorsten-high"')
replace_once(voice, 'private const val MODEL_FILE = "de_DE-thorsten-medium.onnx"', 'private const val MODEL_FILE = "de_DE-thorsten-high.onnx"')

controller = ROOT / "android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/LocalVoiceController.kt"
replace_once(controller, 'onStatus("Live lokal · Thorsten antwortet · Mikrofon ist kurz pausiert")', 'onStatus("Live lokal · Thorsten High antwortet · Mikrofon ist kurz pausiert")')
replace_once(
    controller,
    '''                onError = { error ->
                    main.post {
                        speaking = false
                        spokenAssistantNormalized = ""
                        onStatus("Natürliche Stimme konnte nicht starten · Systemstimme als Fallback")
                        speakWithSystemVoice(spoken, error)
                    }
                },
            )
            return
        }
        speakWithSystemVoice(spoken, null)
''',
    '''                onError = { error ->
                    main.post {
                        speaking = false
                        spokenAssistantNormalized = ""
                        val detail = error.message ?: error.javaClass.simpleName
                        onStatus("Thorsten High konnte nicht starten: $detail")
                        if (active) continueListening(ECHO_RELEASE_MS)
                    }
                },
            )
            return
        }
        speaking = false
        spokenAssistantNormalized = ""
        onStatus("Thorsten High fehlt in dieser APK · keine Systemstimme verwendet")
        if (active) continueListening(ECHO_RELEASE_MS)
''',
)

prepare = ROOT / "qa/prepare-android-natural-voice.sh"
text = prepare.read_text()
text = text.replace('vits-piper-de_DE-thorsten-medium', 'vits-piper-de_DE-thorsten-high')
text = text.replace('de_DE-thorsten-medium.onnx', 'de_DE-thorsten-high.onnx')
text = text.replace('Thorsten medium', 'Thorsten High')
prepare.write_text(text)

gradle = ROOT / "android/homepage-technician/app/build.gradle.kts"
replace_once(gradle, 'versionCode = 7', 'versionCode = 8')
replace_once(gradle, 'versionName = "0.7.0-natural-voice"', 'versionName = "0.8.0-thorsten-high"')

activity = ROOT / "android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/LiveLocalActivity.kt"
activity_text = activity.read_text()
activity_text = activity_text.replace("🔊 Thorsten · ", "🔊 Thorsten High · ")
activity.write_text(activity_text)

print("Thorsten High fix applied: high-quality model, model-specific cache, version 8, no live system-TTS fallback.")
