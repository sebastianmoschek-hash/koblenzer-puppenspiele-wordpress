<?php
/**
 * Bridge between the authenticated owner web app and the Android Homepage-Hilfe app.
 * The native app never receives durable WordPress/GitHub/Gemini credentials. It calls
 * same-origin runtimes protected by WordPress capabilities and short-lived nonces/tokens.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Bootstrap the native technician even when the public template is broken before wp_footer.
 * This action intentionally does not require a pre-existing nonce: it requires an authenticated
 * WordPress session with the repair capability and only returns short-lived/single-session material.
 * A cross-origin page cannot read the response because admin-ajax is same-origin protected.
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

    $now = time();
    $payload = array(
        'uses'                 => 1,
        'expireTime'           => gmdate( 'Y-m-d\\TH:i:s\\Z', $now + 30 * MINUTE_IN_SECONDS ),
        'newSessionExpireTime' => gmdate( 'Y-m-d\\TH:i:s\\Z', $now + 2 * MINUTE_IN_SECONDS ),
    );
    $response = wp_remote_post( 'https://generativelanguage.googleapis.com/v1beta/auth_tokens', array(
        'timeout' => 20,
        'headers' => array(
            'Content-Type'   => 'application/json',
            'x-goog-api-key' => $gemini_key,
        ),
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
    $github_connected = function_exists( 'kp_ai_repair_token' ) && (bool) kp_ai_repair_token();
    wp_send_json_success( array(
        'liveToken'       => sanitize_text_field( (string) $body['name'] ),
        'model'           => 'gemini-2.5-flash-native-audio-preview-12-2025',
        'repairNonce'     => wp_create_nonce( KP_AI_REPAIR_NONCE ),
        'ownerNonce'      => $owner_nonce,
        'githubConnected' => $github_connected,
        'canMerge'        => current_user_can( 'kp_ai_repair_merge' ),
        'expiresAt'       => gmdate( 'c', $now + 30 * MINUTE_IN_SECONDS ),
    ) );
} );
add_action( 'wp_ajax_nopriv_kp_mobile_live_bootstrap', static function () {
    wp_send_json_error( array( 'message' => 'Bitte zuerst bei WordPress anmelden.' ), 401 );
} );

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() ) { return; }
    $can_repair = function_exists( 'kp_ai_repair_can_use' )
        ? kp_ai_repair_can_use()
        : current_user_can( 'edit_pages' );
    if ( ! $can_repair ) { return; }
    if ( ! defined( 'KP_AI_REPAIR_NONCE' ) ) { return; }

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
    </style>
    <script id="kp-mobile-live-bridge-runtime">
    (()=>{
      'use strict';
      if(window.KPRepairMobile?.ready)return;
      const cfg=<?php echo wp_json_encode( $config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;
      const errors=[],network=[];
      const keep=(arr,item)=>{arr.push(item);while(arr.length>12)arr.shift()};
      const safeText=value=>String(value??'').replace(/(?:AIza|gh[pousr]_|github_pat_|auth_tokens\/)[A-Za-z0-9_\-\/]+/g,'[REDACTED]').slice(0,1800);
      const safeUrl=value=>{try{const u=new URL(String(value||''),location.href);return u.origin===location.origin?u.pathname+u.search:u.origin+u.pathname}catch{return safeText(value).slice(0,500)}};
      const note=text=>{let el=document.querySelector('.kp-mobile-live-note');if(!el){el=document.createElement('div');el.className='kp-mobile-live-note';document.body.appendChild(el)}el.textContent=text;clearTimeout(note.timer);note.timer=setTimeout(()=>el.remove(),4200)};

      addEventListener('error',event=>keep(errors,{type:'error',message:safeText(event.message),file:safeUrl(event.filename),line:Number(event.lineno)||0,time:Date.now()}));
      addEventListener('unhandledrejection',event=>keep(errors,{type:'promise',message:safeText(event.reason?.message||event.reason),time:Date.now()}));

      const originalFetch=window.fetch?.bind(window);
      if(originalFetch){window.fetch=async(...args)=>{const target=safeUrl(args[0]?.url||args[0]);const started=Date.now();try{const response=await originalFetch(...args);if(!response.ok)keep(network,{kind:'fetch',url:target,status:response.status,ms:Date.now()-started,time:Date.now()});return response}catch(error){keep(network,{kind:'fetch',url:target,status:0,error:safeText(error?.message||error),ms:Date.now()-started,time:Date.now()});throw error}}}
      const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open=function(method,url,...rest){this.__kpLive={method:safeText(method).slice(0,12),url:safeUrl(url),started:0};return open.call(this,method,url,...rest)};
      XMLHttpRequest.prototype.send=function(...args){if(this.__kpLive)this.__kpLive.started=Date.now();this.addEventListener('loadend',()=>{const meta=this.__kpLive;if(meta&&this.status>=400)keep(network,{kind:'xhr',method:meta.method,url:meta.url,status:this.status,ms:Date.now()-(meta.started||Date.now()),time:Date.now()})},{once:true});return send.apply(this,args)};

      function selectedContext(){
        const el=document.querySelector('.kp-fe2-selected');if(!el)return null;
        const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
        return{tag:el.tagName,id:el.id||'',classes:[...el.classList].filter(x=>!/^kp-fe2-selected$/.test(x)).slice(0,12),text:safeText(el instanceof HTMLImageElement?(el.alt||''):el.textContent).slice(0,1200),rect:{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)},style:{display:style.display,position:style.position,fontSize:style.fontSize,color:style.color,background:style.backgroundColor,width:style.width,height:style.height}};
      }
      function editorHistory(){const counts=window.KPWordHistory?.counts?.()||{undo:0,redo:0};return{undo:Number(counts.undo)||0,redo:Number(counts.redo)||0,savedVersions:document.querySelectorAll('.kp-history-sheet .kp-history-row').length}}
      function context(){return{url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},online:navigator.onLine,userAgent:navigator.userAgent.slice(0,500),insideTechnicianApp:/KoblenzerPuppenspieleTechnician\//.test(navigator.userAgent),selected:selectedContext(),editorHistory:editorHistory(),browserErrors:errors.slice(),networkErrors:network.slice()}}
      async function post(action,nonce,fields={}){if(!originalFetch)throw new Error('Browser-Fetch ist nicht verfügbar.');if(!nonce)throw new Error('Die benötigte Website-Sitzung ist nicht bereit.');const fd=new FormData();fd.append('action',action);fd.append('nonce',nonce);for(const[k,v]of Object.entries(fields))fd.append(k,typeof v==='string'?v:JSON.stringify(v));const response=await originalFetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});const json=await response.json().catch(()=>null);if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Homepage-Aufruf fehlgeschlagen.');return json.data||{}}
      const api=(action,fields={})=>post(action,cfg.nonce,fields);
      const ownerApi=(action,fields={})=>post(action,cfg.ownerNonce,fields);
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
      window.KPRepairMobile={ready:true,context,editorHistory,analyze,createPr,status,merge,undo,redo,savedHistory,undoSaved,restoreSavedVersion,technicalHistory,rollbackRepair};

      function launchLive(){
        try{if(window.KPAndroidTechnician?.isAvailable?.()){window.KPAndroidTechnician.startLive();return}}catch{}
        if(!/Android/i.test(navigator.userAgent)){note('Der Live-Bildschirmmodus ist für die Android Homepage-Hilfe vorgesehen.');return}
        const target='koblenzerpuppenspiele://live?url='+encodeURIComponent(location.href);
        location.href=target;
        setTimeout(()=>{if(document.visibilityState==='visible')note('Die Homepage-Hilfe-App ist auf diesem Gerät noch nicht installiert.')},1400);
      }
      const button=document.createElement('button');button.type='button';button.className='kp-mobile-live-trigger';button.textContent='📱 KI live zeigen';button.addEventListener('click',launchLive);document.body.appendChild(button);
    })();
    </script>
    <?php
}, 2180 );