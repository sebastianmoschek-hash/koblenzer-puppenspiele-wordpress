package de.koblenzerpuppenspiele.techniker

import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume

/**
 * Calls the authenticated WordPress editor/repair runtimes inside the WebView.
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

    suspend fun visualEdit(request: String): JsonObject = call(
        """
        new Promise((resolve, reject) => {
          const request = ${JSONObject.quote(request)};
          const sheet = document.querySelector('.kp-ai-sheet');
          const input = document.querySelector('.kp-ai-request');
          const run = document.querySelector('.kp-ai-run');
          const status = document.querySelector('.kp-ai-status');
          if (!input || !run || !status) {
            reject(new Error('Der direkte Homepage-KI-Editor ist noch nicht verfügbar. Bitte zuerst als Bearbeiter anmelden.'));
            return;
          }
          if (run.disabled) {
            reject(new Error('Der Homepage-KI-Editor arbeitet gerade bereits.'));
            return;
          }
          if (sheet) sheet.hidden = false;
          input.value = request;
          input.dispatchEvent(new Event('input', {bubbles:true}));
          const started = Date.now();
          run.click();
          const timer = setInterval(() => {
            const text = String(status.textContent || '').trim();
            const elapsed = Date.now() - started;
            if (elapsed > 65000) {
              clearInterval(timer);
              reject(new Error('Die sichtbare KI-Bearbeitung hat zu lange gedauert.'));
              return;
            }
            if (!run.disabled && elapsed > 300) {
              clearInterval(timer);
              const lower = text.toLowerCase();
              const failed = ['fehlgeschlagen','nicht verfügbar','nicht verbunden','abgelehnt','keine berechtigung','bitte zuerst'].some(x => lower.includes(x));
              if (failed) reject(new Error(text || 'Die sichtbare KI-Bearbeitung konnte nicht ausgeführt werden.'));
              else resolve({success:true,message:text || 'Änderung umgesetzt · noch nicht gespeichert.',unsaved:true});
            }
          }, 120);
        })
        """.trimIndent()
    )

    suspend fun editorHistory(): JsonObject =
        call("Promise.resolve(window.KPRepairMobile.editorHistory())")

    suspend fun undoEditorChange(): JsonObject =
        call("window.KPRepairMobile.undo()")

    suspend fun redoEditorChange(): JsonObject =
        call("window.KPRepairMobile.redo()")

    suspend fun savedHistory(): JsonObject =
        call("window.KPRepairMobile.savedHistory()")

    suspend fun undoSavedChange(): JsonObject =
        call("window.KPRepairMobile.undoSaved()")

    suspend fun restoreSavedVersion(versionId: String): JsonObject =
        call("window.KPRepairMobile.restoreSavedVersion(${JSONObject.quote(versionId)})")

    suspend fun analyze(description: String): JsonObject =
        call("window.KPRepairMobile.analyze(${JSONObject.quote(description)})")

    suspend fun createRepairBranch(proposalId: String): JsonObject =
        call("window.KPRepairMobile.createPr(${JSONObject.quote(proposalId)})")

    suspend fun status(pr: String): JsonObject =
        call("window.KPRepairMobile.status(${JSONObject.quote(pr)})")

    suspend fun merge(pr: String): JsonObject =
        call("window.KPRepairMobile.merge(${JSONObject.quote(pr)})")

    suspend fun technicalHistory(): JsonObject =
        call("window.KPRepairMobile.technicalHistory()")

    suspend fun rollbackRepair(pr: String): JsonObject =
        call("window.KPRepairMobile.rollbackRepair(${JSONObject.quote(pr)})")

    private suspend fun call(expression: String): JsonObject = suspendCancellableCoroutine { cont ->
        val id = UUID.randomUUID().toString()
        pending[id] = handler@{ raw ->
            if (!cont.isActive) return@handler
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
