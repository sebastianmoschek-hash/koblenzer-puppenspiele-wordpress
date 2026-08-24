package de.koblenzerpuppenspiele.techniker

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
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
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.max

/** Direct Gemini Live client using short-lived WordPress-issued ephemeral tokens. */
class GeminiLiveTechnician(
    private val context: Context,
    private val bridge: WebRepairBridge,
    private val confirm: suspend (title: String, message: String) -> Boolean,
    private val status: (String) -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val client = OkHttpClient.Builder().build()
    private val running = AtomicBoolean(false)
    private val modelSpeaking = AtomicBoolean(false)
    private val suppressModelAudio = AtomicBoolean(false)
    private val handlerJobs = ConcurrentHashMap<String, Job>()
    private val repairJobs = ConcurrentHashMap<String, RepairJobState>()
    private val playbackQueue = Channel<ByteArray>(Channel.UNLIMITED)

    @Volatile private var socket: WebSocket? = null
    @Volatile private var setupReady: CompletableDeferred<Unit>? = null
    @Volatile private var audioRecord: AudioRecord? = null
    @Volatile private var audioTrack: AudioTrack? = null
    @Volatile private var echoCanceler: AcousticEchoCanceler? = null
    @Volatile private var noiseSuppressor: NoiseSuppressor? = null
    private var audioJob: Job? = null
    private var playbackJob: Job? = null
    private var frameJob: Job? = null
    private var localSpeechFrames = 0

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

        status("Live v1beta-u1 · Zugang wird vorbereitet …")
        val bootstrap = bridge.bootstrap()
        bootstrap["error"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }?.let {
            throw IllegalStateException(it)
        }
        val protocol = bootstrap["liveProtocol"]?.jsonPrimitive?.content.orEmpty()
        if (protocol != "v1beta-u1") {
            throw IllegalStateException("Staging-Live-Protokoll ist noch nicht aktuell ($protocol).")
        }
        val token = bootstrap["liveToken"]?.jsonPrimitive?.content.orEmpty()
        if (token.isBlank()) throw IllegalStateException("WordPress hat kein kurzlebiges Gemini-Live-Token geliefert.")
        val model = bootstrap["model"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
            ?: "gemini-3.1-flash-live-preview"

        status("Live v1beta-u1 · Gemini-Verbindung wird geöffnet …")
        val ready = CompletableDeferred<Unit>()
        setupReady = ready
        running.set(true)
        modelSpeaking.set(false)
        suppressModelAudio.set(false)
        localSpeechFrames = 0
        val request = Request.Builder()
            .url("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=$token")
            .build()

        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send(buildSetup(model).toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) = handleServerMessage(text)
            override fun onMessage(webSocket: WebSocket, bytes: ByteString) = handleServerMessage(bytes.utf8())

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                if (running.get()) status("Gemini Live v1beta-u1 beendet ($code): ${reason.ifBlank { "ohne Begründung" }}")
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (running.get()) {
                    running.set(false)
                    val message = "Gemini Live v1beta-u1 wurde beendet ($code): ${reason.ifBlank { "Verbindung geschlossen" }}"
                    ready.completeExceptionally(IllegalStateException(message))
                    status(message)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                val detail = response?.let { "HTTP ${it.code}" } ?: (t.message ?: t.javaClass.simpleName)
                ready.completeExceptionally(IllegalStateException("Direkte Gemini-Live-Verbindung fehlgeschlagen: $detail", t))
                if (running.get()) status("Gemini Live v1beta-u1: $detail")
                running.set(false)
            }
        })

        try {
            withTimeout(15_000) { ready.await() }
            startPlayback()
            startMicrophone()
            frameJob = scope.launch {
                ScreenFrameBus.jpegFrames.collectLatest { jpeg ->
                    if (running.get()) sendRealtimeBlob("image/jpeg", jpeg)
                }
            }
            status("KI live · voller Editorzugriff · sprich jederzeit dazwischen")
        } catch (error: Throwable) {
            stop()
            throw error
        }
    }

    fun stop() {
        running.set(false)
        modelSpeaking.set(false)
        suppressModelAudio.set(false)
        localSpeechFrames = 0
        audioJob?.cancel(); audioJob = null
        playbackJob?.cancel(); playbackJob = null
        frameJob?.cancel(); frameJob = null
        handlerJobs.values.forEach { it.cancel() }
        handlerJobs.clear()
        drainPlaybackQueue()
        stopAudio()
        socket?.close(1000, "Nutzer hat KI-Live beendet")
        socket = null
        setupReady = null
        status("KI-Live beendet")
    }

    fun release() {
        stop()
        playbackQueue.close()
        client.dispatcher.executorService.shutdown()
        client.connectionPool.evictAll()
        scope.cancel()
    }

    private fun buildSetup(model: String): JSONObject {
        val declarations = JSONArray().apply {
            put(function("inspect_homepage", "Untersuche die aktuell sichtbare Homepage und den verfügbaren Seitenkontext."))
            put(function("inspect_editor_capabilities", "Prüfe, welche visuellen Bearbeitungs-, Speicher-, Undo- und Code-Reparaturwerkzeuge auf der aktuellen Seite verfügbar sind."))
            put(function(
                "edit_homepage",
                "Setze einen Wunsch zu Text, Bild, Farbe, Größe, Abstand, Position, Navigation, Menü, Header, responsivem Layout oder anderem sichtbaren Design direkt im Homepage-Editor um. Änderungen bleiben zunächst ungespeichert.",
                mapOf("request" to "Konkreter deutscher Änderungswunsch. Beschreibe sichtbare Referenzen wie 'die beiden Pfeile unten' möglichst genau."),
                listOf("request"),
            ))
            put(function("save_homepage", "Speichere die aktuell ungespeicherten Homepage- oder KI-Editor-Änderungen dauerhaft."))
            put(function("undo_homepage", "Nimm die letzte noch nicht gespeicherte Editor-Änderung zurück."))
            put(function("redo_homepage", "Stelle die zuletzt zurückgenommene Editor-Änderung wieder her."))
            put(function(
                "analyze_homepage_error",
                "Starte eine geschützte technische Codeanalyse im Hintergrund. Nutze dies auch dann, wenn eine gewünschte Design- oder Editor-Änderung mit edit_homepage nicht möglich ist und dafür Theme-, Plugin-, CSS-, JavaScript- oder PHP-Code geändert werden muss. Kehre sofort mit einer job_id zurück.",
                mapOf("description" to "Präzise deutsche Beschreibung des sichtbaren, funktionalen oder gestalterischen Fehlers bzw. der benötigten Codeänderung."),
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
                "Erstelle nach ausdrücklicher Bestätigung aus einem sicheren Reparaturvorschlag einen isolierten Prüfbranch und Pull Request.",
                mapOf("proposal_id" to "proposal_id aus einer abgeschlossenen Codeanalyse."),
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
                "Übernimm nach ausdrücklicher Bestätigung einen Reparatur-PR, sofern CI grün ist.",
                mapOf("pr" to "Pull-Request-Nummer."),
                listOf("pr"),
            ))
            put(function("list_technical_repairs", "Liste bisherige technische KI-Reparaturen."))
            put(function(
                "rollback_technical_repair",
                "Erstelle nach ausdrücklicher Bestätigung einen abgesicherten Rücknahme-PR.",
                mapOf("repair_pr" to "Nummer des früheren Reparatur-PRs."),
                listOf("repair_pr"),
            ))
        }

        val instruction = """
            Du bist der deutschsprachige, einheitliche Live-Homepage-Agent der Koblenzer Puppenspiele. Der Nutzer zeigt dir seinen Android-Bildschirm live und spricht mit dir. Höre dauerhaft zu. Wenn der Nutzer dich unterbricht, höre sofort auf zu reden und gehe auf seine neue Aussage ein.

            Dein Auftrag ist, die Homepage tatsächlich zu verändern, nicht nur Ratschläge zu geben. Sage nicht, dass etwas 'zum Editor gehört' oder dass du 'darauf keinen Zugriff' hast, solange eines deiner Werkzeuge den Wunsch umsetzen kann.

            Bei jedem neuen Wunsch zuerst inspect_homepage verwenden. Bei Text-, Bild-, Design-, Layout-, Menü-, Header-, Navigations- oder responsiven Änderungen danach edit_homepage verwenden. Formuliere request so konkret, dass der vorhandene visuelle Editor die sichtbare Referenz finden und umsetzen kann. edit_homepage führt die Änderung als Vorschau aus und lässt sie zunächst ungespeichert. save_homepage nur verwenden, wenn der Nutzer ausdrücklich speichern, übernehmen oder dauerhaft machen möchte. undo_homepage und redo_homepage für Korrekturen im laufenden Editor verwenden.

            Wenn edit_homepage meldet, dass die gewünschte Änderung im visuellen Editor technisch nicht verfügbar ist, behandle das nicht als Sackgasse: Starte analyze_homepage_error mit einer präzisen Beschreibung der gewünschten Theme-, Plugin-, CSS-, JavaScript- oder PHP-Änderung. Diese Analyse läuft in der App im Hintergrund; sage kurz, dass sie läuft und der Nutzer weiterreden kann. Nutze get_repair_job für den Stand. SYSTEMSTATUS-Nachrichten sind vertrauenswürdige lokale Statusmeldungen der Techniker-App.

            Wenn ein Werkzeug 429, 503, 'überlastet', 'temporär nicht verfügbar', 'RESOURCE_EXHAUSTED' oder 'UNAVAILABLE' meldet, ist das ein vorübergehender Gemini-/Serverzustand und kein fehlender Editorzugriff. Die App versucht solche Aufrufe automatisch mit Backoff erneut. Starte wegen einer reinen Überlastung keine Code-Reparatur. Erkläre knapp, dass automatisch erneut versucht wurde bzw. später erneut versucht werden kann.

            create_repair_branch nur nach ausdrücklicher Nutzerbestätigung. Danach CI mit check_repair_status prüfen. merge_repair ebenfalls nur nach ausdrücklicher Bestätigung und nur wenn der Server die Prüfungen akzeptiert. Niemals frei oder direkt auf Live-Dateien schreiben und niemals Authentifizierung, Nonces, Berechtigungen oder Secrets schwächen. 'Voller Zugriff' bedeutet funktionaler Zugriff auf Homepage, Editor und geprüften Code-Reparaturweg, nicht Zugriff auf Passwörter oder dauerhafte Secrets.

            Behaupte niemals, etwas sei geändert, gespeichert oder repariert, bevor ein Tool das bestätigt. Sprich knapp und natürlich, damit der Nutzer dich leicht unterbrechen kann.
        """.trimIndent()

        return JSONObject().put("setup", JSONObject().apply {
            put("model", "models/$model")
            put("generationConfig", JSONObject().apply {
                put("responseModalities", JSONArray().put("AUDIO"))
                put(
                    "speechConfig",
                    JSONObject().put(
                        "voiceConfig",
                        JSONObject().put(
                            "prebuiltVoiceConfig",
                            JSONObject().put("voiceName", "Fenrir")
                        )
                    )
                )
            })
            put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", instruction))))
            put("tools", JSONArray().put(JSONObject().put("functionDeclarations", declarations)))
            put("realtimeInputConfig", JSONObject().apply {
                put("automaticActivityDetection", JSONObject().apply {
                    put("disabled", false)
                    put("silenceDurationMs", 350)
                    put("prefixPaddingMs", 200)
                    put("startOfSpeechSensitivity", "START_SENSITIVITY_HIGH")
                    put("endOfSpeechSensitivity", "END_SENSITIVITY_HIGH")
                })
                put("activityHandling", "START_OF_ACTIVITY_INTERRUPTS")
                put("turnCoverage", "TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO")
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
            put("type", "object")
            put("properties", JSONObject().apply {
                stringParams.forEach { (param, desc) ->
                    put(param, JSONObject().put("type", "string").put("description", desc))
                }
            })
            if (required.isNotEmpty()) put("required", JSONArray(required))
        })
    }

    private fun handleServerMessage(raw: String) {
        val data = runCatching { JSONObject(raw) }.getOrNull() ?: return

        data.optJSONObject("error")?.let { error ->
            val message = error.optString("message").ifBlank { "Unbekannter Gemini-Live-Protokollfehler." }
            setupReady?.completeExceptionally(IllegalStateException(message))
            status("Gemini Live v1beta-u1: $message")
            return
        }

        if (data.has("setupComplete")) {
            setupReady?.complete(Unit)
            return
        }

        data.optJSONObject("toolCall")?.optJSONArray("functionCalls")?.let { calls ->
            for (i in 0 until calls.length()) {
                val call = calls.optJSONObject(i) ?: continue
                val id = call.optString("id").ifBlank { UUID.randomUUID().toString() }
                val job = scope.launch {
                    handleFunctionCall(id, call.optString("name"), call.optJSONObject("args") ?: JSONObject())
                }
                handlerJobs[id] = job
                job.invokeOnCompletion { handlerJobs.remove(id) }
            }
        }

        data.optJSONObject("toolCallCancellation")?.optJSONArray("ids")?.let { ids ->
            for (i in 0 until ids.length()) handlerJobs.remove(ids.optString(i))?.cancel()
        }

        val server = data.optJSONObject("serverContent") ?: return
        if (server.optBoolean("interrupted", false)) {
            suppressModelAudio.set(false)
            modelSpeaking.set(false)
            localSpeechFrames = 0
            interruptPlayback("KI hört zu · Gemini wurde unterbrochen")
        }
        if (server.optBoolean("turnComplete", false)) {
            modelSpeaking.set(false)
            suppressModelAudio.set(false)
            localSpeechFrames = 0
        }
        server.optJSONObject("modelTurn")?.optJSONArray("parts")?.let { parts ->
            for (i in 0 until parts.length()) {
                val inline = parts.optJSONObject(i)?.optJSONObject("inlineData") ?: continue
                val base64 = inline.optString("data")
                if (base64.isNotBlank()) queueAudio(Base64.decode(base64, Base64.DEFAULT))
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
                "inspect_editor_capabilities" -> {
                    status("KI: Editorzugriff wird geprüft …")
                    jsonToObject(bridge.editorCapabilities())
                }
                "edit_homepage" -> {
                    val request = args.optString("request")
                    if (request.isBlank()) {
                        errorObject("Änderungswunsch fehlt.")
                    } else {
                        status("KI: Homepage wird visuell geändert …")
                        val out = bridge.visualEdit(request)
                        val error = out["error"]?.jsonPrimitive?.content.orEmpty()
                        if (error.isNotBlank() && isTransientGeminiMessage(error)) {
                            JSONObject()
                                .put("success", false)
                                .put("temporary_overload", true)
                                .put("error", error)
                                .put("message", "Der Gemini-/Editor-Dienst war nach automatischen Wiederholungen noch vorübergehend überlastet.")
                        } else if (error.isNotBlank()) {
                            JSONObject()
                                .put("success", false)
                                .put("visual_editor_failed", true)
                                .put("requires_code_repair", true)
                                .put("error", error)
                                .put("message", "Diese Änderung braucht wahrscheinlich den geprüften Code-Reparaturweg. Nutze analyze_homepage_error mit dem ursprünglichen Wunsch.")
                        } else {
                            jsonToObject(out)
                        }
                    }
                }
                "save_homepage" -> {
                    status("KI: Homepage wird gespeichert …")
                    jsonToObject(bridge.saveEditorChanges())
                }
                "undo_homepage" -> {
                    status("KI: letzte Änderung wird zurückgenommen …")
                    jsonToObject(bridge.undoEditorChange())
                }
                "redo_homepage" -> {
                    status("KI: Änderung wird wiederhergestellt …")
                    jsonToObject(bridge.redoEditorChange())
                }
                "analyze_homepage_error" -> startBackgroundRepair(args.optString("description"))
                "get_repair_job" -> repairJobResult(args.optString("job_id"))
                "create_repair_branch" -> {
                    val proposal = args.optString("proposal_id")
                    if (proposal.isBlank()) errorObject("proposal_id fehlt.")
                    else if (!confirm(
                            "Prüfbranch erstellen?",
                            "Gemini möchte den vorbereiteten Fix auf einem isolierten Prüfbranch anlegen. Live-Dateien werden nicht direkt geändert."
                        )) {
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
                    if (!confirm(
                            "Geprüften Fix übernehmen?",
                            "Der Reparaturserver übernimmt PR #$pr nur, wenn alle CI-Prüfungen grün sind."
                        )) {
                        JSONObject().put("cancelled", true).put("message", "Nutzer hat den Merge abgelehnt.")
                    } else {
                        status("KI: geprüfter Fix wird übernommen …")
                        jsonToObject(bridge.merge(pr))
                    }
                }
                "list_technical_repairs" -> jsonToObject(bridge.technicalHistory())
                "rollback_technical_repair" -> {
                    val pr = args.optString("repair_pr")
                    if (!confirm(
                            "Technik-Reparatur zurücknehmen?",
                            "Gemini möchte für Reparatur #$pr einen abgesicherten Rücknahme-PR erstellen."
                        )) {
                        JSONObject().put("cancelled", true).put("message", "Nutzer hat die Rücknahme abgelehnt.")
                    } else {
                        jsonToObject(bridge.rollbackRepair(pr))
                    }
                }
                else -> errorObject("Unbekannte Techniker-Funktion: $name")
            }
        }.getOrElse { errorObject(it.message ?: "Techniker-Funktion fehlgeschlagen.") }
        sendToolResponse(id, name, result)
    }

    private fun startBackgroundRepair(description: String): JSONObject {
        if (description.isBlank()) return errorObject("Fehlerbeschreibung fehlt.")
        val jobId = UUID.randomUUID().toString()
        val state = RepairJobState()
        repairJobs[jobId] = state
        status("KI: Codeanalyse läuft im Hintergrund · du kannst weiterreden")
        scope.launch {
            val result = runCatching { bridge.analyze(description) }
                .getOrElse {
                    kotlinx.serialization.json.buildJsonObject {
                        put("error", it.message ?: "Codeanalyse fehlgeschlagen.")
                    }
                }
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
                "SYSTEMSTATUS: Hintergrund-Codeanalyse job_id=$jobId ist ${state.state}. Ergebnis: $result. " +
                    "Informiere den Nutzer kurz über das Ergebnis. Frage vor create_repair_branch ausdrücklich um Bestätigung."
            )
        }
        return JSONObject()
            .put("started", true)
            .put("job_id", jobId)
            .put("message", "Codeanalyse läuft im Hintergrund. Du kannst das Gespräch fortsetzen.")
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

    /** Current Live API uses explicit realtimeInput.audio / realtimeInput.video blobs. */
    private fun sendRealtimeBlob(mime: String, bytes: ByteArray) {
        if (!running.get() || bytes.isEmpty()) return
        val blob = JSONObject()
            .put("mimeType", mime)
            .put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
        val realtime = JSONObject()
        if (mime.startsWith("audio/")) {
            realtime.put("audio", blob)
        } else {
            realtime.put("video", blob)
        }
        send(JSONObject().put("realtimeInput", realtime))
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
        echoCanceler = if (AcousticEchoCanceler.isAvailable()) {
            runCatching { AcousticEchoCanceler.create(record.audioSessionId)?.apply { enabled = true } }.getOrNull()
        } else null
        noiseSuppressor = if (NoiseSuppressor.isAvailable()) {
            runCatching { NoiseSuppressor.create(record.audioSessionId)?.apply { enabled = true } }.getOrNull()
        } else null
        record.startRecording()
        audioJob = scope.launch {
            val chunk = ByteArray(3_200)
            while (running.get()) {
                val read = record.read(chunk, 0, chunk.size)
                if (read <= 0) continue
                val pcm = chunk.copyOf(read)
                if (modelSpeaking.get()) {
                    val level = averageAbsolutePcm16(pcm)
                    if (level >= LOCAL_BARGE_IN_LEVEL) localSpeechFrames += 1 else localSpeechFrames = 0
                    if (localSpeechFrames >= LOCAL_BARGE_IN_FRAMES) {
                        localSpeechFrames = 0
                        triggerLocalBargeIn()
                    }
                } else {
                    localSpeechFrames = 0
                }
                sendRealtimeBlob("audio/pcm;rate=16000", pcm)
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
                    .setUsage(AudioAttributes.USAGE_MEDIA)
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
        audioManager.mode = AudioManager.MODE_NORMAL
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val speaker = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
                .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
            if (speaker != null) runCatching { track.setPreferredDevice(speaker) }
        }
        track.setVolume(1.0f)
        audioTrack = track
        track.play()
        playbackJob = scope.launch {
            for (bytes in playbackQueue) {
                if (!running.get() || suppressModelAudio.get() || bytes.isEmpty()) continue
                val activeTrack = audioTrack ?: continue
                runCatching { activeTrack.write(bytes, 0, bytes.size, AudioTrack.WRITE_BLOCKING) }
            }
        }
    }

    private fun queueAudio(bytes: ByteArray) {
        if (!running.get() || suppressModelAudio.get() || bytes.isEmpty()) return
        modelSpeaking.set(true)
        playbackQueue.trySend(bytes)
    }

    private fun triggerLocalBargeIn() {
        if (!modelSpeaking.compareAndSet(true, false)) return
        suppressModelAudio.set(true)
        drainPlaybackQueue()
        interruptPlayback("KI hört zu · Unterbrechung erkannt")
    }

    private fun interruptPlayback(message: String) {
        audioTrack?.let { track ->
            runCatching {
                track.pause()
                track.flush()
                if (running.get()) track.play()
            }
        }
        status(message)
    }

    private fun drainPlaybackQueue() {
        while (playbackQueue.tryReceive().isSuccess) {
            // Drop already-buffered model audio so local barge-in is audible immediately.
        }
    }

    private fun averageAbsolutePcm16(bytes: ByteArray): Int {
        if (bytes.size < 2) return 0
        var sum = 0L
        var samples = 0
        var index = 0
        while (index + 1 < bytes.size) {
            val lo = bytes[index].toInt() and 0xff
            val hi = bytes[index + 1].toInt()
            val sample = ((hi shl 8) or lo).toShort().toInt()
            sum += abs(sample.toLong())
            samples += 1
            index += 2
        }
        return if (samples == 0) 0 else (sum / samples).toInt()
    }

    private fun isTransientGeminiMessage(message: String): Boolean =
        Regex("überlast|unavailable|temporar|temporary|503|429|rate.?limit|resource.?exhaust|server busy|try again", RegexOption.IGNORE_CASE)
            .containsMatchIn(message)

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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) audioManager.clearCommunicationDevice()
            audioManager.mode = AudioManager.MODE_NORMAL
        }
    }

    private fun jsonToObject(value: JsonObject): JSONObject =
        runCatching { JSONObject(value.toString()) }.getOrElse { errorObject("Ungültige Tool-Antwort.") }

    private fun errorObject(message: String): JSONObject =
        JSONObject().put("success", false).put("error", message)

    companion object {
        private const val LOCAL_BARGE_IN_LEVEL = 900
        private const val LOCAL_BARGE_IN_FRAMES = 2
    }
}
