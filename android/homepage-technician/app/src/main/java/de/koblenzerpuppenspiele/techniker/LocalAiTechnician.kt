package de.koblenzerpuppenspiele.techniker

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.OpenApiTool
import com.google.ai.edge.litertlm.SamplerConfig
import com.google.ai.edge.litertlm.tool
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

/**
 * Free, on-device primary AI for Homepage-Hilfe.
 *
 * Gemma runs locally through LiteRT-LM. Normal page changes are executed through
 * the existing deterministic editor bridge. Technical code changes are also
 * prepared locally, then handed to the existing protected branch -> CI -> merge
 * workflow. No Gemini/OpenAI API call is required by this class.
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

    private val lock = Mutex()
    private val modelManager = LocalModelManager(context)
    private var engine: Engine? = null
    private var conversation: Conversation? = null
    @Volatile private var pendingCodeRequest: String? = null

    fun modelState(): ModelState = modelManager.state()

    suspend fun downloadModel(onProgress: (downloaded: Long, total: Long) -> Unit) {
        modelManager.download(onProgress)
    }

    suspend fun send(userText: String): String = lock.withLock {
        val prompt = userText.trim()
        if (prompt.isBlank()) return@withLock "Bitte schreib mir, was ich ändern soll."
        if (!modelManager.isInstalled()) throw IllegalStateException("Das lokale KI-Modell ist noch nicht installiert.")

        withContext(Dispatchers.IO) {
            val chat = ensureConversation()
            pendingCodeRequest = null
            status("Lokale KI denkt …")
            val answer = chat.sendMessage(prompt).text.trim().ifBlank { "Erledigt." }
            val codeRequest = pendingCodeRequest?.trim().orEmpty()
            pendingCodeRequest = null
            if (codeRequest.isBlank()) {
                status("Lokale KI bereit · kostenlos auf dem Handy")
                return@withContext answer
            }

            val repairText = runCatching { prepareLocalCodeRepair(codeRequest) }
                .getOrElse { error ->
                    "Die lokale Code-Reparatur konnte nicht vorbereitet werden: ${error.message ?: error.javaClass.simpleName}. Nutze dafür bei Bedarf „Notfall Gemini“."
                }
            status("Lokale KI bereit · kostenlos auf dem Handy")
            listOf(answer, repairText).filter { it.isNotBlank() }.joinToString("\n\n")
        }
    }

    suspend fun emergencyPrompt(userText: String): String = withContext(Dispatchers.IO) {
        val page = runCatching { bridge.context().toString() }.getOrDefault("{}")
        val elements = runCatching { bridge.editableElements().toString() }.getOrDefault("{}")
        """
            Ich bearbeite die Homepage der Koblenzer Puppenspiele. Bitte hilf mir bei dieser Aufgabe:

            ${userText.trim().ifBlank { "Untersuche die aktuelle Homepage und hilf mir bei der gewünschten Änderung." }}

            Aktueller Seitenkontext:
            $page

            Sichtbare/bearbeitbare Elemente:
            $elements

            Bitte antworte konkret auf Deutsch. Wenn Code nötig ist, nenne die betroffenen Dateien und liefere möglichst kleine, sichere Änderungen. Entferne keine Berechtigungs-, Nonce- oder Sicherheitsprüfungen.
        """.trimIndent().take(30000)
    }

    fun release() {
        runCatching { conversation?.close() }
        conversation = null
        runCatching { engine?.close() }
        engine = null
    }

    private fun ensureConversation(): Conversation {
        conversation?.let { return it }
        val activeEngine = ensureEngine()
        val config = ConversationConfig(
            systemInstruction = Contents.of(SYSTEM_INSTRUCTION),
            samplerConfig = SamplerConfig(topK = 32, topP = 0.9, temperature = 0.35),
            tools = homepageTools(),
            automaticToolCalling = true,
        )
        return activeEngine.createConversation(config).also { conversation = it }
    }

    private fun ensureEngine(): Engine {
        engine?.let { return it }
        val model = modelManager.modelFile()
        if (!model.isFile()) throw IllegalStateException("Lokales KI-Modell fehlt.")
        status("Lokale KI wird geladen …")

        fun initialize(backend: Backend): Engine {
            val candidate = Engine(
                EngineConfig(
                    modelPath = model.absolutePath,
                    backend = backend,
                    cacheDir = File(context.cacheDir, "litertlm").apply { mkdirs() }.absolutePath,
                )
            )
            candidate.initialize()
            return candidate
        }

        val active = runCatching { initialize(Backend.GPU()) }
            .recoverCatching { initialize(Backend.CPU()) }
            .getOrElse { throw IllegalStateException("Das lokale KI-Modell konnte auf diesem Handy nicht gestartet werden: ${it.message}", it) }
        engine = active
        return active
    }

    private fun homepageTools() = listOf(
        tool(JsonTool(
            schema("inspect_homepage", "Lies den sichtbaren Seiten-, Browser- und Editorzustand."),
        ) { bridge.context().toString() }),
        tool(JsonTool(
            schema("inspect_editable_elements", "Liste sichtbare bearbeitbare Homepage-Elemente mit live_id, Text, Position und verfügbaren Eigenschaften."),
        ) { bridge.editableElements().toString() }),
        tool(JsonTool(
            schema("inspect_editor_capabilities", "Prüfe direkte Editor-, Speicher-, Undo-/Redo- und Reparaturmöglichkeiten."),
        ) { bridge.editorCapabilities().toString() }),
        tool(JsonTool(
            schema(
                "edit_element",
                "Ändere eine Eigenschaft eines sichtbaren Homepage-Elements direkt. Für inhaltliche Bildgenerierung darf image_prompt im kostenlosen lokalen Modus NICHT benutzt werden.",
                mapOf(
                    "live_id" to "live_id aus inspect_editable_elements",
                    "property" to "text, label, url, font_percent, padding_percent, width_percent, radius_px, color, background, move_x, move_y, section_up oder section_down",
                    "value" to "Neuer Wert"
                ),
                listOf("live_id", "property", "value")
            )
        ) { args ->
            val property = args.optString("property")
            if (property == "image_prompt") {
                JSONObject().put("success", false).put("codeRequired", true)
                    .put("message", "Generative Bildänderung benötigt den Notfall-Gemini-Weg oder eine spätere lokale Bild-KI.").toString()
            } else {
                bridge.editElement(args.optString("live_id"), property, args.optString("value")).toString()
            }
        }),
        tool(JsonTool(
            schema(
                "set_global_design",
                "Ändere eine globale Design-Einstellung direkt.",
                mapOf("key" to "Design-Key", "value" to "Neuer Wert"),
                listOf("key", "value")
            )
        ) { args -> bridge.setGlobalDesign(args.optString("key"), args.optString("value")).toString() }),
        tool(JsonTool(
            schema("save_homepage", "Speichere ungespeicherte Homepage- oder Designänderungen dauerhaft."),
        ) { bridge.saveEditorChanges().toString() }),
        tool(JsonTool(schema("undo_homepage", "Nimm die letzte Editoränderung zurück.")) { bridge.undoEditorChange().toString() }),
        tool(JsonTool(schema("redo_homepage", "Stelle die letzte zurückgenommene Editoränderung wieder her.")) { bridge.redoEditorChange().toString() }),
        tool(JsonTool(
            schema(
                "request_code_change",
                "Fordere eine technische Änderung an WordPress/PHP/JavaScript/CSS/Editor-Code an, wenn direkte Editorwerkzeuge nicht reichen.",
                mapOf("description" to "Präzise Beschreibung der gewünschten Codeänderung oder des Fehlers"),
                listOf("description")
            )
        ) { args ->
            val description = args.optString("description").trim()
            if (description.isNotBlank()) pendingCodeRequest = description
            JSONObject().put("queued", description.isNotBlank())
                .put("message", "Die lokale KI bereitet die Codeänderung nach dieser Antwort über den geschützten Prüfbranch-Weg vor.").toString()
        }),
        tool(JsonTool(
            schema(
                "check_repair_status",
                "Prüfe CI und Merge-Bereitschaft eines technischen Reparatur-PRs.",
                mapOf("pr" to "Pull-Request-Nummer"),
                listOf("pr")
            )
        ) { args -> bridge.status(args.optString("pr")).toString() }),
        tool(JsonTool(
            schema(
                "merge_repair",
                "Übernimm einen technischen Reparatur-PR nur nach ausdrücklicher Nutzerbestätigung und nur wenn CI grün ist.",
                mapOf("pr" to "Pull-Request-Nummer"),
                listOf("pr")
            )
        ) { args ->
            val pr = args.optString("pr")
            val allowed = confirm("Geprüften Fix übernehmen?", "PR #$pr wird nur übernommen, wenn die CI-Prüfungen grün sind.")
            if (!allowed) JSONObject().put("cancelled", true).toString() else bridge.merge(pr).toString()
        }),
    )

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
        val selection = oneShotJson(SELECTION_SYSTEM, selectionPrompt)
        val filesArray = selection.optJSONArray("files") ?: JSONArray()
        val selected = mutableListOf<String>()
        for (i in 0 until minOf(filesArray.length(), 3)) {
            filesArray.optString(i).takeIf { it.isNotBlank() }?.let(selected::add)
        }
        if (selected.isEmpty()) throw IllegalStateException(selection.optString("reply").ifBlank { "Die lokale KI konnte keine passende Reparaturdatei bestimmen." })

        status("Lokale KI liest ${selected.size} Reparaturdatei(en) …")
        val codeJson = bridge.localRepairFiles(selected)
        val rawFiles = codeJson.toString()
        if (rawFiles.contains("\"error\"")) throw IllegalStateException(codeJson["error"]?.jsonPrimitive?.content ?: "Code konnte nicht geladen werden.")

        status("Lokale KI erstellt einen sicheren Patch …")
        val patchPrompt = """
            AUFGABE:
            $description

            DIAGNOSE AUS DATEIAUSWAHL:
            ${selection.optString("diagnosis")}

            DATEIINHALTE:
            $rawFiles
        """.trimIndent()
        val plan = oneShotJson(PATCH_SYSTEM, patchPrompt)
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
        val url = prObject.optString("url")
        return buildString {
            append("Lokale Code-Reparatur vorbereitet und als Prüfbranch angelegt")
            if (number.isNotBlank()) append(" (PR #$number)")
            append(". Vor einer Übernahme muss die CI grün sein und du musst den Merge nochmals bestätigen.")
            if (url.isNotBlank()) append("\n$url")
        }
    }

    private fun oneShotJson(system: String, prompt: String): JSONObject {
        val active = ensureEngine()
        active.createConversation(
            ConversationConfig(
                systemInstruction = Contents.of(system),
                samplerConfig = SamplerConfig(topK = 24, topP = 0.85, temperature = 0.2),
            )
        ).use { temp ->
            val text = temp.sendMessage(prompt).text
            return parseJsonObject(text)
        }
    }

    private fun parseJsonObject(text: String): JSONObject {
        val clean = text.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
        val start = clean.indexOf('{')
        val end = clean.lastIndexOf('}')
        if (start < 0 || end <= start) throw IllegalStateException("Die lokale KI hat keinen strukturierten Reparaturplan geliefert.")
        return JSONObject(clean.substring(start, end + 1))
    }

    private class JsonTool(
        private val description: String,
        private val block: suspend (JSONObject) -> String,
    ) : OpenApiTool {
        constructor(description: String, block: suspend () -> String) : this(description, { block() })

        override fun getToolDescriptionJsonString(): String = description

        override fun execute(paramsJsonString: String): String = runBlocking {
            block(runCatching { JSONObject(paramsJsonString) }.getOrElse { JSONObject() })
        }
    }

    private fun schema(
        name: String,
        description: String,
        params: Map<String, String> = emptyMap(),
        required: List<String> = emptyList(),
    ): String = JSONObject().apply {
        put("name", name)
        put("description", description)
        put("parameters", JSONObject().apply {
            put("type", "object")
            put("properties", JSONObject().apply {
                params.forEach { (key, desc) -> put(key, JSONObject().put("type", "string").put("description", desc)) }
            })
            if (required.isNotEmpty()) put("required", JSONArray(required))
        })
    }.toString()

    companion object {
        private val SYSTEM_INSTRUCTION = """
            Du bist die lokale, kostenlose Homepage-KI der Koblenzer Puppenspiele. Du läufst direkt auf dem Android-Handy. Antworte knapp, freundlich und auf Deutsch.

            Du darfst normale Homepage-Wünsche selbst ausführen. Untersuche dafür zuerst inspect_homepage und inspect_editable_elements und benutze dann edit_element oder set_global_design. Behaupte eine Änderung erst, wenn das Werkzeug Erfolg gemeldet hat. Änderungen bleiben zunächst ungespeichert; save_homepage nur wenn der Nutzer ausdrücklich „speichern“, „übernehmen“ oder „dauerhaft“ sagt. Undo/Redo stehen zur Verfügung.

            Wenn das Ziel ein Editor-Bedienelement, PHP/JavaScript/CSS oder eine Funktion ist, die mit den direkten Werkzeugen nicht möglich ist, sage nicht „kein Zugriff“. Rufe request_code_change mit einer präzisen Beschreibung auf. Danach bereitet die App die Änderung ebenfalls lokal vor und führt sie nur über Prüfbranch + CI + ausdrückliche Bestätigung aus.

            Im kostenlosen lokalen Modus darfst du image_prompt nicht aufrufen, weil die bisherige generative Bildfunktion eine Cloud-API benutzen würde. Für eine rein generative Bildänderung erkläre kurz, dass „Notfall Gemini“ genutzt werden kann. Normale Bildgröße, Position, Radius usw. dürfen direkt geändert werden.
        """.trimIndent()

        private val SELECTION_SYSTEM = """
            Du bist ein lokaler Code-Diagnostiker. Antworte ausschließlich als JSON ohne Markdown:
            {"reply":"kurz","diagnosis":"präzise Diagnose","confidence":"low|medium|high","files":["pfad1","pfad2"]}
            Wähle höchstens 3 Dateien und ausschließlich Pfade aus dem bereitgestellten Katalog. Bevorzuge die kleinste plausible Menge. Keine Secrets erfinden.
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
            Regeln: höchstens 4 Dateien, höchstens 8 Operationen je Datei. search muss ein exakter, ausreichend eindeutiger Ausschnitt aus dem gelieferten Code sein. Ändere so wenig wie möglich. Entferne niemals Berechtigungs-, Nonce-, Authentifizierungs- oder Sicherheitsprüfungen. Keine eval/shell/system-Aufrufe, keine Secrets, keine erfundenen Dateien. Wenn der gezeigte Code nicht reicht, liefere changes als leeres Array.
        """.trimIndent()
    }
}

private class LocalModelManager(private val context: Context) {
    companion object {
        const val MODEL_BYTES = 2_588_147_712L
        private const val REQUIRED_FREE_BYTES = 3_700_000_000L
        private const val RECOMMENDED_RAM_BYTES = 8_000_000_000L
        private const val MODEL_URL = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/6e5c4f1e395deb959c494953478fa5cec4b8008f/gemma-4-E2B-it.litertlm?download=true"
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.MINUTES)
        .build()

    fun modelFile(): File = File(File(context.filesDir, "local-ai").apply { mkdirs() }, "gemma-4-E2B-it.litertlm")

    fun isInstalled(): Boolean = modelFile().let { it.isFile && it.length() == MODEL_BYTES }

    fun state(): LocalAiTechnician.ModelState {
        val memory = (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).let { manager ->
            ActivityManager.MemoryInfo().also(manager::getMemoryInfo)
        }
        val free = context.filesDir.usableSpace
        val arm64 = Build.SUPPORTED_64_BIT_ABIS.any { it.equals("arm64-v8a", ignoreCase = true) }
        return LocalAiTechnician.ModelState(
            installed = isInstalled(),
            modelBytes = MODEL_BYTES,
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
            throw IllegalStateException("Für das lokale KI-Modell werden mindestens etwa 3,7 GB freier Gerätespeicher benötigt.")
        }

        val target = modelFile()
        val part = File(target.parentFile, target.name + ".part")
        if (part.exists()) part.delete()
        val request = Request.Builder().url(MODEL_URL).build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IllegalStateException("Modell-Download fehlgeschlagen (HTTP ${response.code}).")
            val body = response.body
            val announced = body.contentLength().takeIf { it > 0 } ?: MODEL_BYTES
            if (announced in 1 until 100_000_000L) {
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
        if (part.length() != MODEL_BYTES) {
            val got = part.length()
            part.delete()
            throw IllegalStateException("Modelldatei ist unvollständig (${got / 1_000_000} MB statt ${MODEL_BYTES / 1_000_000} MB).")
        }
        if (target.exists()) target.delete()
        if (!part.renameTo(target)) {
            part.copyTo(target, overwrite = true)
            part.delete()
        }
    }
}
