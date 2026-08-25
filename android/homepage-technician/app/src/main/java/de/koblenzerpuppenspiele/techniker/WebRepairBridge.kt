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
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume

/**
 * Calls authenticated WordPress editor/repair endpoints through the trusted same-origin WebView.
 * Normal visual edits are deterministic editor commands; local AI only chooses the action.
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

    /** Legacy Gemini-Live bootstrap kept only for old builds. */
    suspend fun bootstrap(): JsonObject = ajaxBootstrap("kp_mobile_live_bootstrap")

    /** Primary bootstrap for the free local-AI path. This never asks Google for a model token. */
    suspend fun localBootstrap(): JsonObject = ajaxBootstrap("kp_mobile_local_bootstrap")

    private suspend fun ajaxBootstrap(action: String): JsonObject {
        val out = rawCall(
            """
            (async()=>{
              const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
              let lastError=null;
              for(let attempt=0;attempt<4;attempt++){
                if(attempt){const base=700*Math.pow(2,attempt-1);await sleep(base+Math.floor(Math.random()*350));}
                try{
                  const fd=new FormData();fd.append('action',${JSONObject.quote(action)});
                  const response=await fetch('/wp-admin/admin-ajax.php',{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
                  const data=await response.json().catch(()=>null);
                  if(response.ok&&data?.success)return data.data||{};
                  const message=String(data?.data?.message||'Homepage-Bootstrap fehlgeschlagen.');
                  const transient=[408,429,500,502,503,504].includes(response.status)||/(überlast|unavailable|temporar|temporary|server busy|try again|network)/i.test(message);
                  if(!transient||attempt===3)throw new Error(message);
                  lastError=new Error(message);
                }catch(error){
                  const message=String(error?.message||error||'Homepage-Bootstrap fehlgeschlagen.');
                  const transient=/(überlast|unavailable|temporar|temporary|server busy|try again|network|failed to fetch)/i.test(message);
                  if(!transient||attempt===3)throw error;
                  lastError=error;
                }
              }
              throw lastError||new Error('Homepage-Bootstrap fehlgeschlagen.');
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
          return {url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},online:navigator.onLine,bridgeFallback:true,visibleText:String(document.body?.innerText||'').slice(0,2800),selected:selected?{tag:selected.tagName,text:String(selected.textContent||'').slice(0,900),rect:rect?{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)}:null}:null};
        })())
        """.trimIndent()
    )

    suspend fun editorCapabilities(): JsonObject = rawCall(
        """
        Promise.resolve((()=>({
          success:true,
          editMode:document.body.classList.contains('kp-fe2-editing'),
          deterministicEditor:!!window.KPRepairMobile?.editElement,
          elementInspection:!!window.KPRepairMobile?.editableElements,
          globalDesign:!!window.KPRepairMobile?.setDesign,
          save:!!window.KPRepairMobile?.saveChanges,
          undo:!!window.KPRepairMobile?.undo,
          redo:!!window.KPRepairMobile?.redo,
          localTechnicalRepair:true,
          localAndroidSelfRepair:true,
          emergencyGeminiServerFallback:true,
          cloudPlanner:false,
          capabilities:['inspect-elements','text','links','font','padding','width','radius','color','background','global-design','move','section-order','responsive-editor','undo','redo','save','local-technical-code-repair','android-self-repair-via-pr','emergency-gemini-via-protected-server']
        }))())
        """.trimIndent()
    )

    suspend fun editableElements(): JsonObject = call(
        "Promise.resolve(window.KPRepairMobile.editableElements())",
        requireMobileBridge = true,
    )

    suspend fun editElement(liveId: String, property: String, value: String): JsonObject = call(
        "window.KPRepairMobile.editElement(${JSONObject.quote(liveId)},${JSONObject.quote(property)},${JSONObject.quote(value)})",
        requireMobileBridge = true,
    )

    suspend fun setGlobalDesign(key: String, value: String): JsonObject = call(
        "window.KPRepairMobile.setDesign(${JSONObject.quote(key)},${JSONObject.quote(value)})",
        requireMobileBridge = true,
    )

    suspend fun saveEditorChanges(): JsonObject = call(
        "window.KPRepairMobile.saveChanges()",
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

    suspend fun localRepairContext(description: String): JsonObject {
        val browser = context().toString()
        return repairPost("kp_local_ai_repair_context", mapOf("request" to description, "browser" to browser))
    }

    suspend fun localRepairFiles(paths: List<String>): JsonObject = repairPost(
        "kp_local_ai_repair_files",
        mapOf("paths" to JSONArray(paths).toString()),
    )

    suspend fun submitLocalRepairProposal(planJson: String): JsonObject = repairPost(
        "kp_local_ai_repair_proposal",
        mapOf("plan" to planJson),
    )

    suspend fun createRepairBranch(proposalId: String): JsonObject =
        repairPost("kp_local_ai_repair_create_pr", mapOf("proposal_id" to proposalId))

    suspend fun localRepairCiDiagnostics(pr: String): JsonObject =
        repairPost("kp_local_ai_repair_ci_diagnostics", mapOf("pr" to pr))

    /** Explicit cloud fallback. Gemini/API credentials stay on WordPress, never in Android. */
    suspend fun emergencyGemini(request: String, history: String): JsonObject {
        val browser = context().toString()
        // A cloud-model failure is not safely improved by repeating the same expensive
        // generation four times. One attempt also surfaces the real server error quickly.
        return repairPost(
            "kp_mobile_emergency_gemini",
            mapOf(
                "request" to request,
                "history" to history,
                "browser" to browser,
            ),
            maxAttempts = 1,
        )
    }

    suspend fun createEmergencyGeminiBranch(proposalId: String): JsonObject =
        // Branch/PR creation is non-idempotent; never retry it blindly after a lost response.
        repairPost(
            "kp_mobile_emergency_gemini_create_pr",
            mapOf("proposal_id" to proposalId),
            maxAttempts = 1,
        )

    suspend fun status(pr: String): JsonObject =
        repairPost("kp_ai_repair_status", mapOf("pr" to pr))

    suspend fun merge(pr: String): JsonObject =
        repairPost("kp_ai_repair_merge", mapOf("pr" to pr))

    suspend fun technicalHistory(): JsonObject = repairPost("kp_ai_repair_history")

    suspend fun rollbackRepair(pr: String): JsonObject =
        repairPost("kp_ai_repair_rollback", mapOf("repair_pr" to pr))

    suspend fun savedHistory(): JsonObject = ownerPost("kp_owner_history_list")
    suspend fun undoSavedChange(): JsonObject = ownerPost("kp_owner_history_undo")
    suspend fun restoreSavedVersion(versionId: String): JsonObject = ownerPost("kp_owner_history_restore", mapOf("version_id" to versionId))

    private suspend fun repairPost(
        action: String,
        fields: Map<String, String> = emptyMap(),
        maxAttempts: Int = 4,
    ): JsonObject {
        if (repairNonce.isBlank()) localBootstrap()
        return post(action, repairNonce, fields, maxAttempts)
    }

    private suspend fun ownerPost(action: String, fields: Map<String, String> = emptyMap()): JsonObject {
        if (repairNonce.isBlank()) localBootstrap()
        if (ownerNonce.isBlank()) return buildJsonObject { put("error", "Website-Versionshistorie ist in dieser Sitzung nicht verfügbar.") }
        return post(action, ownerNonce, fields)
    }

    private suspend fun post(
        action: String,
        nonce: String,
        fields: Map<String, String>,
        maxAttempts: Int = 4,
    ): JsonObject {
        val attempts = maxAttempts.coerceIn(1, 4)
        val lastAttempt = attempts - 1
        val fieldLines = fields.entries.joinToString("\n") { (key, value) ->
            "fd.append(${JSONObject.quote(key)},${JSONObject.quote(value)});"
        }
        return rawCall(
            """
            (async()=>{
              const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
              let lastError=null;
              for(let attempt=0;attempt<$attempts;attempt++){
                if(attempt){const base=700*Math.pow(2,attempt-1);await sleep(base+Math.floor(Math.random()*350));}
                const fd=new FormData();fd.append('action',${JSONObject.quote(action)});fd.append('nonce',${JSONObject.quote(nonce)});$fieldLines
                try{
                  const response=await fetch('/wp-admin/admin-ajax.php',{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
                  const data=await response.json().catch(()=>null);
                  if(response.ok&&data?.success)return data.data||{};
                  const message=String(data?.data?.message||'Homepage-Aufruf fehlgeschlagen.');
                  const transient=[408,429,500,502,503,504].includes(response.status)||/(überlast|unavailable|temporar|temporary|server busy|try again)/i.test(message);
                  if(!transient||attempt===$lastAttempt)throw new Error(message);
                  lastError=new Error(message);
                }catch(error){
                  const message=String(error?.message||error||'Homepage-Aufruf fehlgeschlagen.');
                  const transient=/(überlast|unavailable|temporar|temporary|server busy|try again|network|failed to fetch)/i.test(message);
                  if(!transient||attempt===$lastAttempt)throw error;
                  lastError=error;
                }
              }
              throw lastError||new Error('Homepage-Aufruf fehlgeschlagen.');
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
              Promise.resolve().then(() => {$guard return ($expression);})
                .then(value => window.KPRepairResult.deliver(id, JSON.stringify(value || {})))
                .catch(error => window.KPRepairResult.deliver(id, JSON.stringify({error:String(error && error.message || error)})));
            })();
        """.trimIndent()
        webView.post { webView.evaluateJavascript(script, null) }
    }
}
