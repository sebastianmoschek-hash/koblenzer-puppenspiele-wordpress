package de.koblenzerpuppenspiele.techniker

import android.annotation.SuppressLint
import android.content.Context
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.FunctionCallPart
import com.google.firebase.ai.type.FunctionDeclaration
import com.google.firebase.ai.type.FunctionResponsePart
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.InlineData
import com.google.firebase.ai.type.LiveSession
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.ResponseModality
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.SpeechConfig
import com.google.firebase.ai.type.Tool
import com.google.firebase.ai.type.Voice
import com.google.firebase.ai.type.content
import com.google.firebase.ai.type.liveGenerationConfig
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Gemini Live is the conversational/visual layer only. Content changes use the common
 * editor Undo/Redo history. Code repairs and rollbacks always use protected PR + CI gates.
 */
@OptIn(PublicPreviewAPI::class)
class GeminiLiveTechnician(
    private val context: Context,
    private val bridge: WebRepairBridge,
    private val confirm: suspend (title: String, message: String) -> Boolean,
    private val status: (String) -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var session: LiveSession? = null
    private var frameJob: Job? = null

    @SuppressLint("MissingPermission")
    suspend fun start() {
        if (session != null) return
        status("Gemini Live wird verbunden …")

        if (FirebaseApp.getApps(context).isEmpty() && FirebaseApp.initializeApp(context) == null) {
            throw IllegalStateException(
                "Firebase ist für die Techniker-App noch nicht eingerichtet. google-services.json fehlt."
            )
        }
        runCatching {
            FirebaseAppCheck.getInstance().installAppCheckProviderFactory(
                PlayIntegrityAppCheckProviderFactory.getInstance()
            )
        }

        val tools = Tool.functionDeclarations(
            listOf(
                FunctionDeclaration(
                    "inspect_homepage",
                    "Read the current authenticated homepage context, selected element, editor history counts, viewport and recent browser/network errors.",
                    emptyMap(),
                ),
                FunctionDeclaration(
                    "get_change_history",
                    "Read both the immediate visual editor Undo/Redo state and the merged technical AI repair history. Use this before deciding how to undo an ambiguous 'last change'.",
                    emptyMap(),
                ),
                FunctionDeclaration(
                    "undo_last_editor_change",
                    "Undo exactly one reversible visual/content editor action using the same central Undo stack as the web app. Use for text, image, layout, color, size, navigation and ordinary AI design changes.",
                    emptyMap(),
                ),
                FunctionDeclaration(
                    "redo_last_editor_change",
                    "Redo exactly one previously undone visual/content editor action using the same central Redo stack as the web app.",
                    emptyMap(),
                ),
                FunctionDeclaration(
                    "list_technical_repairs",
                    "List merged Gemini code repairs and whether each one has already been rolled back.",
                    emptyMap(),
                ),
                FunctionDeclaration(
                    "analyze_homepage_error",
                    "Ask the protected WordPress repair lab to diagnose the described technical homepage fault and prepare a safe repair proposal. This does not change code.",
                    mapOf("description" to Schema.string("German description of the observed fault and what the user just demonstrated.")),
                ),
                FunctionDeclaration(
                    "create_repair_branch",
                    "After explicit user confirmation, create the isolated ai-repair branch and pull request for an already prepared proposal. Never writes directly to live files.",
                    mapOf("proposal_id" to Schema.string("proposal_id returned by analyze_homepage_error")),
                ),
                FunctionDeclaration(
                    "rollback_technical_repair",
                    "After explicit user confirmation, create an isolated rollback PR that restores the exact pre-repair code only when those files have not changed since. The rollback still requires CI and a later merge confirmation.",
                    mapOf("repair_pr" to Schema.string("Pull request number of the merged KI-Reparatur to roll back.")),
                ),
                FunctionDeclaration(
                    "check_repair_status",
                    "Check CI status for either a repair or rollback pull request.",
                    mapOf("pr" to Schema.string("GitHub pull request number returned by a repair or rollback action.")),
                ),
                FunctionDeclaration(
                    "merge_repair",
                    "After explicit user confirmation, ask the server repair lab to merge a repair or rollback pull request. The server refuses unless CI is green.",
                    mapOf("pr" to Schema.string("GitHub pull request number")),
                ),
            )
        )

        val generation = liveGenerationConfig {
            responseModality = ResponseModality.AUDIO
            speechConfig = SpeechConfig(voice = Voice("FENRIR"))
        }
        val model = Firebase.ai(backend = GenerativeBackend.googleAI()).liveModel(
            modelName = "gemini-2.5-flash-native-audio-preview-12-2025",
            generationConfig = generation,
            tools = listOf(tools),
            systemInstruction = content {
                text(
                    "Du bist der deutschsprachige Homepage-Techniker der Koblenzer Puppenspiele. " +
                        "Der Nutzer zeigt dir die Homepage live auf seinem Android-Bildschirm und spricht mit dir. " +
                        "Beobachte genau, frage nur nach wenn wirklich nötig und unterscheide Design-/Inhaltsänderungen von technischen Code-Reparaturen. " +
                        "Normale Änderungen an Text, Bildern, Position, Farben, Größen, Navigation oder Layout gehören immer in die gemeinsame Editor-Historie und werden mit undo_last_editor_change bzw. redo_last_editor_change rückgängig gemacht. " +
                        "Wenn der Nutzer allgemein sagt 'mach die letzte Änderung rückgängig', verwende zuerst get_change_history. Gibt es einen unmittelbaren Editor-Undo-Schritt, verwende diesen. Nur wenn ausdrücklich eine übernommene technische Reparatur gemeint ist oder kein passender Editor-Schritt existiert, verwende die Technik-Historie. " +
                        "Gespeicherte ältere Website-Stände bleiben zusätzlich über die sichtbare Versionshistorie des Editors verfügbar; behaupte nicht, eine solche Version wiederhergestellt zu haben, wenn kein Tool dies getan hat. " +
                        "Bei einem technischen Problem zuerst inspect_homepage verwenden und danach analyze_homepage_error. " +
                        "Code niemals selbst frei erfinden oder live schreiben: Änderungen und Rücknahmen laufen ausschließlich über das geschützte Reparaturlabor, ai-repair-Branch und CI. " +
                        "create_repair_branch, rollback_technical_repair und merge_repair nur auslösen, wenn der Nutzer die jeweilige Aktion ausdrücklich bestätigt hat. " +
                        "Behaupte niemals, dass etwas repariert, zurückgenommen oder gespeichert wurde, bevor ein Tool das bestätigt."
                )
            },
        )

        val live = model.connect()
        session = live
        live.startAudioConversation(::handleFunction)
        frameJob = scope.launch {
            ScreenFrameBus.jpegFrames.collectLatest { jpeg ->
                session?.sendVideoRealtime(InlineData(jpeg, "image/jpeg"))
            }
        }
        status("KI live · zeig mir den Fehler")
    }

    fun stop() {
        frameJob?.cancel()
        frameJob = null
        val active = session
        session = null
        runCatching { active?.stopAudioConversation() }
        if (active != null) {
            scope.launch {
                runCatching { active.close() }
            }
        }
        status("KI-Live beendet")
    }

    fun release() {
        frameJob?.cancel()
        frameJob = null
        val active = session
        session = null
        runCatching { active?.stopAudioConversation() }
        if (active != null) {
            runBlocking(Dispatchers.IO) {
                runCatching { active.close() }
            }
        }
        scope.cancel()
    }

    private fun handleFunction(call: FunctionCallPart): FunctionResponsePart {
        val response = runBlocking(Dispatchers.IO) {
            runCatching {
                when (call.name) {
                    "inspect_homepage" -> bridge.context()
                    "get_change_history" -> buildJsonObject {
                        put("editor", bridge.editorHistory())
                        put("technical", bridge.technicalHistory())
                    }
                    "undo_last_editor_change" -> bridge.undoEditorChange()
                    "redo_last_editor_change" -> bridge.redoEditorChange()
                    "list_technical_repairs" -> bridge.technicalHistory()
                    "analyze_homepage_error" -> {
                        val description = call.args["description"]?.jsonPrimitive?.content.orEmpty()
                        if (description.isBlank()) errorObject("Fehlerbeschreibung fehlt.")
                        else bridge.analyze(description)
                    }
                    "create_repair_branch" -> {
                        val id = call.args["proposal_id"]?.jsonPrimitive?.content.orEmpty()
                        if (id.isBlank()) {
                            errorObject("proposal_id fehlt.")
                        } else if (!confirm("Prüfbranch erstellen?", "Gemini möchte den vorgeschlagenen Fix jetzt auf einem isolierten Prüfbranch anlegen. Live wird dabei nicht verändert.")) {
                            buildJsonObject { put("cancelled", true); put("message", "Nutzer hat die Erstellung abgelehnt.") }
                        } else {
                            bridge.createRepairBranch(id)
                        }
                    }
                    "rollback_technical_repair" -> {
                        val pr = call.args["repair_pr"]?.jsonPrimitive?.content.orEmpty()
                        if (pr.isBlank()) {
                            errorObject("Reparatur-PR fehlt.")
                        } else if (!confirm("Technik-Reparatur zurücknehmen?", "Gemini möchte einen geprüften Rücknahme-Branch für Reparatur #$pr erstellen. Spätere Änderungen an denselben Dateien werden dabei niemals überschrieben.")) {
                            buildJsonObject { put("cancelled", true); put("message", "Nutzer hat die Rücknahme abgelehnt.") }
                        } else {
                            bridge.rollbackRepair(pr)
                        }
                    }
                    "check_repair_status" -> {
                        val pr = call.args["pr"]?.jsonPrimitive?.content.orEmpty()
                        if (pr.isBlank()) errorObject("PR-Nummer fehlt.") else bridge.status(pr)
                    }
                    "merge_repair" -> {
                        val pr = call.args["pr"]?.jsonPrimitive?.content.orEmpty()
                        if (pr.isBlank()) {
                            errorObject("PR-Nummer fehlt.")
                        } else if (!confirm("Geprüfte Änderung übernehmen?", "Nur wenn die CI-Prüfungen grün sind, darf der Reparaturserver diesen Fix oder diese Rücknahme nach main übernehmen.")) {
                            buildJsonObject { put("cancelled", true); put("message", "Nutzer hat die Übernahme abgelehnt.") }
                        } else {
                            bridge.merge(pr)
                        }
                    }
                    else -> errorObject("Unbekannte Techniker-Funktion: ${call.name}")
                }
            }.getOrElse { errorObject(it.message ?: "Techniker-Funktion fehlgeschlagen.") }
        }
        return FunctionResponsePart(call.name, response, call.id)
    }

    private fun errorObject(message: String): JsonObject = JsonObject(
        mapOf(
            "success" to JsonPrimitive(false),
            "error" to JsonPrimitive(message),
        )
    )
}
