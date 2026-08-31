package de.koblenzerpuppenspiele.techniker

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Nativer OpenRouter-Fallback der Android-App.
 *
 * Wird nur verwendet, wenn der geschützte WordPress-Cloud-Fallback
 * (Notfall Gemini) fehlschlägt, damit die KI immer antworten kann.
 * Der API-Key wird beim Build aus `local.properties` bzw. CI-Secret
 * injiziert (BuildConfig.OPENROUTER_API_KEY) und liegt NIE im Repository.
 */
object OpenRouterFallback {

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    fun isConfigured(): Boolean =
        BuildConfig.OPENROUTER_API_KEY.isNotBlank() && BuildConfig.OPENROUTER_API_KEY != "UNSET"

    /**
     * Sendet eine Chat-Anfrage an OpenRouter (kostenloses Modell, Standard).
     * @return Antworttext des Modells.
     * @throws Exception bei Fehlern.
     */
    suspend fun chat(userText: String, history: String = "", system: String = defaultSystem): String =
        withContext(Dispatchers.IO) {
            require(isConfigured()) { "OpenRouter ist nicht konfiguriert." }

            val messages = JSONArray()
            messages.put(JSONObject().put("role", "system").put("content", system))
            if (history.isNotBlank()) {
                // Letzte 2 Nutzer/KI-Paare als Kontext übernehmen (konservativ).
                val lines = history.lines().filter { it.isNotBlank() }
                for (line in lines.takeLast(4)) {
                    val role = if (line.startsWith("NUTZER:")) "user" else "assistant"
                    val content = line.removePrefix("NUTZER:").removePrefix("KI:").trim().take(400)
                    if (content.isNotBlank()) {
                        messages.put(JSONObject().put("role", role).put("content", content))
                    }
                }
            }
            messages.put(JSONObject().put("role", "user").put("content", userText.take(2200)))

            val payload = JSONObject()
                .put("model", BuildConfig.OPENROUTER_MODEL)
                .put("messages", messages)
                .put("stream", false)
                .put("temperature", 0.3)

            val request = Request.Builder()
                .url("https://openrouter.ai/api/v1/chat/completions")
                .addHeader("Authorization", "Bearer ${BuildConfig.OPENROUTER_API_KEY}")
                .addHeader("Content-Type", "application/json")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()

            client.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val message = runCatching {
                        JSONObject(body).optJSONObject("error")?.optString("message").orEmpty()
                    }.getOrDefault("")
                    throw IllegalStateException(message.ifBlank { "OpenRouter hat die Anfrage abgelehnt (HTTP ${response.code})." })
                }
                val reply = JSONObject(body)
                    .optJSONArray("choices")?.optJSONObject(0)
                    ?.optJSONObject("message")?.optString("content")
                    .orEmpty()
                    .trim()
                if (reply.isBlank()) throw IllegalStateException("OpenRouter hat keine Antwort geliefert.")
                reply
            }
        }

    private const val defaultSystem: String =
        "Du bist die KI der Homepage-Hilfe der Koblenzer Puppenspiele. Antworte auf Deutsch, freundlich und konkret. " +
            "Bei normalen Fragen nur antworten und nichts verändern. Wenn Code/Reparatur nötig ist, sag das klar und " +
            "weise auf den geprüften Reparaturweg hin. Erfinde keine abgeschlossenen Änderungen."
}