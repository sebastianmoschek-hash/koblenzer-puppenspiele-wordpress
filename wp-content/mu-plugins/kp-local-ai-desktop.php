<?php
/**
 * Free local-AI chat for desktop owner editing.
 *
 * The model runs in the browser through LiteRT-LM/WebGPU. The browser model only
 * plans actions; existing deterministic editor controls and the protected repair
 * lab perform changes. Difficult tasks can be copied to the normal Gemini web app
 * without using a Gemini API key.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() ) { return; }
    $can_repair = function_exists( 'kp_ai_repair_can_use' ) ? kp_ai_repair_can_use() : current_user_can( 'edit_pages' );
    if ( ! $can_repair || ! defined( 'KP_AI_REPAIR_NONCE' ) ) { return; }
    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
    if ( str_contains( $ua, 'KoblenzerPuppenspieleTechnician/' ) ) { return; }

    $config = array(
        'ajaxUrl' => admin_url( 'admin-ajax.php' ),
        'nonce'   => wp_create_nonce( KP_AI_REPAIR_NONCE ),
        'model'   => 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm?download=true',
        'gemini'  => 'https://gemini.google.com/app',
    );
    ?>
    <style id="kp-local-ai-desktop-style">
      html.kp-local-desktop-ai .kp-ai-trigger,
      html.kp-local-desktop-ai .kp-ai-sheet,
      html.kp-local-desktop-ai .kp-ai-repair-sheet,
      html.kp-local-desktop-ai .kp-ai-repair-open,
      html.kp-local-desktop-ai .kp-mobile-live-trigger{display:none!important}
      .kp-local-ai-launch{position:fixed;right:18px;bottom:18px;z-index:2147482800;border:0;border-radius:999px;padding:12px 18px;background:#241d19;color:#fff;font:800 15px/1.2 system-ui,sans-serif;box-shadow:0 10px 32px rgba(0,0,0,.28);cursor:pointer}
      .kp-local-ai-panel{position:fixed;right:18px;bottom:72px;z-index:2147482799;width:min(430px,calc(100vw - 24px));max-height:min(690px,calc(100vh - 96px));display:none;flex-direction:column;border:1px solid rgba(255,255,255,.15);border-radius:18px;background:#1d1714;color:#fff;box-shadow:0 18px 50px rgba(0,0,0,.4);overflow:hidden;font:14px/1.4 system-ui,sans-serif}
      .kp-local-ai-panel.is-open{display:flex}
      .kp-local-ai-head{padding:13px 14px 10px;border-bottom:1px solid rgba(255,255,255,.12)}
      .kp-local-ai-head strong{display:block;font-size:16px}.kp-local-ai-state{margin-top:4px;color:#d8ccc5;font-size:12px}
      .kp-local-ai-install{margin:10px 14px 0;border:0;border-radius:10px;padding:10px 12px;background:#f3e7dc;color:#211814;font-weight:800;cursor:pointer}
      .kp-local-ai-log{min-height:150px;max-height:310px;margin:10px 14px 0;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
      .kp-local-ai-compose{display:flex;gap:7px;padding:10px 14px 0}.kp-local-ai-input{min-width:0;flex:1;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:10px;background:#2d2521;color:#fff;font:inherit}.kp-local-ai-send{border:0;border-radius:10px;padding:9px 12px;font-weight:800;cursor:pointer}
      .kp-local-ai-actions{display:flex;gap:7px;padding:8px 14px 14px}.kp-local-ai-emergency{flex:1;border:1px solid rgba(255,255,255,.22);border-radius:10px;padding:9px;background:transparent;color:#fff;font-weight:700;cursor:pointer}.kp-local-ai-close{border:0;border-radius:10px;padding:9px 12px;cursor:pointer}
      .kp-local-ai-panel button:disabled,.kp-local-ai-panel input:disabled{opacity:.5;cursor:not-allowed}
      @media(max-width:700px){.kp-local-ai-launch{right:12px;bottom:12px}.kp-local-ai-panel{right:12px;bottom:66px}}
    </style>
    <button type="button" class="kp-local-ai-launch" aria-expanded="false">✦ KI</button>
    <section class="kp-local-ai-panel" aria-label="Lokale Homepage-KI">
      <div class="kp-local-ai-head"><strong>Lokale Homepage-KI</strong><div class="kp-local-ai-state">Kostenlos · Modell läuft auf diesem PC</div></div>
      <button type="button" class="kp-local-ai-install">Lokale PC-KI laden (~2,0 GB)</button>
      <div class="kp-local-ai-log" aria-live="polite">KI: Schreib einfach, was an der Homepage geändert werden soll.</div>
      <div class="kp-local-ai-compose"><input class="kp-local-ai-input" type="text" placeholder="Änderungswunsch schreiben …" disabled><button type="button" class="kp-local-ai-send" disabled>Senden</button></div>
      <div class="kp-local-ai-actions"><button type="button" class="kp-local-ai-emergency">Notfall Gemini</button><button type="button" class="kp-local-ai-close">Schließen</button></div>
    </section>
    <script type="module" id="kp-local-ai-desktop-runtime">
    (()=>{
      'use strict';
      const cfg=<?php echo wp_json_encode( $config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;
      document.documentElement.classList.add('kp-local-desktop-ai');
      const launch=document.querySelector('.kp-local-ai-launch'),panel=document.querySelector('.kp-local-ai-panel'),state=document.querySelector('.kp-local-ai-state'),install=document.querySelector('.kp-local-ai-install'),log=document.querySelector('.kp-local-ai-log'),input=document.querySelector('.kp-local-ai-input'),send=document.querySelector('.kp-local-ai-send'),emergency=document.querySelector('.kp-local-ai-emergency'),close=document.querySelector('.kp-local-ai-close');
      if(!launch||!panel)return;
      let Engine=null,engine=null,busy=false,lastRequest='',history=[];
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const bridge=()=>window.KPRepairMobile?.ready?window.KPRepairMobile:null;
      const append=(who,text)=>{log.textContent+=`\n\n${who}: ${String(text||'').trim()}`;log.scrollTop=log.scrollHeight};
      const setBusy=value=>{busy=!!value;install.disabled=busy;input.disabled=busy||!engine;send.disabled=busy||!engine;emergency.disabled=busy};
      const explicitSave=text=>/\b(speicher(?:n|e|t)?|übernehm(?:en|e|t)?|dauerhaft|veröffentlich(?:en|e|t)?)\b/i.test(String(text||''));
      const jsonText=response=>String(response?.content?.find?.(part=>part?.type==='text')?.text||response?.content?.[0]?.text||'');
      const parseJson=text=>{const clean=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim(),a=clean.indexOf('{'),b=clean.lastIndexOf('}');if(a<0||b<=a)throw new Error('Die lokale KI hat keinen strukturierten Plan geliefert.');return JSON.parse(clean.slice(a,b+1))};
      const post=async(action,fields={})=>{const fd=new FormData();fd.append('action',action);fd.append('nonce',cfg.nonce);for(const[k,v]of Object.entries(fields))fd.append(k,typeof v==='string'?v:JSON.stringify(v));const response=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});const data=await response.json().catch(()=>null);if(!response.ok||!data?.success)throw new Error(data?.data?.message||'Homepage-Aufruf fehlgeschlagen.');return data.data||{}};
      const oneShot=async(system,prompt)=>{if(!engine)throw new Error('Lokale KI ist noch nicht geladen.');const conversation=await engine.createConversation({preface:{messages:[{role:'system',content:system}]}});try{return parseJson(jsonText(await conversation.sendMessage(prompt)))}finally{try{await conversation.delete?.()}catch{}}};

      async function ensureBridge(){for(let i=0;i<30;i++){if(bridge())return bridge();await wait(100)}throw new Error('Homepage-Editor ist noch nicht bereit. Seite bitte einmal neu laden.')}
      async function loadModel(){
        if(engine)return;
        if(!navigator.gpu)throw new Error('Die lokale PC-KI benötigt derzeit Chrome/Edge mit aktiviertem WebGPU. Der manuelle Editor funktioniert trotzdem.');
        setBusy(true);state.textContent='LiteRT-LM wird geladen …';append('System','Das lokale Modell wird geladen. Beim ersten Mal sind etwa 2,0 GB erforderlich.');
        try{
          if(!Engine){const mod=await import('https://cdn.jsdelivr.net/npm/@litert-lm/core/+esm');Engine=mod.Engine}
          state.textContent='Lokales Modell wird auf diesem PC vorbereitet …';
          engine=await Engine.create({model:cfg.model,mainExecutorSettings:{maxNumTokens:4096}});
          install.style.display='none';state.textContent='Lokale KI bereit · keine KI-API-Kosten';append('System','Lokale PC-KI ist bereit.');
        }catch(error){engine=null;state.textContent='Lokale KI konnte nicht geladen werden';throw error}finally{setBusy(false)}
      }

      const plannerSystem=`Du bist die lokale, kostenlose Homepage-KI der Koblenzer Puppenspiele. Antworte ausschließlich als JSON ohne Markdown:\n{"reply":"kurze deutsche Antwort","save":false,"actions":[{"type":"edit_element","live_id":"live-1","property":"text","value":"Neuer Text"},{"type":"set_global_design","key":"accent_color","value":"#D97706"},{"type":"undo"},{"type":"redo"},{"type":"save"},{"type":"request_code_change","description":"präzise technische Änderung"},{"type":"check_repair_status","pr":"123"},{"type":"merge_repair","pr":"123"}]}\nRegeln: höchstens 10 Aktionen. Nutze nur sichtbare live_id-Werte und angebotene Eigenschaften. Für normale Texte, Links, Größen, Abstände, Radius, Farben, Position, Reihenfolge und globale Designwerte direkte Aktionen. Für Editor-Bedienelemente, PHP/JavaScript/CSS, neue Funktionen oder nicht angebotene Eigenschaften request_code_change. Nie Erfolg erfinden. save nur wenn der Nutzer ausdrücklich speichern/übernehmen/dauerhaft verlangt. Generative Bildinhalte sind lokal noch nicht verfügbar; dafür in reply Notfall Gemini nennen.`;
      const selectSystem=`Du bist ein lokaler Code-Diagnostiker. Antworte ausschließlich als JSON ohne Markdown: {"reply":"kurz","diagnosis":"präzise Diagnose","confidence":"low|medium|high","files":["pfad1","pfad2"]}. Wähle höchstens 3 Dateien und ausschließlich Pfade aus dem Katalog. Bevorzuge die kleinste plausible Menge. Keine Secrets erfinden.`;
      const patchSystem=`Du bist ein lokaler sicherer Code-Patcher. Antworte ausschließlich als JSON ohne Markdown: {"summary":"kurz","diagnosis":"warum","risk":"low|medium|high","tests":["Test 1"],"changes":[{"path":"exakter Pfad","reason":"warum","operations":[{"search":"exakter vorhandener Block","replace":"vollständiger Ersatzblock"}]}]}. Höchstens 4 Dateien und 8 Operationen je Datei. search muss exakt aus dem gelieferten Code stammen. Ändere minimal. Entferne niemals Berechtigungs-, Nonce-, Authentifizierungs- oder Sicherheitsprüfungen. Keine eval/shell/system-Aufrufe, keine Secrets, keine erfundenen Dateien. Wenn der Code nicht reicht, changes leer.`;

      async function prepareCodeRepair(description,kp){
        state.textContent='Lokale KI untersucht den Code …';
        const ctx=await post('kp_local_ai_repair_context',{request:description,browser:JSON.stringify(kp.context())});
        if(!ctx.catalog)throw new Error('Kein sicherer Codekatalog verfügbar.');
        const selection=await oneShot(selectSystem,`AUFGABE:\n${description}\n\nBROWSER/SEITE:\n${ctx.browser||''}\n\nDEBUG:\n${ctx.debug_tail||''}\n\nERLAUBTE DATEIEN:\n${ctx.catalog}`);
        const paths=Array.isArray(selection.files)?selection.files.slice(0,3).filter(Boolean):[];
        if(!paths.length)throw new Error(selection.reply||'Keine passende Reparaturdatei gefunden.');
        state.textContent=`Lokale KI liest ${paths.length} Reparaturdatei(en) …`;
        const files=await post('kp_local_ai_repair_files',{paths:JSON.stringify(paths)});
        const plan=await oneShot(patchSystem,`AUFGABE:\n${description}\n\nDIAGNOSE:\n${selection.diagnosis||''}\n\nDATEIINHALTE:\n${JSON.stringify(files)}`);
        const proposal=await post('kp_local_ai_repair_proposal',{plan:JSON.stringify(plan)});
        if(!proposal.proposal_id)return proposal.message||'Die lokale KI konnte keinen sicheren Patch vorbereiten.';
        const allow=confirm(`${proposal.summary||'Lokale Code-Reparatur'}\n\nRisiko: ${proposal.risk||'medium'}\n\nPrüfbranch mit CI erstellen? Live-Dateien werden nicht direkt geändert.`);
        if(!allow)return 'Code-Vorschlag vorbereitet; Prüfbranch wurde nicht erstellt.';
        const pr=await post('kp_ai_repair_create_pr',{proposal_id:proposal.proposal_id});
        return `Code-Reparatur als Prüfbranch angelegt${pr.pr||pr.number?` (PR #${pr.pr||pr.number})`:''}. Vor der Übernahme muss CI grün sein und der Merge erneut bestätigt werden.${pr.url?`\n${pr.url}`:''}`;
      }

      async function runRequest(text){
        const kp=await ensureBridge();
        state.textContent='Lokale KI untersucht die Homepage …';
        const page=kp.context(),elements=kp.editableElements(),caps={success:true,deterministicEditor:!!kp.editElement,globalDesign:!!kp.setDesign,save:!!kp.saveChanges,undo:!!kp.undo,redo:!!kp.redo,localTechnicalRepair:true};
        const prior=history.slice(-4).map(t=>`NUTZER: ${t.user}\nKI: ${t.assistant}`).join('\n');
        const prompt=`AKTUELLER WUNSCH:\n${text}\n\nLETZTE UNTERHALTUNG:\n${prior||'Noch keine.'}\n\nSEITENKONTEXT:\n${JSON.stringify(page)}\n\nSICHTBARE ELEMENTE:\n${JSON.stringify(elements)}\n\nEDITOR-FÄHIGKEITEN:\n${JSON.stringify(caps)}\n\nLiefere ausschließlich den JSON-Plan. Nutze live_id exakt aus den sichtbaren Elementen.`;
        state.textContent='Lokale KI denkt …';
        const plan=await oneShot(plannerSystem,prompt),results=[];let codeRequest='';
        for(const action of (Array.isArray(plan.actions)?plan.actions:[]).slice(0,10)){
          if(!action||typeof action!=='object')continue;
          if(action.type==='edit_element'){
            const out=await kp.editElement(String(action.live_id||''),String(action.property||''),String(action.value??''));results.push(out);if(out?.codeRequired&&!codeRequest)codeRequest=`${text}. Direkte Editoränderung war nicht verfügbar: ${JSON.stringify(out)}`;
          }else if(action.type==='set_global_design'){
            const out=await kp.setDesign(String(action.key||''),String(action.value??''));results.push(out);if(out?.codeRequired&&!codeRequest)codeRequest=`${text}. Designsteuerung war nicht verfügbar: ${JSON.stringify(out)}`;
          }else if(action.type==='undo')results.push(await kp.undo());
          else if(action.type==='redo')results.push(await kp.redo());
          else if(action.type==='save'){if(explicitSave(text))results.push(await kp.saveChanges())}
          else if(action.type==='request_code_change'&&!codeRequest)codeRequest=String(action.description||text);
          else if(action.type==='check_repair_status')results.push(await post('kp_ai_repair_status',{pr:String(action.pr||'')}));
          else if(action.type==='merge_repair'){
            const pr=String(action.pr||'');if(pr&&confirm(`PR #${pr} übernehmen? Der Server führt den Merge nur bei grüner CI aus.`))results.push(await post('kp_ai_repair_merge',{pr}));
          }
        }
        if(plan.save&&explicitSave(text))results.push(await kp.saveChanges());
        let repair='';if(codeRequest){try{repair=await prepareCodeRepair(codeRequest,kp)}catch(error){repair=`Lokale Code-Reparatur konnte nicht sicher vorbereitet werden: ${error.message}. Dafür kannst du Notfall Gemini verwenden.`}}
        const reply=String(plan.reply||'').trim()||(results.length?'Die gewünschte Änderung wurde im Editor vorbereitet.':'Bitte beschreib die Änderung noch etwas genauer.');
        const final=[reply,repair].filter(Boolean).join('\n\n');history.push({user:text.slice(0,1200),assistant:final.slice(0,2400)});if(history.length>6)history.shift();return final;
      }

      async function sendRequest(){if(busy)return;const text=input.value.trim();if(!text)return;if(!engine){append('System','Bitte zuerst die lokale PC-KI laden.');return}lastRequest=text;input.value='';append('Du',text);setBusy(true);try{append('KI',await runRequest(text));state.textContent='Lokale KI bereit · kostenlos auf diesem PC'}catch(error){append('KI',`Fehler: ${error.message||error}`);state.textContent='Lokale KI: Fehler'}finally{setBusy(false)}}
      async function emergencyGemini(){if(busy)return;const request=input.value.trim()||lastRequest;if(!request){append('System','Schreib zuerst die Aufgabe ins Feld.');return}setBusy(true);try{const kp=await ensureBridge(),prompt=`Ich bearbeite die Homepage der Koblenzer Puppenspiele. Aufgabe:\n\n${request}\n\nSeitenkontext:\n${JSON.stringify(kp.context())}\n\nSichtbare Elemente:\n${JSON.stringify(kp.editableElements())}\n\nBitte antworte konkret auf Deutsch. Wenn Code nötig ist, nenne betroffene Dateien und liefere kleine sichere Änderungen. Entferne keine Auth-/Nonce-/Sicherheitsprüfungen.`;await navigator.clipboard.writeText(prompt);append('System','Aufgabe samt Seitenkontext wurde kopiert. In Gemini nur noch Einfügen drücken.');window.open(cfg.gemini,'_blank','noopener');state.textContent='Notfall Gemini geöffnet · Aufgabe kopiert'}catch(error){append('System',`Notfall Gemini: ${error.message||error}`)}finally{setBusy(false)}}

      launch.addEventListener('click',()=>{const open=!panel.classList.contains('is-open');panel.classList.toggle('is-open',open);launch.setAttribute('aria-expanded',String(open));launch.textContent=open?'✕ KI':'✦ KI';if(open&&engine)input.focus()});
      close.addEventListener('click',()=>{panel.classList.remove('is-open');launch.setAttribute('aria-expanded','false');launch.textContent='✦ KI'});
      install.addEventListener('click',()=>loadModel().catch(error=>{append('System',error.message||String(error));state.textContent='Lokale KI konnte nicht geladen werden';setBusy(false)}));
      send.addEventListener('click',sendRequest);input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendRequest()}});emergency.addEventListener('click',emergencyGemini);
      setBusy(false);
    })();
    </script>
    <?php
}, 2320 );
