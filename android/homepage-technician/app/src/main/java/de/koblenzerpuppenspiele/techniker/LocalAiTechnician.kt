package de.koblenzerpuppenspiele.techniker

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.SamplerConfig
import com.google.ai.edge.litertlm.ThinkingConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

/**
 * Free on-device primary AI for Homepage-Hilfe.
 *
 * Gemma runs locally through LiteRT-LM. It produces a small JSON action plan;
 * the existing deterministic editor bridge executes that plan. Technical code
 * changes are also prepared locally, validated by WordPress and only enter the
 * existing branch -> CI -> explicit merge path. No Gemini/OpenAI API call is
 * required by this class.
 */
class LocalAiTechnician(
    private val context: Context,
    private val bridge: WebRepairBridge,
    private val confirm: suspend (title: String, message: String) -> Boolean,
    private val status: (String) -> Unit,
) {
    data class ModelState(
        val installed: Boolean,
        val modelBytes: Long,
        val freeBytes: Long,
        val totalRamBytes: Long,
        val recommendedRam: Boolean,
        val arm64: Boolean,
    )

    private data class ChatTurn(val user: String, val assistant: String)

    private val lock = Mutex()
    private val modelManager = LocalModelManager(context)
    private val history = ArrayDeque<ChatTurn>()
    private var engine: Engine? = null
    private var engineBackend = ""
    private var preferCpu = false

    fun modelState(): ModelState = modelManager.state()

    suspend fun downloadModel(onProgress: (downloaded: Long, total: Long) -> Unit) {
        modelManager.download(onProgress)
    }

    suspend fun send(userText: String): String = lock.withLock {
        val request = userText.trim()
        if (request.isBlank()) return@withLock "Bitte schreib mir, was ich ändern soll."
        if (!modelManager.isInstalled()) throw IllegalStateException("Das lokale KI-Modell ist noch nicht installiert.")

        withContext(Dispatchers.IO) {
            status("Lokale KI untersucht die Homepage …")
            val page = bridge.context()
            val elements = bridge.editableElements()
            val capabilities = bridge.editorCapabilities()
            val prompt = buildPlannerPrompt(request, page.toString(), elements.toString(), capabilities.toString())

            status("Lokale KI denkt …")
            val plan = oneShotJson(PLANNER_SYSTEM, prompt, temperature = 0.12)
            val results = mutableListOf<String>()
            var codeRequest = ""
            val actions = plan.optJSONArray("actions") ?: JSONArray()

            for (i in 0 until minOf(actions.length(), 10)) {
                val action = actions.optJSONObject(i) ?: continue
                when (action.optString("type")) {
                    "edit_element" -> {
                        val result = bridge.editElement(
                            action.optString("live_id"),
                            action.optString("property"),
                            action.optString("value"),
                        )
                        results += result.toString()
                        val codeRequired = result["codeRequired"]?.jsonPrimitive?.content?.equals("true", ignoreCase = true) == true
                        if (codeRequired && codeRequest.isBlank()) {
                            codeRequest = "$request. Direkte Editoränderung war nicht verfügbar: $result"
                        }
                    }
                    "set_global_design" -> {
                        val result = bridge.setGlobalDesign(action.optString("key"), action.optString("value"))
                        results += result.toString()
                        val codeRequired = result["codeRequired"]?.jsonPrimitive?.content?.equals("true", ignoreCase = true) == true
                        if (codeRequired && codeRequest.isBlank()) {
                            codeRequest = "$request. Globale Designsteuerung war nicht verfügbar: $result"
                        }
                    }
                    "undo" -> results += bridge.undoEditorChange().toString()
                    "redo" -> results += bridge.redoEditorChange().toString()
                    "request_code_change" -> if (codeRequest.isBlank()) codeRequest = action.optString("description").trim().ifBlank { request }
                    "save" -> {
                        if (explicitSaveRequested(request)) results += bridge.saveEditorChanges().toString()
                        else results += "{\"saved\":false,\"message\":\"Speichern wurde nicht ausgeführt, weil der Nutzer es nicht ausdrücklich verlangt hat.\"}"
                    }
                }
            }

            if (plan.optBoolean("save", false) && explicitSaveRequested(request)) {
                results += bridge.saveEditorChanges().toString()
            }

            var repairResult = ""
            if (codeRequest.isNotBlank()) {
                repairResult = runCatching { prepareLocalCodeRepair(codeRequest) }
                    .getOrElse { error ->
                        "Die lokale Code-Reparatur konnte nicht sicher vorbereitet werden: ${error.message ?: error.javaClass.simpleName}. Für diesen Ausnahmefall kannst du „Notfall Gemini“ verwenden."
                    }
            }

            val reply = plan.optString("reply").trim().ifBlank {
                if (results.isNotEmpty()) "Die gewünschte Änderung wurde im Editor vorbereitet." else "Ich brauche noch eine genauere Beschreibung der gewünschten Änderung."
            }
            val finalText = listOf(reply, repairResult).filter { it.isNotBlank() }.joinToString("\n\n")
            remember(request, finalText)
            status("Lokale KI bereit · kostenlos auf dem Gerät")
            finalText
        }
    }

    suspend fun emergencyPrompt(userText: String): String = withContext(Dispatchers.IO) {
        val request = userText.trim().ifBlank { "Untersuche die aktuelle Homepage und hilf mir bei der gewünschten Änderung." }
        val page = runCatching { bridge.context().toString() }.getOrDefault("{}")
        val elements = runCatching { bridge.editableElements().toString() }.getOrDefault("{}")
        """
            Ich bearbeite die Homepage der Koblenzer Puppenspiele. Bitte hilf mir bei dieser Aufgabe:

            $request

            Aktueller Seitenkontext:
            $page

            Sichtbare/bearbeitbare Elemente:
            $elements

            Bitte antworte konkret auf Deutsch. Wenn Code nötig ist, nenne die betroffenen Dateien und liefere möglichst kleine, sichere Änderungen. Entferne keine Berechtigungs-, Nonce-, Authentifizierungs- oder Sicherheitsprüfungen. Diese Aufgabe wird anschließend über einen Prüfbranch und CI kontrolliert.
        """.trimIndent().take(30000)
    }

    fun release() {
        resetEngine()
        history.clear()
    }

    private fun buildPlannerPrompt(request: String, page: String, elements: String, capabilities: String): String {
        val prior = history.takeLast(3)
            .joinToString("\n") { "NUTZER: ${it.user.take(500)}\nKI: ${it.assistant.take(700)}" }
            .take(1800)
        val compactPage = page.take(3200)
        val compactElements = compactEditableElements(elements)
        val compactCapabilities = capabilities.take(1800)
        return boundPrompt(
            """
                AUFGABE: Erzeuge einen kleinen ausführbaren JSON-Plan. Verwende nur live_id-Werte aus dem kompakten Elementkontext. Wenn eine Eigenschaft dort nicht angeboten wird, verwende request_code_change.

                AKTUELLER WUNSCH:
                ${request.take(1400)}

                LETZTE UNTERHALTUNG:
                ${prior.ifBlank { "Noch keine." }}

                SEITENKONTEXT:
                $compactPage

                SICHTBARE ELEMENTE (kompakt):
                $compactElements

                EDITOR-FÄHIGKEITEN:
                $compactCapabilities

                Liefere ausschließlich den JSON-Plan. Nutze live_id exakt aus den sichtbaren Elementen. Für Editor-UI, PHP, JavaScript, CSS oder nicht direkt unterstützte Eigenschaften verwende request_code_change statt so zu tun, als sei die Änderung schon erledigt.
            """.trimIndent(),
            MAX_MODEL_PROMPT_CHARS,
        )
    }

    private fun compactEditableElements(raw: String): String = runCatching {
        val source = JSONObject(raw)
        val out = JSONObject()
        out.put("editMode", source.optBoolean("editMode", false))

        val contentSource = source.optJSONArray("content") ?: JSONArray()
        val content = JSONArray()
        for (i in 0 until minOf(contentSource.length(), MAX_CONTENT_ELEMENTS)) {
            val element = contentSource.optJSONObject(i) ?: continue
            val compact = JSONObject()
                .put("liveId", element.optString("liveId"))
                .put("kind", element.optString("kind"))
                .put("tag", element.optString("tag"))
                .put("text", element.optString("text").take(160))
            element.optJSONArray("properties")?.let { compact.put("properties", it) }
            element.optJSONObject("rect")?.let { rect ->
                compact.put(
                    "rect",
                    JSONObject()
                        .put("x", rect.optInt("x"))
                        .put("y", rect.optInt("y"))
                        .put("width", rect.optInt("width"))
                        .put("height", rect.optInt("height")),
                )
            }
            element.optJSONObject("style")?.let { style ->
                compact.put(
                    "style",
                    JSONObject()
                        .put("fontSize", style.optString("fontSize"))
                        .put("color", style.optString("color"))
                        .put("background", style.optString("background")),
                )
            }
            content.put(compact)
        }

        val uiSource = source.optJSONArray("editorUi") ?: JSONArray()
        val editorUi = JSONArray()
        for (i in 0 until minOf(uiSource.length(), MAX_EDITOR_UI_ELEMENTS)) {
            val element = uiSource.optJSONObject(i) ?: continue
            editorUi.put(
                JSONObject()
                    .put("liveId", element.optString("liveId"))
                    .put("kind", "editor-ui")
                    .put("text", element.optString("text").take(120))
                    .put("properties", element.optJSONArray("properties") ?: JSONArray()),
            )
        }
        out.put("content", content)
        out.put("editorUi", editorUi)
        out.put("count", content.length() + editorUi.length())
        out.toString()
    }.getOrElse { raw.take(7000) }

    private fun boundPrompt(text: String, maxChars: Int): String {
        if (text.length <= maxChars) return text
        val head = (maxChars * 3) / 4
        val tail = maxChars - head
        return text.take(head) + "\n\n[Kontext aus Speichergründen gekürzt]\n\n" + text.takeLast(tail)
    }

    private fun remember(user: String, assistant: String) {
        history.addLast(ChatTurn(user.take(1200), assistant.take(2400)))
        while (history.size > 6) history.removeFirst()
    }

    private fun explicitSaveRequested(text: String): Boolean = Regex(
        "(?i)\\b(speicher(?:n|e|t)?|übernehm(?:en|e|t)?|dauerhaft|veröffentlich(?:en|e|t)?)\\b"
    ).containsMatchIn(text)

    private fun cpuBackend(): Backend.CPU = Backend.CPU(
        threadCount = minOf(4, Runtime.getRuntime().availableProcessors().coerceAtLeast(1)),
    )

    private fun ensureEngine(): Engine {
        engine?.let { return it }
        val model = modelManager.modelFile()
        if (!modelManager.isInstalled()) throw IllegalStateException("Lokales KI-Modell fehlt.")
        status("Lokale KI wird geladen …")

        fun initialize(backend: Backend, label: String): Engine {
            val candidate = Engine(
                EngineConfig(
                    modelPath = model.absolutePath,
                    backend = backend,
                    maxNumTokens = LOCAL_MAX_TOKENS,
                    cacheDir = File(context.cacheDir, "litertlm").apply { mkdirs() }.absolutePath,
                )
            )
            return try {
                candidate.initialize()
                engineBackend = label
                candidate
            } catch (error: Throwable) {
                runCatching { candidate.close() }
                throw error
            }
        }

        val active = if (preferCpu) {
            initialize(cpuBackend(), "CPU")
        } else {
            runCatching { initialize(Backend.GPU(), "GPU") }
                .getOrElse {
                    preferCpu = true
                    status("GPU nicht verfügbar · lokale KI nutzt CPU")
                    initialize(cpuBackend(), "CPU")
                }
        }
        engine = active
        return active
    }

    private fun resetEngine() {
        runCatching { engine?.close() }
        engine = null
        engineBackend = ""
    }

    private fun oneShotJson(system: String, prompt: String, temperature: Double): JSONObject {
        val safePrompt = boundPrompt(prompt, MAX_MODEL_PROMPT_CHARS)
        return try {
            oneShotJsonWithEngine(ensureEngine(), system, safePrompt, temperature)
        } catch (error: Throwable) {
            if (!isNativeInferenceFailure(error)) throw error
            val failedBackend = engineBackend
            resetEngine()
            if (failedBackend == "GPU") {
                preferCpu = true
                status("Lokale KI: GPU-Inferenz fehlgeschlagen · einmaliger CPU-Fallback …")
                return try {
                    oneShotJsonWithEngine(ensureEngine(), system, safePrompt, temperature)
                } catch (cpuError: Throwable) {
                    throw friendlyNativeFailure(cpuError)
                }
            }
            throw friendlyNativeFailure(error)
        }
    }

    private fun oneShotJsonWithEngine(active: Engine, system: String, prompt: String, temperature: Double): JSONObject {
        val noThinking = ThinkingConfig(enableThinking = false, thinkingTokenBudget = 0)
        active.createConversation(
            ConversationConfig(
                systemInstruction = Contents.of(system),
                samplerConfig = SamplerConfig(topK = 20, topP = 0.82, temperature = temperature),
                maxOutputToken = MAX_OUTPUT_TOKENS,
                thinkingConfig = noThinking,
            )
        ).use { conversation ->
            val firstText = conversation.sendMessage(prompt).text
            parseJsonObjectOrNull(firstText)?.let { return it }

            // Small local models occasionally emit a bare word, trailing comma or explanatory
            // sentence despite the JSON-only instruction. Ask the same on-device conversation
            // to repair its own output before surfacing an error to the user. This costs no API.
            val repairPrompt = """
                Deine vorige Antwort war kein gültiges JSON. Gib EXAKT denselben Inhalt jetzt noch einmal als syntaktisch gültiges JSON aus.
                Keine Erklärung, kein Markdown, keine Kommentare. Alle Textwerte müssen in doppelten Anführungszeichen stehen.
            """.trimIndent()
            val repairedText = conversation.sendMessage(repairPrompt).text
            return parseJsonObjectOrNull(repairedText)
                ?: throw IllegalStateException("Die lokale KI konnte den Änderungsplan nach einem automatischen Reparaturversuch nicht strukturiert ausgeben. Bitte denselben Wunsch noch einmal senden.")
        }
    }

    private fun isNativeInferenceFailure(error: Throwable): Boolean {
        var current: Throwable? = error
        repeat(6) {
            val type = current?.javaClass?.simpleName.orEmpty()
            val message = current?.message.orEmpty()
            if (type.contains("LiteRtLmJni", ignoreCase = true) ||
                message.contains("nativeSendMessage", ignoreCase = true) ||
                message.contains("resource exhausted", ignoreCase = true) ||
                message.contains("kv cache", ignoreCase = true)
            ) return true
            current = current?.cause
        }
        return false
    }

    private fun friendlyNativeFailure(error: Throwable): IllegalStateException = IllegalStateException(
        "Das lokale Modell konnte den kompakten Seitenkontext gerade nicht berechnen. Die App hat bereits GPU/CPU-Fallback und einen kleineren Kontext versucht. Bitte denselben Wunsch noch einmal senden; wenn es erneut passiert, kannst du vorübergehend Notfall Gemini verwenden.",
        error,
    )

    private fun parseJsonObjectOrNull(text: String): JSONObject? {
        val normalized = text
            .trim()
            .removePrefix("```json")
            .removePrefix("```JSON")
            .removePrefix("```")
            .removeSuffix("```")
            .trim()
            .replace('“', '"')
            .replace('”', '"')
            .replace('„', '"')
            .replace('\u00a0', ' ')
        val start = normalized.indexOf('{')
        val end = normalized.lastIndexOf('}')
        if (start < 0 || end <= start) return null
        val candidate = normalized.substring(start, end + 1)
            .replace(Regex(",\\s*([}\\]])"), "$1")
        return runCatching { JSONObject(candidate) }.getOrNull()
    }

    private suspend fun prepareLocalCodeRepair(description: String): String {
        status("Lokale KI untersucht den Code …")
        val contextJson = bridge.localRepairContext(description)
        val catalog = contextJson["catalog"]?.jsonPrimitive?.content.orEmpty()
        if (catalog.isBlank()) throw IllegalStateException(contextJson["error"]?.jsonPrimitive?.content ?: "Kein Codekatalog verfügbar.")

        val selectionPrompt = """
            AUFGABE:
            $description

            BROWSER/SEITE:
            ${contextJson["browser"]?.jsonPrimitive?.content.orEmpty()}

            DEBUG:
            ${contextJson["debug_tail"]?.jsonPrimitive?.content.orEmpty()}

            ERLAUBTE DATEIEN (Pfad und Größe):
            $catalog
        """.trimIndent()
        val selection = oneShotJson(SELECTION_SYSTEM, selectionPrompt, temperature = 0.08)
        val filesArray = selection.optJSONArray("files") ?: JSONArray()
        val selected = mutableListOf<String>()
        for (i in 0 until minOf(filesArray.length(), 3)) {
            filesArray.optString(i).takeIf { it.isNotBlank() }?.let(selected::add)
        }
        if (selected.isEmpty()) throw IllegalStateException(selection.optString("reply").ifBlank { "Die lokale KI konnte keine passende Reparaturdatei bestimmen." })

        status("Lokale KI liest ${selected.size} Reparaturdatei(en) …")
        val codeJson = bridge.localRepairFiles(selected)
        val error = codeJson["error"]?.jsonPrimitive?.content.orEmpty()
        if (error.isNotBlank()) throw IllegalStateException(error)

        status("Lokale KI erstellt einen sicheren Patch …")
        val patchPrompt = """
            AUFGABE:
            $description

            DIAGNOSE AUS DATEIAUSWAHL:
            ${selection.optString("diagnosis")}

            DATEIINHALTE:
            $codeJson
        """.trimIndent()
        val plan = oneShotJson(PATCH_SYSTEM, patchPrompt, temperature = 0.05)
        val proposal = bridge.submitLocalRepairProposal(plan.toString())
        val proposalId = proposal["proposal_id"]?.jsonPrimitive?.content.orEmpty()
        if (proposalId.isBlank()) {
            return proposal["message"]?.jsonPrimitive?.content
                ?: proposal["error"]?.jsonPrimitive?.content
                ?: "Die lokale KI konnte keinen sicheren Code-Patch vorbereiten. Dafür kannst du „Notfall Gemini“ verwenden."
        }

        val summary = proposal["summary"]?.jsonPrimitive?.content.orEmpty().ifBlank { "Lokale Code-Reparatur" }
        val risk = proposal["risk"]?.jsonPrimitive?.content.orEmpty().ifBlank { "medium" }
        val create = confirm(
            "Prüfbranch erstellen?",
            "$summary\n\nRisiko: $risk\n\nDie lokale KI hat nur einen Vorschlag vorbereitet. Jetzt darf daraus ein isolierter GitHub-Prüfbranch mit CI erstellt werden. Live-Dateien werden nicht direkt überschrieben."
        )
        if (!create) return "Der lokale Code-Vorschlag ist vorbereitet, aber du hast den Prüfbranch nicht erstellt."

        status("Prüfbranch und CI werden erstellt …")
        val pr = bridge.createRepairBranch(proposalId)
        val prObject = JSONObject(pr.toString())
        val number = prObject.optString("pr").ifBlank { prObject.optString("number") }
        val url = prObject.optString("url").ifBlank { prObject.optString("html_url") }
        return buildString {
            append("Lokale Code-Reparatur als Prüfbranch angelegt")
            if (number.isNotBlank()) append(" (PR #$number)")
            append(". Vor einer Übernahme muss die CI grün sein und du musst den Merge nochmals bestätigen.")
            if (url.isNotBlank()) append("\n$url")
        }
    }

    companion object {
        private const val LOCAL_MAX_TOKENS = 6144
        private const val MAX_OUTPUT_TOKENS = 384
        private const val MAX_MODEL_PROMPT_CHARS = 12000
        private const val MAX_CONTENT_ELEMENTS = 28
        private const val MAX_EDITOR_UI_ELEMENTS = 6

        private val PLANNER_SYSTEM = """
            Du bist die lokale, kostenlose Homepage-KI der Koblenzer Puppenspiele. Antworte ausschließlich als JSON ohne Markdown:
            {
              "reply":"kurze deutsche Antwort",
              "save":false,
              "actions":[
                {"type":"edit_element","live_id":"live-1","property":"text","value":"Neuer Text"},
                {"type":"set_global_design","key":"accent_color","value":"#D97706"},
                {"type":"undo"},
                {"type":"redo"},
                {"type":"save"},
                {"type":"request_code_change","description":"präzise technische Änderung"}
              ]
            }
            Regeln: Höchstens 10 Aktionen. Nutze nur sichtbare live_id-Werte und angebotene Eigenschaften. Für normale Texte, Links, Größe, Abstand, Radius, Farben, Position, Reihenfolge und globale Designwerte direkte Aktionen verwenden. ALLE String-Werte müssen in doppelten Anführungszeichen stehen; Farben als Hex-Strings wie "#0000FF", niemals als nacktes Wort. Für Editor-Bedienelemente, PHP/JavaScript, CSS, neue Funktionen oder nicht angebotene Eigenschaften request_code_change verwenden. Nie behaupten, etwas sei geändert oder gespeichert, wenn keine passende Aktion vorhanden ist. save nur setzen/ausgeben, wenn der Nutzer ausdrücklich speichern, übernehmen oder dauerhaft machen verlangt. Generative Bildinhalte sind lokal noch nicht verfügbar; dafür in reply „Notfall Gemini“ nennen, aber keine Cloud-Aktion erfinden.
        """.trimIndent()

        private val SELECTION_SYSTEM = """
            Du bist ein lokaler Code-Diagnostiker. Antworte ausschließlich als JSON ohne Markdown:
            {"reply":"kurz","diagnosis":"präzise Diagnose","confidence":"low|medium|high","files":["pfad1","pfad2"]}
            Wähle höchstens 3 Dateien und ausschließlich Pfade aus dem bereitgestellten Katalog. Bevorzuge die kleinste plausible Menge. Keine Secrets erfinden. Alle String-Werte müssen in doppelten Anführungszeichen stehen.
        """.trimIndent()

        private val PATCH_SYSTEM = """
            Du bist ein lokaler sicherer Code-Patcher. Antworte ausschließlich als JSON ohne Markdown:
            {
              "summary":"kurz",
              "diagnosis":"warum",
              "risk":"low|medium|high",
              "tests":["Test 1"],
              "changes":[
                {"path":"exakter Pfad","reason":"warum","operations":[{"search":"exakter vorhandener Block","replace":"vollständiger Ersatzblock"}]}
              ]
            }
            Regeln: höchstens 4 Dateien, höchstens 8 Operationen je Datei. search muss ein exakter, ausreichend eindeutiger Ausschnitt aus dem gelieferten Code sein. Ändere so wenig wie möglich. Entferne niemals Berechtigungs-, Nonce-, Authentifizierungs- oder Sicherheitsprüfungen. Keine eval/shell/system-Aufrufe, keine Secrets, keine erfundenen Dateien. Wenn der gezeigte Code nicht reicht, liefere changes als leeres Array. Alle String-Werte müssen in doppelten Anführungszeichen stehen.
        """.trimIndent()
    }
}

