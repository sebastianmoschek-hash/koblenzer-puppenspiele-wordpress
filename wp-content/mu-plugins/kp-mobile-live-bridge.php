<?php
/**
 * Bridge between the authenticated owner web app and the Android Homepage-Hilfe app.
 * The native app never receives durable WordPress/GitHub/Gemini credentials. It calls
 * same-origin runtimes protected by WordPress capabilities and short-lived nonces/tokens.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Legacy-compatible bootstrap. kp-mobile-live-bootstrap-v2.php runs at priority 0 on current
 * installs and issues the unconstrained v1beta-u1 token before this callback is reached.
 */
add_action( 'wp_ajax_kp_mobile_live_bootstrap', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'kp_ai_repair_code' ) ) {
        wp_send_json_error( array( 'message' => 'Bitte zuerst als Homepage-Techniker oder Administrator anmelden.' ), 403 );
    }
    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
    if ( ! str_contains( $ua, 'KoblenzerPuppenspieleTechnician/' ) ) {
        wp_send_json_error( array( 'message' => 'Dieser Live-Bootstrap ist nur für die Homepage-Hilfe-App verfügbar.' ), 403 );
    }
    if ( ! defined( 'KP_AI_REPAIR_NONCE' ) || ! function_exists( 'kp_ai_key' ) ) {
        wp_send_json_error( array( 'message' => 'Die KI-Reparaturbasis ist noch nicht vollständig geladen.' ), 503 );
    }
    $gemini_key = kp_ai_key();
    if ( ! $gemini_key ) {
        wp_send_json_error( array( 'message' => 'Gemini ist serverseitig noch nicht verbunden.' ), 409 );
    }

    $model = 'gemini-3.1-flash-live-preview';
    $now = time();
    $payload = array(
        'uses'                 => 1,
        'expireTime'           => gmdate( 'Y-m-d\\TH:i:s\\Z', $now + 30 * MINUTE_IN_SECONDS ),
        'newSessionExpireTime' => gmdate( 'Y-m-d\\TH:i:s\\Z', $now + 2 * MINUTE_IN_SECONDS ),
        'liveConnectConstraints' => array(
            'model' => 'models/' . $model,
            'config' => array( 'responseModalities' => array( 'AUDIO' ) ),
        ),
    );
    $response = wp_remote_post( 'https://generativelanguage.googleapis.com/v1beta/auth_tokens', array(
        'timeout' => 20,
        'headers' => array( 'Content-Type' => 'application/json', 'x-goog-api-key' => $gemini_key ),
        'body' => wp_json_encode( $payload ),
    ) );
    if ( is_wp_error( $response ) ) {
        wp_send_json_error( array( 'message' => 'Gemini-Live-Token konnte nicht angefordert werden: ' . $response->get_error_message() ), 502 );
    }
    $code = (int) wp_remote_retrieve_response_code( $response );
    $body = json_decode( (string) wp_remote_retrieve_body( $response ), true );
    if ( $code < 200 || $code >= 300 || ! is_array( $body ) || empty( $body['name'] ) ) {
        $message = is_array( $body ) ? (string) ( $body['error']['message'] ?? 'Gemini hat kein Live-Token geliefert.' ) : 'Gemini hat kein Live-Token geliefert.';
        if ( 429 === $code ) { $message = 'Gemini-Live-Kontingent oder Rate-Limit erreicht: ' . $message; }
        wp_send_json_error( array( 'message' => sanitize_text_field( $message ) ), $code >= 400 && $code <= 599 ? $code : 502 );
    }

    $owner_nonce = '';
    if ( class_exists( 'KP_Owner_Web_App' ) && defined( 'KP_Owner_Web_App::NONCE_ACTION' ) ) {
        $owner_nonce = wp_create_nonce( KP_Owner_Web_App::NONCE_ACTION );
    }
    wp_send_json_success( array(
        'liveToken'       => sanitize_text_field( (string) $body['name'] ),
        'model'           => $model,
        'repairNonce'     => wp_create_nonce( KP_AI_REPAIR_NONCE ),
        'ownerNonce'      => $owner_nonce,
        'githubConnected' => function_exists( 'kp_ai_repair_token' ) && (bool) kp_ai_repair_token(),
        'canMerge'        => current_user_can( 'kp_ai_repair_merge' ),
        'expiresAt'       => gmdate( 'c', $now + 30 * MINUTE_IN_SECONDS ),
    ) );
} );
add_action( 'wp_ajax_nopriv_kp_mobile_live_bootstrap', static function () {
    wp_send_json_error( array( 'message' => 'Bitte zuerst bei WordPress anmelden.' ), 401 );
} );

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() ) { return; }
    $can_repair = function_exists( 'kp_ai_repair_can_use' ) ? kp_ai_repair_can_use() : current_user_can( 'edit_pages' );
    if ( ! $can_repair || ! defined( 'KP_AI_REPAIR_NONCE' ) ) { return; }

    $owner_nonce = '';
    if ( class_exists( 'KP_Owner_Web_App' ) && defined( 'KP_Owner_Web_App::NONCE_ACTION' ) ) {
        $owner_nonce = wp_create_nonce( KP_Owner_Web_App::NONCE_ACTION );
    }
    $config = array(
        'ajaxUrl'    => admin_url( 'admin-ajax.php' ),
        'nonce'      => wp_create_nonce( KP_AI_REPAIR_NONCE ),
        'ownerNonce' => $owner_nonce,
    );
    ?>
    <style id="kp-mobile-live-bridge-style">
      .kp-mobile-live-trigger{position:fixed;right:16px;bottom:146px;z-index:2147482490;border:0;border-radius:999px;padding:11px 15px;background:#25201d;color:#fff;font-weight:800;box-shadow:0 8px 28px rgba(0,0,0,.28)}
      .kp-mobile-live-note{position:fixed;left:50%;bottom:204px;transform:translateX(-50%);z-index:2147482700;max-width:min(520px,calc(100vw - 28px));padding:10px 13px;border-radius:13px;background:#17110e;color:#fff;font-size:13px;box-shadow:0 8px 34px rgba(0,0,0,.4)}
      body.kp-canva-preview .kp-mobile-live-trigger{display:none!important}
      html.kp-technician-app .kp-ai-trigger,
      html.kp-technician-app .kp-ai-sheet,
      html.kp-technician-app .kp-ai-repair-sheet,
      html.kp-technician-app .kp-ai-repair-open,
      html.kp-technician-app .kp-mobile-live-trigger{display:none!important}
    </style>
    <script id="kp-mobile-live-bridge-runtime">
    (()=>{
      'use strict';
      if(window.KPRepairMobile?.ready)return;
      const cfg=<?php echo wp_json_encode( $config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;
      const insideTechnicianApp=/KoblenzerPuppenspieleTechnician\//.test(navigator.userAgent);
      if(insideTechnicianApp)document.documentElement.classList.add('kp-technician-app');
      const errors=[],network=[];
      let liveId=0,pendingSaveKind='page';
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const keep=(arr,item)=>{arr.push(item);while(arr.length>12)arr.shift()};
      const safeText=value=>String(value??'').replace(/(?:AIza|gh[pousr]_|github_pat_|auth_tokens\/)[A-Za-z0-9_\-\/]+/g,'[REDACTED]').slice(0,1800);
      const safeUrl=value=>{try{const u=new URL(String(value||''),location.href);return u.origin===location.origin?u.pathname+u.search:u.origin+u.pathname}catch{return safeText(value).slice(0,500)}};
      const note=text=>{let el=document.querySelector('.kp-mobile-live-note');if(!el){el=document.createElement('div');el.className='kp-mobile-live-note';document.body.appendChild(el)}el.textContent=text;clearTimeout(note.timer);note.timer=setTimeout(()=>el.remove(),4200)};
      const visible=el=>{if(!(el instanceof Element))return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>2&&r.height>2&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0.02};
      const liveElementId=el=>{if(!el.dataset.kpLiveId)el.dataset.kpLiveId='live-'+(++liveId);return el.dataset.kpLiveId};
      const byLiveId=id=>document.querySelector(`[data-kp-live-id="${CSS.escape(String(id||''))}"]`);
      const isEditorUi=el=>!!el?.closest?.('.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop,.kp-ai-sheet,.kp-ai-repair-sheet,.kp-oa-backdrop,#wpadminbar');
      const kindOf=el=>{const name=el?.dataset?.kpBlockName||'';if(name==='core/image'||el?.matches?.('img'))return'image';if(name==='core/button'||name==='core/navigation-link'||el?.matches?.('a,button'))return'link';if(['core/paragraph','core/heading','core/list-item'].includes(name)||el?.matches?.('h1,h2,h3,h4,h5,h6,p,li,figcaption'))return'text';return'section'};
      const targetOf=el=>{if(!el)return null;const name=el.dataset?.kpBlockName||'';if(name==='core/button'||name==='core/navigation-link')return el.matches('a')?el:el.querySelector('a');if(name==='core/image')return el.matches('img')?el:el.querySelector('img');return el};

      addEventListener('error',event=>keep(errors,{type:'error',message:safeText(event.message),file:safeUrl(event.filename),line:Number(event.lineno)||0,time:Date.now()}));
      addEventListener('unhandledrejection',event=>keep(errors,{type:'promise',message:safeText(event.reason?.message||event.reason),time:Date.now()}));
      const originalFetch=window.fetch?.bind(window);
      if(originalFetch){window.fetch=async(...args)=>{const target=safeUrl(args[0]?.url||args[0]);const started=Date.now();try{const response=await originalFetch(...args);if(!response.ok)keep(network,{kind:'fetch',url:target,status:response.status,ms:Date.now()-started,time:Date.now()});return response}catch(error){keep(network,{kind:'fetch',url:target,status:0,error:safeText(error?.message||error),ms:Date.now()-started,time:Date.now()});throw error}}}
      const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open=function(method,url,...rest){this.__kpLive={method:safeText(method).slice(0,12),url:safeUrl(url),started:0};return open.call(this,method,url,...rest)};
      XMLHttpRequest.prototype.send=function(...args){if(this.__kpLive)this.__kpLive.started=Date.now();this.addEventListener('loadend',()=>{const meta=this.__kpLive;if(meta&&this.status>=400)keep(network,{kind:'xhr',method:meta.method,url:meta.url,status:this.status,ms:Date.now()-(meta.started||Date.now()),time:Date.now()})},{once:true});return send.apply(this,args)};

      function selectedContext(){
        const el=document.querySelector('.kp-fe2-selected');if(!el)return null;
        const rect=el.getBoundingClientRect(),style=getComputedStyle(targetOf(el)||el);
        return{liveId:liveElementId(el),kind:kindOf(el),tag:el.tagName,text:safeText((targetOf(el)||el).textContent||'').slice(0,900),rect:{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)},style:{fontSize:style.fontSize,color:style.color,background:style.backgroundColor,width:style.width,height:style.height}};
      }
      function editorHistory(){const counts=window.KPWordHistory?.counts?.()||{undo:0,redo:0};return{undo:Number(counts.undo)||0,redo:Number(counts.redo)||0,savedVersions:document.querySelectorAll('.kp-history-sheet .kp-history-row').length}}
      function editableElements(){
        const content=[...document.querySelectorAll('[data-kp-dom-key],[data-kp-edit-key]')].filter(visible).slice(0,90).map(el=>{
          const r=el.getBoundingClientRect(),t=targetOf(el)||el,s=getComputedStyle(t),kind=kindOf(el);
          return{liveId:liveElementId(el),kind,editorUi:false,tag:el.tagName,text:safeText(kind==='image'?(t.alt||''):(t.textContent||'')).slice(0,240),rect:{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)},style:{fontSize:s.fontSize,color:s.color,background:s.backgroundColor},properties:kind==='text'?['text','font_percent','padding_percent','width_percent','radius_px','color','background','move_x','move_y']:kind==='link'?['label','url','font_percent','padding_percent','width_percent','radius_px','color','background','move_x','move_y']:kind==='image'?['padding_percent','width_percent','radius_px','background','move_x','move_y']:['padding_percent','width_percent','radius_px','background','section_up','section_down','move_x','move_y']};
        });
        const ui=[...document.querySelectorAll('.kp-fe2-toolbar button,.kp-fe2-toolbar a,.kp-fe2-inspector button,.kp-oa-tools,.kp-history-trigger,[class*="undo"],[class*="redo"]')].filter(visible).slice(0,24).map(el=>{const r=el.getBoundingClientRect();return{liveId:liveElementId(el),kind:'editor-ui',editorUi:true,tag:el.tagName,text:safeText(el.textContent||el.getAttribute('aria-label')||'').slice(0,160),classes:[...el.classList].slice(0,6),rect:{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)},properties:['code_change_required']}});
        return{success:true,editMode:document.body.classList.contains('kp-fe2-editing'),content,editorUi:ui,count:content.length+ui.length};
      }
      function context(){const elements=editableElements();return{url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},online:navigator.onLine,insideTechnicianApp,selected:selectedContext(),editorHistory:editorHistory(),editable:{contentCount:elements.content.length,editorUiCount:elements.editorUi.length},browserErrors:errors.slice(),networkErrors:network.slice()}}

      async function post(action,nonce,fields={}){if(!originalFetch)throw new Error('Browser-Fetch ist nicht verfügbar.');if(!nonce)throw new Error('Die benötigte Website-Sitzung ist nicht bereit.');const fd=new FormData();fd.append('action',action);fd.append('nonce',nonce);for(const[k,v]of Object.entries(fields))fd.append(k,typeof v==='string'?v:JSON.stringify(v));const response=await originalFetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});const json=await response.json().catch(()=>null);if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Homepage-Aufruf fehlgeschlagen.');return json.data||{}}
      const api=(action,fields={})=>post(action,cfg.nonce,fields);
      const ownerApi=(action,fields={})=>post(action,cfg.ownerNonce,fields);

      async function selectElement(liveId){
        const el=byLiveId(liveId);if(!el)return{success:false,message:'Das Element ist nicht mehr auf der Seite sichtbar. Bitte Elemente neu untersuchen.'};
        if(isEditorUi(el))return{success:false,codeRequired:true,message:'Dieses sichtbare Element gehört zur Editor-Oberfläche. Dafür ist eine geprüfte Codeänderung nötig.'};
        const r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:0}));
        await wait(90);const selected=document.querySelector('.kp-fe2-selected');
        if(!selected)return{success:false,message:'Der manuelle Editor konnte das Element nicht auswählen.'};
        return{success:true,liveId:liveElementId(selected),kind:kindOf(selected),selected:selectedContext()};
      }
      async function expandInspector(){const ins=document.querySelector('.kp-fe2-inspector.is-open');if(!ins)return null;if(!ins.classList.contains('is-expanded')){ins.querySelector('.kp-fe2-expand')?.click();await wait(90)}return document.querySelector('.kp-fe2-inspector.is-open')}
      async function setControl(input,value){if(!input)return false;if(input.type==='checkbox')input.checked=/^(1|true|ja|on)$/i.test(String(value));else input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));await wait(35);return true}
      async function editElement(liveId,property,value){
        const chosen=await selectElement(liveId);if(!chosen.success)return chosen;
        const el=document.querySelector('.kp-fe2-selected'),kind=kindOf(el),prop=String(property||''),val=String(value??'');
        if(prop==='text'&&kind==='text'){
          const target=document.querySelector('.kp-fe2-inline-text[contenteditable="true"]')||targetOf(el);if(!target)return{success:false,message:'Der Text ist nicht direkt bearbeitbar.'};target.textContent=val;target.dispatchEvent(new Event('input',{bubbles:true}));pendingSaveKind='page';return{success:true,unsaved:true,message:'Text geändert · noch nicht gespeichert.'};
        }
        if((prop==='label'||prop==='url')&&kind==='link'){
          const input=document.querySelector(prop==='label'?'.kp-fe2-inspector.is-open .kp-fe2-link-label':'.kp-fe2-inspector.is-open .kp-fe2-link-url');if(!input)return{success:false,message:'Link-Steuerung ist für dieses Element nicht verfügbar.'};await setControl(input,val);pendingSaveKind='page';return{success:true,unsaved:true,message:prop==='label'?'Beschriftung geändert · noch nicht gespeichert.':'Link geändert · noch nicht gespeichert.'};
        }
        if(prop==='section_up'||prop==='section_down'){
          const button=document.querySelector(`.kp-fe2-inspector.is-open .${prop==='section_up'?'kp-fe2-up':'kp-fe2-down'}`);if(!button)return{success:false,codeRequired:true,message:'Diese Reihenfolge kann der visuelle Editor hier nicht ändern.'};button.click();await wait(70);pendingSaveKind='page';return{success:true,unsaved:true,message:'Bereich verschoben · noch nicht gespeichert.'};
        }
        if(prop==='move_x'||prop==='move_y'){
          const delta=Number(val);if(!Number.isFinite(delta))return{success:false,message:'Verschiebung muss eine Pixelzahl sein.'};const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,dx=prop==='move_x'?delta:0,dy=prop==='move_y'?delta:0;el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:x,clientY:y,button:0}));window.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:x+dx,clientY:y+dy,button:0}));window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:x+dx,clientY:y+dy,button:0}));await wait(80);pendingSaveKind='page';return{success:true,unsaved:true,message:'Element verschoben · noch nicht gespeichert.'};
        }
        const ins=await expandInspector();if(!ins)return{success:false,message:'Gestaltungssteuerung konnte nicht geöffnet werden.'};
        const map={font_percent:'[data-style="font"]',padding_percent:'[data-style="padding"]',width_percent:'[data-style="width"]',radius_px:'[data-style="radius"]',color:'[data-style-color="color"]',background:'[data-style-color="background"]'};
        const selector=map[prop],input=selector?ins.querySelector(selector):null;
        if(!input)return{success:false,codeRequired:true,message:`Die Eigenschaft ${prop||'(leer)'} ist für dieses Element im visuellen Editor nicht verfügbar. Dafür ist gegebenenfalls eine geprüfte Codeänderung nötig.`};
        await setControl(input,val);pendingSaveKind='page';return{success:true,unsaved:true,message:`${prop} geändert · noch nicht gespeichert.`,selected:selectedContext()};
      }
      async function setDesign(key,value){
        const k=String(key||''),v=String(value??'');let input=document.querySelector(`[data-design="${CSS.escape(k)}"]`);
        if(!input){document.querySelector('.kp-oa-tools')?.click();await wait(80);document.querySelector('[data-action="design"]')?.click();await wait(150);input=document.querySelector(`[data-design="${CSS.escape(k)}"]`)}
        if(!input)return{success:false,codeRequired:true,message:`Die globale Design-Einstellung ${k} ist nicht verfügbar. Für diesen Wunsch ist gegebenenfalls eine geprüfte Codeänderung nötig.`};
        await setControl(input,v);pendingSaveKind='design';return{success:true,unsaved:true,message:`Design ${k} geändert · noch nicht gespeichert.`};
      }
      async function saveChanges(){
        if(pendingSaveKind==='design'){
          const button=document.querySelector('.kp-oa-design-save');if(button&&!button.disabled){button.click();return{success:true,saving:true,message:'Design wird gespeichert.'}}
        }
        if(window.KPAIEditorRuntime?.isDirty?.())await window.KPAIEditorRuntime.flush();
        const button=document.querySelector('.kp-fe2-save');if(button&&!button.disabled){button.click();return{success:true,saving:true,message:'Homepage wird gespeichert.'}}
        const design=document.querySelector('.kp-oa-design-save');if(design&&!design.disabled){design.click();return{success:true,saving:true,message:'Design wird gespeichert.'}}
        return{success:true,saved:false,message:'Keine ungespeicherte Änderung gefunden.'};
      }

      async function analyze(description){return api('kp_ai_repair_analyze',{request:String(description||''),browser:JSON.stringify(context())})}
      async function createPr(proposalId){return api('kp_ai_repair_create_pr',{proposal_id:String(proposalId||'')})}
      async function status(pr){return api('kp_ai_repair_status',{pr:String(pr||'')})}
      async function merge(pr){return api('kp_ai_repair_merge',{pr:String(pr||'')})}
      async function undo(){if(typeof window.KPWordHistory?.undo!=='function')throw new Error('Undo ist auf dieser Seite noch nicht bereit.');const changed=await window.KPWordHistory.undo();return{changed:!!changed,history:editorHistory()}}
      async function redo(){if(typeof window.KPWordHistory?.redo!=='function')throw new Error('Redo ist auf dieser Seite noch nicht bereit.');const changed=await window.KPWordHistory.redo();return{changed:!!changed,history:editorHistory()}}
      async function savedHistory(){return ownerApi('kp_owner_history_list')}
      async function undoSaved(){const out=await ownerApi('kp_owner_history_undo');setTimeout(()=>location.reload(),700);return out}
      async function restoreSavedVersion(versionId){const out=await ownerApi('kp_owner_history_restore',{version_id:String(versionId||'')});setTimeout(()=>location.reload(),700);return out}
      async function technicalHistory(){return api('kp_ai_repair_history')}
      async function rollbackRepair(repairPr){return api('kp_ai_repair_rollback',{repair_pr:String(repairPr||'')})}
      window.KPRepairMobile={ready:true,context,editableElements,selectElement,editElement,setDesign,saveChanges,editorHistory,analyze,createPr,status,merge,undo,redo,savedHistory,undoSaved,restoreSavedVersion,technicalHistory,rollbackRepair};

      function launchLive(){
        try{if(window.KPAndroidTechnician?.isAvailable?.()){window.KPAndroidTechnician.startLive();return}}catch{}
        if(!/Android/i.test(navigator.userAgent)){note('Der Live-Bildschirmmodus ist für die Android Homepage-Hilfe vorgesehen.');return}
        const target='koblenzerpuppenspiele://live?url='+encodeURIComponent(location.href);location.href=target;
        setTimeout(()=>{if(document.visibilityState==='visible')note('Die Homepage-Hilfe-App ist auf diesem Gerät noch nicht installiert.')},1400);
      }
      if(!insideTechnicianApp){const button=document.createElement('button');button.type='button';button.className='kp-mobile-live-trigger';button.textContent='📱 KI live zeigen';button.addEventListener('click',launchLive);document.body.appendChild(button)}
    })();
    </script>
    <?php
}, 2180 );
