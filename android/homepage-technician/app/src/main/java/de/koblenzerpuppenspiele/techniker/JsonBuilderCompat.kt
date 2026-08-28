package de.koblenzerpuppenspiele.techniker

import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive

/** Keeps small error-object builders concise without leaking serialization details into Live code. */
fun JsonObjectBuilder.put(key: String, value: String) {
    put(key, JsonPrimitive(value))
}
