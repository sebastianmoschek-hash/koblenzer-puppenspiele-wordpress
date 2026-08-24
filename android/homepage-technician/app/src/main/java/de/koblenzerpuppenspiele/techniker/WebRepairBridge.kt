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
              const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
              let lastError=null;
              for(let attempt=0;attempt<4;attempt++){
                if(attempt){const base=1000*Math.pow(2,attempt-1);await sleep(base+Math.floor(Math.random()*500));}
                try{
                  const fd=new FormData();
                  fd.append('action','kp_mobile_live_bootstrap');
                  const response=await fetch('/wp-admin/admin-ajax.php',{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
                  const data=await response.json().catch(()=>null);
                  if(response.ok&&data?.success)return data.data||{};
                  const message=String(data?.data?.message||'Live-Bootstrap fehlgeschlagen.');
                  const transient=[408,429,500,502,503,504].includes(response.status)||/(überlast|unavailable|temporar|temporary|rate.?limit|resource.?exhaust|server busy|try again)/i.test(message);
                  if(!transient||attempt===3)throw new Error(message);
                  lastError=new Error(message);
                }catch(error){
                  const message=String(error?.message||error||'Live-Bootstrap fehlgeschlagen.');
                  const transient=/(überlast|unavailable|temporar|temporary|rate.?limit|resource.?exhaust|server busy|try again|network|failed to fetch)/i.test(message);
                  if(!transient||attempt===3)throw error;
                  lastError=error;
                }
              }
              throw lastError||new Error('Live-Bootstrap fehlgeschlagen.');
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

    suspend fun editorCapabilities(): JsonObject = rawCall(
        """
        Promise.resolve((()=>({
          success:true,
          editMode:document.body.classList.contains('kp-fe2-editing'),
          visualAI:!!document.querySelector('.kp-ai-run'),
          selected:!!document.querySelector('.kp-fe2-selected'),
          save:!!document.querySelector('.kp-fe2-save'),
          undo:!!window.KPRepairMobile?.undo,
          redo:!!window.KPRepairMobile?.redo,
          aiDraft:!!window.KPAIEditorRuntime,
          designPanel:!!document.querySelector('.kp-oa-tools'),
          capabilities:['text','links','font','padding','width','radius','color','background','global-design','image-style','image-generation','move','add-element','responsive-editor','undo','redo','save','technical-code-repair']
        }))())
        """.trimIndent()
    )

    suspend fun visualEdit(request: String): JsonObject = call(
        """
        (async()=>{
          const request=${JSONObject.quote(request)};
          const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
          const transient=text=>/(überlast|unavailable|temporar|temporary|503|429|rate.?limit|resource.?exhaust|server busy|try again)/i.test(String(text||''));
          let last='';
          for(let attempt=0;attempt<4;attempt++){
            if(attempt){const base=1000*Math.pow(2,attempt-1);await sleep(base+Math.floor(Math.random()*500));}
            const outcome=await new Promise(resolve=>{
              const sheet=document.querySelector('.kp-ai-sheet');
              const input=document.querySelector('.kp-ai-request');
              const run=document.querySelector('.kp-ai-run');
              const status=document.querySelector('.kp-ai-status');
              if(!input||!run||!status){resolve({ok:false,text:'Der direkte Homepage-KI-Editor ist noch nicht verfügbar.',transient:false});return;}
              if(run.disabled){resolve({ok:false,text:'Der Homepage-KI-Editor arbeitet gerade bereits.',transient:true});return;}
              if(sheet)sheet.hidden=false;
              input.value=request;
              input.dispatchEvent(new Event('input',{bubbles:true}));
              const started=Date.now();
              run.click();
              const timer=setInterval(()=>{
                const text=String(status.textContent||'').trim();
                const elapsed=Date.now()-started;
                if(elapsed>65000){clearInterval(timer);resolve({ok:false,text:'Die sichtbare KI-Bearbeitung hat zu lange gedauert.',transient:true});return;}
                if(!run.disabled&&elapsed>300){
                  clearInterval(timer);
                  const lower=text.toLowerCase();
                  const failed=['fehlgeschlagen','nicht verfügbar','nicht verbunden','abgelehnt','keine berechtigung','bitte zuerst','überlastet','unavailable','resource_exhausted'].some(x=>lower.includes(x));
                  resolve({ok:!failed,text:text||'Änderung umgesetzt · noch nicht gespeichert.',transient:transient(text)});
                }
              },120);
            });
            last=outcome.text||last;
            if(outcome.ok)return{success:true,message:outcome.text,unsaved:true,attempts:attempt+1};
            if(!outcome.transient||attempt===3)throw new Error(outcome.text||'Die sichtbare KI-Bearbeitung konnte nicht ausgeführt werden.');
          }
          throw new Error(last||'Die sichtbare KI-Bearbeitung konnte nicht ausgeführt werden.');
        })()
        """.trimIndent(),
        requireMobileBridge = true,
    )

    suspend fun saveEditorChanges(): JsonObject = rawCall(
        """
        (async()=>{
          let aiDraftSaved=false;
          if(window.KPAIEditorRuntime?.isDirty?.()){
            await window.KPAIEditorRuntime.flush();
            aiDraftSaved=true;
          }
          const save=document.querySelector('.kp-fe2-save');
          if(save){
            if(save.disabled)return{success:false,message:'Der Editor speichert bereits.'};
            save.click();
            return{success:true,saving:true,aiDraftSaved,message:'Homepage wird gespeichert.'};
          }
          const designSave=document.querySelector('.kp-oa-design-save');
          if(designSave&&!designSave.disabled){
            designSave.click();
            return{success:true,saving:true,aiDraftSaved,message:'Design wird gespeichert.'};
          }
          return{success:aiDraftSaved,saved:aiDraftSaved,message:aiDraftSaved?'KI-Änderungen gespeichert.':'Kein ungespeicherter Editor-Entwurf gefunden.'};
        })()
        """.trimIndent()
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
              const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
              let lastError=null;
              for(let attempt=0;attempt<4;attempt++){
                if(attempt){const base=1000*Math.pow(2,attempt-1);await sleep(base+Math.floor(Math.random()*500));}
                const fd=new FormData();
                fd.append('action',${JSONObject.quote(action)});
                fd.append('nonce',${JSONObject.quote(nonce)});
                $fieldLines
                try{
                  const response=await fetch('/wp-admin/admin-ajax.php',{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
                  const data=await response.json().catch(()=>null);
                  if(response.ok&&data?.success)return data.data||{};
                  const message=String(data?.data?.message||'Homepage-Aufruf fehlgeschlagen.');
                  const transient=[408,429,500,502,503,504].includes(response.status)||/(überlast|unavailable|temporar|temporary|rate.?limit|resource.?exhaust|server busy|try again)/i.test(message);
                  if(!transient||attempt===3)throw new Error(message);
                  lastError=new Error(message);
                }catch(error){
                  const message=String(error?.message||error||'Homepage-Aufruf fehlgeschlagen.');
                  const transient=/(überlast|unavailable|temporar|temporary|rate.?limit|resource.?exhaust|server busy|try again|network|failed to fetch)/i.test(message);
                  if(!transient||attempt===3)throw error;
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