package de.koblenzerpuppenspiele.techniker

import com.google.ai.edge.litertlm.Message

/**
 * LiteRT-LM 0.16 returns Message from Conversation.sendMessage().
 * Message.toString() is defined by LiteRT-LM as its concatenated text contents.
 * Keep the planner call sites readable while staying pinned to the tested 0.16 API.
 */
val Message.text: String
    get() = toString()
