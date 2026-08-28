<?php
/**
 * Desktop-only local Homepage AI.
 *
 * Chrome talks only to a loopback companion on the owner's laptop. The companion
 * runs Gemma through local Ollama, can receive a current screen-share frame and
 * applies narrowly validated search/replace patches to the local website repo.
 * No Gemini/OpenAI API is used by this desktop flow.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() ) { return; }
    $can_repair = function_exists( 'kp_ai_repair_can_use' ) ? kp_ai_repair_can_use() : current_user_can( 'edit_pages' );
    if ( ! $can_repair ) { return; }
    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
    if ( str_contains( $ua, 'KoblenzerPuppenspieleTechnician/' ) ) { return; }

    $config = array(
        'agentUrl' => 'http://127.0.0.1:8765',
        'model'    => 'gemma3:4b',
    );
    ?>
    <style id="kp-local-ai-desktop-style">
      html.kp-local-desktop-ai .kp-ai-trigger,
      html.kp-local-desktop-ai .kp-ai-sheet,
      html.kp-local-desktop-ai .kp-ai-repair-sheet,
      html.kp-local-desktop-ai .kp-ai-repair-open,
      html.kp-local-desktop-ai .kp-mobile-live-trigger{display:none!important}
      .kp-local-ai-launch{position:fixed;right:18px;bottom:18px;z-index:2147482800;border:0;border-radius:999px;padding:12px 18px;background:#241d19;color:#fff;font:800 15px/1.2 system-ui,sans-serif;box-shadow:0 10px 32px rgba(0,0,0,.28);cursor:pointer}
      .kp-local-ai-panel{position:fixed;right:18px;bottom:72px;z-index:2147482799;width:min(470px,calc(100vw - 24px));max-height:min(760px,calc(100vh - 96px));display:none;flex-direction:column;border:1px solid rgba(255,255,255,.15);border-radius:18px;background:#1d1714;color:#fff;box-shadow:0 18px 50px rgba(0,0,0,.4);overflow:hidden;font:14px/1.4 system-ui,sans-serif}
      .kp-local-ai-panel.is-open{display:flex}.kp-local-ai-head{padding:13px 14px 10px;border-bottom:1px solid rgba(255,255,255,.12)}
      .kp-local-ai-head strong{display:block;font-size:16px}.kp-local-ai-state{margin-top:4px;color:#d8ccc5;font-size:12px}.kp-local-ai-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.kp-local-ai-badge{padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.09);font-size:11px}.kp-local-ai-badge.is-on{background:#315d37}.kp-local-ai-badge.is-warn{background:#6d5325}
      .kp-local-ai-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:10px 14px 0}.kp-local-ai-tools button,.kp-local-ai-actions button{border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:9px 10px;background:#2d2521;color:#fff;font-weight:800;cursor:pointer}.kp-local-ai-connect{background:#f3e7dc!important;color:#211814!important}.kp-local-ai-share.is-on,.kp-local-ai-mic.is-on,.kp-local-ai-speak.is-on{background:#315d37!important}
      .kp-local-ai-preview{display:none;margin:9px 14px 0;border-radius:10px;overflow:hidden;background:#000;max-height:135px}.kp-local-ai-preview.is-on{display:block}.kp-local-ai-preview video{display:block;width:100%;max-height:135px;object-fit:cover}
      .kp-local-ai-log{min-height:150px;max-height:300px;margin:10px 14px 0;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
      .kp-local-ai-compose{display:flex;gap:7px;padding:10px 14px 0}.kp-local-ai-input{min-width:0;flex:1;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:10px;background:#2d2521;color:#fff;font:inherit}.kp-local-ai-send{border:0;border-radius:10px;padding:9px 12px;font-weight:800;cursor:pointer}
      .kp-local-ai-actions{display:flex;gap:7px;padding:8px 14px 14px}.kp-local-ai-actions button{flex:1}.kp-local-ai-panel button:disabled,.kp-local-ai-panel input:disabled{opacity:.5;cursor:not-allowed}
      @media(max-width:700px){.kp-local-ai-launch{right:12px;bottom:12px}.kp-local-ai-panel{right:12px;bottom:66px}}
    </style>
    <button type="button" class="kp-local-ai-launch" aria-expanded="false">✦ KI</button>
    <section class="kp-local-ai-panel" aria-label="Lokale Homepage-KI">
      <div class="kp-local-ai-head">
        <strong>Lokale Homepage-KI</strong>
        <div class="kp-local-ai-state">Laptop-Agent verbinden · Gemma läuft lokal</div>
        <div class="kp-local-ai-badges"><span class="kp-local-ai-badge kp-local-ai-agent-badge">Agent aus</span><span class="kp-local-ai-badge kp-local-ai-screen-badge">Bild aus</span><span class="kp-local-ai-badge">Android gesperrt</span></div>
      </div>
      <div class="kp-local-ai-tools">
        <button type="button" class="kp-local-ai-connect">Laptop-Agent verbinden</button>
        <button type="button" class="kp-local-ai-share">Bildschirm/Tab/Fenster</button>
        <button type="button" class="kp-local-ai-mic">🎙 Sprache</button>
        <button type="button" class="kp-local-ai-speak">🔊 Antworten</button>
      </div>
      <div class="kp-local-ai-preview"><video class="kp-local-ai-video" muted autoplay playsinline></video></div>
      <div class="kp-local-ai-log" aria-live="polite">KI: Verbinde zuerst den lokalen Laptop-Agenten. Danach kannst du tippen, sprechen und optional Bildschirm, Tab oder Fenster teilen.</div>
      <div class="kp-local-ai-compose"><input class="kp-local-ai-input" type="text" placeholder="Was soll ich an der Homepage ändern?" disabled><button type="button" class="kp-local-ai-send" disabled>Senden</button></div>
      <div class="kp-local-ai-actions"><button type="button" class="kp-local-ai-stop-share">Freigabe stoppen</button><button type="button" class="kp-local-ai-close">Schließen</button></div>
    </section>
    <script id="kp-local-ai-desktop-runtime">
    (()=>{
      'use strict';
      const cfg=<?php echo wp_json_encode( $config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;
      document.documentElement.classList.add('kp-local-desktop-ai');
      const $=selector=>document.querySelector(selector);
      const launch=$('.kp-local-ai-launch'),panel=$('.kp-local-ai-panel'),state=$('.kp-local-ai-state'),connect=$('.kp-local-ai-connect'),share=$('.kp-local-ai-share'),mic=$('.kp-local-ai-mic'),speak=$('.kp-local-ai-speak'),log=$('.kp-local-ai-log'),input=$('.kp-local-ai-input'),send=$('.kp-local-ai-send'),stopShare=$('.kp-local-ai-stop-share'),close=$('.kp-local-ai-close'),video=$('.kp-local-ai-video'),preview=$('.kp-local-ai-preview'),agentBadge=$('.kp-local-ai-agent-badge'),screenBadge=$('.kp-local-ai-screen-badge');
      if(!launch||!panel)return;
      let agentReady=false,busy=false,screenStream=null,recognition=null,speakReplies=false,lastRequest='',history=[];
      const bridge=()=>window.KPRepairMobile?.ready?window.KPRepairMobile:null;
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const append=(who,text)=>{log.textContent+=`\n\n${who}: ${String(text||'').trim()}`;log.scrollTop=log.scrollHeight};
      const setBusy=value=>{busy=!!value;connect.disabled=busy;share.disabled=busy;mic.disabled=busy;input.disabled=busy||!agentReady;send.disabled=busy||!agentReady};
      const explicitSave=text=>/\b(speicher(?:n|e|t)?|übernehm(?:en|e|t)?|dauerhaft|veröffentlich(?:en|e|t)?)\b/i.test(String(text||''));
      const parseJson=text=>{const clean=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim(),a=clean.indexOf('{'),b=clean.lastIndexOf('}');if(a<0||b<=a)throw new Error('Gemma hat keinen strukturierten JSON-Plan geliefert.');return JSON.parse(clean.slice(a,b+1))};
      async function agent(pathname,options={}){const response=await fetch(cfg.agentUrl+pathname,{method:options.method||'GET',mode:'cors',cache:'no-store',headers:{'Content-Type':'application/json','X-KP-Desktop-Agent':'1'},body:options.body===undefined?undefined:JSON.stringify(options.body)});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(data?.error||`Laptop-Agent HTTP ${response.status}`);return data}
      async function gemma(system,prompt,image=''){const messages=[{role:'system',content:system},{role:'user',content:prompt,...(image?{images:[image]}:{})}];return parseJson((await agent('/v1/chat',{method:'POST',body:{messages}})).content)}
      async function ensureBridge(){for(let i=0;i<30;i++){if(bridge())return bridge();await wait(100)}throw new Error('Homepage-Editor ist noch nicht bereit. Seite bitte einmal neu laden.')}
      function say(text){if(!speakReplies||!('speechSynthesis' in window))return;window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(String(text||'').replace(/\n+/g,' ').slice(0,900));utterance.lang='de-DE';window.speechSynthesis.speak(utterance)}

      async function connectAgent(){setBusy(true);state.textContent='Lokaler Laptop-Agent wird geprüft …';try{const health=await agent('/v1/health');if(!health.repoOk)throw new Error('Der Agent findet das lokale Git-Repository nicht.');if(!health.ollama)throw new Error(`Ollama ist nicht erreichbar. Starte Ollama und installiere ${health.model||cfg.model}.`);agentReady=true;agentBadge.textContent=`Agent an · ${health.model||cfg.model}`;agentBadge.classList.add('is-on');connect.textContent='Agent verbunden';state.textContent='Bereit · Gemma lokal · keine Gemini/OpenAI-API';append('System',`Laptop-Agent verbunden. Gemma: ${health.model||cfg.model}. Android-Schreibzugriff: AUS.`)}catch(error){agentReady=false;agentBadge.textContent='Agent aus';agentBadge.classList.remove('is-on');state.textContent='Laptop-Agent nicht erreichbar';append('System',`${error.message||error}\nLokal starten: node desktop/homepage-agent/server.mjs`)}finally{setBusy(false)}}

      async function startShare(){if(screenStream){stopScreenShare();return}if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('Dieser Browser unterstützt die Bildschirmfreigabe nicht.');screenStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:4,max:8}},audio:false,preferCurrentTab:false});video.srcObject=screenStream;preview.classList.add('is-on');share.classList.add('is-on');share.textContent='Freigabe läuft';screenBadge.textContent='Bild live';screenBadge.classList.add('is-on');state.textContent='Bildschirm/Tab/Fenster wird lokal an Gemma geteilt';screenStream.getVideoTracks()[0]?.addEventListener('ended',stopScreenShare,{once:true});}
      function stopScreenShare(){if(screenStream){for(const track of screenStream.getTracks())track.stop()}screenStream=null;video.srcObject=null;preview.classList.remove('is-on');share.classList.remove('is-on');share.textContent='Bildschirm/Tab/Fenster';screenBadge.textContent='Bild aus';screenBadge.classList.remove('is-on')}
      function currentFrame(){if(!screenStream||!video.videoWidth||!video.videoHeight)return'';const maxWidth=1280,scale=Math.min(1,maxWidth/video.videoWidth),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.72).split(',')[1]||''}

      function toggleSpeech(){const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){append('System','Chrome-Spracherkennung ist auf diesem Rechner nicht verfügbar. Tippen funktioniert weiterhin.');return}if(recognition){try{recognition.stop()}catch{}return}recognition=new Recognition();recognition.lang='de-DE';recognition.interimResults=true;recognition.continuous=false;let finalText='';mic.classList.add('is-on');mic.textContent='🎙 Höre zu …';state.textContent='Ich höre zu …';recognition.onresult=event=>{let interim='';for(let i=event.resultIndex;i<event.results.length;i++){const text=event.results[i][0]?.transcript||'';if(event.results[i].isFinal)finalText+=text;else interim+=text}input.value=(finalText||interim).trim()};recognition.onerror=event=>append('System',`Sprache: ${event.error||'Fehler'}`);recognition.onend=()=>{recognition=null;mic.classList.remove('is-on');mic.textContent='🎙 Sprache';state.textContent=agentReady?'Bereit · Gemma lokal':'Laptop-Agent verbinden';if(finalText.trim()){input.value=finalText.trim();sendRequest()}};recognition.start()}

      const plannerSystem=`Du bist die lokale Homepage-KI der Koblenzer Puppenspiele. Du läufst als Gemma vollständig lokal. Antworte ausschließlich als JSON ohne Markdown: {"reply":"kurze deutsche Antwort","save":false,"actions":[{"type":"edit_element","live_id":"live-1","property":"text","value":"Neuer Text"},{"type":"set_global_design","key":"accent_color","value":"#D97706"},{"type":"undo"},{"type":"redo"},{"type":"save"},{"type":"request_code_change","description":"präzise technische Änderung"}]}. Regeln: höchstens 10 Aktionen. Nutze nur sichtbare live_id-Werte. Für normale Texte, Links, Größen, Abstände, Radius, Farben, Position, Reihenfolge und globale Designwerte direkte Aktionen. Für PHP/JavaScript/CSS, neue Funktionen oder nicht angebotene Eigenschaften request_code_change. Nie Erfolg erfinden. save nur wenn ausdrücklich speichern/übernehmen/dauerhaft verlangt. Wenn ein Bild beigefügt ist, ist es der aktuelle Frame der freiwilligen Bildschirm-/Tab-/Fensterfreigabe. Android-Code ist vollständig außerhalb deiner Aufgabe und darf nie ausgewählt oder verändert werden.`;
      const selectSystem=`Du bist ein lokaler Code-Diagnostiker. Antworte ausschließlich als JSON ohne Markdown: {"reply":"kurz","diagnosis":"präzise Diagnose","confidence":"low|medium|high","files":["pfad1","pfad2"]}. Wähle höchstens 5 existierende Website-Dateien aus dem gelieferten Katalog. Nie android/**, qa/mobile-*, qa/*android*, wp-content/mu-plugins/kp-mobile-* oder Android-Workflows wählen. Bevorzuge die kleinste plausible Dateimenge.`;
      const patchSystem=`Du bist ein lokaler sicherer Code-Patcher. Antworte ausschließlich als JSON ohne Markdown: {"summary":"kurz","diagnosis":"warum","risk":"low|medium|high","tests":["Test"],"changes":[{"path":"exakter Pfad","reason":"warum","operations":[{"search":"exakter vorhandener Block","replace":"vollständiger Ersatzblock"}]}]}. Höchstens 5 Dateien und 10 Operationen pro Datei. search muss exakt und eindeutig im gelieferten Code vorkommen. Ändere minimal. Entferne niemals Berechtigungs-, Nonce-, Authentifizierungs- oder Sicherheitsprüfungen. Keine eval/shell/system-Aufrufe, keine Secrets. Android und mobile App-Dateien sind verboten. Wenn der Code nicht reicht, changes leer.`;

      async function prepareCodeRepair(description,kp){
        state.textContent='Lokaler Code-Agent untersucht das Repository …';
        const catalog=(await agent('/v1/catalog')).files||[];
        if(!catalog.length)throw new Error('Der lokale Agent findet keinen erlaubten Website-Code.');
        const selection=await gemma(selectSystem,`AUFGABE:\n${description}\n\nSEITE:\n${JSON.stringify(kp.context())}\n\nERLAUBTER LOKALER DATEIKATALOG:\n${catalog.join('\n')}`);
        const paths=(Array.isArray(selection.files)?selection.files:[]).slice(0,5).filter(Boolean);
        if(!paths.length)throw new Error(selection.reply||'Gemma hat keine passende Website-Datei gewählt.');
        state.textContent=`Lokaler Agent liest ${paths.length} Datei(en) …`;
        const files=(await agent('/v1/files',{method:'POST',body:{paths}})).files||[];
        const plan=await gemma(patchSystem,`AUFGABE:\n${description}\n\nDIAGNOSE:\n${selection.diagnosis||''}\n\nDATEIINHALTE:\n${JSON.stringify(files)}`);
        const changes=Array.isArray(plan.changes)?plan.changes:[];
        if(!changes.length)return plan.summary||'Gemma konnte aus dem gelesenen Code keinen sicheren Patch ableiten.';
        const names=changes.map(change=>change.path).join('\n');
        if(!confirm(`${plan.summary||'Lokale Code-Änderung'}\n\nDateien:\n${names}\n\nRisiko: ${plan.risk||'medium'}\n\nJetzt wirklich im lokalen Website-Repository ändern?`))return 'Code-Patch wurde verworfen; lokale Dateien blieben unverändert.';
        state.textContent='Lokaler Code-Agent schreibt und prüft die Änderung …';
        const result=(await agent('/v1/apply',{method:'POST',body:{plan}})).result||{};
        const testSummary=(result.tests||[]).map(test=>`${test.ok?'✓':'✗'} ${test.name}`).join('\n');
        return `Lokaler Website-Code geändert:\n${(result.changed||[]).join('\n')}${testSummary?`\n\nPrüfungen:\n${testSummary}`:''}\n\nDie Änderung liegt jetzt als echter lokaler Git-Diff vor. Android wurde nicht angefasst.`;
      }

      async function runRequest(text){
        const kp=await ensureBridge();
        state.textContent='Gemma untersucht Homepage und Freigabe …';
        const page=kp.context(),elements=kp.editableElements(),caps={deterministicEditor:!!kp.editElement,globalDesign:!!kp.setDesign,save:!!kp.saveChanges,undo:!!kp.undo,redo:!!kp.redo,localCodeAgent:true,screenShared:!!screenStream};
        const prior=history.slice(-4).map(item=>`NUTZER: ${item.user}\nKI: ${item.assistant}`).join('\n');
        const prompt=`AKTUELLER WUNSCH:\n${text}\n\nLETZTE UNTERHALTUNG:\n${prior||'Noch keine.'}\n\nSEITENKONTEXT:\n${JSON.stringify(page)}\n\nSICHTBARE EDITIERBARE ELEMENTE:\n${JSON.stringify(elements)}\n\nFÄHIGKEITEN:\n${JSON.stringify(caps)}\n\nLiefere ausschließlich den JSON-Plan.`;
        const plan=await gemma(plannerSystem,prompt,currentFrame()),results=[];let codeRequest='';
        for(const action of (Array.isArray(plan.actions)?plan.actions:[]).slice(0,10)){
          if(!action||typeof action!=='object')continue;
          if(action.type==='edit_element'){const out=await kp.editElement(String(action.live_id||''),String(action.property||''),String(action.value??''));results.push(out);if(out?.codeRequired&&!codeRequest)codeRequest=`${text}. Direkte Editoränderung war nicht verfügbar: ${JSON.stringify(out)}`}
          else if(action.type==='set_global_design'){const out=await kp.setDesign(String(action.key||''),String(action.value??''));results.push(out);if(out?.codeRequired&&!codeRequest)codeRequest=`${text}. Designsteuerung war nicht verfügbar: ${JSON.stringify(out)}`}
          else if(action.type==='undo')results.push(await kp.undo());
          else if(action.type==='redo')results.push(await kp.redo());
          else if(action.type==='save'){if(explicitSave(text))results.push(await kp.saveChanges())}
          else if(action.type==='request_code_change'&&!codeRequest)codeRequest=String(action.description||text);
        }
        if(plan.save&&explicitSave(text))results.push(await kp.saveChanges());
        let repair='';if(codeRequest){try{repair=await prepareCodeRepair(codeRequest,kp)}catch(error){repair=`Lokaler Code-Agent: ${error.message||error}`}}
        const reply=String(plan.reply||'').trim()||(results.length?'Die gewünschte Änderung wurde vorbereitet.':'Beschreib bitte konkret, was geändert werden soll.');
        const final=[reply,repair].filter(Boolean).join('\n\n');history.push({user:text.slice(0,1200),assistant:final.slice(0,2600)});if(history.length>6)history.shift();return final;
      }

      async function sendRequest(){if(busy)return;const text=input.value.trim();if(!text)return;if(!agentReady){append('System','Bitte zuerst den Laptop-Agenten verbinden.');return}lastRequest=text;input.value='';append('Du',text);setBusy(true);try{const answer=await runRequest(text);append('KI',answer);say(answer);state.textContent=screenStream?'Bereit · Gemma lokal · Bildfreigabe aktiv':'Bereit · Gemma lokal'}catch(error){append('KI',`Fehler: ${error.message||error}`);state.textContent='Lokale KI: Fehler'}finally{setBusy(false)}}

      launch.addEventListener('click',()=>{const open=!panel.classList.contains('is-open');panel.classList.toggle('is-open',open);launch.setAttribute('aria-expanded',String(open));launch.textContent=open?'✕ KI':'✦ KI';if(open&&!agentReady)connectAgent();else if(open)input.focus()});
      close.addEventListener('click',()=>{panel.classList.remove('is-open');launch.setAttribute('aria-expanded','false');launch.textContent='✦ KI'});
      connect.addEventListener('click',connectAgent);share.addEventListener('click',()=>startShare().catch(error=>append('System',error.message||String(error))));stopShare.addEventListener('click',stopScreenShare);mic.addEventListener('click',toggleSpeech);speak.addEventListener('click',()=>{speakReplies=!speakReplies;speak.classList.toggle('is-on',speakReplies);speak.textContent=speakReplies?'🔊 Antworten an':'🔊 Antworten'});send.addEventListener('click',sendRequest);input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendRequest()}});window.addEventListener('pagehide',stopScreenShare);setBusy(false);
    })();
    </script>
    <?php
}, 2320 );
