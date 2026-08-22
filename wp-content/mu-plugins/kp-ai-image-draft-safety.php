<?php
/**
 * Draft safety for Gemini image editing.
 *
 * kp-ai-direct-editor deliberately applies generated images immediately as a
 * preview. This bridge guarantees that Undo/Discard restores the exact visual
 * image that existed before the AI edit, and removes generated attachments that
 * are no longer used after Discard/Save.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_ajax_kp_ai_temp_image_cleanup', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) {
        wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 );
    }
    check_ajax_referer( 'kp_ai_direct_editor', 'nonce' );
    $ids = isset( $_POST['ids'] ) ? json_decode( wp_unslash( $_POST['ids'] ), true ) : array();
    if ( ! is_array( $ids ) ) { $ids = array(); }
    $deleted = array();
    foreach ( array_slice( array_unique( array_map( 'absint', $ids ) ), 0, 50 ) as $id ) {
        if ( ! $id || 'attachment' !== get_post_type( $id ) || ! current_user_can( 'delete_post', $id ) ) { continue; }
        $file = (string) get_attached_file( $id );
        if ( '' === $file || 0 !== strpos( basename( $file ), 'kp-ai-' ) ) { continue; }
        if ( wp_delete_attachment( $id, true ) ) { $deleted[] = $id; }
    }
    wp_send_json_success( array( 'deleted' => $deleted ) );
} );

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <script id="kp-ai-image-baseline">
    (()=>{
      'use strict';
      const attrs=img=>({src:img.getAttribute('src'),alt:img.getAttribute('alt'),srcset:img.getAttribute('srcset'),sizes:img.getAttribute('sizes')});
      const key=img=>window.KPCanvaKeys?.imageKey?.(img)||img.dataset?.kpCanvaImageKey||'';
      const map=new Map();
      document.querySelectorAll('img').forEach(img=>{const k=key(img);if(k&&!map.has(k))map.set(k,attrs(img));});
      window.KPAIImageDraftBaseline={map,attrs,key};
    })();
    </script>
    <?php
}, 2050 );

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <script id="kp-ai-image-draft-safety">
    (()=>{
      'use strict';
      const cfg=window.KPAIImageDraftBaseline;
      if(!cfg)return;
      const baseline=cfg.map,attrs=cfg.attrs,key=cfg.key;
      const generated=new Map();
      let savedVisual=new Map();

      function imageByKey(k){return [...document.querySelectorAll('img')].find(img=>key(img)===k)||null;}
      function restoreAttrs(img,state){
        if(!img||!state)return;
        for(const name of ['src','alt','srcset','sizes']){
          const value=state[name];
          if(value===null||value===undefined||value==='')img.removeAttribute(name);else img.setAttribute(name,value);
        }
      }
      function captureVisual(){const map=new Map();document.querySelectorAll('img').forEach(img=>{const k=key(img);if(k)map.set(k,attrs(img));});return map;}
      function visibleSrcs(){return new Set([...document.querySelectorAll('img')].map(img=>img.currentSrc||img.src||img.getAttribute('src')||''));}
      async function cleanupUnused(){
        const visible=visibleSrcs(),ids=[];
        for(const [url,entry] of generated){if(!visible.has(url)&&entry.attachmentId)ids.push(entry.attachmentId);}
        if(!ids.length)return;
        const ajaxUrl=window.KPOwnerWebApp?.ajaxUrl||window.KPFrontendEditorV2?.ajaxUrl||'/wp-admin/admin-ajax.php';
        const nonce=cleanupUnused.nonce||'';if(!nonce)return;
        const fd=new FormData();fd.append('action','kp_ai_temp_image_cleanup');fd.append('nonce',nonce);fd.append('ids',JSON.stringify(ids));
        try{
          await fetch(ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,body:fd});
          ids.forEach(id=>{for(const [url,e] of generated){if(e.attachmentId===id)generated.delete(url);}});
        }catch(_){}
      }

      const inheritedFetch=window.fetch.bind(window);
      window.fetch=(input,init={})=>{
        let action='',before=null,beforeKey='',nonce='';
        try{
          const body=init?.body;
          if(body instanceof FormData){action=String(body.get('action')||'');nonce=String(body.get('nonce')||'');}
          if(action==='kp_ai_image_edit'){
            const selected=document.querySelector('.kp-fe2-selected');
            const img=selected instanceof HTMLImageElement?selected:selected?.querySelector?.('img');
            if(img){beforeKey=key(img);before=attrs(img);}
            if(nonce)cleanupUnused.nonce=nonce;
          }
        }catch(_){}
        const request=inheritedFetch(input,init);
        if(action!=='kp_ai_image_edit'||!before)return request;
        return request.then(response=>{
          try{
            response.clone().json().then(json=>{
              const url=String(json?.data?.url||''),attachmentId=Number(json?.data?.attachment_id)||0;
              if(url)generated.set(url,{attachmentId,before,beforeKey});
            }).catch(()=>{});
          }catch(_){}
          return response;
        });
      };

      function install(){
        const runtime=window.KPAIEditorRuntime;if(!runtime||runtime.__kpImageDraftSafe)return false;
        const originalUndo=runtime.undo?.bind(runtime),originalRedo=runtime.redo?.bind(runtime),originalClearRedo=runtime.clearRedo?.bind(runtime),originalDiscard=runtime.discard?.bind(runtime),originalFlush=runtime.flush?.bind(runtime);
        savedVisual=captureVisual();
        runtime.undo=()=>{
          const before=captureVisual();const ok=originalUndo?originalUndo():false;if(!ok)return false;
          const after=captureVisual();
          for(const [k,oldState] of before){
            const img=imageByKey(k),newState=after.get(k);if(!img||!newState)continue;
            const oldSrc=oldState.src||'',newSrc=newState.src||'';
            if(oldSrc===newSrc&&generated.has(oldSrc))restoreAttrs(img,generated.get(oldSrc).before||baseline.get(k));
          }
          return true;
        };
        runtime.redo=()=>originalRedo?originalRedo():false;
        runtime.clearRedo=()=>{const result=originalClearRedo?originalClearRedo():undefined;setTimeout(cleanupUnused,0);return result;};
        runtime.discard=()=>{
          const result=originalDiscard?originalDiscard():undefined;
          for(const [k,state] of savedVisual){restoreAttrs(imageByKey(k),state);}
          setTimeout(cleanupUnused,0);return result;
        };
        runtime.flush=async(...args)=>{
          const result=originalFlush?await originalFlush(...args):{success:true};
          savedVisual=captureVisual();setTimeout(cleanupUnused,0);return result;
        };
        runtime.__kpImageDraftSafe=true;return true;
      }
      install();setInterval(install,350);

      // The global X reloads very shortly after discarding. Invoke AI Discard in
      // window-capture first; cleanup uses fetch keepalive so unused Gemini files
      // still reach WordPress even while the page is leaving.
      window.addEventListener('click',e=>{
        const t=e.target instanceof Element?e.target:null;
        if(t?.closest('.kp-canva-discard'))window.KPAIEditorRuntime?.discard?.();
      },true);
    })();
    </script>
    <?php
}, 2250 );
