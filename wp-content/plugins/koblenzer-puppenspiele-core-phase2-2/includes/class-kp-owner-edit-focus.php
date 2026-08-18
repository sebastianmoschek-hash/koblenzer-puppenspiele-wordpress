<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Focused owner-facing front-end editing:
 * - one entry button on the live site
 * - Preview / Undo / Save on phones
 * - navigation stays usable while edit mode remains active
 * - Android contenteditable changes are committed before saving
 * - success is shown only after WordPress reads the saved data back
 */
final class KP_Owner_Edit_Focus {
    public static function init() {
        add_action( 'admin_bar_menu', array( __CLASS__, 'clean_admin_bar' ), 999 );
        add_action( 'wp_head', array( __CLASS__, 'navigation_bridge' ), 2 );
        add_action( 'wp_footer', array( __CLASS__, 'render_frontend_controls' ), 999 );

        // KP_Frontend_Editor_V2::init() ran immediately before this class.
        remove_action( 'wp_ajax_kp_fe_v2_save', array( 'KP_Frontend_Editor_V2', 'ajax_save' ) );
        add_action( 'wp_ajax_kp_fe_v2_save', array( __CLASS__, 'ajax_save_verified' ) );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function edit_mode() {
        return self::can_edit() && isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    }

    private static function current_url( $edit = false ) {
        $uri  = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/';
        $path = (string) wp_parse_url( $uri, PHP_URL_PATH );
        $url  = home_url( $path ?: '/' );
        return $edit ? add_query_arg( 'kp_edit', '1', $url ) : $url;
    }

    public static function clean_admin_bar( $bar ) {
        if ( is_admin() || ! self::can_edit() ) { return; }

        // One obvious owner entry is enough. Keep account/site access, remove
        // WordPress' competing edit/customize shortcuts on the live website.
        foreach ( array(
            'wp-logo', 'updates', 'comments', 'new-content', 'edit', 'customize',
            'site-editor', 'edit-site', 'kp-quick-edit', 'kp-quick-termin',
            'kp-quick-design', 'kp-frontend-edit', 'kp-frontend-edit-v2'
        ) as $node_id ) {
            $bar->remove_node( $node_id );
        }
    }

    /**
     * Real site navigation wins over the editor's generic tap-to-edit link handler.
     * The edit flag is carried to internal destination pages.
     */
    public static function navigation_bridge() {
        if ( ! self::edit_mode() ) { return; }
        ?>
        <script id="kp-owner-edit-navigation-bridge">
        (()=>{
          'use strict';
          function internalUrl(anchor){
            const raw=anchor.getAttribute('href')||'';
            if(!raw||raw.startsWith('#')||/^(mailto:|tel:|sms:|javascript:)/i.test(raw))return null;
            let url;
            try{url=new URL(raw,window.location.href);}catch(e){return null;}
            if(!/^https?:$/i.test(url.protocol)||url.origin!==window.location.origin)return null;
            return url;
          }
          function isNavigationLink(anchor,url){
            if(anchor.closest('nav,.wp-block-navigation,.wp-block-navigation__responsive-container,.kp-navigation-bar,.kp-site-nav'))return true;
            if(anchor.closest('.kp-repertoire-card'))return true;
            const path=(url.pathname||'/').replace(/\/{2,}/g,'/');
            if(/^\/repertoire\//.test(path))return true;
            if(anchor.closest('.kp-finish-card,.kp-current,.kp-aktuelles')){
              return /^\/(repertoire|termine|jetzt-buchen|kontakt|aktuelles|das-theater|referenzen)(\/|$)/.test(path);
            }
            return false;
          }
          document.addEventListener('click',(event)=>{
            const anchor=event.target.closest&&event.target.closest('a[href]');
            if(!anchor)return;
            if(anchor.closest('#wpadminbar,.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop,.kp-owner-single-edit'))return;
            const url=internalUrl(anchor);
            if(!url||!isNavigationLink(anchor,url))return;
            event.preventDefault();
            event.stopImmediatePropagation();
            url.searchParams.set('kp_edit','1');
            window.location.href=url.toString();
          },true);
        })();
        </script>
        <?php
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

    private static function verified_page_key() {
        $key = isset( $_POST['page_key'] ) ? strtolower( sanitize_text_field( wp_unslash( $_POST['page_key'] ) ) ) : '';
        if ( ! preg_match( '/^(post-[0-9]+|path-[a-f0-9]{16})$/', $key ) ) { return ''; }
        if ( 0 === strpos( $key, 'post-' ) ) {
            $post_id = absint( substr( $key, 5 ) );
            if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) { return ''; }
        }
        return $key;
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

        update_option( KP_Frontend_Editor_V2::GLOBAL_OPTION, $global, false );
        $all = get_option( KP_Frontend_Editor_V2::PAGES_OPTION, array() );
        if ( ! is_array( $all ) ) { $all = array(); }
        $all[ $page_key ] = $page;
        if ( count( $all ) > 160 ) { $all = array_slice( $all, -160, null, true ); }
        update_option( KP_Frontend_Editor_V2::PAGES_OPTION, $all, false );

        // A green check is only allowed after a real readback from WordPress.
        $stored_global = get_option( KP_Frontend_Editor_V2::GLOBAL_OPTION, array() );
        $stored_pages  = get_option( KP_Frontend_Editor_V2::PAGES_OPTION, array() );
        $stored_page   = is_array( $stored_pages ) && isset( $stored_pages[ $page_key ] ) ? $stored_pages[ $page_key ] : null;
        if ( $stored_global !== $global || $stored_page !== $page ) {
            wp_send_json_error( array( 'message' => 'WordPress konnte die Änderung nicht dauerhaft bestätigen. Bitte erneut versuchen.' ), 500 );
        }

        wp_send_json_success( array(
            'message'  => 'Dauerhaft gespeichert ✓',
            'page_key' => $page_key,
            'verified' => true,
        ) );
    }

    public static function render_frontend_controls() {
        if ( is_admin() || ! self::can_edit() ) { return; }
        $edit_url = self::current_url( true );
        ?>
        <style id="kp-owner-edit-focus-css">
          /* Older helper assets must never create a second edit or preview button. */
          .kp-owner-edit-launcher,.kp-fe2-preview{display:none!important}
          .kp-owner-single-edit{position:fixed;left:14px;bottom:16px;z-index:100090;display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:9px 15px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:#f07a22;color:#fff!important;font:800 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-decoration:none!important;box-shadow:0 12px 34px rgba(0,0,0,.34);-webkit-tap-highlight-color:transparent}
          .kp-owner-single-edit:hover,.kp-owner-single-edit:focus{background:#d96819;color:#fff!important}
          @media(max-width:640px){
            .kp-owner-single-edit{left:10px;bottom:10px;min-height:46px;padding:10px 16px;font-size:13px}
            body.kp-fe2-editing .kp-fe2-toolbar{grid-template-columns:1fr 1fr 1fr;display:grid!important;gap:6px!important}
            body.kp-fe2-editing .kp-fe2-toolbar .kp-fe2-device-wrap{display:none!important}
            body.kp-fe2-editing .kp-fe2-toolbar .kp-fe2-exit,
            body.kp-fe2-editing .kp-fe2-toolbar .kp-fe2-undo,
            body.kp-fe2-editing .kp-fe2-toolbar .kp-fe2-save{display:flex!important;width:100%!important;min-width:0!important;padding:7px 5px!important}
            body.kp-fe2-editing .kp-fe2-toolbar .kp-fe2-exit span:not(.dashicons),
            body.kp-fe2-editing .kp-fe2-toolbar .kp-fe2-undo span:not(.dashicons),
            body.kp-fe2-editing .kp-fe2-toolbar .kp-fe2-save span:not(.dashicons){display:inline!important;font-size:10px!important}
          }
        </style>
        <?php if ( ! self::edit_mode() ) : ?>
          <a class="kp-owner-single-edit" href="<?php echo esc_url( $edit_url ); ?>">✏️&nbsp; Bearbeiten</a>
        <?php endif; ?>
        <script id="kp-owner-edit-focus-js">
        (()=>{
          'use strict';
          function prepareEditorUi(){
            document.querySelectorAll('.kp-owner-edit-launcher,.kp-fe2-preview').forEach(el=>el.remove());
            const exit=document.querySelector('.kp-fe2-exit');
            if(exit){
              const icon=exit.querySelector('.dashicons');
              const label=exit.querySelector('span:not(.dashicons)');
              if(icon){icon.classList.remove('dashicons-no-alt');icon.classList.add('dashicons-visibility');}
              if(label)label.textContent='Vorschau';
              exit.setAttribute('title','Besucheransicht ohne Bearbeitungsrahmen');
              exit.setAttribute('aria-label','Vorschau');
            }
            const hint=document.querySelector('.kp-fe2-hint');
            if(hint)hint.textContent='Inhalt antippen = bearbeiten · Menü und Stücktitel = öffnen';
          }
          function commitActiveInlineText(){
            const el=document.querySelector('.kp-fe2-inline-text[contenteditable="true"]');
            if(!el)return;
            try{el.blur();}catch(e){}
            try{el.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){}
          }
          document.addEventListener('DOMContentLoaded',prepareEditorUi);
          window.addEventListener('load',prepareEditorUi);
          document.addEventListener('pointerdown',(e)=>{
            if(e.target.closest('.kp-fe2-save'))commitActiveInlineText();
          },true);
          document.addEventListener('click',(e)=>{
            if(e.target.closest('.kp-fe2-save'))commitActiveInlineText();
          },true);
        })();
        </script>
        <?php
    }
}
