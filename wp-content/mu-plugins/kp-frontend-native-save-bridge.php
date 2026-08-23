<?php
/**
 * Expose FE2's private native Save handler without changing the large editor
 * bundle. The capture exists only until FE2 attaches its .kp-fe2-save click
 * listener; EventTarget.addEventListener is restored immediately afterwards.
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
      function patchedAdd(type,listener,options){
        if(type==='click'&&typeof listener==='function'&&this instanceof Element&&this.matches('.kp-fe2-save')){
          const target=this,nativeListener=listener;
          window.KPFrontendEditorNativeSave=()=>nativeListener.call(target);
          EventTarget.prototype.addEventListener=nativeAdd;
        }
        return nativeAdd.call(this,type,listener,options);
      }
      EventTarget.prototype.addEventListener=patchedAdd;
    })();
    </script>
    <?php
}, 1 );
