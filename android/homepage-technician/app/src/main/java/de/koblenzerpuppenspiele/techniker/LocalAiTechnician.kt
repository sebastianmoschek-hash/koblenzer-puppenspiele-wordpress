package de.koblenzerpuppenspiele.techniker

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.SamplerConfig
import com.google.ai.edge.litertlm.ThinkingConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Free on-device primary AI for Homepage-Hilfe.
 *
 * Gemma runs locally through LiteRT-LM. It produces a small JSON action plan;
 * the existing deterministic editor bridge executes that plan. Technical code
 * changes are also prepared locally, validated by WordPress and only enter the
 * existing branch -> CI -> explicit merge path. No Gemini/OpenAI API call is
 * required by this class.
 *
 * Reliability rules for Android:
 * - every conversation performs exactly ONE native sendMessage;
 * - the KV cache and prompt are deliberately kept close to the model's Android
 *   benchmark profile instead of reserving a large desktop-style context;
 * - any native inference failure tears the engine down and retries exactly once
 *   on a freshly initialized CPU engine with an even smaller prompt.
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
    private data class LocalRepairProposal(
        val id: String,
        val summary: String,
        val risk: String,
        val planJson: String,
    )

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
            var directChanges = 0
            var saved = false
            var historyAction = ""
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
                        val success = result["success"]?.jsonPrimitive?.content?.equals("true", ignoreCase = true) == true
                        if (success) directChanges++
                        if (codeRequired && codeRequest.isBlank()) {
                            codeRequest = "$request. Direkte Editoränderung war nicht verfügbar: $result"
                        }
                    }
                    "set_global_design" -> {
                        val result = bridge.setGlobalDesign(action.optString("key"), action.optString("value"))
                        results += result.toString()
                        val codeRequired = result["codeRequired"]?.jsonPrimitive?.content?.equals("true", ignoreCase = true) == true
                        val success = result["success"]?.jsonPrimitive?.content?.equals("true", ignoreCase = true) == true
                        if (success) directChanges++
                        if (codeRequired && codeRequest.isBlank()) {
                            codeRequest = "$request. Globale Designsteuerung war nicht verfügbar: $result"
                        }
                    }
                    "undo" -> {
                        results += bridge.undoEditorChange().toString()
                        historyAction = "Rückgängig ausgeführt."
                    }
                    "redo" -> {
                        results += bridge.redoEditorChange().toString()
                        historyAction = "Wiederholen ausgeführt."
                    }
                    "request_code_change" -> if (codeRequest.isBlank()) {
                        codeRequest = action.optString("description").trim().ifBlank { request }
                    }
                    "save" -> {
                        if (explicitSaveRequested(request)) {
                            results += bridge.saveEditorChanges().toString()
                            saved = true
                        } else {
                            results += "{\"saved\":false,\"message\":\"Speichern wurde nicht ausgeführt, weil der Nutzer es nicht ausdrücklich verlangt hat.\"}"
                        }
                    }
                }
            }

            if (plan.optBoolean("save", false) && explicitSaveRequested(request) && !saved) {
                results += bridge.saveEditorChanges().toString()
                saved = true
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
            val execution = buildList {
                if (directChanges > 0) add("Ausgeführt: $directChanges direkte ${if (directChanges == 1) "Änderung" else "Änderungen"} im Editor${if (saved) " und gespeichert" else " (noch nicht gespeichert)"}.")
                if (historyAction.isNotBlank()) add(historyAction)
                if (saved && directChanges == 0) add("Speichern wurde ausgeführt.")
            }.joinToString(" ")
            val finalText = listOf(reply, execution, repairResult).filter { it.isNotBlank() }.joinToString("\n\n")
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
            Ich bearbeite die Homepage und die Homepage-Hilfe-App der Koblenzer Puppenspiele. Bitte hilf mir bei dieser Aufgabe:

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
        val prior = history.takeLast(2)
            .joinToString("\n") { "NUTZER: ${it.user.take(320)}\nKI: ${it.assistant.take(420)}" }
            .take(900)
        val compactPage = page.take(1500)
        val compactElements = compactEditableElements(elements)
        val compactCapabilities = capabilities.take(700)
        return boundPrompt(
            """
                AUFGABE: Erzeuge einen kleinen ausführbaren JSON-Plan. Verwende nur live_id-Werte aus dem kompakten Elementkontext. Wenn eine Eigenschaft dort nicht angeboten wird, verwende request_code_change.

                AKTUELLER WUNSCH:
                ${request.take(900)}

                LETZTE UNTERHALTUNG:
                ${prior.ifBlank { "Noch keine." }}

                SEITENKONTEXT:
                $compactPage

                SICHTBARE ELEMENTE (kompakt):
                $compactElements

                EDITOR-FÄHIGKEITEN:
                $compactCapabilities

                Liefere ausschließlich den JSON-Plan. Nutze live_id exakt aus den sichtbaren Elementen. Für Editor-UI, App-Programmierung, PHP, JavaScript, CSS, komplette Umbauten oder nicht direkt unterstützte Eigenschaften verwende request_code_change.
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
                .put("text", element.optString("text").take(100))
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
                    .put("text", element.optString("text").take(80))
                    .put("properties", element.optJSONArray("properties") ?: JSONArray()),
            )
        }
        out.put("content", content)
        out.put("editorUi", editorUi)
        out.put("count", content.length() + editorUi.length())
        out.toString()
    }.getOrElse { raw.take(MAX_MODEL_PROMPT_CHARS / 2) }

    private fun boundPrompt(text: String, maxChars: Int): String {
        if (text.length <= maxChars) return text
        val head = (maxChars * 3) / 4
        val tail = maxChars - head
        return text.take(head) + "\n\n[Kontext aus Speichergründen gekürzt]\n\n" + text.takeLast(tail)
    }

    private fun remember(user: String, assistant: String) {
        history.addLast(ChatTurn(user.take(700), assistant.take(1200)))
        while (history.size > 4) history.removeFirst()
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
                Log.i(TAG, "Initializing LiteRT-LM backend=$label maxNumTokens=$LOCAL_MAX_TOKENS")
                candidate.initialize()
                engineBackend = label
                candidate
            } catch (error: Throwable) {
                Log.w(TAG, "LiteRT-LM backend=$label initialization failed: ${errorChain(error)}")
                runCatching { candidate.close() }
                throw error
            }
        }

        val active = if (preferCpu) {
            initialize(cpuBackend(), "CPU")
        } else {
            runCatching { initialize(Backend.GPU(), "GPU") }
                .getOrElse { gpuError ->
                    preferCpu = true
                    status("GPU nicht verfügbar · lokale KI nutzt CPU")
                    Log.w(TAG, "GPU initialization unavailable; switching to CPU: ${errorChain(gpuError)}")
                    initialize(cpuBackend(), "CPU")
                }
        }
        engine = active
        return active
    }

    private fun resetEngine() {
        val closedBackend = engineBackend
        runCatching { engine?.close() }
            .onFailure { Log.w(TAG, "Closing LiteRT-LM backend=$closedBackend failed: ${errorChain(it)}") }
        engine = null
        engineBackend = ""
    }

    private fun oneShotJson(system: String, prompt: String, temperature: Double): JSONObject {
        val initialLimit = if (preferCpu) MAX_CPU_FALLBACK_PROMPT_CHARS else MAX_MODEL_PROMPT_CHARS
        val safePrompt = boundPrompt(prompt, initialLimit)
        return try {
            Log.i(
                TAG,
                "LiteRT-LM send backend=${engineBackend.ifBlank { if (preferCpu) "CPU-pending" else "GPU-pending" }} promptChars=${safePrompt.length} systemChars=${system.length} maxOutput=$MAX_OUTPUT_TOKENS",
            )
            oneShotJsonWithEngine(ensureEngine(), system, safePrompt, temperature)
        } catch (error: Throwable) {
            if (!isNativeInferenceFailure(error)) throw error

            val failedBackend = engineBackend.ifBlank { if (preferCpu) "CPU" else "GPU" }
            Log.w(
                TAG,
                "Native LiteRT-LM inference failed on $failedBackend; rebuilding CPU engine once. ${errorChain(error)}",
            )
            resetEngine()
            preferCpu = true

            val compactCpuPrompt = boundPrompt(prompt, MAX_CPU_FALLBACK_PROMPT_CHARS)
            status("Lokale KI: Inferenzfehler · CPU wird frisch gestartet …")
            return try {
                Log.i(
                    TAG,
                    "LiteRT-LM CPU retry promptChars=${compactCpuPrompt.length} systemChars=${system.length} maxOutput=$MAX_OUTPUT_TOKENS",
                )
                oneShotJsonWithEngine(ensureEngine(), system, compactCpuPrompt, temperature)
            } catch (cpuError: Throwable) {
                Log.e(TAG, "Fresh CPU retry failed: ${errorChain(cpuError)}")
                resetEngine()
                throw friendlyNativeFailure(cpuError, failedBackend)
            }
        }
    }

    /** Exactly one native sendMessage per conversation for Android stability. */
    private fun oneShotJsonWithEngine(active: Engine, system: String, prompt: String, temperature: Double): JSONObject {
        val noThinking = ThinkingConfig(enableThinking = false, thinkingTokenBudget = 0)
        active.createConversation(
            ConversationConfig(
                systemInstruction = Contents.of(system),
                samplerConfig = SamplerConfig(topK = 16, topP = 0.78, temperature = temperature),
                maxOutputToken = MAX_OUTPUT_TOKENS,
                thinkingConfig = noThinking,
            )
        ).use { conversation ->
            val rawText = conversation.sendMessage(prompt).text
            return parseJsonObjectOrNull(rawText)
                ?: throw IllegalStateException(
                    "Die lokale KI hat geantwortet, aber der Änderungsplan war nicht eindeutig strukturiert. Bitte formuliere den Wunsch etwas kürzer oder konkreter."
                )
        }
    }

    private fun isNativeInferenceFailure(error: Throwable): Boolean {
        var current: Throwable? = error
        repeat(8) {
            val type = current?.javaClass?.simpleName.orEmpty()
            val message = current?.message.orEmpty()
            if (type.contains("LiteRtLmJni", ignoreCase = true) ||
                type.contains("LiteRtLmJniException", ignoreCase = true) ||
                message.contains("nativeSendMessage", ignoreCase = true) ||
                message.contains("Failed to call native", ignoreCase = true) ||
                message.contains("resource exhausted", ignoreCase = true) ||
                message.contains("kv cache", ignoreCase = true) ||
                message.contains("command queue", ignoreCase = true) ||
                message.contains("opencl", ignoreCase = true) ||
                message.contains("delegate", ignoreCase = true)
            ) return true
            current = current?.cause
        }
        return false
    }

    private fun errorChain(error: Throwable): String {
        val parts = mutableListOf<String>()
        var current: Throwable? = error
        repeat(6) {
            current ?: return@repeat
            val type = current!!.javaClass.simpleName
            val message = current!!.message.orEmpty().replace('\n', ' ').take(260)
            parts += if (message.isBlank()) type else "$type: $message"
            current = current!!.cause
        }
        return parts.joinToString(" <- ").take(1200)
    }

    private fun friendlyNativeFailure(error: Throwable, failedBackend: String): IllegalStateException = IllegalStateException(
        "Das lokale Modell konnte die Aufgabe auf diesem Gerät gerade nicht berechnen. Die App hat den $failedBackend-Lauf verworfen, LiteRT-LM vollständig neu gestartet und genau einmal mit CPU sowie kleinerem Kontext wiederholt. Auch dieser lokale Versuch ist fehlgeschlagen. Bitte sende einen sehr kurzen Wunsch erneut; Notfall Gemini bleibt nur als Ausnahmeweg verfügbar.",
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

        val original = normalized.substring(start, end + 1)
        val candidates = linkedSetOf<String>()
        candidates += original
        candidates += original.replace(Regex(",\\s*([}\\]])"), "$1")
        candidates += repairJsonCandidate(original)

        for (candidate in candidates) {
            runCatching { JSONObject(candidate) }.getOrNull()?.let { return it }
        }
        return null
    }

    /** Conservative local cleanup for common small-model JSON slips. */
    private fun repairJsonCandidate(raw: String): String {
        var out = raw
            .replace(Regex("(?i)\\bTrue\\b"), "true")
            .replace(Regex("(?i)\\bFalse\\b"), "false")
            .replace(Regex("(?i)\\bNone\\b"), "null")
            .replace(Regex(",\\s*([}\\]])"), "$1")
            .replace(
                Regex("([\\{,]\\s*)([A-Za-z_][A-Za-z0-9_]*)(\\s*:)")
            ) { match -> "${match.groupValues[1]}\"${match.groupValues[2]}\"${match.groupValues[3]}" }

        val stringKeys = listOf(
            "reply", "type", "live_id", "property", "value", "key", "description",
            "summary", "diagnosis", "risk", "confidence", "path", "reason"
        )
        for (key in stringKeys) {
            val pattern = Regex("(\\\"${Regex.escape(key)}\\\"\\s*:\\s*)([^\\\"\\{\\[0-9tfn-][^,}\\]\\n]*)(?=\\s*[,}\\]])")
            out = pattern.replace(out) { match ->
                val prefix = match.groupValues[1]
                val value = match.groupValues[2].trim()
                if (value.isBlank()) match.value else prefix + JSONObject.quote(value)
            }
        }
        return out
    }

    private suspend fun prepareLocalCodeRepair(description: String): String {
        val first = buildLocalRepairProposal(description)
        val create = confirm(
            "Autonome Reparatur starten?",
            "${first.summary}\n\nRisiko: ${first.risk}\n\nDie lokale KI darf jetzt einen isolierten GitHub-Prüfbranch erstellen, die CI beobachten und bei roter CI höchstens ${MAX_AUTO_REPAIR_ROUNDS - 1} korrigierte Ersatzversuche vorbereiten. Live-Dateien werden nie direkt überschrieben. Ein Merge wird auch bei grüner CI separat bestätigt."
        )
        if (!create) return "Der lokale Code-Vorschlag ist vorbereitet, aber der autonome Prüfzyklus wurde nicht gestartet."
        return runLocalRepairAutopilot(description, first, round = 1)
    }

    private suspend fun buildLocalRepairProposal(description: String): LocalRepairProposal {
        status("Lokale KI untersucht den Code …")
        val contextJson = bridge.localRepairContext(description)
        val catalog = contextJson["catalog"]?.jsonPrimitive?.content.orEmpty()
        if (catalog.isBlank()) throw IllegalStateException(contextJson["error"]?.jsonPrimitive?.content ?: "Kein Codekatalog verfügbar.")

        val selectionPrompt = """
            AUFGABE:
            ${description.take(1800)}

            BROWSER/SEITE:
            ${contextJson["browser"]?.jsonPrimitive?.content.orEmpty().take(700)}

            DEBUG:
            ${contextJson["debug_tail"]?.jsonPrimitive?.content.orEmpty().takeLast(700)}

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
            ${description.take(1800)}

            DIAGNOSE AUS DATEIAUSWAHL:
            ${selection.optString("diagnosis").take(700)}

            DATEIINHALTE:
            $codeJson
        """.trimIndent()
        val plan = oneShotJson(PATCH_SYSTEM, patchPrompt, temperature = 0.05)
        val proposal = bridge.submitLocalRepairProposal(plan.toString())
        val proposalId = proposal["proposal_id"]?.jsonPrimitive?.content.orEmpty()
        if (proposalId.isBlank()) {
            throw IllegalStateException(
                proposal["message"]?.jsonPrimitive?.content
                    ?: proposal["error"]?.jsonPrimitive?.content
                    ?: "Die lokale KI konnte keinen sicheren Code-Patch vorbereiten."
            )
        }
        return LocalRepairProposal(
            id = proposalId,
            summary = proposal["summary"]?.jsonPrimitive?.content.orEmpty().ifBlank { "Lokale Code-Reparatur" },
            risk = proposal["risk"]?.jsonPrimitive?.content.orEmpty().ifBlank { "medium" },
            planJson = plan.toString(),
        )
    }

    private suspend fun runLocalRepairAutopilot(
        originalDescription: String,
        proposal: LocalRepairProposal,
        round: Int,
    ): String {
        status("Prüfbranch wird erstellt · Reparaturrunde $round/$MAX_AUTO_REPAIR_ROUNDS …")
        val pr = bridge.createRepairBranch(proposal.id)
        val prObject = JSONObject(pr.toString())
        val number = prObject.optString("pr").ifBlank { prObject.optString("number") }
        val url = prObject.optString("url").ifBlank { prObject.optString("html_url") }
        if (number.isBlank()) {
            throw IllegalStateException(prObject.optString("message").ifBlank { "Prüfbranch konnte nicht erstellt werden." })
        }

        val health = waitForRepairCi(number, round)
        if (health == "success") {
            status("CI grün · Übernahme wartet auf Bestätigung")
            val mergeNow = confirm(
                "CI grün – Fix übernehmen?",
                "Reparaturrunde $round ist vollständig grün. PR #$number kann jetzt per Squash-Merge übernommen werden. Production-/Live-Dateien wurden bisher nicht direkt verändert."
            )
            if (!mergeNow) {
                return "CI ist grün für PR #$number, aber der Merge wurde nicht bestätigt.${if (url.isNotBlank()) "\n$url" else ""}"
            }
            status("Geprüfter Fix wird übernommen …")
            val merge = JSONObject(bridge.merge(number).toString())
            if (!merge.optBoolean("merged", false)) {
                throw IllegalStateException(merge.optString("message").ifBlank { "GitHub hat den geprüften Merge nicht bestätigt." })
            }
            return buildString {
                append("Reparatur erfolgreich: PR #$number war grün und wurde nach deiner Bestätigung übernommen.")
                merge.optString("sha").takeIf { it.isNotBlank() }?.let { append("\nMerge: ${it.take(12)}") }
            }
        }

        if (health == "failure") {
            if (round >= MAX_AUTO_REPAIR_ROUNDS) {
                return "Die CI ist auch in Reparaturrunde $round rot. Der autonome Zyklus stoppt nach $MAX_AUTO_REPAIR_ROUNDS Versuchen, damit keine Endlosschleife entsteht.${if (url.isNotBlank()) "\n$url" else ""}"
            }

            status("CI rot · Compilerdiagnose wird sicher eingelesen …")
            val diagnosticsJson = bridge.localRepairCiDiagnostics(number)
            val diagnostics = diagnosticsJson["diagnostics"]?.jsonPrimitive?.content.orEmpty().trim()
            if (diagnostics.isBlank()) {
                return "PR #$number ist rot, aber es liegt noch keine sichere CI-Diagnose für eine automatische Korrektur vor.${if (url.isNotBlank()) "\n$url" else ""}"
            }

            val retryDescription = """
                AUTONOME KORREKTURRUNDE ${round + 1}/$MAX_AUTO_REPAIR_ROUNDS.
                Ursprüngliche Aufgabe: ${originalDescription.take(700)}
                Der vorherige isolierte Patch ist in CI fehlgeschlagen. Erstelle einen vollständigen Ersatzfix gegen den aktuellen Hauptstand; übernimm keine fehlerhafte Annahme blind.
                Vorheriger Patchplan: ${proposal.planJson.take(700)}
                CI-Diagnose: ${diagnostics.takeLast(1700)}
                Behebe nur die aus Diagnose und Code ableitbare Ursache. Sicherheitsprüfungen niemals schwächen.
            """.trimIndent()
            status("CI rot · lokale KI korrigiert automatisch · Runde ${round + 1}/$MAX_AUTO_REPAIR_ROUNDS …")
            val corrected = buildLocalRepairProposal(retryDescription)
            val next = runLocalRepairAutopilot(originalDescription, corrected, round + 1)
            return "PR #$number war rot; die lokale KI hat die CI-Diagnose ausgewertet und automatisch eine Ersatzrunde gestartet.\n\n$next"
        }

        return "PR #$number wurde erstellt. Die CI ist nach dem begrenzten Beobachtungsfenster noch nicht fertig; der Prüfbranch bleibt sicher offen.${if (url.isNotBlank()) "\n$url" else ""}"
    }

    private suspend fun waitForRepairCi(pr: String, round: Int): String {
        for (attempt in 0 until CI_POLL_ATTEMPTS) {
            if (attempt > 0) delay(CI_POLL_INTERVAL_MS)
            val result = runCatching { bridge.status(pr) }.getOrNull()
            val health = result?.get("health")?.jsonPrimitive?.content.orEmpty().lowercase()
            if (health == "success" || health == "failure") return health
            status("CI prüft Reparaturrunde $round/$MAX_AUTO_REPAIR_ROUNDS · ${attempt + 1}/$CI_POLL_ATTEMPTS …")
        }
        return "pending"
    }

    companion object {
        private const val TAG = "KPLocalAi"

        // Gemma 4 E2B Android benchmarks use a 2048-token context. Keeping the
        // KV cache here avoids the large native allocation previously caused by 6144.
        private const val LOCAL_MAX_TOKENS = 2048
        private const val MAX_OUTPUT_TOKENS = 256
        private const val MAX_MODEL_PROMPT_CHARS = 3600
        private const val MAX_CPU_FALLBACK_PROMPT_CHARS = 2400
        private const val MAX_CONTENT_ELEMENTS = 16
        private const val MAX_EDITOR_UI_ELEMENTS = 4
        private const val MAX_AUTO_REPAIR_ROUNDS = 3
        private const val CI_POLL_ATTEMPTS = 45
        private const val CI_POLL_INTERVAL_MS = 8_000L

        private val PLANNER_SYSTEM = """
            Du bist die lokale kostenlose Homepage-KI der Koblenzer Puppenspiele. Antworte nur als gültiges JSON ohne Markdown:
            {"reply":"kurz auf Deutsch","save":false,"actions":[{"type":"edit_element","live_id":"live-1","property":"text","value":"Neuer Text"}]}
            Erlaubte Typen: edit_element, set_global_design, undo, redo, save, request_code_change. Höchstens 10 Aktionen. Nutze nur sichtbare live_id-Werte und angebotene Eigenschaften. Für App/PHP/JavaScript/CSS, neue Funktionen oder nicht angebotene Eigenschaften nutze request_code_change. save nur bei ausdrücklichem Speichern/Übernehmen. Nie behaupten, etwas sei erledigt, wenn keine passende Aktion vorhanden ist. Alle Strings in doppelten Anführungszeichen.
        """.trimIndent()

        private val SELECTION_SYSTEM = """
            Du bist ein lokaler Code-Diagnostiker für Website UND Android-App. Antworte ausschließlich als syntaktisch gültiges JSON ohne Markdown:
            {"reply":"kurz","diagnosis":"präzise Diagnose","confidence":"low|medium|high","files":["pfad1","pfad2"]}
            Wähle höchstens 3 Dateien und ausschließlich Pfade aus dem bereitgestellten Katalog. Bevorzuge die kleinste plausible Menge. Keine Secrets erfinden. Alle String-Werte müssen in doppelten Anführungszeichen stehen.
        """.trimIndent()

        private val PATCH_SYSTEM = """
            Du bist ein lokaler sicherer Code-Patcher für WordPress und die Android Homepage-Hilfe. Antworte ausschließlich als syntaktisch gültiges JSON ohne Markdown:
            {"summary":"kurz","diagnosis":"warum","risk":"low|medium|high","tests":["Test 1"],"changes":[{"path":"exakter Pfad","reason":"warum","operations":[{"search":"exakter vorhandener Block","replace":"vollständiger Ersatzblock"}]}]}
            Regeln: höchstens 4 Dateien, höchstens 8 Operationen je Datei. search muss ein exakter eindeutiger Ausschnitt aus dem gelieferten Code sein. Ändere so wenig wie möglich. Entferne niemals Berechtigungs-, Nonce-, Authentifizierungs- oder Sicherheitsprüfungen. Keine eval/shell/system-Aufrufe, keine Secrets, keine erfundenen Dateien. Wenn der gezeigte Code nicht reicht, liefere changes als leeres Array. Alle Strings in doppelten Anführungszeichen.
        """.trimIndent()
    }
}

private class LocalModelManager(private val context: Context) {
    companion object {
        const val REFERENCE_MODEL_BYTES = 2_588_147_712L
        private const val FREE_SPACE_SAFETY_BYTES = 750_000_000L
        private const val RECOMMENDED_RAM_BYTES = 6_000_000_000L
        private const val MODEL_SHA256 = "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c"
        private const val MODEL_URL = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/6e5c4f1e395deb959c494953478fa5cec4b8008f/gemma-4-E2B-it.litertlm?download=true"
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.MINUTES)
        .build()

    fun modelFile(): File = File(File(context.filesDir, "local-ai").apply { mkdirs() }, "gemma-4-E2B-it.litertlm")

    private fun checksumMarker(): File = File(modelFile().parentFile, modelFile().name + ".sha256")

    fun isInstalled(): Boolean = modelFile().let { file ->
        file.isFile &&
            file.length() == REFERENCE_MODEL_BYTES &&
            checksumMarker().runCatching { readText().trim().lowercase() }.getOrNull() == MODEL_SHA256
    }

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
        val target = modelFile()
        val marker = checksumMarker()
        marker.delete()

        // Upgrades and developer/device transfers may already contain the exact
        // pinned model. Verify it once instead of downloading another 2.6 GB.
        if (target.isFile && target.length() == REFERENCE_MODEL_BYTES) {
            onProgress(0L, REFERENCE_MODEL_BYTES)
            if (sha256(target) == MODEL_SHA256) {
                marker.writeText(MODEL_SHA256)
                onProgress(REFERENCE_MODEL_BYTES, REFERENCE_MODEL_BYTES)
                return@withContext
            }
            target.delete()
        } else if (target.exists()) {
            target.delete()
        }

        if (!Build.SUPPORTED_64_BIT_ABIS.any { it.equals("arm64-v8a", ignoreCase = true) }) {
            throw IllegalStateException("Die lokale KI benötigt derzeit ein 64-Bit-ARM-Handy.")
        }

        val part = File(target.parentFile, target.name + ".part")
        if (part.length() > REFERENCE_MODEL_BYTES) part.delete()
        if (part.isFile && part.length() == REFERENCE_MODEL_BYTES) {
            if (sha256(part) == MODEL_SHA256) {
                activateVerifiedModel(part, target, marker)
                onProgress(REFERENCE_MODEL_BYTES, REFERENCE_MODEL_BYTES)
                return@withContext
            }
            part.delete()
        }

        val existingBytes = part.takeIf { it.isFile }?.length() ?: 0L
        val requiredFree = (REFERENCE_MODEL_BYTES - existingBytes).coerceAtLeast(0L) + FREE_SPACE_SAFETY_BYTES
        if (context.filesDir.usableSpace < requiredFree) {
            throw IllegalStateException(
                "Für die verbleibende Modelldatei werden noch etwa ${requiredFree / 1_000_000_000.0} GB freier Gerätespeicher benötigt.",
            )
        }

        val request = Request.Builder()
            .url(MODEL_URL)
            .apply { if (existingBytes > 0L) header("Range", "bytes=$existingBytes-") }
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IllegalStateException("Modell-Download fehlgeschlagen (HTTP ${response.code}).")
            val body = response.body
            val append = existingBytes > 0L && response.code == 206
            if (append) {
                val contentRange = response.header("Content-Range").orEmpty()
                if (!contentRange.startsWith("bytes $existingBytes-")) {
                    throw IllegalStateException("Der Modellserver hat eine ungültige Fortsetzungsantwort geliefert.")
                }
            }
            val startBytes = if (append) existingBytes else 0L
            val announced = body.contentLength().takeIf { it > 0 }?.plus(startBytes) ?: REFERENCE_MODEL_BYTES
            if (announced != REFERENCE_MODEL_BYTES) {
                throw IllegalStateException("Der Modellserver hat keine gültige Modelldatei geliefert.")
            }
            body.byteStream().use { input ->
                FileOutputStream(part, append).use { output ->
                    val buffer = ByteArray(1024 * 1024)
                    var downloaded = startBytes
                    var lastReported = startBytes
                    onProgress(downloaded, announced)
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
        if (part.length() != REFERENCE_MODEL_BYTES) {
            val got = part.length()
            throw IllegalStateException("Modelldatei ist noch unvollständig (${got / 1_000_000} MB). Der nächste Versuch wird an dieser Stelle fortgesetzt.")
        }
        if (sha256(part) != MODEL_SHA256) {
            part.delete()
            throw IllegalStateException("Die Prüfsumme des lokalen Modells stimmt nicht. Der beschädigte Download wurde verworfen.")
        }
        activateVerifiedModel(part, target, marker)
    }

    private fun activateVerifiedModel(part: File, target: File, marker: File) {
        if (target.exists()) target.delete()
        if (!part.renameTo(target)) {
            part.copyTo(target, overwrite = true)
            part.delete()
        }
        marker.writeText(MODEL_SHA256)
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(4 * 1024 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
    }
}
