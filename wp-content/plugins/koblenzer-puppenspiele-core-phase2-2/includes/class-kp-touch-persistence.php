<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Cache-independent persistence bridge for the visual touch layout.
 *
 * The normal free-layout data is localized into the page HTML. A page/PWA cache
 * can therefore briefly serve older localized values even though admin-ajax has
 * already written newer coordinates to WordPress. This class exposes a tiny live
 * read endpoint and primes the free-layout runtime from a verified local mirror
 * before its JavaScript starts.
 */
final class KP_Touch_Persistence {
    const GLOBAL_OPTION = 'kp_touch_free_layout_global_v1';
    const PAGES_OPTION  = 'kp_touch_free_layout_pages_v1';

    public static function init() {
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 195 );
        add_action( 'wp_ajax_kp_touch_free_layout_load', array( __CLASS__, 'ajax_load' ) );
        add_action( 'wp_ajax_nopriv_kp_touch_free_layout_load', array( __CLASS__, 'ajax_load' ) );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function page_key() {
        $id = (int) get_queried_object_id();
        if ( $id > 0 ) { return 'post-' . $id; }
        $uri  = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/';
        $path = (string) wp_parse_url( $uri, PHP_URL_PATH );
        return 'path-' . substr( hash( 'sha256', $path ?: '/' ), 0, 16 );
    }

    private static function valid_page_key( $page_key ) {
        return is_string( $page_key ) && 1 === preg_match( '/^(post-[0-9]+|path-[a-f0-9]{16})$/', $page_key );
    }

    private static function clean_scope( $raw ) {
        if ( ! is_array( $raw ) ) { return array(); }
        $out = array();
        $devices = array( 'mobile', 'tablet', 'laptop', 'desktop' );
        foreach ( $raw as $key => $per_device ) {
            $key = sanitize_key( (string) $key );
            if ( ! $key || ! is_array( $per_device ) ) { continue; }
            foreach ( $devices as $device ) {
                if ( empty( $per_device[ $device ] ) || ! is_array( $per_device[ $device ] ) ) { continue; }
                $value = $per_device[ $device ];
                $x = isset( $value['x'] ) ? max( -1600, min( 1600, (float) $value['x'] ) ) : 0;
                $y = isset( $value['y'] ) ? max( -1600, min( 1600, (float) $value['y'] ) ) : 0;
                $scale = isset( $value['scale'] ) ? max( 0.45, min( 2.5, (float) $value['scale'] ) ) : 1;
                if ( abs( $x ) < 0.01 && abs( $y ) < 0.01 && abs( $scale - 1 ) < 0.001 ) { continue; }
                $out[ $key ][ $device ] = array(
                    'x'     => round( $x, 2 ),
                    'y'     => round( $y, 2 ),
                    'scale' => round( $scale, 3 ),
                );
            }
        }
        return $out;
    }

    private static function payload_for( $page_key ) {
        $global = self::clean_scope( get_option( self::GLOBAL_OPTION, array() ) );
        $pages = get_option( self::PAGES_OPTION, array() );
        if ( ! is_array( $pages ) ) { $pages = array(); }
        $page = isset( $pages[ $page_key ] ) && is_array( $pages[ $page_key ] )
            ? self::clean_scope( $pages[ $page_key ] )
            : array();
        $revision = substr( hash( 'sha256', wp_json_encode( array( $global, $page, $page_key ) ) ), 0, 16 );
        return array(
            // These scopes are maps. Keep empty scopes as {} instead of [] so a
            // later browser edit cannot create non-serializable named Array keys.
            'global'   => (object) $global,
            'page'     => (object) $page,
            'pageKey'  => $page_key,
            'revision' => $revision,
        );
    }

    public static function enqueue() {
        if ( is_admin() ) { return; }

        $page_key = self::page_key();

        /* This inline bootstrap runs after KPFreeLayout was localized but before
         touch-free-layout.js clones it. A mirror written only after a verified
         admin-ajax save therefore survives an HTML/PWA cache serving stale data. */
        $bootstrap = <<<'JS'
(() => {
  const cfg = window.KPFreeLayout;
  if (!cfg || !cfg.pageKey) return;
  const clone = value => {
    const cloned = JSON.parse(JSON.stringify(value || {}));
    return Array.isArray(cloned) ? {} : cloned;
  };
  cfg.global = clone(cfg.global);
  cfg.page = clone(cfg.page);
  const mergeEntry = (entry) => {
    if (!entry || !entry.key || !entry.scope || !entry.device || !entry.after) return;
    const bucket = entry.scope === 'global' ? cfg.global : cfg.page;
    bucket[entry.key] = bucket[entry.key] || {};
    bucket[entry.key][entry.device] = clone(entry.after);
  };
  try {
    const mirror = JSON.parse(localStorage.getItem(`kpFreeLayoutMirror:${cfg.pageKey}`) || 'null');
    if (mirror && mirror.pageKey === cfg.pageKey && Date.now() - Number(mirror.savedAt || 0) < 30 * 24 * 60 * 60 * 1000) {
      cfg.global = clone(mirror.global);
      cfg.page = clone(mirror.page);
      return;
    }
  } catch (_) {}
  try {
    const undo = JSON.parse(sessionStorage.getItem(`kpFreeLayoutUndo:${location.pathname}`) || 'null');
    if (undo && Date.now() - Number(undo.savedAt || 0) < 30 * 60 * 1000 && Array.isArray(undo.entries)) {
      cfg.global = clone(cfg.global);
      cfg.page = clone(cfg.page);
      undo.entries.forEach(mergeEntry);
    }
  } catch (_) {}
})();
JS;
        wp_add_inline_script( 'kp-touch-free-layout', $bootstrap, 'before' );

        $path = KP_CORE_DIR . 'assets/touch-persistence.js';
        wp_enqueue_script(
            'kp-touch-persistence',
            KP_CORE_URL . 'assets/touch-persistence.js',
            array( 'kp-touch-editor-bridge' ),
            file_exists( $path ) ? (string) filemtime( $path ) : KP_CORE_VERSION,
            true
        );
        wp_localize_script( 'kp-touch-persistence', 'KPTouchPersistence', array(
            'ajaxUrl' => admin_url( 'admin-ajax.php' ),
            'pageKey' => $page_key,
            'canEdit' => self::can_edit(),
        ) );
    }

    public static function ajax_load() {
        $page_key = isset( $_POST['page_key'] ) ? sanitize_text_field( wp_unslash( $_POST['page_key'] ) ) : '';
        if ( ! self::valid_page_key( $page_key ) ) {
            wp_send_json_error( array( 'message' => 'Ungültige Seite.' ), 400 );
        }
        nocache_headers();
        wp_send_json_success( self::payload_for( $page_key ) );
    }
}
