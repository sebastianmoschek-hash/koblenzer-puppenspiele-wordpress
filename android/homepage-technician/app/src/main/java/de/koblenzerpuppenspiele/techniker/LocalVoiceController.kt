package de.koblenzerpuppenspiele.techniker

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import java.text.Normalizer
import java.util.Locale
import java.util.UUID

/**
 * Resource-conscious local conversational speech loop.
 *
 * Speech recognition is accepted only through Android's explicit on-device
 * recognizer. TTS uses German voices that declare that no network connection is
 * required. The recognizer stays warm while the model thinks and can listen
 * while TTS is speaking; a lightweight text-overlap filter rejects the phone's
 * own TTS echo and allows real user speech to interrupt the answer (barge-in).
 */
class LocalVoiceController(
    private val context: Context,
    private val onUserText: (String) -> Unit,
    private val onStatus: (String) -> Unit,
) {
    data class VoiceOption(
        val id: String,
        val label: String,
        val localeTag: String,
    )

    private val main = Handler(Looper.getMainLooper())
    private val prefs = context.getSharedPreferences("kp-local-voice", Context.MODE_PRIVATE)
    private var recognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var offlineVoices: List<Voice> = emptyList()
    private var active = false
    private var listening = false
    private var speaking = false
    private var ttsReady = false
    private var selectedVoiceName: String = prefs.getString("voice_name", "").orEmpty()
    private var spokenAssistantNormalized = ""
    private var lastDeliveredNormalized = ""
    private var lastDeliveredAt = 0L

    init {
        tts = TextToSpeech(context.applicationContext) { result ->
            // Post once so field assignment has definitely completed even with a
            // very fast in-process TTS engine.
            main.post { configureTts(result) }
        }
    }

    fun isSupported(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

    fun isActive(): Boolean = active

    fun hasOfflineGermanVoices(): Boolean = ttsReady && offlineVoices.isNotEmpty()

    fun voiceOptions(): List<VoiceOption> = offlineVoices.take(MAX_VOICE_OPTIONS).mapIndexed { index, voice ->
        VoiceOption(
            id = voice.name,
            label = "Stimme ${index + 1} · ${voice.locale.toLanguageTag()} · lokal",
            localeTag = voice.locale.toLanguageTag(),
        )
    }

    fun selectedVoiceId(): String = currentVoice()?.name.orEmpty()

    fun selectedVoiceLabel(): String {
        val voice = currentVoice() ?: return if (ttsReady) "keine deutsche Offline-Stimme" else "Stimme wird geladen"
        val index = offlineVoices.indexOfFirst { it.name == voice.name }.takeIf { it >= 0 } ?: 0
        return "Stimme ${index + 1} · ${voice.locale.toLanguageTag()}"
    }

    fun selectVoice(id: String): Boolean {
        val engine = tts ?: return false
        val voice = offlineVoices.firstOrNull { it.name == id } ?: return false
        val result = engine.setVoice(voice)
        if (result == TextToSpeech.ERROR) return false
        selectedVoiceName = voice.name
        prefs.edit().putString("voice_name", voice.name).apply()
        return true
    }

    fun previewVoice(id: String): Boolean {
        if (!selectVoice(id)) return false
        val engine = tts ?: return false
        val wasActive = active
        if (wasActive) {
            listening = false
            runCatching { recognizer?.cancel() }
        }
        speaking = true
        spokenAssistantNormalized = normalize(PREVIEW_TEXT)
        val result = engine.speak(PREVIEW_TEXT, TextToSpeech.QUEUE_FLUSH, null, "kp-preview-${UUID.randomUUID()}")
        if (result == TextToSpeech.ERROR) {
            speaking = false
            spokenAssistantNormalized = ""
            if (wasActive) continueListening(250L)
            return false
        }
        return true
    }

    fun start() {
        check(isSupported()) { "Auf diesem Gerät ist keine lokale Android-Spracherkennung verfügbar." }
        active = true
        ensureRecognizer()
        continueListening(80L)
    }

    fun stop() {
        active = false
        listening = false
        speaking = false
        spokenAssistantNormalized = ""
        main.removeCallbacksAndMessages(null)
        runCatching { recognizer?.cancel() }
        runCatching { recognizer?.destroy() }
        recognizer = null
        runCatching { tts?.stop() }
    }

    /** Keep the on-device recognizer warm, including while the model is thinking. */
    fun continueListening(delayMs: Long = 120L) {
        if (!active) return
        main.postDelayed({
            if (!active || listening) return@postDelayed
            ensureRecognizer()
            listening = true
            onStatus(if (speaking) "Live lokal · KI spricht · du kannst sie unterbrechen" else "Live lokal · ich höre zu und sehe die aktuelle Homepage")
            runCatching { recognizer?.startListening(recognizerIntent()) }
                .onFailure {
                    listening = false
                    onStatus("Lokale Spracherkennung konnte nicht gestartet werden: ${it.message ?: it.javaClass.simpleName}")
                    if (active) continueListening(650L)
                }
        }, delayMs)
    }

    fun speak(text: String) {
        if (!active) return
        val engine = tts
        val spoken = speechFriendly(text)
        if (spoken.isBlank()) {
            continueListening(80L)
            return
        }
        if (!ttsReady || offlineVoices.isEmpty() || engine == null) {
            onStatus("Live lokal · Antwort steht im Chat · keine deutsche Offline-Stimme installiert")
            continueListening(120L)
            return
        }

        runCatching { recognizer?.cancel() }
        listening = false
        speaking = true
        spokenAssistantNormalized = normalize(spoken)
        val utteranceId = "kp-local-${UUID.randomUUID()}"
        onStatus("Live lokal · KI antwortet · reinreden zum Unterbrechen")
        val result = engine.speak(spoken, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
        if (result == TextToSpeech.ERROR) {
            speaking = false
            spokenAssistantNormalized = ""
            continueListening(180L)
            return
        }
        // Listen again while TTS is still playing. Echo-like transcripts are
        // ignored; a divergent transcript is treated as a real interruption.
        continueListening(BARGE_IN_LISTEN_DELAY_MS)
    }

    fun stopSpeakingForBargeIn() {
        if (!speaking) return
        speaking = false
        spokenAssistantNormalized = ""
        runCatching { tts?.stop() }
        onStatus("Live lokal · unterbrochen · ich höre dir zu")
    }

    fun release() {
        stop()
        runCatching { tts?.shutdown() }
        tts = null
    }

    private fun configureTts(result: Int) {
        val engine = tts ?: return
        if (result != TextToSpeech.SUCCESS) {
            ttsReady = false
            offlineVoices = emptyList()
            return
        }

        offlineVoices = engine.voices.orEmpty()
            .asSequence()
            .filter { voice ->
                voice.locale.language.equals("de", ignoreCase = true) &&
                    !voice.isNetworkConnectionRequired
            }
            .sortedWith(
                compareByDescending<Voice> { voice -> voice.name.contains("male", ignoreCase = true) || voice.name.contains("mann", ignoreCase = true) }
                    .thenByDescending { voice -> voice.locale.country.equals("DE", ignoreCase = true) }
                    .thenByDescending { voice -> voice.quality }
                    .thenBy { voice -> voice.latency }
                    .thenBy { voice -> voice.name }
            )
            .toList()

        val chosen = offlineVoices.firstOrNull { it.name == selectedVoiceName }
            ?: offlineVoices.firstOrNull()
        if (chosen != null) {
            engine.voice = chosen
            selectedVoiceName = chosen.name
            prefs.edit().putString("voice_name", chosen.name).apply()
        } else {
            engine.language = Locale.GERMANY
        }
        engine.setSpeechRate(1.03f)
        engine.setPitch(0.96f)
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit

            override fun onDone(utteranceId: String?) {
                main.post {
                    speaking = false
                    spokenAssistantNormalized = ""
                    if (active && !listening) continueListening(70L)
                }
            }

            @Deprecated("Deprecated callback retained for older Android TTS engines")
            override fun onError(utteranceId: String?) {
                main.post {
                    speaking = false
                    spokenAssistantNormalized = ""
                    if (active && !listening) continueListening(120L)
                }
            }
        })
        ttsReady = true
    }

    private fun currentVoice(): Voice? {
        val engineVoice = tts?.voice
        if (engineVoice != null && offlineVoices.any { it.name == engineVoice.name }) return engineVoice
        return offlineVoices.firstOrNull { it.name == selectedVoiceName } ?: offlineVoices.firstOrNull()
    }

    private fun recognizerIntent(): Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "de-DE")
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "de-DE")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        // One spoken request must arrive as one command. The previous segmented
        // session could deliver fragments such as "unterstütz" immediately.
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, SPEECH_MINIMUM_MS)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, SPEECH_POSSIBLY_COMPLETE_SILENCE_MS)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, SPEECH_COMPLETE_SILENCE_MS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            putExtra(
                RecognizerIntent.EXTRA_BIASING_STRINGS,
                arrayListOf(
                    "Koblenzer Puppenspiele",
                    "Homepage",
                    "Begrüßungstext",
                    "Überschrift",
                    "was siehst du",
                    "hilf mir",
                    "unterstütz mich",
                    "größer",
                    "kleiner",
                    "Pfeile",
                    "Menü",
                    "Bearbeiten",
                    "Speichern",
                ),
            )
        }
    }

    private fun ensureRecognizer() {
        if (recognizer != null) return
        if (!isSupported()) throw IllegalStateException("Lokale Spracherkennung ist auf diesem Gerät nicht verfügbar.")
        recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context).also { speech ->
            speech.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    onStatus(if (speaking) "Live lokal · KI spricht · einfach reinreden" else "Live lokal · sprich einfach · aktuelle Seite wird mitgelesen")
                }

                override fun onBeginningOfSpeech() {
                    if (speaking) onStatus("Live lokal · Unterbrechung erkannt …")
                }

                override fun onRmsChanged(rmsdB: Float) = Unit
                override fun onBufferReceived(buffer: ByteArray?) = Unit
                override fun onEndOfSpeech() = Unit

                override fun onError(error: Int) {
                    listening = false
                    if (!active) return
                    when (error) {
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                            active = false
                            onStatus("Mikrofonberechtigung fehlt für Live lokal.")
                        }
                        SpeechRecognizer.ERROR_CLIENT -> continueListening(420L)
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> continueListening(650L)
                        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> continueListening(120L)
                        else -> continueListening(300L)
                    }
                }

                override fun onResults(results: Bundle?) {
                    listening = false
                    consumeRecognition(bestText(results), keepSession = false)
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val partial = bestText(partialResults)
                    if (partial.isBlank() || !active) return
                    if (speaking && !looksLikeOwnVoice(partial)) {
                        stopSpeakingForBargeIn()
                    }
                    if (!looksLikeOwnVoice(partial)) onStatus("Live lokal · $partial")
                }

                override fun onSegmentResults(segmentResults: Bundle) {
                    // Some Android recognizers may emit segment callbacks even
                    // without a segmented session. Never execute those fragments.
                    val segment = bestText(segmentResults)
                    if (segment.isNotBlank() && active && !looksLikeOwnVoice(segment)) {
                        onStatus("Live lokal · $segment …")
                    }
                }

                override fun onEndOfSegmentedSession() {
                    listening = false
                    if (active) continueListening(120L)
                }

                override fun onEvent(eventType: Int, params: Bundle?) = Unit
            })
        }
    }

    private fun consumeRecognition(text: String, keepSession: Boolean) {
        if (!active) return
        val clean = text.trim()
        if (clean.isBlank()) {
            if (!keepSession) continueListening(80L)
            return
        }
        if (looksLikeOwnVoice(clean)) {
            if (!keepSession) continueListening(80L)
            return
        }
        if (speaking) stopSpeakingForBargeIn()

        val normalized = normalize(clean)
        val now = System.currentTimeMillis()
        if (normalized == lastDeliveredNormalized && now - lastDeliveredAt < DUPLICATE_WINDOW_MS) {
            if (!keepSession) continueListening(80L)
            return
        }
        lastDeliveredNormalized = normalized
        lastDeliveredAt = now
        if (!keepSession) listening = false
        onStatus("Live lokal · verstanden · KI bearbeitet die aktuelle Seite …")
        onUserText(clean)
    }

    private fun bestText(bundle: Bundle?): String = bundle
        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        ?.firstOrNull()
        ?.trim()
        .orEmpty()

    private fun looksLikeOwnVoice(candidate: String): Boolean {
        if (!speaking || spokenAssistantNormalized.isBlank()) return false
        val heard = normalize(candidate)
        if (heard.length < 3) return true
        if (spokenAssistantNormalized.contains(heard)) return true
        val heardWords = heard.split(' ').filter { it.length > 2 }.toSet()
        val spokenWords = spokenAssistantNormalized.split(' ').filter { it.length > 2 }.toSet()
        if (heardWords.isEmpty() || spokenWords.isEmpty()) return false
        val overlap = heardWords.intersect(spokenWords).size.toDouble() / heardWords.size.toDouble()
        return overlap >= ECHO_WORD_OVERLAP
    }

    private fun speechFriendly(text: String): String {
        val cleaned = text
            .replace(Regex("https?://\\S+"), "")
            .replace(Regex("[`*_#]+"), "")
            .replace(Regex("\\s+"), " ")
            .trim()
        val concise = cleaned.split(Regex("(?<=[.!?])\\s+")).take(2).joinToString(" ")
        return concise.take(MAX_SPOKEN_CHARS)
    }

    private fun normalize(text: String): String = Normalizer.normalize(text.lowercase(Locale.GERMAN), Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "")
        .replace(Regex("[^a-z0-9äöüß ]"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()

    companion object {
        private const val MAX_VOICE_OPTIONS = 8
        private const val MAX_SPOKEN_CHARS = 520
        private const val BARGE_IN_LISTEN_DELAY_MS = 320L
        private const val SPEECH_MINIMUM_MS = 900L
        private const val SPEECH_POSSIBLY_COMPLETE_SILENCE_MS = 1100L
        private const val SPEECH_COMPLETE_SILENCE_MS = 1800L
        private const val DUPLICATE_WINDOW_MS = 1800L
        private const val ECHO_WORD_OVERLAP = 0.72
        private const val PREVIEW_TEXT = "Hallo. Ich bin deine lokale Homepage-Hilfe. Was möchtest du ändern?"
    }
}