private class LocalModelManager(private val context: Context) {
    companion object {
        const val REFERENCE_MODEL_BYTES = 2_588_147_712L
        private const val MIN_VALID_MODEL_BYTES = 2_400_000_000L
        private const val MAX_VALID_MODEL_BYTES = 3_100_000_000L
        private const val REQUIRED_FREE_BYTES = 4_500_000_000L
        private const val RECOMMENDED_RAM_BYTES = 6_000_000_000L
        private const val MODEL_URL = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/6e5c4f1e395deb959c494953478fa5cec4b8008f/gemma-4-E2B-it.litertlm?download=true"
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.MINUTES)
        .build()

    fun modelFile(): File = File(File(context.filesDir, "local-ai").apply { mkdirs() }, "gemma-4-E2B-it.litertlm")

    fun isInstalled(): Boolean = modelFile().let { it.isFile && it.length() in MIN_VALID_MODEL_BYTES..MAX_VALID_MODEL_BYTES }

    fun state(): LocalAiTechnician.ModelState {
        val memory = (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).let { manager ->
            ActivityManager.MemoryInfo().also(manager::getMemoryInfo)
        }
        val file = modelFile()
        val free = context.filesDir.usableSpace
        val arm64 = Build.SUPPORTED_64_BIT_ABIS.any { it.equals("arm64-v8a", ignoreCase = true) }
        return LocalAiTechnician.ModelState(
            installed = isInstalled(),
            modelBytes = if (isInstalled()) file.length() else REFERENCE_MODEL_BYTES,
            freeBytes = free,
            totalRamBytes = memory.totalMem,
            recommendedRam = memory.totalMem >= RECOMMENDED_RAM_BYTES,
            arm64 = arm64,
        )
    }

