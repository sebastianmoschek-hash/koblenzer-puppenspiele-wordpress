<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Simple left/center/right + fine horizontal positioning for images selected
 * in the direct front-end editor. Stored separately so the core editor remains
 * backward compatible and existing saved visual edits are untouched.
 */
final class KP_Image_Position {
    const GLOBAL_OPTION = 'kp_image_position_global_v1';
    const PAGES_OPTION  = 'kp_image_position_pages_v1';
    const NONCE_ACTION  = 'kp_image_position';

    public static function init() {
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 70 );
        add_action( 'wp_ajax_kp_image_position_save', array( __CLASS__, 'ajax_save' ) );
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

    private static function clean_scope( $input ) {
        $out = array();
        if ( ! is_array( $input ) ) { return $out; }
        $devices = array( 'mobile', 'tablet', 'laptop', 'desktop' );
        foreach ( $input as $key => $device_values ) {
            $key = sanitize_key( (string) $key );
            if ( '' === $key || ! is_array( $device_values ) ) { continue; }
            foreach ( $devices as $device ) {
                if ( ! isset( $device_values[ $device ] ) ) { continue; }
                $x = max( 0, min( 100, (int) $device_values[ $device ] ) );
                $out[ $key ][ $device ] = $x;
            }
        }
        return $out;
    }

    public static function enqueue() {
        if ( is_admin() ) { return; }

        $all_pages = get_option( self::PAGES_OPTION, array() );
        if ( ! is_array( $all_pages ) ) { $all_pages = array(); }
        $page_key = self::page_key();
        $page_data = isset( $all_pages[ $page_key ] ) && is_array( $all_pages[ $page_key ] ) ? $all_pages[ $page_key ] : array();
        $global = get_option( self::GLOBAL_OPTION, array() );
        if ( ! is_array( $global ) ) { $global = array(); }

        $src = KP_CORE_URL . 'assets/image-position.js';
        $path = KP_CORE_DIR . 'assets/image-position.js';
        wp_enqueue_script( 'kp-image-position', $src, array( 'kp-frontend-editor' ), file_exists( $path ) ? (string) filemtime( $path ) : KP_CORE_VERSION, true );
        wp_localize_script( 'kp-image-position', 'KPImagePosition', array(
            'ajaxUrl'   => admin_url( 'admin-ajax.php' ),
            'nonce'     => self::can_edit() ? wp_create_nonce( self::NONCE_ACTION ) : '',
            'canEdit'   => self::can_edit(),
            'editMode'  => self::can_edit() && isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) ),
            'pageKey'   => $page_key,
            'global'    => $global,
            'page'      => $page_data,
        ) );
    }

    public static function ajax_save() {
        if ( ! self::can_edit() ) {
            wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 );
        }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );

        $global_raw = isset( $_POST['global'] ) ? json_decode( wp_unslash( $_POST['global'] ), true ) : array();
        $page_raw   = isset( $_POST['page'] ) ? json_decode( wp_unslash( $_POST['page'] ), true ) : array();
        $page_key   = isset( $_POST['page_key'] ) ? sanitize_text_field( wp_unslash( $_POST['page_key'] ) ) : '';
        if ( ! preg_match( '/^(post-[0-9]+|path-[a-f0-9]{16})$/', $page_key ) ) {
            wp_send_json_error( array( 'message' => 'Ungültige Seite.' ), 400 );
        }

        update_option( self::GLOBAL_OPTION, self::clean_scope( $global_raw ), false );
        $all_pages = get_option( self::PAGES_OPTION, array() );
        if ( ! is_array( $all_pages ) ) { $all_pages = array(); }
        $clean_page = self::clean_scope( $page_raw );
        if ( $clean_page ) { $all_pages[ $page_key ] = $clean_page; }
        else { unset( $all_pages[ $page_key ] ); }
        update_option( self::PAGES_OPTION, $all_pages, false );

        wp_send_json_success( array( 'message' => 'Bildposition gespeichert.' ) );
    }
}
