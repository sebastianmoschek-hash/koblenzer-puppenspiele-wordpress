<?php
/**
 * Undo bridge for programmatic editor-control changes (primarily AI actions).
 * Human input is already handled by kp-word-history; this module deliberately
 * listens only to synthetic input/change events so one AI control change also
 * becomes a normal Word-style undo/redo step.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <script id="kp-synthetic-control-history">
    (()=>{
      'use strict';
      const MAX=50,history=[],redo=[],known=new Map();
      let applying=false;
      const selectors='[data-design],[data-kp-size],[data-kp-menu-x] input,.kp-image-position-controls input,.kp-image-position-controls select,.kp-image-position-controls textarea';
      function key(el){
        if(el.dataset.design)return `design:${el.dataset.design}`;
        if(el.dataset.kpSize)return `size:${el.dataset.kpSize}`;
        if(el.closest('[data-kp-menu-x]'))return 'menu-x';
        if(el.closest('.kp-image-position-controls'))return `image-position:${el.className||el.name||el.type||'control'}`;
        return '';
      }
      function value(el){return el.type==='checkbox'||el.type==='radio'?!!el.checked:String(el.value)}
      function equal(a,b){return JSON.stringify(a)===JSON.stringify(b)}
      function scan(root=document){
        const list=[];if(root instanceof Element&&root.matches(selectors))list.push(root);root.querySelectorAll?.(selectors).forEach(el=>list.push(el));
        list.forEach(el=>{const k=key(el);if(k&&!known.has(k))known.set(k,value(el))});
      }
      function find(k){
        if(k.startsWith('design:'))return document.querySelector(`[data-design="${CSS.escape(k.slice(7))}"]`);
        if(k.startsWith('size:'))return document.querySelector(`[data-kp-size="${CSS.escape(k.slice(5))}"]`);
        if(k==='menu-x')return document.querySelector('[data-kp-menu-x] input');
        if(k.startsWith('image-position:'))return document.querySelector('.kp-image-position-controls input,.kp-image-position-controls select,.kp-image-position-controls textarea');
        return null;
      }
      function apply(entry,next){
        const el=find(entry.key);if(!el)return false;applying=true;
        try{if(el.type==='checkbox'||el.type==='radio')el.checked=!!next;else el.value=String(next);known.set(entry.key,next);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true}finally{applying=false}
      }
      function undo(){const e=history.pop();if(!e)return false;if(!apply(e,e.before)){history.push(e);return false}redo.push(e);if(redo.length>MAX)redo.shift();return true}
      function redoStep(){const e=redo.pop();if(!e)return false;if(!apply(e,e.after)){redo.push(e);return false}history.push(e);if(history.length>MAX)history.shift();return true}
      function clearRedo(){redo.length=0}
      const runtime={undo,redo:redoStep,clearRedo,counts:()=>({undo:history.length,redo:redo.length})};
      function register(){if(window.KPWordHistory?.register){window.KPWordHistory.register('synthetic-controls',()=>runtime);return true}return false}
      register();setInterval(register,500);scan();
      new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n instanceof Element)scan(n)}))).observe(document.documentElement,{childList:true,subtree:true});
      function onSynthetic(e){
        const el=e.target instanceof Element?e.target.closest(selectors):null;if(!el)return;
        const k=key(el),after=value(el);if(!k)return;
        const before=known.has(k)?known.get(k):after;known.set(k,after);
        if(applying||e.isTrusted||equal(before,after))return;
        history.push({key:k,before,after});if(history.length>MAX)history.shift();redo.length=0;window.KPWordHistory?.push?.('synthetic-controls');
      }
      document.addEventListener('input',onSynthetic,true);document.addEventListener('change',onSynthetic,true);
      // Human changes update the remembered baseline after the normal Word-history
      // capture phase, but never create a second marker here.
      document.addEventListener('input',e=>{if(!e.isTrusted)return;const el=e.target instanceof Element?e.target.closest(selectors):null;if(el){const k=key(el);if(k)known.set(k,value(el))}},false);
      document.addEventListener('change',e=>{if(!e.isTrusted)return;const el=e.target instanceof Element?e.target.closest(selectors):null;if(el){const k=key(el);if(k)known.set(k,value(el))}},false);
    })();
    </script>
    <?php
}, 2200 );
