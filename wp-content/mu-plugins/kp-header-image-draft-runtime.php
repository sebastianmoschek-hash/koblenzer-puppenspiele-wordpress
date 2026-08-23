<?php
/**
 * Header image draft/undo bridge.
 * Media selections used a private design draft and were invisible to the normal
 * control history. Track that selection explicitly and persist it through the
 * unified Save registry.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <script id="kp-header-image-draft-runtime">
    (()=>{
      'use strict';
      const cfg=window.KPOwnerWebApp;if(!cfg?.canEdit)return;
      const history=[],redo=[];const MAX=50;
      let current={id:Number(cfg.design?.header_image_id)||0,url:String(cfg.headerImageUrl||'')},saved={...current},dirty=false,saving=null;
      const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
      function apply(state){
        current={id:Number(state?.id)||0,url:String(state?.url||'')};
        const images=qa('.kp-header-stage img,.kp-header-photo img');
        images.forEach(img=>{
          if(current.url){img.src=current.url;img.removeAttribute('srcset');img.removeAttribute('sizes');}
          else{img.removeAttribute('src');img.removeAttribute('srcset');img.removeAttribute('sizes');}
        });
        const preview=q('.kp-oa-header-preview');
        if(preview)preview.innerHTML=current.url?`<img src="${current.url.replace(/"/g,'&quot;')}" alt="Header-Vorschau">`:'<span class="kp-oa-header-empty">Kein Headerbild ausgewählt</span>';
        dirty=true;q('.kp-fe2-save')?.classList.add('is-dirty');return true;
      }
      function push(before,after){history.push({before:{...before},after:{...after}});if(history.length>MAX)history.shift();redo.length=0;window.KPWordHistory?.push?.('header-image')}
      function undo(){const e=history.pop();if(!e)return false;apply(e.before);redo.push(e);if(redo.length>MAX)redo.shift();return true}
      function redoStep(){const e=redo.pop();if(!e)return false;apply(e.after);history.push(e);if(history.length>MAX)history.shift();return true}
      function clearRedo(){redo.length=0}
      function discard(){current={...saved};dirty=false;history.length=0;redo.length=0;apply(current);dirty=false}
      function liveDesign(){const settings={...(cfg.design||{})};qa('[data-design]').forEach(input=>{const k=input.dataset.design;if(!k)return;settings[k]=input.type==='checkbox'?(input.checked?1:0):(input.type==='range'?Number(input.value):input.value)});settings.header_image_id=current.id;return settings}
      async function flush(){
        if(!dirty)return{draft:false};if(saving)return saving;
        saving=(async()=>{const fd=new FormData();fd.append('action','kp_owner_design_save');fd.append('nonce',cfg.nonce||'');fd.append('settings',JSON.stringify(liveDesign()));const r=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});const j=await r.json().catch(()=>null);if(!r.ok||!j?.success)throw new Error(j?.data?.message||'Headerbild konnte nicht gespeichert werden.');cfg.design={...(j.data?.settings||liveDesign())};cfg.headerImageUrl=current.url;saved={...current};dirty=false;history.length=0;redo.length=0;return j.data||{}})().finally(()=>{saving=null});return saving;
      }
      const runtime={flush,isDirty:()=>dirty,undo,redo:redoStep,clearRedo,discard,counts:()=>({undo:history.length,redo:redo.length})};window.KPHeaderImageDraftRuntime=runtime;
      function register(){if(window.KPWordHistory?.register){window.KPWordHistory.register('header-image',()=>runtime);return true}return false}register();setInterval(register,500);

      function wrapMedia(){
        if(!window.wp?.media||window.wp.media.__kpHeaderDraftWrapped)return;
        const original=window.wp.media;
        const wrapped=function(...args){
          const frame=original.apply(this,args),opts=args[0]||{};
          if(frame?.on&&/Headerbild/i.test(String(opts.title||''))){frame.on('select',()=>{try{const a=frame.state().get('selection').first().toJSON(),before={...current},after={id:Number(a.id)||0,url:String(a.url||'')};if(before.id===after.id&&before.url===after.url)return;current=after;dirty=true;push(before,after);q('.kp-fe2-save')?.classList.add('is-dirty')}catch(_){}})}
          return frame;
        };
        Object.assign(wrapped,original);wrapped.__kpHeaderDraftWrapped=true;window.wp.media=wrapped;
      }
      wrapMedia();new MutationObserver(wrapMedia).observe(document.documentElement,{childList:true,subtree:true});
    })();
    </script>
    <?php
}, 2175 );
