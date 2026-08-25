<?php
/**
 * Late compatibility bridge for the owner editor's single orange Save button.
 *
 * Several specialist editors register their own draft runtime (Canva, AI,
 * navigation, social, records, cards, header image). The original coordinator
 * only flushed the older design/size/menu/image-position runtimes, so those
 * specialists could be visible in the UI but never reached by the unified Save.
 *
 * Keep the coordinator authoritative, then flush every loaded specialist once.
 * The owner-history burst guard folds these adjacent requests into the same
 * saved checkpoint, while clean runtimes remain no-ops.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <script id="kp-unified-save-runtime-bridge">
    (()=>{
      'use strict';
      const RUNTIMES=[
        'KPCanvaLayoutRuntime','KPCanvaImageRuntime','KPAIEditorRuntime',
        'KPRecordDraftRuntime','KPHeaderImageDraftRuntime','KPNavigationDraftRuntime',
        'KPSocialDraftRuntime','KPCardDraftRuntime'
      ];
      const registrations=new Map();
      let installedRegistry=null;
      let busy=null;

      function resolveRuntime(value){
        try{return typeof value==='function'?value():value}catch(_){return null}
      }

      function install(){
        const registry=window.KPOwnerSaveRegistry;
        if(!registry||typeof registry.flushAll!=='function'||registry===installedRegistry)return;
        if(registry.__kpAllRuntimeBridge){installedRegistry=registry;return;}

        const originalFlush=registry.flushAll.bind(registry);
        const originalRegister=typeof registry.register==='function'?registry.register.bind(registry):null;

        registry.register=(name,runtime)=>{
          if(name)registrations.set(String(name),runtime);
          try{return originalRegister?originalRegister(name,runtime):runtime}catch(_){return runtime}
        };

        registry.flushAll=()=>{
          if(busy)return busy;
          busy=(async()=>{
            const result=await originalFlush();
            const seen=new Set();
            const queue=[];
            for(const value of registrations.values())queue.push(resolveRuntime(value));
            for(const name of RUNTIMES)queue.push(window[name]);
            for(const runtime of queue){
              if(!runtime||typeof runtime.flush!=='function'||seen.has(runtime))continue;
              seen.add(runtime);
              await runtime.flush();
            }
            return result||{success:true};
          })().finally(()=>{busy=null});
          return busy;
        };

        registry.__kpAllRuntimeBridge=true;
        installedRegistry=registry;
        window.dispatchEvent(new CustomEvent('kp:owner-save-registry-ready'));
      }

      install();
      new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
      const timer=setInterval(()=>{
        install();
        if(installedRegistry&&RUNTIMES.every(name=>!window[name]||typeof window[name]?.flush==='function')){
          // Keep a low-frequency safety check because some record/card runtimes
          // are created only after their editor panel is opened.
          clearInterval(timer);
          setInterval(install,1200);
        }
      },120);
    })();
    </script>
    <?php
}, 2500 );
