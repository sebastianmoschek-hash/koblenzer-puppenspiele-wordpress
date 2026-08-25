package de.koblenzerpuppenspiele.techniker

import android.content.Context
import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
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
import org.json.JSONObject
import java.io.File

/**
 * Multimodal companion for the same Gemma 4 E2B file already used by LocalAiTechnician.
 * It sees the latest locally captured screen frame and turns visual references like
 * "dieser Text" or "der Fehler hier" into an explicit textual handoff for the
 * deterministic editor/code agent. No screen frame leaves the device.
 */
class LocalVisualAgent(
    private val context: Context,
    private val status: (String) -> Unit,
) {
    data class Result(
        val reply: String,
        val handoff: String,
    )

    private val lock = Mutex()
    private var engine: Engine? = null
    private var backendLabel = ""
    private var preferCpu = false
    private val history = ArrayDeque<Pair<String, String>>()

    fun modelInstalled(): Boolean = modelFile().let { it.isFile && it.length() in MIN_MODEL_BYTES..MAX_MODEL_BYTES }

    suspend fun analyze(userText: String, imageFile: File, pageContext: String): Result = lock.withLock {
        withContext(Dispatchers.IO) {
            if (!modelInstalled()) throw IllegalStateException("Das lokale Gemma-Modell ist noch nicht installiert.")
            if (!imageFile.isFile || imageFile.length() <= 0) throw IllegalStateException("Es liegt noch kein aktueller Bildschirm-Frame vor.")

            val prompt = buildPrompt(userText, pageContext)
            status("Live lokal · Gemma sieht den aktuellen Bildschirm …")
            val raw = runInference(prompt, imageFile)
            val json = parseJson(raw) ?: JSONObject().apply {
                put("reply", raw.trim().take(1200))
                put("handoff", "")
            }
            val reply = json.optString("reply").trim().ifBlank { "Ich sehe den aktuellen Bildschirm." }
            val handoff = json.optString("handoff").trim().take(1800)
            history.addLast(userText.take(700) to reply.take(1000))
            while (history.size > 5) history.removeFirst()
            Result(reply = reply, handoff = handoff)
        }
    }

    fun release() {
        runCatching { engine?.close() }
        engine = null
        backendLabel = ""
    }

    private fun modelFile(): File = File(File(context.filesDir, "local-ai"), "gemma-4-E2B-it.litertlm")

    private fun buildPrompt(userText: String, pageContext: String): String {
        val recent = history.takeLast(3).joinToString("\n") { (user, assistant) ->
            "NUTZER: ${user.take(300)}\nKI: ${assistant.take(420)}"
        }.take(1200)
        return """
            NUTZERWUNSCH:
            ${userText.trim().take(1200)}

            LETZTE UNTERHALTUNG:
            ${recent.ifBlank { "Noch keine." }}

            WEB-SEITENKONTEXT (ergänzt das Bild, kann aber leer sein):
            ${pageContext.take(1800)}

            Sieh dir das beigefügte aktuelle Bildschirmbild an. Antworte ausschließlich als JSON:
            {"reply":"natürliche kurze Antwort auf Deutsch","handoff":""}

            Wenn der Nutzer nur fragt, was du siehst, etwas erklärt haben möchte oder gemeinsam durch den Bildschirm gehen will, bleibt handoff leer.
            Wenn er etwas ändern, reparieren, programmieren, anklicken/gestalten lassen oder einen sichtbaren Fehler beheben will, schreibe in handoff eine eigenständige präzise technische Aufgabe. Nenne dabei die sichtbaren Texte, Fehlermeldungen oder Elemente aus dem Bild so konkret, dass ein nachgelagerter Code-/Editor-Agent ohne das Bild weiterarbeiten kann. Erfinde nichts, was im Bild nicht erkennbar ist.
        """.trimIndent().take(MAX_PROMPT_CHARS)
    }

    private fun ensureEngine(): Engine {
        engine?.let { return it }
        val model = modelFile()
        fun initialize(mainBackend: Backend, visionBackend: Backend, label: String): Engine {
            val candidate = Engine(
                EngineConfig(
                    modelPath = model.absolutePath,
                    backend = mainBackend,
                    visionBackend = visionBackend,
                    maxNumTokens = MAX_TOKENS,
                    cacheDir = File(context.cacheDir, "litertlm-vision").apply { mkdirs() }.absolutePath,
                )
            )
            return try {
                Log.i(TAG, "Initializing multimodal LiteRT-LM backend=$label")
                candidate.initialize()
                backendLabel = label
                candidate
            } catch (error: Throwable) {
                runCatching { candidate.close() }
                throw error
            }
        }

        val active = if (preferCpu) {
            initialize(cpu(), cpu(), "CPU")
        } else {
            runCatching { initialize(Backend.GPU(), Backend.GPU(), "GPU") }
                .getOrElse {
                    preferCpu = true
                    status("Live lokal · GPU nicht verfügbar · Vision nutzt CPU")
                    initialize(cpu(), cpu(), "CPU")
                }
        }
        engine = active
        return active
    }

    private fun cpu(): Backend.CPU = Backend.CPU(
        threadCount = minOf(4, Runtime.getRuntime().availableProcessors().coerceAtLeast(1)),
    )

    private fun runInference(prompt: String, imageFile: File): String {
        return try {
            runInferenceWith(ensureEngine(), prompt, imageFile)
        } catch (error: Throwable) {
            Log.w(TAG, "Multimodal inference failed backend=$backendLabel: ${error.message}")
            release()
            if (preferCpu) throw error
            preferCpu = true
            status("Live lokal · Vision wird einmal frisch auf CPU gestartet …")
            runInferenceWith(ensureEngine(), prompt.take(CPU_PROMPT_CHARS), imageFile)
        }
    }

    private fun runInferenceWith(active: Engine, prompt: String, imageFile: File): String {
        active.createConversation(
            ConversationConfig(
                systemInstruction = Contents.of(
                    "Du bist der lokale visuelle Assistent der Koblenzer Puppenspiele. Du arbeitest vollständig auf dem Android-Gerät und beschreibst nur, was du im bereitgestellten Bildschirmbild und Kontext tatsächlich erkennen kannst."
                ),
                samplerConfig = SamplerConfig(topK = 16, topP = 0.82, temperature = 0.15),
                maxOutputToken = MAX_OUTPUT_TOKENS,
                thinkingConfig = ThinkingConfig(enableThinking = false, thinkingTokenBudget = 0),
            )
        ).use { conversation ->
            return conversation.sendMessage(
                Contents.of(
                    Content.ImageFile(imageFile.absolutePath),
                    Content.Text(prompt),
                )
            ).text
        }
    }

    private fun parseJson(raw: String): JSONObject? {
        val text = raw.trim()
            .removePrefix("```json")
            .removePrefix("```")
            .removeSuffix("```")
            .trim()
        val start = text.indexOf('{')
        val end = text.lastIndexOf('}')
        if (start < 0 || end <= start) return null
        return runCatching { JSONObject(text.substring(start, end + 1)) }.getOrNull()
    }

    companion object {
        private const val TAG = "KPLocalVision"
        private const val MIN_MODEL_BYTES = 2_400_000_000L
        private const val MAX_MODEL_BYTES = 3_100_000_000L
        private const val MAX_TOKENS = 2048
        private const val MAX_OUTPUT_TOKENS = 280
        private const val MAX_PROMPT_CHARS = 3600
        private const val CPU_PROMPT_CHARS = 2400
    }
}
