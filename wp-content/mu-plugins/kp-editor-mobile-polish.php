<?php
/**
 * Small late-running owner-editor polish layer.
 *
 * - keeps the Word-style arrows useful after FE2 save/reload in the same tab
 * - falls back to FE2's private in-session history if the global marker is missing
 * - separates the floating AI and owner-tools buttons on mobile
 * - keeps the two history arrows visually close together
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
      @media(max-width:782px){
        body.kp-fe2-editing .kp-ai-trigger{
          right:12px!important;
          bottom:max(138px,calc(env(safe-area-inset-bottom) + 128px))!important;
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
