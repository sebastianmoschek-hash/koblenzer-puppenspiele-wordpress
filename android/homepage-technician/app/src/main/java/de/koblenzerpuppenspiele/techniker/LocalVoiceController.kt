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
import java.text.Normalizer
import java.util.Locale

/**
 * Local conversational speech loop for Homepage-Hilfe.
 *
 * Recognition uses Android's explicit on-device recognizer. Speech output is
 * exclusively the bundled Thorsten High Piper/VITS model via LocalNaturalVoice;
 * there is deliberately no Android/Google TextToSpeech fallback.
 */
class LocalVoiceController(
    private val context: Context,
    private val onUserText: (String) -> Unit,
    private val onStatus: (String) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    private val prefs = context.getSharedPreferences("kp-local-voice", Context.MODE_PRIVATE)
    private val naturalVoice = LocalNaturalVoice(context.applicationContext)
    private var speechRate = prefs.getFloat("speech_rate", 1.0f).coerceIn(0.8f, 1.2f)
    private var recognizer: SpeechRecognizer? = null
    private var active = false
    private var listening = false
    private var speaking = false
    private var spokenAssistantNormalized = ""
    private var lastDeliveredNormalized = ""
    private var lastDeliveredAt = 0L

    fun isSupported(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

    fun isActive(): Boolean = active

    fun naturalVoiceLabel(): String = naturalVoice.label()

    fun speechRateLabel(): String = String.format(Locale.GERMANY, "%.1f×", speechRate)

    fun cycleSpeechRateLabel(): String {
        val rates = floatArrayOf(0.8f, 0.9f, 1.0f, 1.1f, 1.2f)
        val current = rates.indices.minByOrNull { kotlin.math.abs(rates[it] - speechRate) } ?: 2
        speechRate = rates[(current + 1) % rates.size]
        prefs.edit().putFloat("speech_rate", speechRate).apply()
        return speechRateLabel()
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
        naturalVoice.stop()
        runCatching { recognizer?.cancel() }
        runCatching { recognizer?.destroy() }
        recognizer = null
    }

    fun continueListening(delayMs: Long = 120L) {
        if (!active) return
        main.postDelayed({
            if (!active || listening || speaking) return@postDelayed
            ensureRecognizer()
            listening = true
            onStatus("Live lokal · ich höre zu und sehe die aktuelle Homepage")
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
        val spoken = speechFriendly(text)
        if (spoken.isBlank()) {
            continueListening(ECHO_RELEASE_MS)
            return
        }

        // Strict half duplex: while Thorsten speaks, recognition is fully stopped.
        listening = false
        runCatching { recognizer?.cancel() }
        speaking = true
        spokenAssistantNormalized = normalize(spoken)
        onStatus("Live lokal · Thorsten High antwortet · Mikrofon ist kurz pausiert")

        if (!naturalVoice.isBundled()) {
            speaking = false
            spokenAssistantNormalized = ""
            onStatus("Thorsten High fehlt in dieser APK · keine Systemstimme verwendet")
            if (active) continueListening(ECHO_RELEASE_MS)
            return
        }

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
                    val detail = error.message ?: error.javaClass.simpleName
                    onStatus("Thorsten High konnte nicht starten: $detail · keine Systemstimme verwendet")
                    if (active) continueListening(ECHO_RELEASE_MS)
                }
            },
        )
    }

    fun stopSpeakingForBargeIn() {
        if (!speaking) return
        naturalVoice.stop()
        speaking = false
        spokenAssistantNormalized = ""
        onStatus("Live lokal · Sprachausgabe beendet")
        if (active) continueListening(ECHO_RELEASE_MS)
    }

    fun release() {
        stop()
        naturalVoice.release()
    }

    private fun recognizerIntent(): Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "de-DE")
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "de-DE")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
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
                    onStatus("Live lokal · sprich einfach · aktuelle Seite wird mitgelesen")
                }

                override fun onBeginningOfSpeech() = Unit
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
                    if (partial.isBlank() || !active || speaking) return
                    onStatus("Live lokal · $partial")
                }

                override fun onSegmentResults(segmentResults: Bundle) {
                    val segment = bestText(segmentResults)
                    if (segment.isNotBlank() && active && !speaking) {
                        onStatus("Live lokal · $segment …")
                    }
                }

                override fun onEndOfSegmentedSession() {
                    listening = false
                    if (active && !speaking) continueListening(120L)
                }

                override fun onEvent(eventType: Int, params: Bundle?) = Unit
            })
        }
    }

    private fun consumeRecognition(text: String, keepSession: Boolean) {
        if (!active || speaking) return
        val clean = text.trim()
        if (clean.isBlank()) {
            if (!keepSession) continueListening(80L)
            return
        }

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
        private const val MAX_SPOKEN_CHARS = 520
        private const val ECHO_RELEASE_MS = 650L
        private const val SPEECH_MINIMUM_MS = 900L
        private const val SPEECH_POSSIBLY_COMPLETE_SILENCE_MS = 1100L
        private const val SPEECH_COMPLETE_SILENCE_MS = 1800L
        private const val DUPLICATE_WINDOW_MS = 1800L
    }
}
