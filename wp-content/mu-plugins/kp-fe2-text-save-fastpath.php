<?php
/**
 * Fast path for a pure FE2 text/content save.
 *
 * The unified Save bridge must flush owner/design/touch drafts before FE2 when
 * those runtimes are dirty. For a pure FE2 edit, however, running the complete
 * owner registry first only adds avoidable staging latency. Register this
 * capture listener in the head so it wins before the footer bridge and calls
 * FE2's already-captured native save handler directly when the registry is
 * definitely clean.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_head', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    if ( ! isset( $_GET['kp_edit'] ) || '1' !== sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) ) ) { return; }
    ?>
    <script id="kp-fe2-text-save-fastpath">
    (()=>{
      'use strict';
      let running=false;
      window.addEventListener('click',event=>{
        const target=event.target instanceof Element?event.target:null;
        const save=target?.closest?.('.kp-fe2-save');
        if(!save||running)return;
        const registry=window.KPOwnerSaveRegistry;
        const nativeSave=window.KPFrontendEditorNativeSave;
        if(typeof nativeSave!=='function'||!registry||typeof registry.isDirty!=='function')return;
        // Only bypass the unified bridge when no non-FE2 draft exists. The
        // orange button's dirty marker then represents the FE2 draft itself.
        if(registry.isDirty()!==false||!save.classList.contains('is-dirty'))return;
        event.preventDefault();
        event.stopImmediatePropagation();
        running=true;
        Promise.resolve(nativeSave()).finally(()=>{running=false});
      },true);
    })();
    </script>
    <?php
}, 1 );
