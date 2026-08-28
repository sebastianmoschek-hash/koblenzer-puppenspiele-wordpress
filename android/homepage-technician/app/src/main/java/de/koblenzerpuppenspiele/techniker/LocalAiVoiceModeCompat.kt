package de.koblenzerpuppenspiele.techniker

/**
 * Live mode deliberately reuses the exact same local planner as text chat.
 * Spoken concision is handled by LocalVoiceController so the model does not need
 * a second conversation/model or additional prompt pass just for voice output.
 */
suspend fun LocalAiTechnician.send(userText: String, voiceMode: Boolean): String {
    @Suppress("UNUSED_VARIABLE")
    val presentationOnly = voiceMode
    return send(userText)
}
