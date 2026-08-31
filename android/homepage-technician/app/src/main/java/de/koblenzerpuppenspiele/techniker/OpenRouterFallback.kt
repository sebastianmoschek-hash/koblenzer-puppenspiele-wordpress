package de.koblenzerpuppenspiele.techniker

/**
 * Deliberately disabled compatibility placeholder.
 *
 * Homepage-Hilfe has no OpenRouter runtime path and no OpenRouter build
 * configuration. Local LiteRT/Gemma remains the normal Android AI route.
 */
@Deprecated("OpenRouter is intentionally disabled; use LocalAiTechnician instead.")
object OpenRouterFallback {
    fun isConfigured(): Boolean = false

    suspend fun chat(userText: String, history: String = "", system: String = ""): String {
        throw UnsupportedOperationException("OpenRouter is intentionally disabled.")
    }
}
