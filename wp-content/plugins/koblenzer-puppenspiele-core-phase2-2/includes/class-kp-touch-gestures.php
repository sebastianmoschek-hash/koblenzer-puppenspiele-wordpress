<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Touch-first direct manipulation for the owner editor.
 *
 * - tap remains owned by the existing direct editor
 * - long press + drag stores a responsive visual offset
 * - two-finger pinch stores a responsive scale
 * - gesture data is isolated from structured Termine/Repertoire content
 */
final class KP_Touch_Gestures {
    const GLOBAL_OPTION = 'kp_touch_gestures_global_v1';
    const PAGES_OPTION  = 'kp_touch_gestures_pages_v1';
    const NONCE_ACTION  = 'kp_touch_gestures';

    public static function init() {
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 175 );
        add_action( 'wp_ajax_kp_touch_gesture_save', array( __CLASS__, 'ajax_save' ) );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function edit_mode() {
        return self::can_edit()
            && isset( $_GET['kp_edit'] )
            && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    }

    private static function page_key() {
        $id = (int) get_queried_object_id();
        if ( $id > 0 ) { return 'post-' . $id; }
        $uri  = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/';
        $path = (string) wp_parse_url( $uri, PHP_URL_PATH );
        return 'path-' . substr( hash( 'sha256', $path ?: '/' ), 0, 16 );
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
                $v = $per_device[ $device ];
                $x = isset( $v['x'] ) ? max( -1200, min( 1200, (float) $v['x'] ) ) : 0;
                $y = isset( $v['y'] ) ? max( -1200, min( 1200, (float) $v['y'] ) ) : 0;
                $scale = isset( $v['scale'] ) ? max( 0.45, min( 2.5, (float) $v['scale'] ) ) : 1;
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

    public static function enqueue() {
        if ( is_admin() ) { return; }

        $global = get_option( self::GLOBAL_OPTION, array() );
        if ( ! is_array( $global ) ) { $global = array(); }
        $pages = get_option( self::PAGES_OPTION, array() );
        if ( ! is_array( $pages ) ) { $pages = array(); }
        $page_key = self::page_key();
        $page = isset( $pages[ $page_key ] ) && is_array( $pages[ $page_key ] ) ? $pages[ $page_key ] : array();

        $css = KP_CORE_DIR . 'assets/touch-gestures.css';
        $js  = KP_CORE_DIR . 'assets/touch-gestures.js';
        wp_enqueue_style(
            'kp-touch-gestures',
            KP_CORE_URL . 'assets/touch-gestures.css',
            array(),
            file_exists( $css ) ? (string) filemtime( $css ) : KP_CORE_VERSION
        );
        wp_enqueue_script(
            'kp-touch-gestures',
            KP_CORE_URL . 'assets/touch-gestures.js',
            array( 'kp-frontend-editor-v2' ),
            file_exists( $js ) ? (string) filemtime( $js ) : KP_CORE_VERSION,
            true
        );
        wp_localize_script( 'kp-touch-gestures', 'KPTouchGestures', array(
            'ajaxUrl'   => admin_url( 'admin-ajax.php' ),
            'nonce'     => self::can_edit() ? wp_create_nonce( self::NONCE_ACTION ) : '',
            'canEdit'   => self::can_edit(),
            'editMode'  => self::edit_mode(),
            'pageKey'   => $page_key,
            'global'    => self::clean_scope( $global ),
            'page'      => self::clean_scope( $page ),
            'holdMs'    => 460,
        ) );
    }

    public static function ajax_save() {
        if ( ! self::can_edit() ) {
            wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 );
        }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );

        $page_key = isset( $_POST['page_key'] ) ? sanitize_text_field( wp_unslash( $_POST['page_key'] ) ) : '';
        if ( ! preg_match( '/^(post-[0-9]+|path-[a-f0-9]{16})$/', $page_key ) ) {
            wp_send_json_error( array( 'message' => 'Ungültige Seite.' ), 400 );
        }

        $global_raw = isset( $_POST['global'] ) ? json_decode( wp_unslash( $_POST['global'] ), true ) : array();
        $page_raw   = isset( $_POST['page'] ) ? json_decode( wp_unslash( $_POST['page'] ), true ) : array();
        $global = self::clean_scope( $global_raw );
        $page   = self::clean_scope( $page_raw );

        update_option( self::GLOBAL_OPTION, $global, false );
        $pages = get_option( self::PAGES_OPTION, array() );
        if ( ! is_array( $pages ) ) { $pages = array(); }
        if ( $page ) { $pages[ $page_key ] = $page; }
        else { unset( $pages[ $page_key ] ); }
        update_option( self::PAGES_OPTION, $pages, false );

        wp_send_json_success( array( 'message' => 'Position gespeichert ✓' ) );
    }
}
