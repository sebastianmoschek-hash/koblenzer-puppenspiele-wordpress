<?php
/**
 * Small late-running owner-editor polish layer.
 *
 * - keeps the Word-style arrows useful after FE2 save/reload in the same tab
 * - falls back to FE2's private in-session history if the global marker is missing
 * - separates the floating AI and owner-tools buttons on mobile
 * - keeps the two history arrows visually close together
 * - keeps the agreed mobile navigation on tablets through 900px
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <style id="kp-editor-mobile-polish-style">
      /* The AI pill has an intentionally very high z-index. While an owner
         bottom-sheet is open that would otherwise put it above sticky Save /
         Reset controls. Hide it for the duration of the sheet and bring it
         back automatically when the sheet closes. */
      body.kp-oa-open .kp-ai-trigger{display:none!important}

      /* The editor contract and the responsive editor both define tablet as
         <=900px. The theme's older 781px navigation breakpoint left an 820px
         tablet in desktop-navigation mode, while the tablet gate correctly
         expected the touch menu. Override only the navigation layer here; the
         rest of the theme's layout breakpoints stay untouched. */
      @media(min-width:782px) and (max-width:900px){
        .kp-navigation-bar{
          height:0!important;
          min-height:0!important;
          padding:0!important;
          border:0!important;
          box-shadow:none!important;
          background:transparent!important;
        }
        .kp-site-nav{
          position:fixed!important;
          right:max(16px,env(safe-area-inset-right))!important;
          bottom:max(18px,env(safe-area-inset-bottom))!important;
          z-index:9999!important;
          width:auto!important;
          min-height:0!important;
        }
        .kp-site-nav .wp-block-navigation__responsive-container:not(.is-menu-open):not(.has-modal-open){
          display:none!important;
        }
        .kp-site-nav .wp-block-navigation__responsive-container-open{
          display:inline-flex!important;
          align-items:center!important;
          justify-content:center!important;
          gap:.42rem!important;
          min-width:112px!important;
          min-height:52px!important;
          padding:.72rem 1rem!important;
          border:1px solid rgba(255,255,255,.2)!important;
          border-radius:999px!important;
          background:var(--kp-orange,#f07a22)!important;
          color:#fff!important;
          box-shadow:0 12px 32px rgba(0,0,0,.42)!important;
          font-weight:850!important;
        }
        .kp-site-nav .wp-block-navigation__responsive-container-open::after{
          content:"Menü"!important;
          display:inline!important;
          font-size:.94rem!important;
        }
        .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open,
        .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open{
          position:fixed!important;
          inset:0!important;
          z-index:10000!important;
          display:flex!important;
          padding:max(22px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(22px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left))!important;
          background:rgba(8,7,6,.98)!important;
          color:#fff!important;
          backdrop-filter:blur(12px)!important;
        }
        .kp-site-nav .wp-block-navigation__responsive-close{
          width:100%!important;
          max-width:520px!important;
          margin:auto!important;
        }
        .kp-site-nav .wp-block-navigation__responsive-dialog{
          min-height:calc(100dvh - 44px)!important;
          display:flex!important;
          flex-direction:column!important;
        }
        .kp-site-nav .wp-block-navigation__responsive-container-content{
          flex:1!important;
          display:flex!important;
          align-items:center!important;
          justify-content:center!important;
          padding-top:54px!important;
        }
        .kp-site-nav .wp-block-navigation__responsive-container-content .wp-block-navigation__container{
          display:flex!important;
          flex-direction:column!important;
          align-items:stretch!important;
          gap:.25rem!important;
          width:100%!important;
        }
        .kp-site-nav .wp-block-navigation-item__content{
          display:block!important;
          width:100%!important;
          padding:.72rem 1rem!important;
          border-radius:12px!important;
          color:#fff!important;
          font-family:Georgia,'Times New Roman',serif!important;
          font-size:clamp(1.25rem,5vw,1.7rem)!important;
          text-align:center!important;
        }
        .kp-site-nav .wp-block-navigation__responsive-container-close{
          position:absolute!important;
          top:0!important;
          right:0!important;
          display:inline-flex!important;
          align-items:center!important;
          justify-content:center!important;
          width:48px!important;
          height:48px!important;
          border:1px solid rgba(255,255,255,.18)!important;
          border-radius:999px!important;
          background:var(--kp-orange,#f07a22)!important;
          color:#fff!important;
        }
      }

      @media(min-width:901px){
        /* The takeover button is the active local-AI launcher. Keep it and
           hide the duplicate legacy launcher, including in preview mode. */
        html.kp-local-ai-takeover .kp-local-ai-launch,
        body:has(.kp-lat-launch) .kp-local-ai-launch,
        body.kp-canva-preview .kp-local-ai-launch{
          display:none!important;
        }
        /* The editor toolbar owns the bottom row. Legacy/live AI controls
           occupy a separate right-hand rail above it and must never cover
           Preview, Undo, Redo or the device selector. */
        body.kp-fe2-editing .kp-fe2-toolbar{
          left:14px!important;
          right:auto!important;
          bottom:14px!important;
          width:min(560px, calc(100vw - 28px))!important;
          max-width:min(560px, calc(100vw - 28px))!important;
          transform:none!important;
          display:flex!important;
          flex-wrap:nowrap!important;
          justify-content:flex-start!important;
          gap:10px!important;
          overflow-x:auto!important;
          overflow-y:hidden!important;
          z-index:2147483001!important;
        }
        body.kp-fe2-editing .kp-fe2-toolbar::-webkit-scrollbar{display:none}
        body.kp-fe2-editing .kp-fe2-toolbar button,
        body.kp-fe2-editing .kp-fe2-toolbar a,
        body.kp-fe2-editing .kp-fe2-device-wrap{
          flex:0 0 auto!important;
          min-width:48px!important;
          min-height:44px!important;
        }
        body.kp-fe2-editing .kp-fe2-device-wrap{
          width:132px!important;
          padding:7px 10px!important;
          gap:7px!important;
        }
        body.kp-fe2-editing .kp-fe2-device{
          width:100%!important;
          max-width:none!important;
          min-width:0!important;
        }
        body.kp-fe2-editing .kp-lat-launch,
        body.kp-fe2-editing .kp-local-ai-launch{
          right:18px!important;
          bottom:calc(108px + env(safe-area-inset-bottom))!important;
        }
        body.kp-fe2-editing .kp-ai-trigger{
          right:18px!important;
          bottom:calc(164px + env(safe-area-inset-bottom))!important;
        }
        body.kp-fe2-editing .kp-oa-tools{
          right:18px!important;
          bottom:calc(220px + env(safe-area-inset-bottom))!important;
        }
        /* Preview can remove kp-fe2-editing before the controls disappear.
           Keep the rail separated for that transition frame as well. */
        body:has(.kp-fe2-toolbar) .kp-lat-launch,
        body:has(.kp-fe2-toolbar) .kp-local-ai-launch{
          right:18px!important;
          bottom:calc(108px + env(safe-area-inset-bottom))!important;
        }
        body:has(.kp-fe2-toolbar) .kp-ai-trigger{
          right:18px!important;
          bottom:calc(164px + env(safe-area-inset-bottom))!important;
        }
        body:has(.kp-fe2-toolbar) .kp-oa-tools{
          right:18px!important;
          bottom:calc(220px + env(safe-area-inset-bottom))!important;
        }
      }

      @media(min-width:901px) and (max-width:1180px){
        body.kp-fe2-editing .kp-fe2-toolbar{right:300px!important}
        body.kp-fe2-editing .kp-fe2-device-wrap{width:112px!important}
      }

      /* Keep the responsive site navigation above the editor bar. The menu
         trigger is a separate control; an opened navigation overlay may cover
         the editor intentionally, but the closed trigger must remain clickable. */
      @media(max-width:900px){
        body.kp-fe2-editing{padding-bottom:148px!important}
        body.kp-fe2-editing .kp-site-nav .wp-block-navigation__responsive-container-open{
          bottom:max(88px,calc(env(safe-area-inset-bottom) + 80px))!important;
          z-index:2147483002!important;
        }
        body.kp-fe2-editing .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open,
        body.kp-fe2-editing .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open{
          z-index:2147483100!important;
        }
        body.kp-fe2-editing .kp-lat-launch,
        body.kp-fe2-editing .kp-local-ai-launch,
        body.kp-fe2-editing .kp-ai-trigger{
          max-width:150px!important;
          min-height:44px!important;
          padding:9px 12px!important;
          font-size:13px!important;
          line-height:1.1!important;
        }
      }

      @media(max-width:782px){
        /* Keep the editor bar readable and keep independent floating controls
           above it instead of covering Preview/Undo/Redo. */
        body.kp-fe2-editing .kp-fe2-toolbar{
          display:flex!important;
          flex-wrap:nowrap!important;
          justify-content:flex-start!important;
          gap:8px!important;
          overflow-x:auto!important;
          overflow-y:hidden!important;
          z-index:2147483001!important;
          scrollbar-width:none!important;
        }
        body.kp-fe2-editing .kp-fe2-toolbar::-webkit-scrollbar{display:none}
        body.kp-fe2-editing .kp-fe2-toolbar button,
        body.kp-fe2-editing .kp-fe2-toolbar a,
        body.kp-fe2-editing .kp-fe2-device-wrap{
          flex:0 0 auto!important;
          min-width:44px!important;
          min-height:44px!important;
        }
        body.kp-fe2-editing .kp-fe2-toolbar .kp-fe2-exit,
        body.kp-fe2-editing .kp-fe2-toolbar .kp-fe2-undo,
        body.kp-fe2-editing .kp-fe2-toolbar .kp-fe2-redo,
        body.kp-fe2-editing .kp-fe2-toolbar .kp-fe2-device-wrap,
        body.kp-fe2-editing .kp-fe2-toolbar .kp-fe2-save{
          width:auto!important;
        }
        /* Keep the three owner actions in a touch-safe vertical rail. */
        body.kp-fe2-editing .kp-mobile-live-trigger,
        body.kp-fe2-editing .kp-ai-trigger,
        body.kp-fe2-editing .kp-oa-tools{
          right:12px!important;
          left:auto!important;
          transform:none!important;
        }
        body.kp-fe2-editing .kp-mobile-live-trigger{
          bottom:max(198px,calc(env(safe-area-inset-bottom) + 188px))!important;
          min-height:44px!important;
        }
        body.kp-fe2-editing .kp-ai-trigger{
          bottom:max(138px,calc(env(safe-area-inset-bottom) + 128px))!important;
          min-height:44px!important;
        }
        body.kp-fe2-editing .kp-oa-tools{
          bottom:max(72px,calc(env(safe-area-inset-bottom) + 62px))!important;
          min-height:44px!important;
        }
        body.kp-fe2-editing .kp-oa-sticky-actions{
          column-gap:3px!important;
          row-gap:6px!important;
        }
        body.kp-fe2-editing .kp-oa-sticky-actions>[data-kp-word-history-new="undo"],
        body.kp-fe2-editing .kp-oa-sticky-actions>[data-kp-word-history-new="redo"]{
          margin:0!important;
        }
      }
    </style>
    <script id="kp-editor-mobile-polish-runtime">
    (()=>{
      'use strict';
      const cfg=window.KPFrontendEditorV2;
      if(!cfg?.editMode||!cfg?.canEdit||!cfg?.pageKey)return;

      const MAX=20;
      const storageKey=`kp-fe2-saved-arrows-v2:${cfg.pageKey}`;
      const clone=value=>JSON.parse(JSON.stringify(value||{}));
      const same=(a,b)=>JSON.stringify(a||{})===JSON.stringify(b||{});
      const current=()=>({global:clone(cfg.global),page:clone(cfg.page)});

      function emptyStore(){return{undo:[],redo:[],pending:null}}
      function load(){
        try{
          const parsed=JSON.parse(sessionStorage.getItem(storageKey)||'null');
          if(!parsed||!Array.isArray(parsed.undo)||!Array.isArray(parsed.redo))return emptyStore();
          return{undo:parsed.undo.slice(-MAX),redo:parsed.redo.slice(-MAX),pending:parsed.pending||null};
        }catch(_){return emptyStore()}
      }
      function save(store){
        store.undo=store.undo.slice(-MAX);store.redo=store.redo.slice(-MAX);
        try{sessionStorage.setItem(storageKey,JSON.stringify(store))}catch(_){ }
      }
      function toast(text,type='ok'){
        const el=document.querySelector('.kp-fe2-toast')||document.querySelector('.kp-oa-toast');
        if(!el)return;
        el.textContent=text;
        el.className=(el.classList.contains('kp-fe2-toast')?'kp-fe2-toast':'kp-oa-toast')+` is-visible is-${type}`;
        clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('is-visible'),2200);
      }

      // A save reload destroys the private FE2 JS history. Remember the last
      // persisted state just before saving and finalize it only if the reload
      // actually shows a different FE2 state. Failed saves therefore create no
      // fake undo step.
      let store=load();
      if(store.pending){
        const now=current();
        if(!same(store.pending,now)){
          store.undo.push(store.pending);
          store.redo=[];
        }
        store.pending=null;save(store);
      }

      function rememberBeforeSave(event){
        const target=event.target instanceof Element?event.target.closest('.kp-fe2-save'):null;
        if(!target||!target.classList.contains('is-dirty'))return;
        const next=load();
        if(!next.pending){next.pending=current();save(next)}
      }
      window.addEventListener('pointerdown',rememberBeforeSave,true);
      window.addEventListener('mousedown',rememberBeforeSave,true);
      window.addEventListener('keydown',event=>{
        if((event.key==='Enter'||event.key===' ')&&event.target instanceof Element&&event.target.closest('.kp-fe2-save'))rememberBeforeSave(event);
      },true);

      function counts(){
        const global=window.KPWordHistory?.counts?.()||{undo:0,redo:0};
        const frontend=window.KPFrontendEditorHistory?.counts?.()||{undo:0,redo:0};
        const persisted=load();
        return{
          globalUndo:Number(global.undo)||0,globalRedo:Number(global.redo)||0,
          frontendUndo:Number(frontend.undo)||0,frontendRedo:Number(frontend.redo)||0,
          savedUndo:persisted.undo.length,savedRedo:persisted.redo.length
        };
      }

      function refreshButtons(){
        const c=counts();
        const back=document.querySelector('[data-kp-word-history-new="undo"]');
        const forward=document.querySelector('[data-kp-word-history-new="redo"]');
        const canUndo=c.globalUndo>0||c.frontendUndo>0||c.savedUndo>0;
        const canRedo=c.globalRedo>0||c.frontendRedo>0||c.savedRedo>0;
        if(back){back.disabled=!canUndo;back.setAttribute('aria-disabled',canUndo?'false':'true')}
        if(forward){forward.disabled=!canRedo;forward.setAttribute('aria-disabled',canRedo?'false':'true')}
      }

      async function persistState(state){
        const fd=new FormData();
        fd.append('action','kp_fe_v2_save');
        fd.append('nonce',cfg.nonce||'');
        fd.append('page_key',cfg.pageKey);
        fd.append('payload',JSON.stringify({global:state.global||{},page:state.page||{}}));
        const response=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
        const json=await response.json().catch(()=>null);
        if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Änderung konnte nicht wiederhergestellt werden.');
      }

      async function savedStep(direction){
        const before=load();
        const working={undo:[...before.undo],redo:[...before.redo],pending:null};
        const now=current();
        let target=null;
        if(direction==='undo'){
          target=working.undo.pop()||null;
          if(!target)return false;
          working.redo.push(now);
        }else{
          target=working.redo.pop()||null;
          if(!target)return false;
          working.undo.push(now);
        }
        save(working);refreshButtons();
        try{
          toast(direction==='undo'?'Gespeicherte Änderung wird zurückgenommen …':'Änderung wird wiederholt …');
          await persistState(target);
          location.reload();
          return true;
        }catch(error){
          save(before);refreshButtons();toast(error?.message||'Wiederherstellung fehlgeschlagen.','error');
          return false;
        }
      }

      // Capture before the button's own listener. Normally KPWordHistory remains
      // authoritative. If it has no marker, use FE2's private history; after a
      // successful save/reload use the tab-local persisted save history.
      window.addEventListener('click',event=>{
        const button=event.target instanceof Element?event.target.closest('[data-kp-word-history-new]'):null;
        if(!button)return;
        const direction=button.dataset.kpWordHistoryNew;
        if(direction!=='undo'&&direction!=='redo')return;
        const c=counts();
        if(direction==='undo'){
          if(c.globalUndo>0)return;
          if(c.frontendUndo>0&&window.KPFrontendEditorHistory?.undo){
            event.preventDefault();event.stopImmediatePropagation();
            Promise.resolve(window.KPFrontendEditorHistory.undo()).finally(()=>requestAnimationFrame(refreshButtons));return;
          }
          if(c.savedUndo>0){event.preventDefault();event.stopImmediatePropagation();void savedStep('undo')}
        }else{
          if(c.globalRedo>0)return;
          if(c.frontendRedo>0&&window.KPFrontendEditorHistory?.redo){
            event.preventDefault();event.stopImmediatePropagation();
            Promise.resolve(window.KPFrontendEditorHistory.redo()).finally(()=>requestAnimationFrame(refreshButtons));return;
          }
          if(c.savedRedo>0){event.preventDefault();event.stopImmediatePropagation();void savedStep('redo')}
        }
      },true);

      window.addEventListener('kp:frontend-history-push',()=>requestAnimationFrame(refreshButtons));
      window.addEventListener('kp:frontend-history-change',()=>requestAnimationFrame(refreshButtons));
      const observer=new MutationObserver(()=>requestAnimationFrame(refreshButtons));
      observer.observe(document.documentElement,{childList:true,subtree:true});
      setInterval(refreshButtons,700);
      refreshButtons();
    })();
    </script>
    <?php
}, 4000 );