    suspend fun download(onProgress: (Long, Long) -> Unit) = withContext(Dispatchers.IO) {
        if (isInstalled()) return@withContext
        if (!Build.SUPPORTED_64_BIT_ABIS.any { it.equals("arm64-v8a", ignoreCase = true) }) {
            throw IllegalStateException("Die lokale KI benötigt derzeit ein 64-Bit-ARM-Handy.")
        }
        if (context.filesDir.usableSpace < REQUIRED_FREE_BYTES) {
            throw IllegalStateException("Für das lokale KI-Modell werden mindestens etwa 4,5 GB freier Gerätespeicher benötigt.")
        }

        val target = modelFile()
        val part = File(target.parentFile, target.name + ".part")
        if (part.exists()) part.delete()
        val request = Request.Builder().url(MODEL_URL).build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IllegalStateException("Modell-Download fehlgeschlagen (HTTP ${response.code}).")
            val body = response.body
            val announced = body.contentLength().takeIf { it > 0 } ?: REFERENCE_MODEL_BYTES
            if (announced !in MIN_VALID_MODEL_BYTES..MAX_VALID_MODEL_BYTES) {
                throw IllegalStateException("Der Modellserver hat keine gültige Modelldatei geliefert.")
            }
            body.byteStream().use { input ->
                FileOutputStream(part).use { output ->
                    val buffer = ByteArray(1024 * 1024)
                    var downloaded = 0L
                    var lastReported = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        downloaded += read
                        if (downloaded - lastReported >= 8L * 1024L * 1024L) {
                            lastReported = downloaded
                            onProgress(downloaded, announced)
                        }
                    }
                    output.fd.sync()
                    onProgress(downloaded, announced)
                }
            }
        }
        if (part.length() !in MIN_VALID_MODEL_BYTES..MAX_VALID_MODEL_BYTES) {
            val got = part.length()
            part.delete()
            throw IllegalStateException("Modelldatei ist unvollständig (${got / 1_000_000} MB).")
        }
        if (target.exists()) target.delete()
        if (!part.renameTo(target)) {
            part.copyTo(target, overwrite = true)
            part.delete()
        }
    }
}
