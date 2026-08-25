#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
voice = ROOT / 'android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/LocalVoiceController.kt'
live = ROOT / 'android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/LiveLocalActivity.kt'
ci = ROOT / '.circleci/config.yml'

s = voice.read_text()

needle = '    private val prefs = context.getSharedPreferences("kp-local-voice", Context.MODE_PRIVATE)\n'
insert = needle + '    private val naturalVoice = LocalNaturalVoice(context.applicationContext)\n    private var speechRate = prefs.getFloat("speech_rate", 1.0f).coerceIn(0.8f, 1.2f)\n'
if 'private val naturalVoice = LocalNaturalVoice' not in s:
    if needle not in s:
        raise SystemExit('LocalVoiceController prefs anchor missing')
    s = s.replace(needle, insert, 1)

anchor = '    fun isActive(): Boolean = active\n\n'
extra = '''    fun isActive(): Boolean = active

    fun naturalVoiceLabel(): String = naturalVoice.label()

    fun speechRateLabel(): String = String.format(Locale.GERMANY, "%.1f×", speechRate)

    fun cycleSpeechRateLabel(): String {
        val rates = floatArrayOf(0.8f, 0.9f, 1.0f, 1.1f, 1.2f)
        val current = rates.indices.minByOrNull { kotlin.math.abs(rates[it] - speechRate) } ?: 2
        speechRate = rates[(current + 1) % rates.size]
        prefs.edit().putFloat("speech_rate", speechRate).apply()
        return speechRateLabel()
    }

'''
if 'fun cycleSpeechRateLabel()' not in s:
    if anchor not in s:
        raise SystemExit('LocalVoiceController isActive anchor missing')
    s = s.replace(anchor, extra, 1)

s = s.replace(
    '            if (!active || listening) return@postDelayed\n',
    '            if (!active || listening || speaking) return@postDelayed\n',
    1,
)
s = s.replace(
    '            onStatus(if (speaking) "Live lokal · KI spricht · du kannst sie unterbrechen" else "Live lokal · ich höre zu und sehe die aktuelle Homepage")\n',
    '            onStatus("Live lokal · ich höre zu und sehe die aktuelle Homepage")\n',
    1,
)

start = s.index('    fun speak(text: String) {')
stop = s.index('    fun stopSpeakingForBargeIn() {', start)
new_speak = '''    fun speak(text: String) {
        if (!active) return
        val spoken = speechFriendly(text)
        if (spoken.isBlank()) {
            continueListening(ECHO_RELEASE_MS)
            return
        }

        // Half duplex by design: while the assistant speaks, Android speech
        // recognition is completely stopped so the phone cannot transcribe its
        // own loudspeaker output as a new user command.
        listening = false
        runCatching { recognizer?.cancel() }
        speaking = true
        spokenAssistantNormalized = normalize(spoken)
        onStatus("Live lokal · Thorsten antwortet · Mikrofon ist kurz pausiert")

        if (naturalVoice.isBundled()) {
            naturalVoice.speak(
                text = spoken,
                speed = speechRate,
                onStart = { Unit },
                onDone = {
                    main.post {
                        speaking = false
                        spokenAssistantNormalized = ""
                        if (active) continueListening(ECHO_RELEASE_MS)
                    }
                },
                onError = { error ->
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
    }

    private fun speakWithSystemVoice(spoken: String, cause: Throwable?) {
        val engine = tts
        if (!ttsReady || offlineVoices.isEmpty() || engine == null) {
            speaking = false
            spokenAssistantNormalized = ""
            onStatus("Antwort steht im Chat · keine lokale Stimme verfügbar${cause?.message?.let { ": $it" } ?: ""}")
            if (active) continueListening(ECHO_RELEASE_MS)
            return
        }
        engine.setSpeechRate(speechRate)
        val utteranceId = "kp-local-${UUID.randomUUID()}"
        val result = engine.speak(spoken, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
        if (result == TextToSpeech.ERROR) {
            speaking = false
            spokenAssistantNormalized = ""
            if (active) continueListening(ECHO_RELEASE_MS)
        }
    }

'''
s = s[:start] + new_speak + s[stop:]

