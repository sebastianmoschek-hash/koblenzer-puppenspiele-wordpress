package de.koblenzerpuppenspiele.techniker

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.util.Base64
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

/**
 * Direct Gemini Live client for the Homepage-Hilfe app.
 *
 * A durable Gemini API key never enters Android. WordPress exchanges its server-side key for a
 * one-use ephemeral Live token, then this class connects directly to Gemini over WebSocket.
 * Microphone audio remains open while Gemini speaks. Gemini's VAD can therefore emit
 * serverContent.interrupted, at which point playback is flushed immediately (true barge-in).
 *
 * Long repair analysis is deliberately detached from the Live function call: Gemini receives an
 * immediate job id and can continue the conversation while the protected WordPress repair lab runs.
 */
class GeminiLiveTechnician(
    private val context: Context,
    private val bridge: WebRepairBridge,
    private val confirm: suspend (title: String, message: String) -> Boolean,
    private val status: (String) -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val client = OkHttpClient.Builder().build()
    private val running = AtomicBoolean(false)
    private val handlerJobs = ConcurrentHashMap<String, Job>()
    private val repairJobs = ConcurrentHashMap<String, RepairJobState>()

    @Volatile private var socket: WebSocket? = null
    @Volatile private var setupReady: CompletableDeferred<Unit>? = null
    @Volatile private var audioRecord: AudioRecord? = null
    @Volatile private var audioTrack: AudioTrack? = null
    @Volatile private var echoCanceler: AcousticEchoCanceler? = null
    @Volatile private var noiseSuppressor: NoiseSuppressor? = null
    private var audioJob: Job? = null
    private var frameJob: Job? = null

    private data class RepairJobState(
        @Volatile var state: String = "running",
        @Volatile var message: String = "Codeanalyse läuft.",
        @Volatile var result: JsonObject? = null,
    )

    @SuppressLint("MissingPermission")
    suspend fun start() {
        if (running.get()) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            throw IllegalStateException("Mikrofonzugriff fehlt.")
        }

        status("Live-Zugang wird serverseitig vorbereitet …")
        val bootstrap = bridge.bootstrap()
        bootstrap["error"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }?.let { throw IllegalStateException(it) }
        val token = bootstrap["liveToken"]?.jsonPrimitive?.content.orEmpty()
        if (token.isBlank()) throw IllegalStateException("WordPress hat kein kurzlebiges Gemini-Live-Token geliefert.")
        val model = bootstrap["model"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
            ?: "gemini-3.1-flash-live-preview"

        status("Direkte Gemini-Live-Verbindung wird geöffnet …")
        val ready = CompletableDeferred<Unit>()
        setupReady = ready
        running.set(true)
        val encoded = URLEncoder.encode(token, StandardCharsets.UTF_8.toString())
        val request = Request.Builder()
            .url("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=$encoded")
            .build()

        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send(buildSetup(model).toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleServerMessage(text)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                handleServerMessage(bytes.utf8())
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                if (running.get()) status("Gemini Live beendet die Verbindung ($code): ${reason.ifBlank { "ohne Begründung" }}")
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (running.get()) {
                    running.set(false)
                    status("Gemini Live wurde beendet ($code): ${reason.ifBlank { "Verbindung geschlossen" }}")
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                val detail = response?.let { "HTTP ${it.code}" } ?: (t.message ?: t.javaClass.simpleName)
                ready.completeExceptionally(IllegalStateException("Direkte Gemini-Live-Verbindung fehlgeschlagen: $detail", t))
                if (running.get()) status("Gemini Live: $detail")
                running.set(false)
            }
        })

        try {
            withTimeout(15_000) { ready.await() }
            startPlayback()
            startMicrophone()
            frameJob = scope.launch {
                ScreenFrameBus.jpegFrames.collectLatest { jpeg ->
                    if (!running.get()) return@collectLatest
                    sendRealtimeBlob("video", "image/jpeg", jpeg)
                }
            }
            status("KI live · du kannst Gemini jederzeit ins Wort fallen")
        } catch (error: Throwable) {
            stop()
            throw error
        }
    }

    fun stop() {
        running.set(false)
        audioJob?.cancel(); audioJob = null
        frameJob?.cancel(); frameJob = null
        handlerJobs.values.forEach { it.cancel() }
        handlerJobs.clear()
        stopAudio()
        socket?.close(1000, "Nutzer hat KI-Live beendet")
        socket = null
        setupReady = null
        status("KI-Live beendet")
    }

    fun release() {
        stop()
        client.dispatcher.executorService.shutdown()
        client.connectionPool.evictAll()
        scope.cancel()
    }

    private fun buildSetup(model: String): JSONObject {
        val declarations = JSONArray().apply {
            put(function("inspect_homepage", "Untersuche sofort die aktuell sichtbare Homepage, den ausgewählten Bereich und den verfügbaren Seitenkontext. Verwende das zuerst bei einem neuen Fehler."))
            put(function(
                "analyze_homepage_error",
                "Starte eine geschützte technische Codeanalyse im Hintergrund. Die Funktion kehrt sofort mit einer job_id zurück, damit du weiter mit dem Nutzer sprechen kannst. Sage danach, dass die Analyse läuft und der Nutzer weiterreden kann.",
                mapOf("description" to "Präzise deutsche Beschreibung des beobachteten Fehlers, inklusive sichtbarer Stelle und gewünschtem Verhalten."),
                listOf("description"),
            ))
            put(function(
                "get_repair_job",
                "Prüfe den Stand einer zuvor gestarteten Hintergrund-Codeanalyse.",
                mapOf("job_id" to "job_id aus analyze_homepage_error."),
                listOf("job_id"),
            ))
            put(function(
                "create_repair_branch",
                "Erstelle nach ausdrücklicher Bestätigung des Nutzers aus einem sicheren Reparaturvorschlag einen isolierten ai-repair Prüfbranch und Pull Request. Niemals direkt live schreiben.",
                mapOf("proposal_id" to "proposal_id aus einer abgeschlossenen sicheren Codeanalyse."),
                listOf("proposal_id"),
            ))
            put(function(
                "check_repair_status",
                "Prüfe CI und Merge-Bereitschaft eines Reparatur-Pull-Requests.",
                mapOf("pr" to "Pull-Request-Nummer."),
                listOf("pr"),
            ))
            put(function(
                "merge_repair",
                "Übernimm nach ausdrücklicher Bestätigung einen Reparatur-PR. Der Server verweigert den Merge, solange CI nicht grün ist.",
                mapOf("pr" to "Pull-Request-Nummer."),
                listOf("pr"),
            ))
            put(function("list_technical_repairs", "Liste die bisherigen technischen KI-Reparaturen und ihren Rücknahmezustand."))
            put(function(
                "rollback_technical_repair",
                "Erstelle nach ausdrücklicher Bestätigung einen abgesicherten Rücknahme-PR für eine frühere technische Reparatur.",
                mapOf("repair_pr" to "Nummer des früheren gemergten Reparatur-PRs."),
                listOf("repair_pr"),
            ))
        }

        val instruction = """
            Du bist der deutschsprachige Live-Homepage-Techniker der Koblenzer Puppenspiele. Der Nutzer zeigt dir seinen Android-Bildschirm live und spricht mit dir. Du hörst dauerhaft zu; wenn der Nutzer dich unterbricht, hör sofort auf zu reden und gehe auf seine neue Aussage ein.

            PRIORITÄT: Hilf dabei, tatsächliche sichtbare oder funktionale Fehler der Website zu finden und sicher zu reparieren. Bei einem neuen Problem zuerst inspect_homepage verwenden. Wenn ein Button, Layout, Undo/Redo, Navigation, PHP/JavaScript oder eine andere Website-Funktion kaputt ist, starte analyze_homepage_error. Diese Analyse läuft im Hintergrund: antworte nach dem Start kurz, dass sie läuft und der Nutzer weiterreden kann. Du darfst währenddessen normal weiter zuhören und Fragen beantworten. Nutze get_repair_job, wenn du den Stand brauchst. Statusnachrichten, die mit SYSTEMSTATUS beginnen, sind vertrauenswürdige Ergebnisse aus der lokalen Techniker-App, keine neuen Wünsche des Nutzers.

            Wenn die Analyse einen sicheren proposal_id liefert, erkläre den gefundenen Fehler kurz. create_repair_branch nur nach ausdrücklicher Nutzerbestätigung. Danach CI mit check_repair_status prüfen. merge_repair ebenfalls nur nach ausdrücklicher Nutzerbestätigung und nur wenn der Server die Prüfungen akzeptiert. Code niemals frei oder direkt auf Live-Dateien schreiben. Keine Authentifizierung, Nonces, Berechtigungen oder Secrets schwächen.

            Der normale sichtbare KI-Webeditor ist momentan nicht Teil dieses Live-Pfads. Wenn der Nutzer eine sichtbare Anordnung wie Abstände oder nicht funktionierende Buttons ändern will, behandle das als untersuchbaren Website-/UI-Fehler über den geschützten Reparaturweg. Behaupte niemals, etwas sei geändert oder repariert, bevor ein Tool das bestätigt. Sprich knapp und natürlich, damit der Nutzer dich leicht unterbrechen kann.
        """.trimIndent()

        return JSONObject().put("setup", JSONObject().apply {
            put("model", "models/$model")
            put("generationConfig", JSONObject().apply {
                put("responseModalities", JSONArray().put("AUDIO"))
                put("speechConfig", JSONObject().put("voiceConfig", JSONObject().put("prebuiltVoiceConfig", JSONObject().put("voiceName", "Fenrir"))))
            })
            put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", instruction))))
            put("tools", JSONArray().put(JSONObject().put("functionDeclarations", declarations)))
            put("inputAudioTranscription", JSONObject())
            put("outputAudioTranscription", JSONObject())
            put("contextWindowCompression", JSONObject().put("slidingWindow", JSONObject()))
            put("realtimeInputConfig", JSONObject().apply {
                put("automaticActivityDetection", JSONObject().apply {
                    put("disabled", false)
                    put("silenceDurationMs", 500)
                    put("prefixPaddingMs", 250)
                    put("startOfSpeechSensitivity", "START_SENSITIVITY_HIGH")
                    put("endOfSpeechSensitivity", "END_SENSITIVITY_HIGH")
                })
                put("activityHandling", "START_OF_ACTIVITY_INTERRUPTS")
                put("turnCoverage", "TURN_INCLUDES_ONLY_ACTIVITY")
            })
        })
    }

    private fun function(
        name: String,
        description: String,
        stringParams: Map<String, String> = emptyMap(),
        required: List<String> = emptyList(),
    ): JSONObject = JSONObject().apply {
        put("name", name)
        put("description", description)
        put("parameters", JSONObject().apply {
            put("type", "OBJECT")
            put("properties", JSONObject().apply {
                stringParams.forEach { (param, desc) ->
                    put(param, JSONObject().put("type", "STRING").put("description", desc))
                }
            })
            if (required.isNotEmpty()) put("required", JSONArray(required))
        })
    }

    private fun handleServerMessage(raw: String) {
        val data = runCatching { JSONObject(raw) }.getOrNull() ?: return
        if (data.has("setupComplete")) {
            setupReady?.complete(Unit)
            return
        }
        data.optJSONObject("toolCall")?.optJSONArray("functionCalls")?.let { calls ->
            for (i in 0 until calls.length()) {
                val call = calls.optJSONObject(i) ?: continue
                val id = call.optString("id").ifBlank { UUID.randomUUID().toString() }
                val job = scope.launch { handleFunctionCall(id, call.optString("name"), call.optJSONObject("args") ?: JSONObject()) }
                handlerJobs[id] = job
                job.invokeOnCompletion { handlerJobs.remove(id) }
            }
        }
        data.optJSONObject("toolCallCancellation")?.optJSONArray("ids")?.let { ids ->
            for (i in 0 until ids.length()) handlerJobs.remove(ids.optString(i))?.cancel()
        }

        val server = data.optJSONObject("serverContent") ?: return
        if (server.optBoolean("interrupted", false)) interruptPlayback()
        server.optJSONObject("modelTurn")?.optJSONArray("parts")?.let { parts ->
            for (i in 0 until parts.length()) {
                val inline = parts.optJSONObject(i)?.optJSONObject("inlineData") ?: continue
                val base64 = inline.optString("data")
                if (base64.isNotBlank()) playAudio(Base64.decode(base64, Base64.DEFAULT))
            }
        }
    }

    private suspend fun handleFunctionCall(id: String, name: String, args: JSONObject) {
        val result = runCatching {
            when (name) {
                "inspect_homepage" -> {
                    status("KI: Seite wird untersucht …")
                    jsonToObject(bridge.context())
                }
                "analyze_homepage_error" -> startBackgroundRepair(args.optString("description"))
                "get_repair_job" -> repairJobResult(args.optString("job_id"))
                "create_repair_branch" -> {
                    val proposal = args.optString("proposal_id")
                    if (proposal.isBlank()) errorObject("proposal_id fehlt.")
                    else if (!confirm("Prüfbranch erstellen?", "Gemini möchte den vorbereiteten Fix auf einem isolierten Prüfbranch anlegen. Live-Dateien werden nicht direkt geändert.")) {
                        JSONObject().put("cancelled", true).put("message", "Nutzer hat die Erstellung abgelehnt.")
                    } else {
                        status("KI: Prüfbranch wird erstellt …")
                        jsonToObject(bridge.createRepairBranch(proposal))
                    }
                }
                "check_repair_status" -> {
                    status("KI: CI-Status wird geprüft …")
                    jsonToObject(bridge.status(args.optString("pr")))
                }
                "merge_repair" -> {
                    val pr = args.optString("pr")
                    if (!confirm("Geprüften Fix übernehmen?", "Der Reparaturserver übernimmt PR #$pr nur, wenn alle CI-Prüfungen grün sind.")) {
                        JSONObject().put("cancelled", true).put("message", "Nutzer hat den Merge abgelehnt.")
                    } else {
                        status("KI: geprüfter Fix wird übernommen …")
                        jsonToObject(bridge.merge(pr))
                    }
                }
                "list_technical_repairs" -> jsonToObject(bridge.technicalHistory())
                "rollback_technical_repair" -> {
                    val pr = args.optString("repair_pr")
                    if (!confirm("Technik-Reparatur zurücknehmen?", "Gemini möchte für Reparatur #$pr einen abgesicherten Rücknahme-PR erstellen. Spätere Änderungen werden nicht überschrieben.")) {
                        JSONObject().put("cancelled", true).put("message", "Nutzer hat die Rücknahme abgelehnt.")
                    } else jsonToObject(bridge.rollbackRepair(pr))
                }
                else -> errorObject("Unbekannte Techniker-Funktion: $name")
            }
        }.getOrElse { errorObject(it.message ?: "Techniker-Funktion fehlgeschlagen.") }
        sendToolResponse(id, name, result)
    }

    /** Returns immediately and lets the protected repair analysis run independently. */
    private fun startBackgroundRepair(description: String): JSONObject {
        if (description.isBlank()) return errorObject("Fehlerbeschreibung fehlt.")
        val jobId = UUID.randomUUID().toString()
        val state = RepairJobState()
        repairJobs[jobId] = state
        status("KI: Codeanalyse läuft im Hintergrund · du kannst weiterreden")
        scope.launch {
            val result = runCatching { bridge.analyze(description) }
                .getOrElse { kotlinx.serialization.json.buildJsonObject { put("error", it.message ?: "Codeanalyse fehlgeschlagen.") } }
            state.result = result
            val error = result["error"]?.jsonPrimitive?.content
            if (!error.isNullOrBlank()) {
                state.state = "failed"
                state.message = error
                status("KI: Codeanalyse fehlgeschlagen · $error")
            } else {
                state.state = "completed"
                state.message = "Codeanalyse abgeschlossen."
                status("KI: Codeanalyse abgeschlossen · Gemini bekommt das Ergebnis")
            }
            sendRealtimeText(
                "SYSTEMSTATUS: Hintergrund-Codeanalyse job_id=$jobId ist ${state.state}. Ergebnis: ${result}. " +
                    "Informiere den Nutzer kurz über das Ergebnis. Wenn ein sicherer proposal_id vorhanden ist, frage vor create_repair_branch ausdrücklich um Bestätigung."
            )
        }
        return JSONObject()
            .put("started", true)
            .put("job_id", jobId)
            .put("message", "Codeanalyse läuft im Hintergrund. Du kannst das Gespräch fortsetzen und später get_repair_job verwenden.")
    }

    private fun repairJobResult(jobId: String): JSONObject {
        val job = repairJobs[jobId] ?: return errorObject("Unbekannte job_id.")
        return JSONObject()
            .put("job_id", jobId)
            .put("state", job.state)
            .put("message", job.message)
            .put("result", job.result?.let(::jsonToObject) ?: JSONObject.NULL)
    }

    private fun sendToolResponse(id: String, name: String, result: JSONObject) {
        val response = JSONObject()
            .put("id", id)
            .put("name", name)
            .put("response", JSONObject().put("result", result))
        send(JSONObject().put("toolResponse", JSONObject().put("functionResponses", JSONArray().put(response))))
    }

    private fun sendRealtimeText(text: String) {
        if (!running.get()) return
        send(JSONObject().put("realtimeInput", JSONObject().put("text", text)))
    }

    private fun sendRealtimeBlob(field: String, mime: String, bytes: ByteArray) {
        val blob = JSONObject()
            .put("mimeType", mime)
            .put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
        send(JSONObject().put("realtimeInput", JSONObject().put(field, blob)))
    }

    private fun send(message: JSONObject) {
        socket?.send(message.toString())
    }

    @SuppressLint("MissingPermission")
    private fun startMicrophone() {
        val sampleRate = 16_000
        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuffer <= 0) throw IllegalStateException("Mikrofon-Puffer konnte nicht bestimmt werden.")
        val record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            max(minBuffer * 2, 6_400),
        )
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            throw IllegalStateException("Mikrofon konnte nicht initialisiert werden.")
        }
        audioRecord = record
        echoCanceler = if (AcousticEchoCanceler.isAvailable()) runCatching { AcousticEchoCanceler.create(record.audioSessionId)?.apply { enabled = true } }.getOrNull() else null
        noiseSuppressor = if (NoiseSuppressor.isAvailable()) runCatching { NoiseSuppressor.create(record.audioSessionId)?.apply { enabled = true } }.getOrNull() else null
        record.startRecording()
        audioJob = scope.launch {
            val chunk = ByteArray(3_200) // ~100 ms PCM16 mono at 16 kHz.
            while (running.get()) {
                val read = record.read(chunk, 0, chunk.size)
                if (read > 0) sendRealtimeBlob("audio", "audio/pcm;rate=16000", chunk.copyOf(read))
            }
        }
    }

    private fun startPlayback() {
        val sampleRate = 24_000
        val minBuffer = AudioTrack.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(max(minBuffer * 4, 19_200))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        if (track.state != AudioTrack.STATE_INITIALIZED) {
            track.release()
            throw IllegalStateException("Gemini-Audioausgabe konnte nicht initialisiert werden.")
        }
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        audioTrack = track
        track.play()
    }

    private fun playAudio(bytes: ByteArray) {
        val track = audioTrack ?: return
        if (!running.get() || bytes.isEmpty()) return
        runCatching { track.write(bytes, 0, bytes.size, AudioTrack.WRITE_BLOCKING) }
    }

    private fun interruptPlayback() {
        audioTrack?.let { track ->
            runCatching {
                track.pause()
                track.flush()
                if (running.get()) track.play()
            }
        }
        status("KI hört zu · du hast Gemini unterbrochen")
    }

    private fun stopAudio() {
        echoCanceler?.release(); echoCanceler = null
        noiseSuppressor?.release(); noiseSuppressor = null
        audioRecord?.let { record ->
            runCatching { if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) record.stop() }
            record.release()
        }
        audioRecord = null
        audioTrack?.let { track ->
            runCatching { track.pause(); track.flush(); track.stop() }
            track.release()
        }
        audioTrack = null
        runCatching {
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager.mode = AudioManager.MODE_NORMAL
        }
    }

    private fun jsonToObject(value: JsonObject): JSONObject = runCatching { JSONObject(value.toString()) }.getOrElse { errorObject("Ungültige Tool-Antwort.") }

    private fun errorObject(message: String): JSONObject = JSONObject().put("success", false).put("error", message)
}