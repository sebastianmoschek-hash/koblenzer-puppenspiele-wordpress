<?php
/**
 * Instant Word-style Undo/Redo for the owner-facing visual editor.
 *
 * Session arrows are deliberately separate from the 48-hour saved versions.
 * The runtime is extensible so every editing subsystem (including AI) can
 * contribute one chronological undo marker per logical user action.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <style id="kp-word-history-style">
      [data-kp-history-undo],[data-kp-v3],[data-kp-word-undo],[data-kp-word-redo],
      .kp-oa-history-nav,.kp-word-history-icon,.kp-fe2-undo{display:none!important}
      .kp-word-history-button{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 46px!important;width:46px!important;min-width:46px!important;max-width:46px!important;min-height:48px!important;padding:0!important;border-radius:15px!important;font-size:28px!important;line-height:1!important;font-weight:700!important;white-space:nowrap!important}
      .kp-word-history-button:disabled{opacity:.32!important;cursor:default!important;filter:saturate(.2)!important}
      @media(max-width:640px){
        .kp-oa-sticky-actions{display:grid!important;grid-template-columns:minmax(96px,1fr) 44px 44px minmax(118px,1.18fr)!important;align-items:stretch!important;gap:6px!important}
        .kp-oa-sticky-actions>.kp-word-history-button{width:44px!important;min-width:44px!important;max-width:44px!important;min-height:54px!important;border-radius:14px!important;font-size:27px!important}
        .kp-oa-sticky-actions .kp-oa-design-save,.kp-oa-sticky-actions button,.kp-oa-sticky-actions a{margin:0!important}
      }
    </style>
    <script id="kp-word-history-runtime">
    (()=>{
      'use strict';
      const cfg=window.KPOwnerWebApp;
      if(!cfg?.canEdit)return;
      const MAX=50,undoStack=[],redoStack=[],specialists=new Map();
      let restoring=false,pending=null,pendingTimer=0;
      const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];

      function register(kind,getter){if(kind&&typeof getter==='function')specialists.set(kind,getter);updateButtons()}
      register('frontend',()=>window.KPFrontendEditorHistory||null);
      register('layout',()=>window.KPCanvaLayoutRuntime||null);
      register('image',()=>window.KPCanvaImageRuntime||null);

      function runtime(kind){try{return specialists.get(kind)?.()||null}catch(_){return null}}
      function directControls(){
        return qa('.kp-oa-sheet input,.kp-oa-sheet select,.kp-oa-sheet textarea,.kp-fe2-inspector .kp-image-position-controls input,.kp-fe2-inspector .kp-image-position-controls select,.kp-fe2-inspector .kp-image-position-controls textarea')
          .filter(el=>!el.closest('.kp-history-sheet')&&!el.closest('[data-kp-word-history-new]')&&!el.closest('.kp-canva-image-panel'));
      }
      function isDirectControl(target){
        if(!(target instanceof Element))return null;
        const el=target.closest('.kp-oa-sheet input,.kp-oa-sheet select,.kp-oa-sheet textarea,.kp-fe2-inspector .kp-image-position-controls input,.kp-fe2-inspector .kp-image-position-controls select,.kp-fe2-inspector .kp-image-position-controls textarea');
        if(!el||el.closest('.kp-history-sheet,.kp-canva-image-panel,[data-kp-navigation-draft]'))return null;
        return el;
      }
      function controlKey(el){
        const data=[...el.attributes].filter(a=>a.name.startsWith('data-')).map(a=>`${a.name}=${a.value}`).sort().join('|');
        const zone=el.closest('.kp-image-position-controls')?'image-position':'owner';
        return [zone,el.tagName,el.type||'',el.name||'',el.id||'',data].join('::');
      }
      function captureControls(){
        const seen=new Map();
        return directControls().map(el=>{const base=controlKey(el),n=(seen.get(base)||0)+1;seen.set(base,n);return{el,key:`${base}::${n}`,value:el.value,checked:!!el.checked,selectedIndex:typeof el.selectedIndex==='number'?el.selectedIndex:-1}});
      }
      function currentControlMap(){
        const seen=new Map(),map=new Map();directControls().forEach(el=>{const base=controlKey(el),n=(seen.get(base)||0)+1;seen.set(base,n);map.set(`${base}::${n}`,el)});return map;
      }
      function restoreControls(state){
        if(!Array.isArray(state))return;restoring=true;const fallback=currentControlMap();
        try{state.forEach(item=>{const el=item.el?.isConnected?item.el:fallback.get(item.key);if(!el)return;if(el.type==='checkbox'||el.type==='radio')el.checked=!!item.checked;else if(el.tagName==='SELECT'&&item.selectedIndex>=0)el.selectedIndex=item.selectedIndex;else el.value=item.value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))})}finally{restoring=false}
      }
      function clearForeignRedo(kind){specialists.forEach((getter,name)=>{if(name!==kind)runtime(name)?.clearRedo?.()})}
      function push(entry){if(restoring||!entry)return false;undoStack.push(entry);if(undoStack.length>MAX)undoStack.shift();redoStack.length=0;clearForeignRedo(entry.kind||'controls');updateButtons();return true}
      function pushSpecialist(kind){if(!kind||!runtime(kind))return false;return push({kind})}

      function beginControlGesture(el){if(restoring||!el)return;clearTimeout(pendingTimer);pending={el,state:captureControls(),recorded:false}}
      function commitControlGesture(el){if(restoring||!el)return;if(!pending||pending.el!==el)beginControlGesture(el);if(pending&&!pending.recorded){push({kind:'controls',state:pending.state});pending.recorded=true}}
      function endControlGesture(){clearTimeout(pendingTimer);pendingTimer=setTimeout(()=>{pending=null},60)}
      document.addEventListener('pointerdown',e=>{const el=isDirectControl(e.target);if(el)beginControlGesture(el)},true);
      document.addEventListener('focusin',e=>{const el=isDirectControl(e.target);if(el&&!pending)beginControlGesture(el)},true);
      document.addEventListener('input',e=>{if(!e.isTrusted)return;const el=isDirectControl(e.target);if(el)commitControlGesture(el)},true);
      document.addEventListener('change',e=>{if(!e.isTrusted)return;const el=isDirectControl(e.target);if(el)commitControlGesture(el)},true);
      document.addEventListener('pointerup',endControlGesture,true);document.addEventListener('pointercancel',endControlGesture,true);document.addEventListener('focusout',endControlGesture,true);
      document.addEventListener('click',e=>{if(restoring||!e.isTrusted)return;const btn=e.target instanceof Element?e.target.closest('.kp-oa-sheet button'):null;if(!btn||btn.closest('.kp-history-sheet,.kp-canva-image-panel,[data-kp-navigation-draft]'))return;const text=(btn.textContent||'').replace(/\s+/g,' ').trim(),cls=String(btn.className||'');if(/reset/i.test(cls)||/zurücksetzen|standardwerte|auf 100|standard/i.test(text))push({kind:'controls',state:captureControls()})},true);

      window.addEventListener('kp:frontend-history-push',()=>pushSpecialist('frontend'));
      window.addEventListener('kp:frontend-history-change',updateButtons);
      window.addEventListener('kp:canva-layout-history-push',()=>pushSpecialist('layout'));
      window.addEventListener('kp:canva-layout-history-change',updateButtons);
      window.addEventListener('kp:canva-image-history-push',()=>pushSpecialist('image'));
      window.addEventListener('kp:canva-image-history-change',updateButtons);

      function undo(){
        const entry=undoStack.pop();if(!entry){updateButtons();return false}
        if(entry.kind==='controls'){const current=captureControls();restoreControls(entry.state);redoStack.push({kind:'controls',state:current})}
        else{const ok=!!runtime(entry.kind)?.undo?.();if(!ok){undoStack.push(entry);updateButtons();return false}redoStack.push({kind:entry.kind})}
        if(redoStack.length>MAX)redoStack.shift();updateButtons();return true;
      }
      function redo(){
        const entry=redoStack.pop();if(!entry){updateButtons();return false}
        if(entry.kind==='controls'){const current=captureControls();restoreControls(entry.state);undoStack.push({kind:'controls',state:current})}
        else{const ok=!!runtime(entry.kind)?.redo?.();if(!ok){redoStack.push(entry);updateButtons();return false}undoStack.push({kind:entry.kind})}
        if(undoStack.length>MAX)undoStack.shift();updateButtons();return true;
      }
      function findBar(){const direct=q('.kp-oa-sticky-actions');if(direct)return direct;const candidates=qa('div,nav,footer').filter(el=>{const text=(el.textContent||'').replace(/\s+/g,' ').trim();return /Vorschau/i.test(text)&&/Speichern/i.test(text)&&el.querySelectorAll('button,a').length>=2});return candidates.sort((a,b)=>a.children.length-b.children.length)[0]||null}
      function removeLegacyControls(bar){qa('[data-kp-history-undo]').forEach(el=>el.remove());if(!bar)return;qa('[data-kp-v3],[data-kp-word-undo],[data-kp-word-redo],.kp-oa-history-nav,.kp-word-history-icon',bar).forEach(el=>el.remove());qa('button,a',bar).forEach(el=>{if(el.dataset.kpWordHistoryNew)return;const t=(el.textContent||'').replace(/\s+/g,' ').trim();if(/^(?:↶\s*)?(?:Rückgängig|Zurück)$/i.test(t)||/^(?:↷\s*)?(?:Vor|Wiederholen)$/i.test(t))el.remove()})}
      function updateVersionCopy(){qa('.kp-history-sheet .kp-oa-head p').forEach(p=>p.textContent='Gespeicherte Website-Stände der letzten 48 Stunden. Diese Wiederherstellung ist bewusst getrennt von den beiden Bearbeitungs-Pfeilen.');qa('.kp-history-sheet .kp-history-row small').forEach(s=>s.textContent=(s.textContent||'').replace(/\s*·\s*Rückgängig-Schritt\s*/g,'').trim())}
      function install(){
        const bar=findBar();removeLegacyControls(bar);updateVersionCopy();if(!bar)return;
        let back=q('[data-kp-word-history-new="undo"]',bar),forward=q('[data-kp-word-history-new="redo"]',bar);const controls=qa('button,a',bar),preview=controls.find(el=>/Vorschau/i.test(el.textContent||'')),save=controls.find(el=>/Speichern/i.test(el.textContent||''));if(!preview||!save)return;
        if(!back){back=document.createElement('button');back.type='button';back.className='kp-oa-secondary kp-word-history-button';back.dataset.kpWordHistoryNew='undo';back.setAttribute('aria-label','Rückgängig');back.textContent='↶';back.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();undo()})}
        if(!forward){forward=document.createElement('button');forward.type='button';forward.className='kp-oa-secondary kp-word-history-button';forward.dataset.kpWordHistoryNew='redo';forward.setAttribute('aria-label','Wiederholen');forward.textContent='↷';forward.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();redo()})}
        bar.insertBefore(back,save);bar.insertBefore(forward,save);updateButtons();
      }
      function updateButtons(){const back=q('[data-kp-word-history-new="undo"]'),forward=q('[data-kp-word-history-new="redo"]');if(back){back.disabled=undoStack.length===0;back.title=`Rückgängig (${undoStack.length} Schritt${undoStack.length===1?'':'e'})`}if(forward){forward.disabled=redoStack.length===0;forward.title=`Wiederholen (${redoStack.length} Schritt${redoStack.length===1?'':'e'})`}}
      window.KPWordHistory={undo,redo,counts:()=>({undo:undoStack.length,redo:redoStack.length}),register,push:pushSpecialist,refresh:updateButtons};
      const observer=new MutationObserver(()=>requestAnimationFrame(install));observer.observe(document.documentElement,{childList:true,subtree:true});install();
    })();
    </script>
    <?php
}, 2000 );
