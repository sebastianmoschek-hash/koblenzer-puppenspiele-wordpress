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
 * All requests emitted by one orange Save share one explicit kp_history_group,
 * so save -> reload -> undo behaves as one transaction across every runtime.
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
      let historyGroup='';

      function makeHistoryGroup(){
        const random=(globalThis.crypto?.getRandomValues)
          ?Array.from(globalThis.crypto.getRandomValues(new Uint32Array(2))).map(v=>v.toString(36)).join('')
          :Math.random().toString(36).slice(2);
        return `save-${Date.now().toString(36)}-${random}`.toLowerCase();
      }

      // The coordinator's own history-group closure ends when its original flush
      // returns. Specialist runtimes flush afterwards, so give the complete
      // extended transaction one outer group that remains active until every
      // runtime has finished. Existing groups are never overwritten.
      if(!window.fetch.__kpUnifiedSaveHistoryBridge){
        const previousFetch=window.fetch.bind(window);
        const groupedFetch=(input,init={})=>{
          try{
            const body=init?.body;
            if(historyGroup&&body instanceof FormData&&!body.has('kp_history_group')){
              const action=String(body.get('action')||'');
              if(/^kp_(owner_(design|sizes|menu_x|nav)_save|fe_v2_save|touch_(free_layout|gesture)_save|image_position_save|canva_image_save|frontend_card_(image|button)_save|fe_v2_record_save)$/.test(action)){
                body.append('kp_history_group',historyGroup);
              }
            }
          }catch(_){}
          return previousFetch(input,init);
        };
        groupedFetch.__kpUnifiedSaveHistoryBridge=true;
        window.fetch=groupedFetch;
      }

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
            historyGroup=makeHistoryGroup();
            try{
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
            } finally {
              historyGroup='';
            }
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
