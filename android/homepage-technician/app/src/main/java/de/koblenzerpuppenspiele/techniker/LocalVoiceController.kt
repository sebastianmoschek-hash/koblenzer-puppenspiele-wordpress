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
import java.util.Locale
import java.util.UUID

/**
 * Local speech loop for Homepage-Hilfe.
 *
 * Audio is accepted only through Android's explicit on-device recognizer. We do
 * not fall back to createSpeechRecognizer(), because that implementation may
 * stream audio to remote servers. Spoken answers likewise use only an installed
 * TTS voice that declares that it does not require a network connection.
 */
class LocalVoiceController(
    private val context: Context,
    private val onUserText: (String) -> Unit,
    private val onStatus: (String) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var active = false
    private var listening = false
    private var ttsReady = false
    private var offlineGermanVoice = false

    private val tts = TextToSpeech(context.applicationContext) { result ->
        if (result != TextToSpeech.SUCCESS) {
            ttsReady = false
            offlineGermanVoice = false
            return@TextToSpeech
        }
        val engine = tts
        val voice = engine.voices
            ?.filter { it.locale.language.equals("de", ignoreCase = true) && !it.isNetworkConnectionRequired }
            ?.sortedByDescending { it.locale.country.equals("DE", ignoreCase = true) }
            ?.firstOrNull()
        offlineGermanVoice = voice != null
        if (voice != null) engine.voice = voice else engine.language = Locale.GERMANY
        engine.setSpeechRate(1.0f)
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit
            override fun onDone(utteranceId: String?) {
                main.post { if (active) continueListening() }
            }
            @Deprecated("Deprecated callback retained for older Android TTS engines")
            override fun onError(utteranceId: String?) {
                main.post { if (active) continueListening() }
            }
        })
        ttsReady = true
    }

    fun isSupported(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

    fun isActive(): Boolean = active

    fun start() {
        check(isSupported()) { "Auf diesem Gerät ist keine lokale Android-Spracherkennung verfügbar." }
        active = true
        ensureRecognizer()
        continueListening()
    }

    fun stop() {
        active = false
        listening = false
        main.removeCallbacksAndMessages(null)
        runCatching { recognizer?.cancel() }
        runCatching { recognizer?.destroy() }
        recognizer = null
        runCatching { tts.stop() }
    }

    fun continueListening(delayMs: Long = 250L) {
        if (!active) return
        main.postDelayed({
            if (!active || listening) return@postDelayed
            ensureRecognizer()
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "de-DE")
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "de-DE")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            }
            listening = true
            onStatus("Live lokal · ich höre zu und sehe die aktuelle Homepage")
            runCatching { recognizer?.startListening(intent) }
                .onFailure {
                    listening = false
                    onStatus("Lokale Spracherkennung konnte nicht gestartet werden: ${it.message ?: it.javaClass.simpleName}")
                }
        }, delayMs)
    }

    fun speak(text: String) {
        if (!active) return
        listening = false
        runCatching { recognizer?.cancel() }
        val spoken = text.trim().take(1400)
        if (spoken.isBlank()) {
            continueListening()
            return
        }
        if (!ttsReady || !offlineGermanVoice) {
            onStatus("Live lokal · Antwort steht im Chat · keine lokale deutsche Stimme installiert")
            continueListening(500L)
            return
        }
        val utteranceId = "kp-local-${UUID.randomUUID()}"
        onStatus("Live lokal · KI antwortet …")
        val result = tts.speak(spoken, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
        if (result == TextToSpeech.ERROR) continueListening(500L)
    }

    fun release() {
        stop()
        runCatching { tts.shutdown() }
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
                        SpeechRecognizer.ERROR_CLIENT -> continueListening(700L)
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> continueListening(900L)
                        else -> continueListening(450L)
                    }
                }

                override fun onResults(results: Bundle?) {
                    listening = false
                    if (!active) return
                    val text = results
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()
                        ?.trim()
                        .orEmpty()
                    if (text.isBlank()) {
                        continueListening()
                    } else {
                        onStatus("Live lokal · verstanden · KI bearbeitet die aktuelle Seite …")
                        onUserText(text)
                    }
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    if (!active) return
                    val partial = partialResults
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()
                        ?.trim()
                        .orEmpty()
                    if (partial.isNotBlank()) onStatus("Live lokal · $partial")
                }

                override fun onEvent(eventType: Int, params: Bundle?) = Unit
            })
        }
    }
}
