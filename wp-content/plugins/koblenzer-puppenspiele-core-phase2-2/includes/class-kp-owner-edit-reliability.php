<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Reliability layer for the owner-facing direct editor.
 *
 * Android/IME keyboards can keep the last composition in the contenteditable
 * DOM without emitting the final input event before the user taps "Fertig" or
 * "Speichern". This layer therefore sends the actually visible text as a small
 * verified patch together with the normal v2 editor payload. WordPress merges
 * both, reads the stored result back, and only then returns success.
 */
final class KP_Owner_Edit_Reliability {
    public static function init() {
        add_action( 'admin_bar_menu', array( __CLASS__, 'clean_mobile_admin_bar' ), 1100 );
        add_action( 'send_headers', array( __CLASS__, 'no_cache_for_editors' ), 1 );
        add_action( 'wp_footer', array( __CLASS__, 'render_guard' ), 1100 );

        // The focus layer already replaced the original v2 save callback. This
        // final callback keeps its validation and additionally merges visible
        // text patches captured directly from the live DOM.
        remove_action( 'wp_ajax_kp_fe_v2_save', array( 'KP_Owner_Edit_Focus', 'ajax_save_verified' ) );
        add_action( 'wp_ajax_kp_fe_v2_save', array( __CLASS__, 'ajax_save_verified' ) );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function edit_mode() {
        return self::can_edit()
            && isset( $_GET['kp_edit'] )
            && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    }

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

    private static function verified_page_key() {
        $key = isset( $_POST['page_key'] ) ? strtolower( sanitize_text_field( wp_unslash( $_POST['page_key'] ) ) ) : '';
        if ( ! preg_match( '/^(post-[0-9]+|path-[a-f0-9]{16})$/', $key ) ) { return ''; }
        if ( 0 === strpos( $key, 'post-' ) ) {
            $post_id = absint( substr( $key, 5 ) );
            if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) { return ''; }
        }
        return $key;
    }

    private static function sanitize_content( $content ) {
        if ( ! is_array( $content ) ) { return array(); }
        $type = isset( $content['type'] ) ? sanitize_key( $content['type'] ) : '';
        if ( 'html' === $type ) {
            return array( 'type' => 'html', 'value' => isset( $content['value'] ) ? wp_kses_post( $content['value'] ) : '' );
        }
        if ( 'link' === $type ) {
            return array(
                'type'  => 'link',
                'label' => isset( $content['label'] ) ? sanitize_text_field( $content['label'] ) : '',
                'href'  => isset( $content['href'] ) ? esc_url_raw( $content['href'] ) : '',
            );
        }
        if ( 'image' === $type ) {
            return array(
                'type'          => 'image',
                'src'           => isset( $content['src'] ) ? esc_url_raw( $content['src'] ) : '',
                'alt'           => isset( $content['alt'] ) ? sanitize_text_field( $content['alt'] ) : '',
                'attachment_id' => isset( $content['attachment_id'] ) ? absint( $content['attachment_id'] ) : 0,
            );
        }
        return array();
    }

    private static function sanitize_style( $style ) {
        if ( ! is_array( $style ) ) { return array(); }
        $out = array();
        if ( isset( $style['font_px'] ) ) { $out['font_px'] = max( 8, min( 120, (float) $style['font_px'] ) ); }
        if ( isset( $style['padding_y'] ) ) { $out['padding_y'] = max( 0, min( 180, (float) $style['padding_y'] ) ); }
        if ( isset( $style['width_pct'] ) ) { $out['width_pct'] = max( 30, min( 100, (int) $style['width_pct'] ) ); }
        if ( ! empty( $style['color'] ) && sanitize_hex_color( $style['color'] ) ) { $out['color'] = sanitize_hex_color( $style['color'] ); }
        if ( ! empty( $style['background'] ) && sanitize_hex_color( $style['background'] ) ) { $out['background'] = sanitize_hex_color( $style['background'] ); }
        if ( isset( $style['radius'] ) ) { $out['radius'] = max( 0, min( 80, (int) $style['radius'] ) ); }
        if ( ! empty( $style['align'] ) && in_array( $style['align'], array( 'left', 'center', 'right' ), true ) ) { $out['align'] = $style['align']; }
        $out['hidden'] = ! empty( $style['hidden'] ) ? 1 : 0;
        return $out;
    }

