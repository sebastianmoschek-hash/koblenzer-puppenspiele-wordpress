<?php
/**
 * Compact Word-style history controls for the owner toolbar.
 * Removes the legacy text undo button from the visible bottom bar and
 * inserts icon-only undo/redo controls between Preview and Save.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <style id="kp-owner-history-toolbar-fix-style">
      [data-kp-history-undo]{display:none!important}
      .kp-word-history-icon{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 52px!important;width:52px!important;min-width:52px!important;max-width:52px!important;padding:0!important;font-size:28px!important;line-height:1!important}
      .kp-word-history-icon:disabled{opacity:.35!important;cursor:default!important}
      @media(max-width:640px){.kp-word-history-icon{flex-basis:48px!important;width:48px!important;min-width:48px!important;max-width:48px!important;font-size:26px!important}}
    </style>
    <script id="kp-owner-history-toolbar-fix-ui">
    (()=>{
      'use strict';
      const cfg=window.KPOwnerWebApp;
      if(!cfg?.canEdit)return;
      const q=(s,r=document)=>r.querySelector(s);
      const qa=(s,r=document)=>[...r.querySelectorAll(s)];

      async function api(action){
        const fd=new FormData();
        fd.append('action',action);fd.append('nonce',cfg.nonce||'');
        const res=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',body:fd});
        const json=await res.json().catch(()=>null);
        if(!res.ok||!json?.success)throw new Error(json?.data?.message||'Aktion fehlgeschlagen.');
        return json.data||{};
      }

      function findBar(){
        const candidates=qa('div,nav,footer').filter(el=>{
          const text=(el.textContent||'').replace(/\s+/g,' ').trim();
          return /Vorschau/i.test(text)&&/Speichern/i.test(text)&&el.querySelectorAll('button,a').length>=2;
        });
        return candidates.sort((a,b)=>a.children.length-b.children.length)[0]||null;
      }

      async function refresh(undo,redo){
        try{
          const d=await api('kp_owner_history_list');
          const u=Number(d.undo_steps)||0,r=Number(d.redo_steps)||0;
          undo.disabled=!u;redo.disabled=!r;
          undo.title=`Rückgängig (${u} verfügbar)`;
          redo.title=`Wiederholen (${r} verfügbar)`;
        }catch(_){ }
      }

      async function go(action,undo,redo){
        undo.disabled=true;redo.disabled=true;
        try{await api(action);setTimeout(()=>location.reload(),180);}
        catch(_){refresh(undo,redo);}
      }

      function install(){
        qa('[data-kp-history-undo]').forEach(el=>el.remove());
        const bar=findBar();
        if(!bar||bar.dataset.kpCompactHistory==='1')return;
        const controls=qa('button,a',bar);
        const preview=controls.find(el=>/Vorschau/i.test(el.textContent||''));
        const save=controls.find(el=>/Speichern/i.test(el.textContent||''));
        if(!preview||!save)return;

        qa('[data-kp-word-undo],[data-kp-word-redo]',bar).forEach(el=>el.remove());

        const undo=document.createElement('button');
        undo.type='button';undo.className='kp-word-history-icon';undo.dataset.kpWordUndo='1';undo.setAttribute('aria-label','Rückgängig');undo.textContent='↶';
        const redo=document.createElement('button');
        redo.type='button';redo.className='kp-word-history-icon';redo.dataset.kpWordRedo='1';redo.setAttribute('aria-label','Wiederholen');redo.textContent='↷';
        undo.addEventListener('click',()=>go('kp_owner_history_undo',undo,redo));
        redo.addEventListener('click',()=>go('kp_owner_history_redo',undo,redo));

        bar.insertBefore(undo,save);
        bar.insertBefore(redo,save);
        bar.dataset.kpCompactHistory='1';
        refresh(undo,redo);
      }

      new MutationObserver(()=>requestAnimationFrame(install)).observe(document.documentElement,{childList:true,subtree:true});
      install();
    })();
    </script>
    <?php
}, 1002 );
