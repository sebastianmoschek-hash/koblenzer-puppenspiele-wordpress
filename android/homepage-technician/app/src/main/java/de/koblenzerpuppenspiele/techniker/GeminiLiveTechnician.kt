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
import kotlinx.coroutines.delay
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
import kotlin.random.Random

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
    private val sessionStarted = AtomicBoolean(false)
    private val reconnecting = AtomicBoolean(false)
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
    @Volatile private var currentToken: String = ""
    @Volatile private var currentModel: String = "gemini-3.1-flash-live-preview"
    @Volatile private var resumptionHandle: String = ""
    private var audioJob: Job? = null
    private var playbackJob: Job? = null
    private var frameJob: Job? = null
    private var reconnectJob: Job? = null
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

        running.set(true)
        sessionStarted.set(false)
        reconnecting.set(false)
        resumptionHandle = ""
        modelSpeaking.set(false)
        suppressModelAudio.set(false)
        localSpeechFrames = 0

        try {
            status("KI · Zugang wird vorbereitet …")
            refreshBootstrap()
            status("KI · Gemini Live wird verbunden …")
            val ready = openConnection()
            withTimeout(15_000) { ready.await() }
            startPlayback()
            startMicrophone()
            frameJob = scope.launch {
                ScreenFrameBus.jpegFrames.collectLatest { jpeg ->
                    if (running.get() && socket != null) sendRealtimeBlob("image/jpeg", jpeg)
                }
            }
            sessionStarted.set(true)
            status("KI live · direkter Editorzugriff · sprich einfach mit mir")
        } catch (error: Throwable) {
            stop()
            throw error
        }
    }

    fun stop() {
        running.set(false)
        sessionStarted.set(false)
        reconnecting.set(false)
        reconnectJob?.cancel(); reconnectJob = null
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
        val old = socket
        socket = null
        old?.close(1000, "Nutzer hat KI-Live beendet")
        setupReady = null
        currentToken = ""
        resumptionHandle = ""
        status("KI-Live beendet")
    }

    fun release() {
        stop()
        playbackQueue.close()
        client.dispatcher.executorService.shutdown()
        client.connectionPool.evictAll()
        scope.cancel()
    }

    private suspend fun refreshBootstrap() {
        val bootstrap = bridge.bootstrap()
        bootstrap["error"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }?.let { throw IllegalStateException(it) }
        val protocol = bootstrap["liveProtocol"]?.jsonPrimitive?.content.orEmpty()
        if (protocol != "v1beta-u1") throw IllegalStateException("Staging-Live-Protokoll ist noch nicht aktuell ($protocol).")
        currentToken = bootstrap["liveToken"]?.jsonPrimitive?.content.orEmpty()
        if (currentToken.isBlank()) throw IllegalStateException("WordPress hat kein kurzlebiges Gemini-Live-Token geliefert.")
        currentModel = bootstrap["model"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
            ?: "gemini-3.1-flash-live-preview"
    }

    private fun openConnection(): CompletableDeferred<Unit> {
        val ready = CompletableDeferred<Unit>()
        setupReady = ready
        val token = currentToken
        val model = currentModel
        val request = Request.Builder()
            .url("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=$token")
            .build()

        val webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (!running.get()) return
                webSocket.send(buildSetup(model, resumptionHandle).toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (socket === webSocket) handleServerMessage(text)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                if (socket === webSocket) handleServerMessage(bytes.utf8())
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (socket !== webSocket) return
                socket = null
                if (!ready.isCompleted) ready.completeExceptionally(IllegalStateException("Gemini Live wurde beendet ($code): ${reason.ifBlank { "Verbindung geschlossen" }}"))
                if (running.get() && sessionStarted.get()) requestReconnect("Verbindung wurde geschlossen")
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (socket !== webSocket) return
                socket = null
                val detail = response?.let { "HTTP ${it.code}" } ?: (t.message ?: t.javaClass.simpleName)
                if (!ready.isCompleted) ready.completeExceptionally(IllegalStateException("Direkte Gemini-Live-Verbindung fehlgeschlagen: $detail", t))
                if (running.get() && sessionStarted.get()) requestReconnect(detail)
            }
        })
        socket = webSocket
        return ready
    }

    private fun requestReconnect(reason: String) {
        if (!running.get() || !sessionStarted.get()) return
        if (!reconnecting.compareAndSet(false, true)) return
        val old = socket
        socket = null
        old?.close(1000, "Session wird fortgesetzt")
        drainPlaybackQueue()
        modelSpeaking.set(false)
        suppressModelAudio.set(false)
        reconnectJob = scope.launch {
            var lastError = reason
            for (attempt in 0 until 5) {
                if (!running.get()) break
                val base = if (attempt == 0) 450L else 1_000L shl (attempt - 1)
                delay(base + Random.nextLong(0, 450))
                try {
                    status(if (attempt == 0) "KI-Verbindung wird automatisch fortgesetzt …" else "KI-Verbindung · neuer Versuch ${attempt + 1}/5 …")
                    refreshBootstrap()
                    if (attempt >= 2) resumptionHandle = ""
                    val ready = openConnection()
                    withTimeout(15_000) { ready.await() }
                    reconnecting.set(false)
                    status(if (resumptionHandle.isNotBlank()) "KI live · Sitzung fortgesetzt" else "KI live · wieder verbunden")
                    return@launch
                } catch (error: Throwable) {
                    lastError = error.message ?: error.javaClass.simpleName
                    val failed = socket
                    socket = null
                    failed?.cancel()
                }
            }
            reconnecting.set(false)
            sessionStarted.set(false)
            status("KI-Verbindung konnte nicht wiederhergestellt werden · $lastError")
        }
    }

    private fun buildSetup(model: String, handle: String): JSONObject {
        val declarations = JSONArray().apply {
            put(function("inspect_homepage", "Untersuche die sichtbare Homepage, Browserfehler und den aktuellen Editorzustand."))
            put(function("inspect_editable_elements", "Liste sichtbare bearbeitbare Homepage-Elemente und sichtbare Editor-Bedienelemente mit live_id, Position, Typ, Text und verfügbaren Eigenschaften."))
            put(function("inspect_editor_capabilities", "Prüfe die verfügbaren direkten Editor-, Speicher-, Undo-/Redo- und Code-Reparaturwerkzeuge."))
            put(function(
                "edit_element",
                "Ändere genau eine Eigenschaft eines sichtbaren Homepage-Elements direkt im bestehenden manuellen Editor, ohne eine zweite Gemini-Planungsanfrage. Wenn das Ziel zur Editor-Oberfläche gehört oder die Eigenschaft nicht direkt unterstützt wird, liefert das Werkzeug codeRequired=true.",
                mapOf(
                    "live_id" to "live_id aus inspect_editable_elements.",
                    "property" to "Eine verfügbare Eigenschaft: text, label, url, font_percent, padding_percent, width_percent, radius_px, color, background, move_x, move_y, section_up oder section_down.",
                    "value" to "Neuer Wert. Farben als #RRGGBB, Größen als Zahl, Verschiebungen in Pixel. Für section_up/down kann value leer sein."
                ),
                listOf("live_id", "property", "value"),
            ))
            put(function(
                "set_global_design",
                "Ändere eine globale Design-Einstellung direkt im Website-Designpanel, ohne zweite Gemini-Anfrage.",
                mapOf(
                    "key" to "Design-Key, z.B. accent_color, background_color, content_width, wide_width, card_radius, button_radius, body_font, heading_font, header_max_width, menu_width, menu_radius, menu_button_size, menu_font_delta.",
                    "value" to "Neuer Wert passend zum Design-Key."
                ),
                listOf("key", "value"),
            ))
            put(function("save_homepage", "Speichere die aktuell ungespeicherten direkten Homepage- oder Designänderungen dauerhaft."))
            put(function("undo_homepage", "Nimm die letzte Editoränderung zurück."))
            put(function("redo_homepage", "Stelle die zuletzt zurückgenommene Editoränderung wieder her."))
            put(function(
                "analyze_homepage_error",
                "Starte eine geschützte technische Codeanalyse im Hintergrund. Nutze dies auch für gewünschte Änderungen an Editor-Bedienelementen oder Eigenschaften, die edit_element/set_global_design mit codeRequired=true melden.",
                mapOf("description" to "Präzise deutsche Beschreibung des Fehlers oder der benötigten Code-/Editoränderung."),
                listOf("description"),
            ))
            put(function("get_repair_job", "Prüfe den Stand einer Hintergrund-Codeanalyse.", mapOf("job_id" to "job_id aus analyze_homepage_error."), listOf("job_id")))
            put(function("create_repair_branch", "Erstelle nach ausdrücklicher Bestätigung einen isolierten Prüfbranch und Pull Request.", mapOf("proposal_id" to "proposal_id aus der abgeschlossenen Codeanalyse."), listOf("proposal_id")))
            put(function("check_repair_status", "Prüfe CI und Merge-Bereitschaft eines Reparatur-Pull-Requests.", mapOf("pr" to "Pull-Request-Nummer."), listOf("pr")))
            put(function("merge_repair", "Übernimm nach ausdrücklicher Bestätigung einen Reparatur-PR, sofern CI grün ist.", mapOf("pr" to "Pull-Request-Nummer."), listOf("pr")))
            put(function("list_technical_repairs", "Liste bisherige technische KI-Reparaturen."))
            put(function("rollback_technical_repair", "Erstelle nach ausdrücklicher Bestätigung einen abgesicherten Rücknahme-PR.", mapOf("repair_pr" to "Nummer des früheren Reparatur-PRs."), listOf("repair_pr")))
        }

        val instruction = """
            Du bist der einzige deutschsprachige KI-Homepage-Agent der Koblenzer Puppenspiele. Der Nutzer zeigt dir seinen Android-Bildschirm live und spricht mit dir. Höre dauerhaft zu und lasse dich jederzeit unterbrechen.

            Die Bedienidee ist einfach: Der Nutzer spricht nur mit dir. Für normale Homepage-Änderungen benutzt du DIREKTE Editorwerkzeuge. Du darfst niemals den alten separaten 'KI bearbeiten'-Dialog oder eine zweite Text-KI voraussetzen.

            Bei sichtbaren Änderungswünschen zuerst inspect_homepage und inspect_editable_elements verwenden. Ordne die Beschreibung des Nutzers anhand Bildschirmbild, Text, Typ und rect den passenden live_id-Werten zu. Danach edit_element für jede nötige Eigenschaft aufrufen. Für globale Farben, Header-, Menü- und Layoutwerte set_global_design verwenden. Mehrere Elemente oder mehrere Eigenschaften werden mit mehreren Werkzeugaufrufen umgesetzt. Änderungen bleiben zunächst ungespeichert. save_homepage nur auf ausdrücklichen Wunsch wie 'speichern', 'übernehmen' oder 'dauerhaft machen'. undo_homepage/redo_homepage für Korrekturen verwenden.

            Wenn ein sichtbares Ziel editorUi=true ist (z.B. Zurück-/Vor-Pfeile, Toolbar, Editor-Bedienelemente), oder edit_element/set_global_design codeRequired=true meldet, sage NICHT 'kein Zugriff'. Starte stattdessen analyze_homepage_error mit der gewünschten Änderung. Das ist dein sicherer Weg zu Theme-, Plugin-, CSS-, JavaScript- oder PHP-Änderungen. Die Analyse läuft im Hintergrund. Nutze get_repair_job für den Stand. create_repair_branch und merge_repair jeweils nur nach ausdrücklicher Bestätigung des Nutzers.

            Bei Bildern: Darstellung wie Breite, Rundung, Abstand und Position kannst du mit edit_element ändern. Wenn der Nutzer ein Bild inhaltlich generativ verändern oder durch neues Bildmaterial ersetzen möchte und dafür noch kein direktes Bildwerkzeug angeboten wird, erkläre kurz, dass dafür die Bildfunktion erweitert werden muss und nutze analyze_homepage_error nur dann, wenn es wirklich eine Softwarefunktion betrifft. Erfinde keine erfolgreiche Bildänderung.

            429/503/RESOURCE_EXHAUSTED/UNAVAILABLE sind vorübergehende Kapazitäts- oder Quota-Zustände. Die App versucht Verbindungen und WordPress-Aufrufe automatisch erneut. Starte wegen reiner Überlastung keine Code-Reparatur.

            Behaupte nie, eine Änderung sei umgesetzt, gespeichert oder repariert, bevor ein Werkzeug das bestätigt. 'Voller Zugriff' bedeutet funktionaler Zugriff auf Homepage, Editor und den geprüften Code-Reparaturweg, niemals Zugriff auf Passwörter oder dauerhafte Secrets. Sprich knapp und natürlich.
        """.trimIndent()

        return JSONObject().put("setup", JSONObject().apply {
            put("model", "models/$model")
            put("generationConfig", JSONObject().apply {
                put("responseModalities", JSONArray().put("AUDIO"))
                put("speechConfig", JSONObject().put("voiceConfig", JSONObject().put("prebuiltVoiceConfig", JSONObject().put("voiceName", "Fenrir"))))
            })
            put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", instruction))))
            put("tools", JSONArray().put(JSONObject().put("functionDeclarations", declarations)))
            put("sessionResumption", JSONObject().apply { if (handle.isNotBlank()) put("handle", handle) })
            put("contextWindowCompression", JSONObject().put("slidingWindow", JSONObject()))
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
                stringParams.forEach { (param, desc) -> put(param, JSONObject().put("type", "string").put("description", desc)) }
            })
            if (required.isNotEmpty()) put("required", JSONArray(required))
        })
    }

    private fun handleServerMessage(raw: String) {
        val data = runCatching { JSONObject(raw) }.getOrNull() ?: return

        data.optJSONObject("error")?.let { error ->
            val message = error.optString("message").ifBlank { "Unbekannter Gemini-Live-Protokollfehler." }
            setupReady?.completeExceptionally(IllegalStateException(message))
            status("Gemini Live: $message")
            return
        }

        data.optJSONObject("sessionResumptionUpdate")?.let { update ->
            if (update.optBoolean("resumable", false)) {
                update.optString("newHandle").takeIf { it.isNotBlank() }?.let { resumptionHandle = it }
            }
        }

        data.optJSONObject("goAway")?.let {
            if (running.get() && sessionStarted.get()) requestReconnect("Gemini wechselt die Live-Verbindung")
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
                val job = scope.launch { handleFunctionCall(id, call.optString("name"), call.optJSONObject("args") ?: JSONObject()) }
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
        if (server.optBoolean("turnComplete", false) || server.optBoolean("generationComplete", false)) {
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
                "inspect_editable_elements" -> {
                    status("KI: bearbeitbare Elemente werden erkannt …")
                    jsonToObject(bridge.editableElements())
                }
                "inspect_editor_capabilities" -> jsonToObject(bridge.editorCapabilities())
                "edit_element" -> {
                    status("KI: Änderung wird direkt im Editor umgesetzt …")
                    jsonToObject(bridge.editElement(args.optString("live_id"), args.optString("property"), args.optString("value")))
                }
                "set_global_design" -> {
                    status("KI: globales Design wird angepasst …")
                    jsonToObject(bridge.setGlobalDesign(args.optString("key"), args.optString("value")))
                }
                "save_homepage" -> {
                    status("KI: Homepage wird gespeichert …")
                    jsonToObject(bridge.saveEditorChanges())
                }
                "undo_homepage" -> jsonToObject(bridge.undoEditorChange())
                "redo_homepage" -> jsonToObject(bridge.redoEditorChange())
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
                    if (!confirm("Technik-Reparatur zurücknehmen?", "Gemini möchte für Reparatur #$pr einen abgesicherten Rücknahme-PR erstellen.")) {
                        JSONObject().put("cancelled", true).put("message", "Nutzer hat die Rücknahme abgelehnt.")
                    } else jsonToObject(bridge.rollbackRepair(pr))
                }
                else -> errorObject("Unbekannte KI-Funktion: $name")
            }
        }.getOrElse { errorObject(it.message ?: "KI-Funktion fehlgeschlagen.") }
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
                "SYSTEMSTATUS: Hintergrund-Codeanalyse job_id=$jobId ist ${state.state}. Ergebnis: $result. " +
                    "Informiere den Nutzer knapp. Frage vor create_repair_branch ausdrücklich um Bestätigung."
            )
        }
        return JSONObject().put("started", true).put("job_id", jobId).put("message", "Codeanalyse läuft im Hintergrund. Du kannst das Gespräch fortsetzen.")
    }

    private fun repairJobResult(jobId: String): JSONObject {
        val job = repairJobs[jobId] ?: return errorObject("Unbekannte job_id.")
        return JSONObject().put("job_id", jobId).put("state", job.state).put("message", job.message).put("result", job.result?.let(::jsonToObject) ?: JSONObject.NULL)
    }

    private fun sendToolResponse(id: String, name: String, result: JSONObject) {
        val response = JSONObject().put("id", id).put("name", name).put("response", JSONObject().put("result", result))
        send(JSONObject().put("toolResponse", JSONObject().put("functionResponses", JSONArray().put(response))))
    }

    private fun sendRealtimeText(text: String) {
        if (!running.get() || socket == null) return
        send(JSONObject().put("realtimeInput", JSONObject().put("text", text)))
    }

    private fun sendRealtimeBlob(mime: String, bytes: ByteArray) {
        if (!running.get() || socket == null || bytes.isEmpty()) return
        val blob = JSONObject().put("mimeType", mime).put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
        val realtime = JSONObject()
        if (mime.startsWith("audio/")) realtime.put("audio", blob) else realtime.put("video", blob)
        send(JSONObject().put("realtimeInput", realtime))
    }

    private fun send(message: JSONObject) {
        socket?.send(message.toString())
    }

    @SuppressLint("MissingPermission")
    private fun startMicrophone() {
        val sampleRate = 16_000
        val minBuffer = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minBuffer <= 0) throw IllegalStateException("Mikrofon-Puffer konnte nicht bestimmt werden.")
        val record = AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, max(minBuffer * 2, 6_400))
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            throw IllegalStateException("Mikrofon konnte nicht initialisiert werden.")
        }
        audioRecord = record
        echoCanceler = if (AcousticEchoCanceler.isAvailable()) runCatching { AcousticEchoCanceler.create(record.audioSessionId)?.apply { enabled = true } }.getOrNull() else null
        noiseSuppressor = if (NoiseSuppressor.isAvailable()) runCatching { NoiseSuppressor.create(record.audioSessionId)?.apply { enabled = true } }.getOrNull() else null
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
                } else localSpeechFrames = 0
                sendRealtimeBlob("audio/pcm;rate=16000", pcm)
            }
        }
    }

    private fun startPlayback() {
        val sampleRate = 24_000
        val minBuffer = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val track = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(sampleRate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
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
            val speaker = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
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
        audioTrack?.let { track -> runCatching { track.pause(); track.flush(); if (running.get()) track.play() } }
        status(message)
    }

    private fun drainPlaybackQueue() {
        while (playbackQueue.tryReceive().isSuccess) { /* drop buffered model audio */ }
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

    private fun jsonToObject(value: JsonObject): JSONObject = runCatching { JSONObject(value.toString()) }.getOrElse { errorObject("Ungültige Tool-Antwort.") }
    private fun errorObject(message: String): JSONObject = JSONObject().put("success", false).put("error", message)

    companion object {
        private const val LOCAL_BARGE_IN_LEVEL = 900
        private const val LOCAL_BARGE_IN_FRAMES = 2
    }
}
