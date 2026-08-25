package de.koblenzerpuppenspiele.techniker

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import com.k2fsa.sherpa.onnx.GenerationConfig
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import java.io.File
import java.util.concurrent.atomic.AtomicInteger

/**
 * Bundled, completely offline German male TTS voice for Live lokal.
 *
 * Model: Piper/VITS de_DE-thorsten-high via sherpa-onnx.
 * The model/tokens stay in APK assets; eSpeak data is copied once to filesDir
 * because the native phonemizer needs a real filesystem path.
 */
class LocalNaturalVoice(private val context: Context) {
    private val generation = AtomicInteger(0)
    @Volatile private var tts: OfflineTts? = null
    @Volatile private var track: AudioTrack? = null

    fun label(): String = "Thorsten High · natürlich · lokal"

    fun isBundled(): Boolean = runCatching {
        context.assets.open("$MODEL_DIR/tokens.txt").use { true }
    }.getOrDefault(false)

    fun speak(
        text: String,
        speed: Float,
        onStart: () -> Unit,
        onDone: () -> Unit,
        onError: (Throwable) -> Unit,
    ) {
        stop()
        val request = generation.incrementAndGet()
        Thread({
            var localTrack: AudioTrack? = null
            try {
                val engine = ensureTts()
                val sampleRate = engine.sampleRate()
                val minBuffer = AudioTrack.getMinBufferSize(
                    sampleRate,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_FLOAT,
                ).coerceAtLeast(sampleRate / 2)
                localTrack = AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANT)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                            .setSampleRate(sampleRate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build()
                    )
                    .setBufferSizeInBytes(minBuffer * 2)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .setSessionId(AudioManager.AUDIO_SESSION_ID_GENERATE)
                    .build()
                track = localTrack
                localTrack.play()
                onStart()

                engine.generateWithConfigAndCallback(
                    text = text,
                    config = GenerationConfig(
                        speed = speed.coerceIn(0.80f, 1.20f),
                        silenceScale = 0.16f,
                        sid = 0,
                    ),
                ) { samples ->
                    if (request != generation.get()) return@generateWithConfigAndCallback 0
                    val written = localTrack.write(samples, 0, samples.size, AudioTrack.WRITE_BLOCKING)
                    if (written > 0) 1 else 0
                }

                if (request == generation.get()) {
                    runCatching { localTrack.stop() }
                    onDone()
                }
            } catch (error: Throwable) {
                Log.e(TAG, "Thorsten High local voice failed", error)
                if (request == generation.get()) {
                    showEngineError(error)
                    // Deliberately finish instead of invoking the controller's
                    // legacy onError path, which used Android system TTS.
                    onDone()
                }
            } finally {
                runCatching { localTrack?.pause() }
                runCatching { localTrack?.flush() }
                runCatching { localTrack?.release() }
                if (track === localTrack) track = null
            }
        }, "kp-natural-voice").start()
    }

    fun stop() {
        generation.incrementAndGet()
        val active = track
        track = null
        runCatching { active?.pause() }
        runCatching { active?.flush() }
        runCatching { active?.stop() }
        runCatching { active?.release() }
    }

    fun release() {
        stop()
        val engine = tts
        tts = null
        runCatching { engine?.release() }
    }

    @Synchronized
    private fun ensureTts(): OfflineTts {
        tts?.let { return it }
        check(isBundled()) { "Thorsten High ist in dieser APK nicht enthalten." }
        val dataDir = ensureEspeakData()
        val config = OfflineTtsConfig(
            model = OfflineTtsModelConfig(
                vits = OfflineTtsVitsModelConfig(
                    model = "$MODEL_DIR/$MODEL_FILE",
                    tokens = "$MODEL_DIR/tokens.txt",
                    dataDir = dataDir.absolutePath,
                    noiseScale = 0.667f,
                    noiseScaleW = 0.8f,
                    lengthScale = 1.0f,
                ),
                numThreads = 2,
                debug = false,
            ),
            maxNumSentences = 2,
            silenceScale = 0.16f,
        )
        return OfflineTts(assetManager = context.assets, config = config).also { tts = it }
    }

    private fun ensureEspeakData(): File {
        val root = File(context.filesDir, "natural-voice/$MODEL_DIR/$ESPEAK_DIR")
        val marker = File(root, ".ready-v1")
        if (marker.isFile) return root
        if (root.exists()) root.deleteRecursively()
        root.mkdirs()
        copyAssetTree("$MODEL_DIR/$ESPEAK_DIR", root)
        marker.writeText("ok")
        return root
    }

    private fun copyAssetTree(assetPath: String, destination: File) {
        val children = context.assets.list(assetPath).orEmpty()
        if (children.isEmpty()) {
            destination.parentFile?.mkdirs()
            context.assets.open(assetPath).use { input ->
                destination.outputStream().use { output -> input.copyTo(output, 256 * 1024) }
            }
            return
        }
        destination.mkdirs()
        for (child in children) {
            copyAssetTree("$assetPath/$child", File(destination, child))
        }
    }

    private fun showEngineError(error: Throwable) {
        val detail = error.message ?: error.javaClass.simpleName
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(
                context,
                "Thorsten High konnte nicht starten: $detail · keine Systemstimme verwendet",
                Toast.LENGTH_LONG,
            ).show()
        }
    }

    companion object {
        private const val TAG = "KPNaturalVoice"
        private const val MODEL_DIR = "vits-piper-de_DE-thorsten-high"
        private const val MODEL_FILE = "de_DE-thorsten-high.onnx"
        private const val ESPEAK_DIR = "espeak-ng-data"
    }
}
