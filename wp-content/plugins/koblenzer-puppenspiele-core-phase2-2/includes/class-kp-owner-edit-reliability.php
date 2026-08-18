<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Reliability layer for the owner-facing direct editor.
 *
 * Android/IME keyboards can keep the last composition in the contenteditable
 * DOM without emitting the final input event before the user taps "Fertig" or
 * "Speichern". The v2 editor stores its draft from input events, so we mirror
 * real DOM mutations back into that input pipeline and commit once more before
 * the user leaves the active text. Visitors are unaffected.
 */
final class KP_Owner_Edit_Reliability {
    public static function init() {
        add_action( 'admin_bar_menu', array( __CLASS__, 'clean_mobile_admin_bar' ), 1100 );
        add_action( 'send_headers', array( __CLASS__, 'no_cache_for_editors' ), 1 );
        add_action( 'wp_footer', array( __CLASS__, 'render_guard' ), 1100 );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function edit_mode() {
        return self::can_edit()
            && isset( $_GET['kp_edit'] )
            && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    }

    /**
     * The blue dashboard/site button is useful in wp-admin but distracting on
     * the live mobile canvas. Keep the account menu on the right, remove only
     * the WordPress/site launchers on the left.
     */
    public static function clean_mobile_admin_bar( $bar ) {
        if ( is_admin() || ! self::can_edit() ) { return; }
        foreach ( array( 'site-name', 'my-sites', 'wp-logo' ) as $node_id ) {
            $bar->remove_node( $node_id );
        }
    }

    /** Logged-in editing must never be served from a stale page cache. */
    public static function no_cache_for_editors() {
        if ( is_admin() || ! self::can_edit() ) { return; }
        nocache_headers();
    }

    public static function render_guard() {
        if ( is_admin() || ! self::edit_mode() ) { return; }
        ?>
        <style id="kp-owner-edit-reliability-css">
          @media(max-width:782px){
            #wpadminbar #wp-admin-bar-site-name,
            #wpadminbar #wp-admin-bar-my-sites,
            #wpadminbar #wp-admin-bar-wp-logo{display:none!important}
          }
        </style>
        <script id="kp-owner-edit-reliability-js">
        (()=>{
          'use strict';
          const selector='.kp-fe2-inline-text[contenteditable="true"]';
          let committing=false;

          function activeText(){
            return document.querySelector(selector);
          }

          function commit(el){
            if(!el||committing)return false;
            committing=true;
            try{
              /* KP_Frontend_Editor_V2 listens to this event synchronously and
                 copies the current innerHTML into its save draft. */
              el.dispatchEvent(new Event('input',{bubbles:true}));
            }catch(e){}
            committing=false;
            return true;
          }

          /* Do not depend on Android/Gboard emitting a final input event.
             Character-data changes in the live contenteditable are enough. */
          const observer=new MutationObserver((records)=>{
            const el=activeText();
            if(!el)return;
            const touched=records.some((record)=>record.target===el||el.contains(record.target));
            if(touched)commit(el);
          });
          observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});

          /* Composition end is the most important IME signal on Android. */
          document.addEventListener('compositionend',(event)=>{
            const el=event.target?.closest?.(selector);
            if(el)commit(el);
          },true);

          /* Commit before ANY tap outside the active text. This covers
             Fertig, Speichern, Vorschau, inspector close and selecting another
             element, before the v2 click handlers can deactivate the editor. */
          const commitBeforeLeaving=(event)=>{
            const el=activeText();
            if(el&&!el.contains(event.target))commit(el);
          };
          document.addEventListener('pointerdown',commitBeforeLeaving,true);
          document.addEventListener('touchstart',commitBeforeLeaving,{capture:true,passive:true});
          document.addEventListener('mousedown',commitBeforeLeaving,true);

          /* Keyboard/accessibility exits and tab/app switches get the same
             protection. */
          document.addEventListener('focusout',(event)=>{
            const el=event.target?.closest?.(selector);
            if(el)commit(el);
          },true);
          document.addEventListener('visibilitychange',()=>{
            if(document.visibilityState==='hidden')commit(activeText());
          });
          window.addEventListener('pagehide',()=>commit(activeText()));
        })();
        </script>
        <?php
    }
}
