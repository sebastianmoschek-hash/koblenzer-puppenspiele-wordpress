<?php
/**
 * Robust desktop takeover for the owner KI button.
 *
 * This intentionally avoids the legacy Gemini/repair capability gate. On the
 * authenticated desktop owner editor it replaces the old KI surface with a
 * browser-to-loopback Gemma UI. Android technician code is never touched.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( is_admin() || ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    $edit_mode = isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    if ( ! $edit_mode ) { return; }
    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
    if ( false !== strpos( $ua, 'KoblenzerPuppenspieleTechnician/' ) ) { return; }

    $config = array(
        'agentUrl' => 'http://127.0.0.1:8765',
        'model'    => 'gemma3:4b',
    );
    ?>
    <style id="kp-local-ai-takeover-style">
      html.kp-local-ai-takeover .kp-ai-trigger,
      html.kp-local-ai-takeover .kp-ai-sheet,
      html.kp-local-ai-takeover .kp-ai-repair-sheet,
      html.kp-local-ai-takeover .kp-ai-repair-open,
      html.kp-local-ai-takeover .kp-mobile-live-trigger,
      html.kp-local-ai-takeover .kp-local-ai-launch,
      html.kp-local-ai-takeover .kp-local-ai-panel{display:none!important}
      .kp-lat-launch{position:fixed;right:18px;bottom:18px;z-index:2147483600;min-width:132px;border:0;border-radius:999px;padding:14px 22px;background:#f47b20;color:#fff;font:850 16px/1.15 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.34);cursor:pointer}
      .kp-lat-panel{position:fixed;right:14px;top:14px;bottom:76px;z-index:2147483599;width:min(560px,calc(100vw - 28px));display:none;grid-template-rows:auto auto minmax(130px,1fr) auto auto;border:1px solid rgba(255,255,255,.14);border-radius:22px;background:#17110e;color:#f8f2ed;box-shadow:0 26px 80px rgba(0,0,0,.55);overflow:hidden;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
      .kp-lat-panel.is-open{display:grid}.kp-lat-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 17px 13px;border-bottom:1px solid rgba(255,255,255,.12)}.kp-lat-head strong{display:block;font-size:20px}.kp-lat-sub{margin-top:3px;color:#cdbfb5;font-size:12px}.kp-lat-close{border:0;border-radius:12px;background:rgba(255,255,255,.08);color:#fff;font-size:24px;line-height:1;padding:8px 11px;cursor:pointer}
      .kp-lat-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 16px 0}.kp-lat-tools button,.kp-lat-actions button{min-height:42px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#2b231f;color:#fff;font-weight:800;cursor:pointer}.kp-lat-connect{background:#f1e5da!important;color:#211914!important}.kp-lat-tools button.is-on{background:#315d37!important}
      .kp-lat-log{margin:12px 16px 0;padding:13px;border-radius:14px;background:rgba(255,255,255,.06);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.kp-lat-preview{display:none;margin:10px 16px 0;border-radius:12px;overflow:hidden;background:#000;max-height:130px}.kp-lat-preview.is-on{display:block}.kp-lat-preview video{display:block;width:100%;max-height:130px;object-fit:cover}
      .kp-lat-compose{display:flex;gap:8px;padding:12px 16px 0}.kp-lat-input{min-width:0;flex:1;border:1px solid rgba(255,255,255,.18);border-radius:13px;padding:11px 12px;background:#0f0c0a;color:#fff;font:inherit}.kp-lat-send{border:0;border-radius:13px;padding:10px 16px;background:#f47b20;color:#fff;font-weight:850;cursor:pointer}.kp-lat-actions{display:flex;gap:8px;padding:9px 16px 16px}.kp-lat-actions button{flex:1}.kp-lat-panel button:disabled,.kp-lat-panel input:disabled{opacity:.48;cursor:not-allowed}.kp-lat-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.kp-lat-badge{padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.09);font-size:11px}.kp-lat-badge.is-on{background:#315d37}
      @media(max-width:900px){.kp-lat-launch,.kp-lat-panel{display:none!important}}
    </style>
    <button type="button" class="kp-lat-launch" aria-expanded="false">✦ Lokale KI</button>
    <section class="kp-lat-panel" aria-label="Lokale Homepage-KI">
      <div class="kp-lat-head"><div><strong>Lokale Homepage-KI</strong><div class="kp-lat-sub">Gemma auf diesem Laptop · keine Gemini/OpenAI-API</div><div class="kp-lat-badges"><span class="kp-lat-badge kp-lat-agent-badge">Agent aus</span><span class="kp-lat-badge kp-lat-screen-badge">Bild aus</span><span class="kp-lat-badge">Android gesperrt</span></div></div><button type="button" class="kp-lat-close" aria-label="Schließen">×</button></div>
      <div><div class="kp-lat-tools"><button type="button" class="kp-lat-connect">Laptop-Agent verbinden</button><button type="button" class="kp-lat-share">Bildschirm/Tab/Fenster</button><button type="button" class="kp-lat-mic">🎙 Sprache</button><button type="button" class="kp-lat-speak">🔊 Antworten</button></div><div class="kp-lat-preview"><video class="kp-lat-video" muted autoplay playsinline></video></div></div>
      <div class="kp-lat-log" aria-live="polite">KI: Öffne die lokale KI. Ich verbinde mich dann mit Gemma auf diesem Laptop.</div>
      <div class="kp-lat-compose"><input class="kp-lat-input" type="text" placeholder="Was soll ich erklären, ändern oder reparieren?" disabled><button type="button" class="kp-lat-send" disabled>Senden</button></div>
      <div class="kp-lat-actions"><button type="button" class="kp-lat-stop">Freigabe stoppen</button><button type="button" class="kp-lat-reconnect">Neu verbinden</button></div>
    </section>
    <script id="kp-local-ai-desktop-takeover-runtime">
    (()=>{
      'use strict';
      if(matchMedia('(max-width:900px)').matches)return;
      const cfg=<?php echo wp_json_encode( $config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;
      document.documentElement.classList.add('kp-local-ai-takeover');
      const q=s=>document.querySelector(s), launch=q('.kp-lat-launch'), panel=q('.kp-lat-panel'), close=q('.kp-lat-close'), connect=q('.kp-lat-connect'), reconnect=q('.kp-lat-reconnect'), share=q('.kp-lat-share'), mic=q('.kp-lat-mic'), speak=q('.kp-lat-speak'), log=q('.kp-lat-log'), input=q('.kp-lat-input'), send=q('.kp-lat-send'), stop=q('.kp-lat-stop'), video=q('.kp-lat-video'), preview=q('.kp-lat-preview'), agentBadge=q('.kp-lat-agent-badge'), screenBadge=q('.kp-lat-screen-badge');
      if(!launch||!panel)return;
      let ready=false,busy=false,stream=null,recognition=null,speakReplies=false,history=[];
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const append=(who,text)=>{log.textContent+=`\n\n${who}: ${String(text||'').trim()}`;log.scrollTop=log.scrollHeight};
      const setBusy=v=>{busy=!!v;[connect,reconnect,share,mic,send].forEach(b=>{if(b)b.disabled=busy});input.disabled=busy||!ready;send.disabled=busy||!ready};
      const parseJson=text=>{const clean=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim(),a=clean.indexOf('{'),b=clean.lastIndexOf('}');if(a<0||b<=a)throw new Error('Gemma hat keinen gültigen JSON-Plan geliefert.');return JSON.parse(clean.slice(a,b+1))};
      async function agent(path,options={}){const r=await fetch(cfg.agentUrl+path,{method:options.method||'GET',mode:'cors',cache:'no-store',headers:{'Content-Type':'application/json','X-KP-Desktop-Agent':'1'},body:options.body===undefined?undefined:JSON.stringify(options.body)});const data=await r.json().catch(()=>null);if(!r.ok||!data?.ok)throw new Error(data?.error||`Laptop-Agent HTTP ${r.status}`);return data}
      async function gemma(system,prompt,image=''){const msg={role:'user',content:prompt};if(image)msg.images=[image];const out=await agent('/v1/chat',{method:'POST',body:{messages:[{role:'system',content:system},msg]}});return parseJson(out.content)}
      const bridge=()=>window.KPRepairMobile?.ready?window.KPRepairMobile:null;
      async function getBridge(){for(let i=0;i<25;i++){const b=bridge();if(b)return b;await wait(100)}return null}
      function currentFrame(){if(!stream||!video.videoWidth||!video.videoHeight)return'';const max=1280,scale=Math.min(1,max/video.videoWidth),c=document.createElement('canvas');c.width=Math.max(1,Math.round(video.videoWidth*scale));c.height=Math.max(1,Math.round(video.videoHeight*scale));c.getContext('2d',{alpha:false}).drawImage(video,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.72).split(',')[1]||''}
      function say(text){if(!speakReplies||!('speechSynthesis'in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text||'').replace(/\n+/g,' ').slice(0,900));u.lang='de-DE';speechSynthesis.speak(u)}
      async function connectAgent(){setBusy(true);try{const h=await agent('/v1/health');if(!h.repoOk)throw new Error('Der Laptop-Agent findet das lokale Git-Repository nicht.');if(!h.ollama)throw new Error(`Ollama ist nicht erreichbar. Modell: ${h.model||cfg.model}`);ready=true;agentBadge.textContent=`Agent an · ${h.model||cfg.model}`;agentBadge.classList.add('is-on');connect.textContent='Agent verbunden';append('System',`Laptop-Agent verbunden. Gemma: ${h.model||cfg.model}. Android-Schreibzugriff: AUS.`);input.focus()}catch(e){ready=false;agentBadge.textContent='Agent aus';agentBadge.classList.remove('is-on');append('System',`${e.message||e}\nFalls nötig lokal starten: node desktop/homepage-agent/server.mjs`)}finally{setBusy(false)}}
      async function startShare(){if(stream){stopShare();return}if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('Bildschirmfreigabe wird von diesem Browser nicht unterstützt.');stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:4,max:8}},audio:false});video.srcObject=stream;preview.classList.add('is-on');share.classList.add('is-on');share.textContent='Freigabe läuft';screenBadge.textContent='Bild live';screenBadge.classList.add('is-on');stream.getVideoTracks()[0]?.addEventListener('ended',stopShare,{once:true})}
      function stopShare(){if(stream)for(const t of stream.getTracks())t.stop();stream=null;video.srcObject=null;preview.classList.remove('is-on');share.classList.remove('is-on');share.textContent='Bildschirm/Tab/Fenster';screenBadge.textContent='Bild aus';screenBadge.classList.remove('is-on')}
      function toggleSpeech(){const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R){append('System','Chrome-Spracherkennung ist hier nicht verfügbar. Tippen funktioniert.');return}if(recognition){try{recognition.stop()}catch{}return}recognition=new R();recognition.lang='de-DE';recognition.interimResults=true;recognition.continuous=false;let final='';mic.classList.add('is-on');mic.textContent='🎙 Höre zu …';recognition.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)final+=t;else interim+=t}input.value=(final||interim).trim()};recognition.onerror=e=>append('System',`Sprache: ${e.error||'Fehler'}`);recognition.onend=()=>{recognition=null;mic.classList.remove('is-on');mic.textContent='🎙 Sprache';if(final.trim()){input.value=final.trim();sendRequest()}};recognition.start()}

      const plannerSystem=`Du bist die lokale Homepage-KI der Koblenzer Puppenspiele. Du läufst ausschließlich als Gemma auf dem Laptop. Antworte nur als JSON ohne Markdown: {"reply":"kurze deutsche Antwort","save":false,"actions":[{"type":"edit_element","live_id":"live-1","property":"text","value":"Neuer Text"},{"type":"set_global_design","key":"accent_color","value":"#D97706"},{"type":"undo"},{"type":"redo"},{"type":"save"},{"type":"request_code_change","description":"präzise technische Änderung"}]}. Verwende direkte Editoraktionen nur wenn passende live_id-Werte geliefert wurden. Für PHP, JavaScript, CSS, neue Funktionen, Editor-Oberfläche oder wenn direkte Editierfunktionen fehlen: request_code_change. Nie Android-Dateien oder mobile KI-Dateien auswählen. Nie Erfolg erfinden. save nur wenn der Nutzer ausdrücklich speichern, übernehmen, dauerhaft oder veröffentlichen verlangt.`;
      const selectSystem=`Du bist lokaler Code-Diagnostiker. Antworte nur als JSON: {"reply":"kurz","diagnosis":"präzise","confidence":"low|medium|high","files":["pfad"]}. Wähle höchstens 5 EXISTIERENDE Dateien aus dem gelieferten Katalog. Verboten: android/**, qa/mobile-*, qa/*android*, wp-content/mu-plugins/kp-mobile-*. Bevorzuge die kleinste plausible Website-Dateimenge.`;
      const patchSystem=`Du erzeugst einen minimalen lokalen Website-Patch. Antworte nur als JSON: {"summary":"kurz","risk":"low|medium|high","changes":[{"path":"exakter gelesener Pfad","operations":[{"search":"exakter eindeutiger vorhandener Text","replace":"vollständiger Ersatz"}]}]}. Höchstens 5 Dateien und 10 Operationen. search muss bytegenau im gelieferten Dateiinhalt vorkommen und eindeutig sein. Keine Android- oder kp-mobile-Dateien. Keine erfundenen Dateien. Keine Shell-Kommandos.`;
      const explicitSave=t=>/\b(speicher(?:n|e|t)?|übernehm(?:en|e|t)?|dauerhaft|veröffentlich(?:en|e|t)?)\b/i.test(String(t||''));
      async function codeChange(description){
        const catalog=await agent('/v1/catalog');
        const selection=await gemma(selectSystem,`AUFGABE:\n${description}\n\nDATEIKATALOG:\n${(catalog.files||[]).join('\n')}`);
        const paths=(Array.isArray(selection.files)?selection.files:[]).filter(Boolean).slice(0,5);if(!paths.length)return selection.reply||'Gemma konnte keine passende Website-Datei bestimmen.';
        const files=(await agent('/v1/files',{method:'POST',body:{paths}})).files||[];
        const plan=await gemma(patchSystem,`AUFGABE:\n${description}\n\nDIAGNOSE:\n${selection.diagnosis||''}\n\nDATEIEN:\n${JSON.stringify(files)}`);
        const changes=Array.isArray(plan.changes)?plan.changes:[];if(!changes.length)return plan.summary||'Kein sicherer Code-Patch gefunden.';
        const names=changes.map(c=>c.path).join('\n');if(!confirm(`${plan.summary||'Lokale Code-Änderung'}\n\nDateien:\n${names}\n\nRisiko: ${plan.risk||'medium'}\n\nJetzt wirklich im lokalen Website-Repository ändern?`))return'Code-Patch verworfen; lokale Dateien blieben unverändert.';
        const result=(await agent('/v1/apply',{method:'POST',body:{plan}})).result||{};
        const tests=(result.tests||[]).map(t=>`${t.ok?'✓':'✗'} ${t.name}`).join('\n');return`Lokaler Website-Code geändert:\n${(result.changed||[]).join('\n')}${tests?`\n\nPrüfungen:\n${tests}`:''}\n\nDie Änderung liegt als lokaler Git-Diff vor. Android wurde nicht angefasst.`;
      }
      async function runRequest(text){
        const b=await getBridge();
        let page={},elements={content:[],editorUi:[]};
        if(b){try{page=b.context();elements=b.editableElements()}catch{}}
        const prior=history.slice(-4).map(x=>`NUTZER: ${x.user}\nKI: ${x.assistant}`).join('\n');
        const prompt=`WUNSCH:\n${text}\n\nLETZTE UNTERHALTUNG:\n${prior||'Noch keine.'}\n\nSEITENKONTEXT:\n${JSON.stringify(page)}\n\nEDITIERBARE ELEMENTE:\n${JSON.stringify(elements)}\n\nDIREKTER EDITOR VERFÜGBAR: ${!!b}. Liefere nur den JSON-Plan.`;
        const plan=await gemma(plannerSystem,prompt,currentFrame());const results=[];let code='';
        for(const a of (Array.isArray(plan.actions)?plan.actions:[]).slice(0,10)){
          if(!a||typeof a!=='object')continue;
          try{
            if(a.type==='edit_element'){if(b)results.push(await b.editElement(String(a.live_id||''),String(a.property||''),String(a.value??'')));else code=code||text}
            else if(a.type==='set_global_design'){if(b)results.push(await b.setDesign(String(a.key||''),String(a.value??'')));else code=code||text}
            else if(a.type==='undo'){if(b)results.push(await b.undo());else code=code||'Undo ist über die lokale Browserbrücke nicht verfügbar.'}
            else if(a.type==='redo'){if(b)results.push(await b.redo());else code=code||'Redo ist über die lokale Browserbrücke nicht verfügbar.'}
            else if(a.type==='save'){if(b&&explicitSave(text))results.push(await b.saveChanges())}
            else if(a.type==='request_code_change')code=code||String(a.description||text);
          }catch(e){code=code||`${text}. Direkte Editoraktion scheiterte: ${e.message||e}`}
        }
        if(plan.save&&b&&explicitSave(text))try{results.push(await b.saveChanges())}catch(e){append('System',e.message||String(e))}
        let repair='';if(code)repair=await codeChange(code);
        const reply=String(plan.reply||'').trim()||(results.length?'Die Änderung wurde im Entwurf vorbereitet.':'Sag mir bitte genauer, was ich ändern soll.');const final=[reply,repair].filter(Boolean).join('\n\n');history.push({user:text.slice(0,1200),assistant:final.slice(0,2600)});if(history.length>6)history.shift();return final;
      }
      async function sendRequest(){if(busy)return;const text=input.value.trim();if(!text)return;if(!ready){append('System','Bitte zuerst den Laptop-Agenten verbinden.');return}input.value='';append('Du',text);setBusy(true);try{const answer=await runRequest(text);append('KI',answer);say(answer)}catch(e){append('KI',`Fehler: ${e.message||e}`)}finally{setBusy(false)}}

      launch.addEventListener('click',()=>{const open=!panel.classList.contains('is-open');panel.classList.toggle('is-open',open);launch.setAttribute('aria-expanded',String(open));launch.textContent=open?'✕ KI':'✦ Lokale KI';if(open&&!ready)connectAgent();else if(open)input.focus()});
      close.addEventListener('click',()=>{panel.classList.remove('is-open');launch.setAttribute('aria-expanded','false');launch.textContent='✦ Lokale KI'});connect.addEventListener('click',connectAgent);reconnect.addEventListener('click',connectAgent);share.addEventListener('click',()=>startShare().catch(e=>append('System',e.message||String(e))));stop.addEventListener('click',stopShare);mic.addEventListener('click',toggleSpeech);speak.addEventListener('click',()=>{speakReplies=!speakReplies;speak.classList.toggle('is-on',speakReplies);speak.textContent=speakReplies?'🔊 Antworten an':'🔊 Antworten'});send.addEventListener('click',sendRequest);input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendRequest()}});addEventListener('beforeunload',stopShare);setBusy(false);
    })();
    </script>
    <?php
}, 99999 );
