package de.koblenzerpuppenspiele.techniker

import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume

/**
 * Calls the authenticated WordPress repair runtime inside the WebView.
 * No GitHub or WordPress credentials are copied into the Android app.
 */
class WebRepairBridge(private val webView: WebView) {
    private val pending = ConcurrentHashMap<String, (String) -> Unit>()
    private val json = Json { ignoreUnknownKeys = true }

    @JavascriptInterface
    fun deliver(id: String, payload: String) {
        pending.remove(id)?.invoke(payload)
    }

    suspend fun context(): JsonObject = call("Promise.resolve(window.KPRepairMobile.context())")

    suspend fun analyze(description: String): JsonObject =
        call("window.KPRepairMobile.analyze(${JSONObject.quote(description)})")

    suspend fun createRepairBranch(proposalId: String): JsonObject =
        call("window.KPRepairMobile.createPr(${JSONObject.quote(proposalId)})")

    suspend fun status(pr: String): JsonObject =
        call("window.KPRepairMobile.status(${JSONObject.quote(pr)})")

    suspend fun merge(pr: String): JsonObject =
        call("window.KPRepairMobile.merge(${JSONObject.quote(pr)})")

    private suspend fun call(expression: String): JsonObject = suspendCancellableCoroutine { cont ->
        val id = UUID.randomUUID().toString()
        pending[id] = { raw ->
            if (!cont.isActive) return@let
            val parsed = runCatching { json.parseToJsonElement(raw).jsonObject }
                .getOrElse { buildJsonObject { put("error", "Ungültige Antwort der Homepage-Bridge.") } }
            cont.resume(parsed)
        }
        cont.invokeOnCancellation { pending.remove(id) }

        val script = """
            (() => {
              const id = ${JSONObject.quote(id)};
              Promise.resolve()
                .then(() => {
                  if (!window.KPRepairMobile || !window.KPRepairMobile.ready) {
                    throw new Error('Homepage-Reparaturbridge ist noch nicht bereit.');
                  }
                  return ($expression);
                })
                .then(value => window.KPRepairResult.deliver(id, JSON.stringify(value || {})))
                .catch(error => window.KPRepairResult.deliver(id, JSON.stringify({error:String(error && error.message || error)})));
            })();
        """.trimIndent()
        webView.post { webView.evaluateJavascript(script, null) }
    }
}