old_stop_start = s.index('    fun stopSpeakingForBargeIn() {')
old_stop_end = s.index('    fun release() {', old_stop_start)
new_stop = '''    fun stopSpeakingForBargeIn() {
        if (!speaking) return
        naturalVoice.stop()
        runCatching { tts?.stop() }
        speaking = false
        spokenAssistantNormalized = ""
        onStatus("Live lokal · Sprachausgabe beendet")
        if (active) continueListening(ECHO_RELEASE_MS)
    }

'''
s = s[:old_stop_start] + new_stop + s[old_stop_end:]

if 'naturalVoice.release()' not in s:
    s = s.replace(
        '    fun release() {\n        stop()\n',
        '    fun release() {\n        stop()\n        naturalVoice.release()\n',
        1,
    )

s = s.replace('if (active && !listening) continueListening(70L)', 'if (active && !listening) continueListening(ECHO_RELEASE_MS)')
s = s.replace('if (active && !listening) continueListening(120L)', 'if (active && !listening) continueListening(ECHO_RELEASE_MS)')

if 'private const val ECHO_RELEASE_MS' not in s:
    const_anchor = '        private const val MAX_SPOKEN_CHARS = 520\n'
    if const_anchor not in s:
        raise SystemExit('LocalVoiceController constants anchor missing')
    s = s.replace(const_anchor, const_anchor + '        private const val ECHO_RELEASE_MS = 650L\n', 1)

voice.write_text(s)

l = live.read_text()
js_anchor = "                actions.prepend(b);\n                const small = q('.kp-wa-head small');\n"
js_insert = '''                const speedButton = document.createElement('button');
                speedButton.type = 'button';
                speedButton.className = 'kp-wa-local-speed';
                speedButton.style.minHeight = '48px';
                speedButton.style.borderRadius = '14px';
                speedButton.style.padding = '8px 12px';
                speedButton.style.fontWeight = '800';
                speedButton.style.border = '1px solid rgba(255,255,255,.18)';
                speedButton.style.background = 'rgba(255,255,255,.09)';
                speedButton.style.color = 'inherit';
                const refreshSpeed = () => {
                  try { speedButton.textContent = '🔊 Thorsten · ' + window.KPLocalLive.speechRateLabel(); }
                  catch (_) { speedButton.textContent = '🔊 Thorsten · 1,0×'; }
                };
                speedButton.addEventListener('click', event => {
                  event.preventDefault(); event.stopPropagation();
                  try { speedButton.textContent = '🔊 Thorsten · ' + window.KPLocalLive.cycleSpeechRate(); }
                  catch (_) {}
                });
                refreshSpeed();
                actions.prepend(speedButton);
                actions.prepend(b);
                const small = q('.kp-wa-head small');
'''
if 'kp-wa-local-speed' not in l:
    if js_anchor not in l:
        raise SystemExit('LiveLocalActivity JS actions anchor missing')
    l = l.replace(js_anchor, js_insert, 1)

bridge_anchor = '''        @JavascriptInterface
        fun installModel() {
'''
bridge_insert = '''        @JavascriptInterface
        fun speechRateLabel(): String = if (::voiceController.isInitialized) voiceController.speechRateLabel() else "1,0×"

        @JavascriptInterface
        fun cycleSpeechRate(): String = if (::voiceController.isInitialized) voiceController.cycleSpeechRateLabel() else "1,0×"

        @JavascriptInterface
        fun installModel() {
'''
if 'fun cycleSpeechRate()' not in l:
    if bridge_anchor not in l:
        raise SystemExit('LiveLocalActivity bridge anchor missing')
    l = l.replace(bridge_anchor, bridge_insert, 1)

live.write_text(l)

c = ci.read_text()
ci_anchor = '''      - run:
          name: Compile Homepage-Hilfe debug APK
'''
ci_step = '''      - run:
          name: Prepare bundled natural male voice
          command: bash qa/prepare-android-natural-voice.sh
      - run:
          name: Compile Homepage-Hilfe debug APK
'''
if 'name: Prepare bundled natural male voice' not in c:
    if ci_anchor not in c:
        raise SystemExit('CircleCI Android compile anchor missing')
    c = c.replace(ci_anchor, ci_step, 1)
ci.write_text(c)

print('Natural voice source patch applied.')
