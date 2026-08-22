<?php
/**
 * Bootstrap and compatibility layer for the Word-style owner history controls.
 * Keeps editor software/UI outside restorable website snapshots.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'plugins_loaded', static function () {
    if ( class_exists( 'KP_Owner_Undo_Redo' ) ) {
        KP_Owner_Undo_Redo::init();
        // Use one compatibility-safe UI below rather than the module's first draft.
        remove_action( 'wp_footer', array( 'KP_Owner_Undo_Redo', 'print_ui' ), 1000 );
    }
}, 1 );

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <style id="kp-owner-history-v3-style">
      .kp-oa-action-grid [data-kp-history-undo]{display:none!important}
      .kp-oa-history-nav{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;min-width:70px!important;white-space:nowrap!important}
      .kp-oa-history-nav>span:first-child{font-size:20px;line-height:1}
      .kp-oa-history-nav:disabled{opacity:.36!important;cursor:default!important;filter:saturate(.25)}
      .kp-history-scope-note{margin:10px 0 16px;padding:11px 13px;border-radius:12px;background:rgba(255,255,255,.06);font-size:13px;line-height:1.45}
      @media(max-width:640px){.kp-oa-history-nav{min-width:46px!important;padding-left:9px!important;padding-right:9px!important}.kp-oa-history-nav .kp-history-label{display:none}}
    </style>
    <script id="kp-owner-history-v3-ui">
    (()=>{
      'use strict';
      const cfg=window.KPOwnerWebApp;
      if(!cfg?.canEdit)return;
      const q=(s,r=document)=>r.querySelector(s);
      const qa=(s,r=document)=>[...r.querySelectorAll(s)];
      async function api(action,fields={}){
        const fd=new FormData();fd.append('action',action);fd.append('nonce',cfg.nonce||'');
        Object.entries(fields).forEach(([k,v])=>fd.append(k,String(v)));
        const res=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',body:fd});
        const json=await res.json().catch(()=>null);
        if(!res.ok||!json?.success)throw new Error(json?.data?.message||'Aktion fehlgeschlagen.');
        return json.data||{};
      }
      function toast(text,type='ok'){
        let el=q('.kp-oa-toast')||q('.kp-fe2-toast');
        if(!el){el=document.createElement('div');el.className='kp-oa-toast';document.body.appendChild(el);}
        const base=el.classList.contains('kp-fe2-toast')?'kp-fe2-toast':'kp-oa-toast';
        el.textContent=text;el.className=base+' is-visible is-'+type;
        clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('is-visible'),2500);
      }
      async function sync(){
        const undo=q('.kp-oa-history-nav[data-kp-v3="undo"]');
        const redo=q('.kp-oa-history-nav[data-kp-v3="redo"]');
        if(!undo&&!redo)return;
        try{
          const d=await api('kp_owner_history_list');
          const u=Number(d.undo_steps)||0,r=Number(d.redo_steps)||0;
          if(undo){undo.disabled=!u;undo.title=`Rückgängig (${u} verfügbar)`;}
          if(redo){redo.disabled=!r;redo.title=`Wiederholen (${r} verfügbar)`;}
        }catch(_){ }
      }
      function install(){
        const actions=q('.kp-oa-sticky-actions');
        if(actions&&!q('[data-kp-v3="undo"]',actions)){
          const undo=document.createElement('button');undo.type='button';undo.className='kp-oa-secondary kp-oa-history-nav';undo.dataset.kpV3='undo';undo.innerHTML='<span aria-hidden="true">↶</span><span class="kp-history-label">Zurück</span>';undo.setAttribute('aria-label','Rückgängig');
          const redo=document.createElement('button');redo.type='button';redo.className='kp-oa-secondary kp-oa-history-nav';redo.dataset.kpV3='redo';redo.innerHTML='<span aria-hidden="true">↷</span><span class="kp-history-label">Vor</span>';redo.setAttribute('aria-label','Wiederholen');
          const save=q('.kp-oa-design-save',actions);actions.insertBefore(undo,save||null);actions.insertBefore(redo,save||null);sync();
        }
        qa('.kp-history-sheet .kp-oa-head p').forEach(p=>{p.textContent='Stellt gespeicherte Website-Inhalte und Gestaltung wieder her. Neue Editor-Funktionen, Buttons und Bedienung bleiben immer auf dem aktuellen Softwarestand.';});
        const list=q('.kp-history-sheet .kp-history-list');
        if(list&&!q('.kp-history-scope-note',list.parentElement)){
          const note=document.createElement('div');note.className='kp-history-scope-note';note.innerHTML='<strong>Wichtig:</strong> Eine Version ist kein Software-Rollback. Neue Editor-Funktionen, Menüs und Buttons bleiben erhalten.';list.parentElement.insertBefore(note,list);
        }
      }
      async function step(kind,button){
        if(button.disabled)return;
        button.disabled=true;
        try{const d=await api(kind==='undo'?'kp_owner_history_undo':'kp_owner_history_redo');toast(d.message||(kind==='undo'?'Rückgängig ✓':'Wiederholt ✓'),'ok');setTimeout(()=>location.reload(),220);}
        catch(e){toast(e.message,'error');button.disabled=false;sync();}
      }
      // Capture new controls before legacy document click handlers can see them.
      document.addEventListener('click',e=>{
        const b=e.target instanceof Element?e.target.closest('.kp-oa-history-nav[data-kp-v3]'):null;
        if(!b)return;
        e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
        step(b.dataset.kpV3,b);
      },true);
      new MutationObserver(()=>{install();}).observe(document.documentElement,{childList:true,subtree:true});
      install();
    })();
    </script>
    <?php
}, 1001 );
