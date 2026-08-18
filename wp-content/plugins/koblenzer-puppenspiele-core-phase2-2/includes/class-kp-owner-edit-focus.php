<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Keeps the owner-facing front-end editing experience intentionally small:
 * one entry button, then Preview / Undo / Save in edit mode.
 * Also keeps site navigation usable while edit mode stays active and commits
 * Android contenteditable text before the v2 save handler runs.
 */
final class KP_Owner_Edit_Focus {
    public static function init() {
        add_action( 'admin_bar_menu', array( __CLASS__, 'clean_admin_bar' ), 999 );
        add_action( 'wp_head', array( __CLASS__, 'navigation_bridge' ), 2 );
        add_action( 'wp_footer', array( __CLASS__, 'render_frontend_controls' ), 999 );
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
     * Register before the v2 footer script. This lets real site navigation win
     * over the editor's generic "tap a link to edit it" handler.
     *
     * Main navigation always navigates. Repertoire title/image links and links
     * from news/current cards into repertoire pages navigate as well. The
     * kp_edit flag is carried to the destination so editing continues there.
     */
    public static function navigation_bridge() {
        if ( ! self::edit_mode() ) { return; }
        ?>
        <script id="kp-owner-edit-navigation-bridge">
        (()=>{
          'use strict';
          const editParam='kp_edit';

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
            if(anchor.closest('#wpadminbar,.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop'))return;
            const url=internalUrl(anchor);
            if(!url||!isNavigationLink(anchor,url))return;

            event.preventDefault();
            event.stopImmediatePropagation();
            url.searchParams.set(editParam,'1');
            window.location.href=url.toString();
          },true);
        })();
        </script>
        <?php
    }

    public static function render_frontend_controls() {
        if ( is_admin() || ! self::can_edit() ) { return; }
        $edit_url = self::current_url( true );
        ?>
        <style id="kp-owner-edit-focus-css">
          .kp-owner-single-edit{position:fixed;left:14px;bottom:16px;z-index:100090;display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:9px 15px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:#f07a22;color:#fff!important;font:800 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-decoration:none!important;box-shadow:0 12px 34px rgba(0,0,0,.34);-webkit-tap-highlight-color:transparent}
          .kp-owner-single-edit:hover,.kp-owner-single-edit:focus{background:#d96819;color:#fff!important}
          .kp-owner-single-edit .dashicons{width:18px;height:18px;font-size:18px}
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
          <a class="kp-owner-single-edit" href="<?php echo esc_url( $edit_url ); ?>"><span class="dashicons dashicons-edit"></span>Website bearbeiten</a>
        <?php endif; ?>
        <script id="kp-owner-edit-focus-js">
        (()=>{
          'use strict';

          function prepareEditorUi(){
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

          // Android keyboards can keep the final contenteditable change in an IME
          // composition until focus changes. Commit it before the editor's own
          // save click handler deactivates/removes the input listener.
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
