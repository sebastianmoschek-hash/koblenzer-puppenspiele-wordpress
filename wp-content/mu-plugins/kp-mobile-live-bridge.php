<?php
/**
 * Bridge between the authenticated owner web app and the Android Homepage-Hilfe app.
 * The native app never receives WordPress/GitHub credentials; it calls this same-origin
 * runtime which remains protected by WordPress capabilities and nonces.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() ) { return; }
    $can_repair = function_exists( 'kp_ai_repair_can_use' )
        ? kp_ai_repair_can_use()
        : current_user_can( 'edit_pages' );
    if ( ! $can_repair ) { return; }
    if ( ! defined( 'KP_AI_REPAIR_NONCE' ) ) { return; }

    $config = array(
        'ajaxUrl' => admin_url( 'admin-ajax.php' ),
        'nonce'   => wp_create_nonce( KP_AI_REPAIR_NONCE ),
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
      const safeText=value=>String(value??'').replace(/(?:AIza|gh[pousr]_|github_pat_)[A-Za-z0-9_\-]+/g,'[REDACTED]').slice(0,1800);
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
      function context(){return{url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},online:navigator.onLine,userAgent:navigator.userAgent.slice(0,500),insideTechnicianApp:/KoblenzerPuppenspieleTechnician\//.test(navigator.userAgent),selected:selectedContext(),browserErrors:errors.slice(),networkErrors:network.slice()}}
      async function api(action,fields={}){const fd=new FormData();fd.append('action',action);fd.append('nonce',cfg.nonce);for(const[k,v]of Object.entries(fields))fd.append(k,typeof v==='string'?v:JSON.stringify(v));const response=await originalFetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});const json=await response.json().catch(()=>null);if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Homepage-Reparaturaufruf fehlgeschlagen.');return json.data||{}}
      async function analyze(description){return api('kp_ai_repair_analyze',{request:String(description||''),browser:JSON.stringify(context())})}
      async function createPr(proposalId){return api('kp_ai_repair_create_pr',{proposal_id:String(proposalId||'')})}
      async function status(pr){return api('kp_ai_repair_status',{pr:String(pr||'')})}
      async function merge(pr){return api('kp_ai_repair_merge',{pr:String(pr||'')})}
      window.KPRepairMobile={ready:true,context,analyze,createPr,status,merge};

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
