<?php
/**
 * Persistent semantic Undo/Redo for owner controls.
 *
 * Design, responsive-size and horizontal-menu controls are frequently rebuilt
 * when the owner sheet changes. DOM-only snapshots therefore lose their target.
 * This runtime stores stable semantic keys plus a fallback control reference,
 * covers both human and AI/programmatic changes, and groups one programmatic
 * batch (for example a preset load) into one Word-style Undo step.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <script id="kp-synthetic-control-history">
    (()=>{
      'use strict';
      const MAX=50,history=[],redo=[],known=new Map();
      const selectors='[data-design],[data-kp-size],[data-kp-menu-x] input';
      let applying=false,humanGesture=null,programBatch=null,programTimer=0,sizeResetBefore=null;

      function key(el){
        if(el?.dataset?.design)return `design:${el.dataset.design}`;
        if(el?.dataset?.kpSize)return `size:${el.dataset.kpSize}`;
        if(el?.closest?.('[data-kp-menu-x]'))return 'menu-x';
        return '';
      }
      function value(el){return el.type==='checkbox'||el.type==='radio'?!!el.checked:String(el.value)}
      function equal(a,b){return JSON.stringify(a)===JSON.stringify(b)}
      function assign(el,next){if(el.type==='checkbox'||el.type==='radio')el.checked=!!next;else el.value=String(next)}
      function find(k){
        if(k.startsWith('design:'))return document.querySelector(`[data-design="${CSS.escape(k.slice(7))}"]`);
        if(k.startsWith('size:'))return document.querySelector(`[data-kp-size="${CSS.escape(k.slice(5))}"]`);
        if(k==='menu-x')return document.querySelector('[data-kp-menu-x] input');
        return null;
      }
      function topDetachedRoot(el){
        if(!el||el.isConnected)return null;
        let root=el.closest('label')||el;
        while(root.parentElement&&!root.parentElement.isConnected)root=root.parentElement;
        return root;
      }
      function withConnected(el,fn){
        if(!el||el.isConnected)return fn(el);
        const root=topDetachedRoot(el);if(!root)return fn(el);
        const holder=document.createElement('div');holder.hidden=true;holder.dataset.kpHistoryTemp='1';document.body.appendChild(holder);holder.appendChild(root);
        try{return fn(el)}finally{root.remove();holder.remove()}
      }
      function remember(el,force=true){const k=key(el);if(!k)return;const old=known.get(k);if(force||!old)known.set(k,{value:value(el),ref:el});else if(el.isConnected)known.set(k,{...old,ref:el})}
      function hydrate(el){
        const k=key(el);if(!k)return;const old=known.get(k);
        if(!old){remember(el,true);return}
        known.set(k,{...old,ref:el});
        if(equal(value(el),old.value))return;
        applying=true;
        try{
          assign(el,old.value);
          el.dispatchEvent(new Event('input',{bubbles:true}));
          el.dispatchEvent(new Event('change',{bubbles:true}));
          known.set(k,{value:old.value,ref:el});
        }finally{applying=false}
      }
      function scan(root=document){
        const list=[];if(root instanceof Element&&root.matches(selectors))list.push(root);root.querySelectorAll?.(selectors).forEach(el=>list.push(el));
        list.forEach(hydrate);
      }
      function snapshot(prefix=''){
        const out=new Map();document.querySelectorAll(selectors).forEach(el=>{const k=key(el);if(k&&(!prefix||k.startsWith(prefix)))out.set(k,{key:k,value:value(el),ref:el})});return out;
      }
      function makeChange(k,before,after,ref){return{key:k,before,after,ref}}
      function pushEntry(entry,removeGeneric=false){
        if(!entry?.changes?.length)return null;
        if(removeGeneric)window.KPWordHistory?.discardLastControlsMarker?.();
        history.push(entry);if(history.length>MAX)history.shift();redo.length=0;window.KPWordHistory?.push?.('synthetic-controls');return entry;
      }
      function addChange(entry,k,before,after,ref){
        if(equal(before,after))return false;
        let change=entry.changes.find(c=>c.key===k);
        if(!change){change=makeChange(k,before,after,ref);entry.changes.push(change)}else{change.after=after;if(ref)change.ref=ref}
        return true;
      }

      function applyOne(change,next){
        const el=find(change.key)||change.ref||known.get(change.key)?.ref;if(!el)return false;
        applying=true;
        try{
          return withConnected(el,control=>{
            assign(control,next);
            known.set(change.key,{value:next,ref:control});
            control.dispatchEvent(new Event('input',{bubbles:true}));
            control.dispatchEvent(new Event('change',{bubbles:true}));
            return true;
          });
        }finally{applying=false}
      }
      function applyEntry(entry,side){
        if(!entry?.changes?.length)return false;
        const list=side==='before'?[...entry.changes].reverse():entry.changes;
        let ok=true;for(const change of list)ok=applyOne(change,change[side])&&ok;return ok;
      }
      function undo(){const e=history.pop();if(!e)return false;if(!applyEntry(e,'before')){history.push(e);return false}redo.push(e);if(redo.length>MAX)redo.shift();return true}
      function redoStep(){const e=redo.pop();if(!e)return false;if(!applyEntry(e,'after')){redo.push(e);return false}history.push(e);if(history.length>MAX)history.shift();return true}
      function clearRedo(){redo.length=0}
      const runtime={undo,redo:redoStep,clearRedo,counts:()=>({undo:history.length,redo:redo.length})};
      function register(){if(window.KPWordHistory?.register){window.KPWordHistory.register('synthetic-controls',()=>runtime);return true}return false}
      register();setInterval(register,500);scan();
      new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n instanceof Element)scan(n)}))).observe(document.documentElement,{childList:true,subtree:true});

      function beginHuman(el){const k=key(el);if(!k)return;const baseline=known.get(k);humanGesture={key:k,before:baseline?baseline.value:value(el),ref:el,entry:null}}
      function endHuman(){setTimeout(()=>{humanGesture=null},0)}
      document.addEventListener('pointerdown',e=>{const el=e.target instanceof Element?e.target.closest(selectors):null;if(el)beginHuman(el)},true);
      document.addEventListener('focusin',e=>{const el=e.target instanceof Element?e.target.closest(selectors):null;if(el&&(!humanGesture||humanGesture.key!==key(el)))beginHuman(el)},true);
      document.addEventListener('pointerup',endHuman,true);document.addEventListener('pointercancel',endHuman,true);document.addEventListener('focusout',endHuman,true);

      function handleHuman(el,k,after){
        if(!humanGesture||humanGesture.key!==k)beginHuman(el);
        const before=humanGesture?.before;
        if(!equal(before,after)){
          if(!humanGesture.entry){humanGesture.entry=pushEntry({changes:[makeChange(k,before,after,el)]},true)}
          else addChange(humanGesture.entry,k,before,after,el);
        }
        known.set(k,{value:after,ref:el});
      }
      function closeProgramBatch(){clearTimeout(programTimer);programTimer=setTimeout(()=>{programBatch=null},140)}
      function handleProgram(el,k,after){
        const baseline=known.get(k),before=baseline?baseline.value:after;known.set(k,{value:after,ref:el});if(equal(before,after))return;
        if(!programBatch){programBatch={changes:[]};addChange(programBatch,k,before,after,el);pushEntry(programBatch,true)}else addChange(programBatch,k,before,after,el);
        closeProgramBatch();
      }
      function onControl(e){
        const el=e.target instanceof Element?e.target.closest(selectors):null;if(!el)return;const k=key(el);if(!k)return;const after=value(el);
        if(applying){known.set(k,{value:after,ref:el});return}
        if(e.isTrusted)handleHuman(el,k,after);else handleProgram(el,k,after);
      }
      document.addEventListener('input',onControl,true);document.addEventListener('change',onControl,true);

      // The responsive "Alles auf 100 %" button assigns values directly without
      // dispatching input events. Capture it as one semantic batch explicitly.
      window.addEventListener('click',e=>{
        const btn=e.target instanceof Element?e.target.closest('.kp-oa-size-reset'):null;if(!btn)return;sizeResetBefore=snapshot('size:');
        setTimeout(()=>{
          if(!sizeResetBefore)return;const after=snapshot('size:'),entry={changes:[]};
          sizeResetBefore.forEach((item,k)=>{const next=after.get(k);if(next)addChange(entry,k,item.value,next.value,next.ref||item.ref);known.set(k,{value:next?.value??item.value,ref:next?.ref||item.ref})});
          sizeResetBefore=null;if(entry.changes.length)pushEntry(entry,true);
        },0);
      },true);
    })();
    </script>
    <?php
}, 2200 );
