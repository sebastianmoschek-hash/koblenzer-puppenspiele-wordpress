<?php
/**
 * Instant Word-style Undo/Redo for the owner-facing visual editor.
 *
 * Important separation of concerns:
 * - The two arrow buttons operate ONLY on the current browser editing session.
 * - They never call the 48-hour server snapshot/restore endpoints.
 * - The 48-hour Versions UI remains an explicit safety net.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <style id="kp-word-history-style">
      /* Never show the old text undo controls alongside the Word-style arrows. */
      [data-kp-history-undo],
      [data-kp-v3],
      [data-kp-word-undo],
      [data-kp-word-redo],
      .kp-oa-history-nav,
      .kp-word-history-icon,
      .kp-fe2-undo { display:none!important; }

      .kp-word-history-button{
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        flex:0 0 46px!important;
        width:46px!important;
        min-width:46px!important;
        max-width:46px!important;
        min-height:48px!important;
        padding:0!important;
        border-radius:15px!important;
        font-size:28px!important;
        line-height:1!important;
        font-weight:700!important;
        white-space:nowrap!important;
      }
      .kp-word-history-button:disabled{
        opacity:.32!important;
        cursor:default!important;
        filter:saturate(.2)!important;
      }

      @media(max-width:640px){
        .kp-oa-sticky-actions{
          display:grid!important;
          grid-template-columns:minmax(96px,1fr) 44px 44px minmax(118px,1.18fr)!important;
          align-items:stretch!important;
          gap:6px!important;
        }
        .kp-oa-sticky-actions>.kp-word-history-button{
          width:44px!important;
          min-width:44px!important;
          max-width:44px!important;
          min-height:54px!important;
          border-radius:14px!important;
          font-size:27px!important;
        }
        .kp-oa-sticky-actions .kp-oa-design-save,
        .kp-oa-sticky-actions button,
        .kp-oa-sticky-actions a{
          margin:0!important;
        }
      }
    </style>
    <script id="kp-word-history-runtime">
    (()=>{
      'use strict';
      const cfg=window.KPOwnerWebApp;
      if(!cfg?.canEdit)return;

      const MAX=50;
      const undoStack=[];
      const redoStack=[];
      let restoring=false;
      let pending=null;
      let pendingTimer=0;
      const q=(s,r=document)=>r.querySelector(s);
      const qa=(s,r=document)=>[...r.querySelectorAll(s)];

      function historyRuntime(){ return window.KPFrontendEditorHistory||null; }

      function ownerControls(){
        return qa('.kp-oa-sheet input,.kp-oa-sheet select,.kp-oa-sheet textarea')
          .filter(el=>!el.closest('.kp-history-sheet')&&!el.closest('[data-kp-word-history-new]'));
      }

      function controlKey(el){
        if(!el)return '';
        const data=[...el.attributes]
          .filter(a=>a.name.startsWith('data-'))
          .map(a=>`${a.name}=${a.value}`)
          .sort()
          .join('|');
        return [el.tagName,el.type||'',el.name||'',el.id||'',data].join('::');
      }

      function captureControls(){
        const seen=new Map();
        return ownerControls().map(el=>{
          const base=controlKey(el);
          const n=(seen.get(base)||0)+1;seen.set(base,n);
          return {
            el,
            key:`${base}::${n}`,
            value:el.value,
            checked:!!el.checked,
            selectedIndex:typeof el.selectedIndex==='number'?el.selectedIndex:-1
          };
        });
      }

      function currentControlMap(){
        const seen=new Map(),map=new Map();
        ownerControls().forEach(el=>{
          const base=controlKey(el);
          const n=(seen.get(base)||0)+1;seen.set(base,n);
          map.set(`${base}::${n}`,el);
        });
        return map;
      }

      function restoreControls(state){
        if(!Array.isArray(state))return;
        restoring=true;
        const fallback=currentControlMap();
        try{
          state.forEach(item=>{
            const el=item.el?.isConnected?item.el:fallback.get(item.key);
            if(!el)return;
            if(el.type==='checkbox'||el.type==='radio')el.checked=!!item.checked;
            else if(el.tagName==='SELECT'&&item.selectedIndex>=0)el.selectedIndex=item.selectedIndex;
            else el.value=item.value;
            el.dispatchEvent(new Event('input',{bubbles:true}));
            el.dispatchEvent(new Event('change',{bubbles:true}));
          });
        } finally {
          restoring=false;
        }
      }

      function push(entry){
        if(restoring||!entry)return;
        undoStack.push(entry);
        if(undoStack.length>MAX)undoStack.shift();
        redoStack.length=0;
        if(entry.kind!=='frontend')historyRuntime()?.clearRedo?.();
        updateButtons();
      }

      function beginControlGesture(el){
        if(restoring||!el||el.closest('.kp-fe2-inspector,.kp-fe2-toolbar,.kp-fe2-record-backdrop'))return;
        clearTimeout(pendingTimer);
        pending={el,state:captureControls(),recorded:false};
      }

      function commitControlGesture(el){
        if(restoring||!el||el.closest('.kp-fe2-inspector,.kp-fe2-toolbar,.kp-fe2-record-backdrop'))return;
        if(!pending||pending.el!==el)beginControlGesture(el);
        if(pending&&!pending.recorded){
          push({kind:'controls',state:pending.state});
          pending.recorded=true;
        }
      }

      function endControlGesture(){
        clearTimeout(pendingTimer);
        pendingTimer=setTimeout(()=>{pending=null;},40);
      }

      function isOwnerControl(target){
        return target instanceof Element ? target.closest('.kp-oa-sheet input,.kp-oa-sheet select,.kp-oa-sheet textarea') : null;
      }

      document.addEventListener('pointerdown',e=>{
        const el=isOwnerControl(e.target);if(el)beginControlGesture(el);
      },true);
      document.addEventListener('focusin',e=>{
        const el=isOwnerControl(e.target);if(el&&!pending)beginControlGesture(el);
      },true);
      document.addEventListener('input',e=>{
        if(!e.isTrusted)return;
        const el=isOwnerControl(e.target);if(el)commitControlGesture(el);
      },true);
      document.addEventListener('change',e=>{
        if(!e.isTrusted)return;
        const el=isOwnerControl(e.target);if(el)commitControlGesture(el);
      },true);
      document.addEventListener('pointerup',endControlGesture,true);
      document.addEventListener('pointercancel',endControlGesture,true);
      document.addEventListener('focusout',endControlGesture,true);

      // Reset/default actions often change many controls at once. Capture one state
      // before the existing handler performs the reset.
      document.addEventListener('click',e=>{
        if(restoring||!e.isTrusted)return;
        const btn=e.target instanceof Element?e.target.closest('.kp-oa-sheet button'):null;
        if(!btn||btn.closest('.kp-history-sheet'))return;
        const text=(btn.textContent||'').replace(/\s+/g,' ').trim();
        const cls=String(btn.className||'');
        if(/reset/i.test(cls)||/zurücksetzen|standardwerte|auf 100|standard/i.test(text)){
          push({kind:'controls',state:captureControls()});
        }
      },true);

      // The frontend editor has its own exact draft+DOM snapshots. We only keep
      // a chronological marker here, so the two global arrows can drive it.
      window.addEventListener('kp:frontend-history-push',()=>push({kind:'frontend'}));
      window.addEventListener('kp:frontend-history-change',updateButtons);

      function undo(){
        const entry=undoStack.pop();
        if(!entry){updateButtons();return;}
        if(entry.kind==='frontend'){
          const rt=historyRuntime();
          if(!rt?.undo?.()){
            updateButtons();return;
          }
          redoStack.push({kind:'frontend'});
        }else{
          const current=captureControls();
          restoreControls(entry.state);
          redoStack.push({kind:'controls',state:current});
        }
        if(redoStack.length>MAX)redoStack.shift();
        updateButtons();
      }

      function redo(){
        const entry=redoStack.pop();
        if(!entry){updateButtons();return;}
        if(entry.kind==='frontend'){
          const rt=historyRuntime();
          if(!rt?.redo?.()){
            updateButtons();return;
          }
          undoStack.push({kind:'frontend'});
        }else{
          const current=captureControls();
          restoreControls(entry.state);
          undoStack.push({kind:'controls',state:current});
        }
        if(undoStack.length>MAX)undoStack.shift();
        updateButtons();
      }

      function findBar(){
        const direct=q('.kp-oa-sticky-actions');
        if(direct)return direct;
        const candidates=qa('div,nav,footer').filter(el=>{
          const text=(el.textContent||'').replace(/\s+/g,' ').trim();
          return /Vorschau/i.test(text)&&/Speichern/i.test(text)&&el.querySelectorAll('button,a').length>=2;
        });
        return candidates.sort((a,b)=>a.children.length-b.children.length)[0]||null;
      }

      function removeLegacyControls(bar){
        qa('[data-kp-history-undo]').forEach(el=>el.remove());
        if(!bar)return;
        qa('[data-kp-v3],[data-kp-word-undo],[data-kp-word-redo],.kp-oa-history-nav,.kp-word-history-icon',bar).forEach(el=>el.remove());
        qa('button,a',bar).forEach(el=>{
          if(el.dataset.kpWordHistoryNew)return;
          const t=(el.textContent||'').replace(/\s+/g,' ').trim();
          if(/^(?:↶\s*)?(?:Rückgängig|Zurück)$/i.test(t)||/^(?:↷\s*)?(?:Vor|Wiederholen)$/i.test(t))el.remove();
        });
      }

      function updateVersionCopy(){
        qa('.kp-history-sheet .kp-oa-head p').forEach(p=>{
          p.textContent='Gespeicherte Website-Stände der letzten 48 Stunden. Diese Wiederherstellung ist bewusst getrennt von den beiden Bearbeitungs-Pfeilen.';
        });
        qa('.kp-history-sheet .kp-history-row small').forEach(s=>{
          s.textContent=(s.textContent||'').replace(/\s*·\s*Rückgängig-Schritt\s*/g,'').trim();
        });
      }

      function install(){
        const bar=findBar();
        removeLegacyControls(bar);
        updateVersionCopy();
        if(!bar)return;
        let back=q('[data-kp-word-history-new="undo"]',bar);
        let forward=q('[data-kp-word-history-new="redo"]',bar);
        const controls=qa('button,a',bar);
        const preview=controls.find(el=>/Vorschau/i.test(el.textContent||''));
        const save=controls.find(el=>/Speichern/i.test(el.textContent||''));
        if(!preview||!save)return;
        if(!back){
          back=document.createElement('button');
          back.type='button';back.className='kp-oa-secondary kp-word-history-button';
          back.dataset.kpWordHistoryNew='undo';back.setAttribute('aria-label','Rückgängig');back.textContent='↶';
          back.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();undo();});
        }
        if(!forward){
          forward=document.createElement('button');
          forward.type='button';forward.className='kp-oa-secondary kp-word-history-button';
          forward.dataset.kpWordHistoryNew='redo';forward.setAttribute('aria-label','Wiederholen');forward.textContent='↷';
          forward.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();redo();});
        }
        if(back.parentElement!==bar)bar.insertBefore(back,save);
        if(forward.parentElement!==bar)bar.insertBefore(forward,save);
        // Keep the order deterministic even when the owner toolbar rebuilds itself.
        bar.insertBefore(back,save);
        bar.insertBefore(forward,save);
        updateButtons();
      }

      function updateButtons(){
        const back=q('[data-kp-word-history-new="undo"]');
        const forward=q('[data-kp-word-history-new="redo"]');
        if(back){back.disabled=undoStack.length===0;back.title=`Rückgängig (${undoStack.length} Schritt${undoStack.length===1?'':'e'})`;}
        if(forward){forward.disabled=redoStack.length===0;forward.title=`Wiederholen (${redoStack.length} Schritt${redoStack.length===1?'':'e'})`;}
      }

      window.KPWordHistory={undo,redo,counts:()=>({undo:undoStack.length,redo:redoStack.length})};
      const observer=new MutationObserver(()=>requestAnimationFrame(install));
      observer.observe(document.documentElement,{childList:true,subtree:true});
      install();
    })();
    </script>
    <?php
}, 2000 );
