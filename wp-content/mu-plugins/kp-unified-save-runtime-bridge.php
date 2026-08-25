<?php
/**
 * Late compatibility bridge for the owner editor's single orange Save button.
 *
 * The main unified-save coverage owns the Save transaction and its
 * kp_history_group. This late bridge only preserves registrations from
 * specialist runtimes that appear after the base registry was created. It must
 * never create a second history group or install another fetch wrapper, because
 * one visible Save gesture has to map to exactly one 48-hour checkpoint.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <script id="kp-unified-save-runtime-bridge">
    (()=>{
      'use strict';
      const FALLBACK_RUNTIMES=[
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

      function ensureOneHistoryGroup(){
        try{return window.KPUnifiedSaveCoverage?.ensureGroup?.()||''}catch(_){return''}
      }

      function install(){
        const registry=window.KPOwnerSaveRegistry;
        if(!registry||typeof registry.flushAll!=='function'||registry===installedRegistry)return;
        if(registry.__kpLateRuntimeBridge){installedRegistry=registry;return;}

        const originalFlush=registry.flushAll.bind(registry);
        const originalRegister=typeof registry.register==='function'?registry.register.bind(registry):null;

        registry.register=(name,runtime)=>{
          if(name)registrations.set(String(name),runtime);
          try{return originalRegister?originalRegister(name,runtime):runtime}catch(_){return runtime}
        };

        registry.flushAll=()=>{
          if(busy)return busy;
          busy=(async()=>{
            // kp-unified-save-coverage.php is the sole transaction owner. Calling
            // ensureGroup here only guarantees that late runtime requests join
            // the already active Save transaction; it never creates a parallel
            // fetch wrapper or a competing group id.
            ensureOneHistoryGroup();
            const result=await originalFlush();

            const seen=new Set();
            const queue=[];
            // Always include runtimes registered after this compatibility layer
            // attached. The base/coverage registry may not know how to resolve
            // every future specialist registration by itself.
            for(const value of registrations.values())queue.push(resolveRuntime(value));

            // On older/partially cached staging bundles without unified coverage,
            // retain the historical fallback list. On the current bundle the
            // coverage layer already flushes these fixed runtimes, so do not run
            // them a second time and accidentally create extra checkpoints.
            if(!registry.__kpUnifiedCoverage){
              for(const name of FALLBACK_RUNTIMES)queue.push(window[name]);
            }

            for(const runtime of queue){
              if(!runtime||typeof runtime.flush!=='function'||seen.has(runtime))continue;
              seen.add(runtime);
              await runtime.flush();
            }
            return result||{success:true};
          })().finally(()=>{busy=null});
          return busy;
        };

        registry.__kpLateRuntimeBridge=true;
        installedRegistry=registry;
        window.dispatchEvent(new CustomEvent('kp:owner-save-registry-ready'));
      }

      install();
      new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
      const timer=setInterval(()=>{
        install();
        if(installedRegistry){
          clearInterval(timer);
          setInterval(install,1200);
        }
      },120);
    })();
    </script>
    <?php
}, 2500 );