    private static function sanitize_scope_data( $data ) {
        $out = array( 'blocks' => array(), 'dom' => array(), 'order' => array() );
        if ( ! is_array( $data ) ) { return $out; }
        foreach ( array( 'blocks', 'dom' ) as $collection ) {
            if ( empty( $data[ $collection ] ) || ! is_array( $data[ $collection ] ) ) { continue; }
            foreach ( array_slice( $data[ $collection ], 0, 400, true ) as $key => $item ) {
                $key = preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) $key ) );
                if ( ! $key || ! is_array( $item ) ) { continue; }
                $clean = array();
                if ( isset( $item['content'] ) ) { $clean['content'] = self::sanitize_content( $item['content'] ); }
                if ( ! empty( $item['styles'] ) && is_array( $item['styles'] ) ) {
                    foreach ( array( 'mobile', 'tablet', 'laptop', 'desktop' ) as $device ) {
                        if ( isset( $item['styles'][ $device ] ) ) { $clean['styles'][ $device ] = self::sanitize_style( $item['styles'][ $device ] ); }
                    }
                }
                if ( $clean ) { $out[ $collection ][ $key ] = $clean; }
            }
        }
        if ( ! empty( $data['order'] ) && is_array( $data['order'] ) ) {
            foreach ( array_slice( $data['order'], 0, 80 ) as $key ) {
                $key = preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) $key ) );
                if ( $key ) { $out['order'][] = $key; }
            }
        }
        return $out;
    }

    private static function text_patches() {
        $raw = isset( $_POST['kp_text_patches'] ) ? wp_unslash( $_POST['kp_text_patches'] ) : '';
        $items = $raw ? json_decode( $raw, true ) : array();
        if ( ! is_array( $items ) ) { return array(); }
        $out = array();
        foreach ( array_slice( $items, 0, 80 ) as $item ) {
            if ( ! is_array( $item ) ) { continue; }
            $scope = isset( $item['scope'] ) && 'global' === $item['scope'] ? 'global' : 'page';
            $collection = isset( $item['collection'] ) && 'dom' === $item['collection'] ? 'dom' : 'blocks';
            $key = isset( $item['key'] ) ? preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) $item['key'] ) ) : '';
            if ( ! $key ) { continue; }
            $out[] = array(
                'scope'      => $scope,
                'collection' => $collection,
                'key'        => $key,
                'html'       => isset( $item['html'] ) ? wp_kses_post( $item['html'] ) : '',
            );
        }
        return $out;
    }

    private static function apply_text_patches( &$global, &$page, $patches ) {
        foreach ( $patches as $patch ) {
            $target =& $page;
            if ( 'global' === $patch['scope'] ) { $target =& $global; }
            $collection = $patch['collection'];
            $key = $patch['key'];
            if ( ! isset( $target[ $collection ] ) || ! is_array( $target[ $collection ] ) ) { $target[ $collection ] = array(); }
            if ( ! isset( $target[ $collection ][ $key ] ) || ! is_array( $target[ $collection ][ $key ] ) ) { $target[ $collection ][ $key ] = array(); }
            $target[ $collection ][ $key ]['content'] = array(
                'type'  => 'html',
                'value' => $patch['html'],
            );
            unset( $target );
        }
    }

    public static function ajax_save_verified() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( KP_Frontend_Editor_V2::NONCE_ACTION, 'nonce' );

        $page_key = self::verified_page_key();
        if ( ! $page_key ) {
            wp_send_json_error( array( 'message' => 'Die Seite konnte beim Speichern nicht sicher erkannt werden. Bitte neu laden.' ), 400 );
        }

        $raw = isset( $_POST['payload'] ) ? wp_unslash( $_POST['payload'] ) : '';
        $payload = json_decode( $raw, true );
        if ( ! is_array( $payload ) ) { wp_send_json_error( array( 'message' => 'Ungültige Speicherdaten.' ), 400 ); }

        $global = self::sanitize_scope_data( isset( $payload['global'] ) ? $payload['global'] : array() );
        $page   = self::sanitize_scope_data( isset( $payload['page'] ) ? $payload['page'] : array() );
        $patches = self::text_patches();
        self::apply_text_patches( $global, $page, $patches );

        update_option( KP_Frontend_Editor_V2::GLOBAL_OPTION, $global, false );
        $all = get_option( KP_Frontend_Editor_V2::PAGES_OPTION, array() );
        if ( ! is_array( $all ) ) { $all = array(); }
        $all[ $page_key ] = $page;
        if ( count( $all ) > 160 ) { $all = array_slice( $all, -160, null, true ); }
        update_option( KP_Frontend_Editor_V2::PAGES_OPTION, $all, false );

        // A green success is only allowed after a real database readback.
        $stored_global = get_option( KP_Frontend_Editor_V2::GLOBAL_OPTION, array() );
        $stored_pages  = get_option( KP_Frontend_Editor_V2::PAGES_OPTION, array() );
        $stored_page   = is_array( $stored_pages ) && isset( $stored_pages[ $page_key ] ) ? $stored_pages[ $page_key ] : null;
        if ( $stored_global !== $global || $stored_page !== $page ) {
            wp_send_json_error( array( 'message' => 'WordPress konnte die Änderung nicht dauerhaft bestätigen. Bitte erneut versuchen.' ), 500 );
        }

        wp_send_json_success( array(
            'message'      => 'Dauerhaft gespeichert ✓',
            'page_key'     => $page_key,
            'verified'     => true,
            'text_patches' => count( $patches ),
        ) );
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
          .kp-fe-save-verify{position:fixed;left:12px;right:12px;top:12px;z-index:100300;padding:11px 14px;border-radius:12px;background:#7a1d1d;color:#fff;font:700 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 12px 35px rgba(0,0,0,.35)}
        </style>
        <script id="kp-owner-edit-reliability-js">
        (()=>{
          'use strict';
          const cfg=window.KPFrontendEditorV2;
          if(!cfg)return;
          const selector='.kp-fe2-inline-text[contenteditable="true"]';
          const pending=new Map();
          let committing=false;

          function activeText(){return document.querySelector(selector);}
          function descriptor(el){
            if(!el)return null;
            const owner=el.closest('[data-kp-edit-key],[data-kp-dom-key]')||el;
            const key=owner.dataset.kpEditKey||owner.dataset.kpDomKey||'';
            if(!key)return null;
            return {
              scope:owner.closest('header,footer')?'global':'page',
              collection:owner.dataset.kpEditKey?'blocks':'dom',
              key,
              html:el.innerHTML,
              text:(el.textContent||'').replace(/\s+/g,' ').trim()
            };
          }
          function remember(el){
            const patch=descriptor(el);if(!patch)return;
            pending.set(`${patch.scope}:${patch.collection}:${patch.key}`,patch);
          }
          function commit(el){
            if(!el||committing)return false;
            committing=true;
            remember(el);
            try{el.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){}
            remember(el);
            committing=false;
            return true;
          }

          document.addEventListener('input',(event)=>{
            const el=event.target?.closest?.(selector);if(el)remember(el);
          },true);
          document.addEventListener('compositionend',(event)=>{
            const el=event.target?.closest?.(selector);if(el)commit(el);
          },true);

          const observer=new MutationObserver((records)=>{
            const el=activeText();if(!el)return;
            if(records.some(record=>record.target===el||el.contains(record.target)))commit(el);
          });
          observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});

          const commitBeforeLeaving=(event)=>{
            const el=activeText();if(el&&!el.contains(event.target))commit(el);
          };
          document.addEventListener('pointerdown',commitBeforeLeaving,true);
          document.addEventListener('touchstart',commitBeforeLeaving,{capture:true,passive:true});
          document.addEventListener('mousedown',commitBeforeLeaving,true);
          document.addEventListener('focusout',(event)=>{
            const el=event.target?.closest?.(selector);if(el)commit(el);
          },true);
          document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')commit(activeText());});
          window.addEventListener('pagehide',()=>commit(activeText()));

          /* Attach the real visible text to the existing v2 save request. The
             v2 draft remains the primary payload; these patches are a safety
             net for Android/IME composition and are merged server-side last. */
          const nativeFetch=window.fetch.bind(window);
          window.fetch=(input,init={})=>{
            try{
              const body=init?.body;
              if(body instanceof FormData && body.get('action')==='kp_fe_v2_save'){
                commit(activeText());
                const patches=[...pending.values()];
                body.set('kp_text_patches',JSON.stringify(patches));
                if(patches.length){
                  sessionStorage.setItem('kpFeSaveExpected',JSON.stringify({pageKey:cfg.pageKey,patches,at:Date.now()}));
                }
              }
            }catch(e){}
            return nativeFetch(input,init);
          };

          function verifyAfterReload(){
            let expected=null;
            try{expected=JSON.parse(sessionStorage.getItem('kpFeSaveExpected')||'null');}catch(e){}
            if(!expected||expected.pageKey!==cfg.pageKey||Date.now()-expected.at>20000){sessionStorage.removeItem('kpFeSaveExpected');return;}
            sessionStorage.removeItem('kpFeSaveExpected');
            setTimeout(()=>{
              const failed=(expected.patches||[]).filter(patch=>{
                const attr=patch.collection==='blocks'?'data-kp-edit-key':'data-kp-dom-key';
                const el=document.querySelector(`[${attr}="${CSS.escape(patch.key)}"]`);
                if(!el)return true;
                const shown=(el.textContent||'').replace(/\s+/g,' ').trim();
                return shown!==patch.text;
              });
              if(!failed.length){
                const toast=document.querySelector('.kp-fe2-toast');
                if(toast){toast.textContent='Speichern geprüft ✓';toast.className='kp-fe2-toast is-visible is-ok';setTimeout(()=>toast.classList.remove('is-visible'),2200);}
                return;
              }
              const note=document.createElement('div');
              note.className='kp-fe-save-verify';
              note.textContent='Die letzte Textänderung stimmt nach dem Neuladen noch nicht. Bitte nichts weiter ändern und kurz melden.';
              document.body.appendChild(note);
            },250);
          }
          verifyAfterReload();
        })();
        </script>
        <?php
    }
}
