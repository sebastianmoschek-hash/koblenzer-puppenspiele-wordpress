<?php
/**
 * Expose FE2's private native Save handler without changing the large editor
 * bundle. The bridge deliberately ignores unrelated click listeners that may be
 * attached to the shared orange Save button before FE2 installs saveAll().
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_head', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    if ( ! isset( $_GET['kp_edit'] ) || '1' !== sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) ) ) { return; }
    ?>
    <script id="kp-frontend-native-save-bridge">
    (()=>{
      'use strict';
      if(window.KPFrontendNativeSaveBridgeInstalled)return;
      window.KPFrontendNativeSaveBridgeInstalled=true;
      const nativeAdd=EventTarget.prototype.addEventListener;
      let restored=false;

      function looksLikeFe2Save(listener){
        if(typeof listener!=='function')return false;
        try{
          const source=Function.prototype.toString.call(listener);
          // FE2's private saveAll posts kp_fe_v2_save and switches the visible
          // button to “Speichert…”. Checking both keeps this bridge specific and
          // prevents an earlier compatibility/capture listener from being saved
          // as KPFrontendEditorNativeSave.
          return source.includes('kp_fe_v2_save') && (source.includes('Speichert') || source.includes('saveAll'));
        }catch(_){return false}
      }

      function restore(){
        if(restored)return;
        restored=true;
        EventTarget.prototype.addEventListener=nativeAdd;
      }

      function patchedAdd(type,listener,options){
        if(type==='click'&&typeof listener==='function'&&this instanceof Element&&this.matches('.kp-fe2-save')&&looksLikeFe2Save(listener)){
          const target=this,nativeListener=listener;
          window.KPFrontendEditorNativeSave=async()=>{
            // The authoritative orange-Save controller has already decided
            // whether specialist owner/design/touch drafts need flushing before
            // it calls this native FE2 save. During the FE2 AJAX itself, older
            // compatibility wrappers must not run that expensive flush a second
            // time. Temporarily report the owner registry as clean only for this
            // native save call; any real owner drafts were either already flushed
            // or the controller would not have reached this function yet.
            const registry=window.KPOwnerSaveRegistry;
            const nativeDirty=registry&&typeof registry.isDirty==='function'?registry.isDirty:null;
            window.KPFrontendPureSaveInFlight=true;
            if(registry&&nativeDirty)registry.isDirty=()=>false;
            try{
              return await nativeListener.call(target);
            }finally{
              if(registry&&nativeDirty)registry.isDirty=nativeDirty;
              window.KPFrontendPureSaveInFlight=false;
            }
          };
          restore();
        }
        return nativeAdd.call(this,type,listener,options);
      }
      EventTarget.prototype.addEventListener=patchedAdd;

      // Do not leave the prototype patched forever on a partially cached/broken
      // bundle. FE2 normally attaches saveAll synchronously during script load.
      setTimeout(restore,15000);
    })();
    </script>
    <?php
}, 1 );
