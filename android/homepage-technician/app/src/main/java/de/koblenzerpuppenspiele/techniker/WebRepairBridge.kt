package de.koblenzerpuppenspiele.techniker

import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume

/**
 * Calls authenticated WordPress editor/repair endpoints through the trusted same-origin WebView.
 * Repair operations no longer depend on wp_footer being rendered: after bootstrap they POST
 * directly to admin-ajax.php with short-lived WordPress nonces. Durable credentials never enter
 * the Android app.
 */
class WebRepairBridge(private val webView: WebView) {
    private val pending = ConcurrentHashMap<String, (String) -> Unit>()
    private val json = Json { ignoreUnknownKeys = true }
    @Volatile private var repairNonce: String = ""
    @Volatile private var ownerNonce: String = ""

    @JavascriptInterface
    fun deliver(id: String, payload: String) {
        pending.remove(id)?.invoke(payload)
    }

    suspend fun bootstrap(): JsonObject {
        val out = rawCall(
            """
            (async()=>{
              const fd=new FormData();
              fd.append('action','kp_mobile_live_bootstrap');
              const response=await fetch('/wp-admin/admin-ajax.php',{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
              const data=await response.json().catch(()=>null);
              if(!response.ok||!data?.success) throw new Error(data?.data?.message||'Live-Bootstrap fehlgeschlagen.');
              return data.data||{};
            })()
            """.trimIndent()
        )
        repairNonce = out["repairNonce"]?.jsonPrimitive?.content.orEmpty()
        ownerNonce = out["ownerNonce"]?.jsonPrimitive?.content.orEmpty()
        if (repairNonce.isBlank()) throw IllegalStateException(out["error"]?.jsonPrimitive?.content ?: "Reparatur-Nonce fehlt.")
        return out
    }

    suspend fun context(): JsonObject = rawCall(
        """
        Promise.resolve((()=>{
          if(window.KPRepairMobile?.ready) return window.KPRepairMobile.context();
          const selected=document.querySelector('.kp-fe2-selected');
          const rect=selected?.getBoundingClientRect?.();
          return {
            url:location.href,
            title:document.title,
            viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
            online:navigator.onLine,
            bridgeFallback:true,
            visibleText:String(document.body?.innerText||'').slice(0,2800),
            selected:selected?{tag:selected.tagName,text:String(selected.textContent||'').slice(0,900),rect:rect?{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)}:null}:null
          };
        })())
        """.trimIndent()
    )

    suspend fun visualEdit(request: String): JsonObject = call(
        """
        new Promise((resolve, reject) => {
          const request = ${JSONObject.quote(request)};
          const sheet = document.querySelector('.kp-ai-sheet');
          const input = document.querySelector('.kp-ai-request');
          const run = document.querySelector('.kp-ai-run');
          const status = document.querySelector('.kp-ai-status');
          if (!input || !run || !status) {
            reject(new Error('Der direkte Homepage-KI-Editor ist noch nicht verfügbar.'));
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
        """.trimIndent(),
        requireMobileBridge = true,
    )

    suspend fun editorHistory(): JsonObject = call(
        "Promise.resolve(window.KPRepairMobile.editorHistory())",
        requireMobileBridge = true,
    )

    suspend fun undoEditorChange(): JsonObject = call(
        "window.KPRepairMobile.undo()",
        requireMobileBridge = true,
    )

    suspend fun redoEditorChange(): JsonObject = call(
        "window.KPRepairMobile.redo()",
        requireMobileBridge = true,
    )

    suspend fun savedHistory(): JsonObject = ownerPost("kp_owner_history_list")

    suspend fun undoSavedChange(): JsonObject = ownerPost("kp_owner_history_undo")

    suspend fun restoreSavedVersion(versionId: String): JsonObject =
        ownerPost("kp_owner_history_restore", mapOf("version_id" to versionId))

    suspend fun analyze(description: String): JsonObject = repairPost(
        "kp_ai_repair_analyze",
        mapOf(
            "request" to description,
            "browser" to context().toString(),
        ),
    )

    suspend fun createRepairBranch(proposalId: String): JsonObject =
        repairPost("kp_ai_repair_create_pr", mapOf("proposal_id" to proposalId))

    suspend fun status(pr: String): JsonObject =
        repairPost("kp_ai_repair_status", mapOf("pr" to pr))

    suspend fun merge(pr: String): JsonObject =
        repairPost("kp_ai_repair_merge", mapOf("pr" to pr))

    suspend fun technicalHistory(): JsonObject = repairPost("kp_ai_repair_history")

    suspend fun rollbackRepair(pr: String): JsonObject =
        repairPost("kp_ai_repair_rollback", mapOf("repair_pr" to pr))

    private suspend fun repairPost(action: String, fields: Map<String, String> = emptyMap()): JsonObject {
        if (repairNonce.isBlank()) bootstrap()
        return post(action, repairNonce, fields)
    }

    private suspend fun ownerPost(action: String, fields: Map<String, String> = emptyMap()): JsonObject {
        if (repairNonce.isBlank()) bootstrap()
        if (ownerNonce.isBlank()) return buildJsonObject { put("error", "Website-Versionshistorie ist in dieser Sitzung nicht verfügbar.") }
        return post(action, ownerNonce, fields)
    }

    private suspend fun post(action: String, nonce: String, fields: Map<String, String>): JsonObject {
        val fieldLines = fields.entries.joinToString("\n") { (key, value) ->
            "fd.append(${JSONObject.quote(key)},${JSONObject.quote(value)});"
        }
        return rawCall(
            """
            (async()=>{
              const fd=new FormData();
              fd.append('action',${JSONObject.quote(action)});
              fd.append('nonce',${JSONObject.quote(nonce)});
              $fieldLines
              const response=await fetch('/wp-admin/admin-ajax.php',{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
              const data=await response.json().catch(()=>null);
              if(!response.ok||!data?.success) throw new Error(data?.data?.message||'Homepage-Aufruf fehlgeschlagen.');
              return data.data||{};
            })()
            """.trimIndent()
        )
    }

    private suspend fun rawCall(expression: String): JsonObject = call(expression, requireMobileBridge = false)

    private suspend fun call(expression: String, requireMobileBridge: Boolean): JsonObject = suspendCancellableCoroutine { cont ->
        val id = UUID.randomUUID().toString()
        pending[id] = handler@{ raw ->
            if (!cont.isActive) return@handler
            val parsed = runCatching { json.parseToJsonElement(raw).jsonObject }
                .getOrElse { buildJsonObject { put("error", "Ungültige Antwort der Homepage-Bridge.") } }
            cont.resume(parsed)
        }
        cont.invokeOnCancellation { pending.remove(id) }

        val guard = if (requireMobileBridge) {
            "if(!window.KPRepairMobile||!window.KPRepairMobile.ready)throw new Error('Homepage-Reparaturbridge ist auf dieser Seite nicht bereit.');"
        } else ""
        val script = """
            (() => {
              const id = ${JSONObject.quote(id)};
              Promise.resolve()
                .then(() => {
                  $guard
                  return ($expression);
                })
                .then(value => window.KPRepairResult.deliver(id, JSON.stringify(value || {})))
                .catch(error => window.KPRepairResult.deliver(id, JSON.stringify({error:String(error && error.message || error)})));
            })();
        """.trimIndent()
        webView.post { webView.evaluateJavascript(script, null) }
    }
}