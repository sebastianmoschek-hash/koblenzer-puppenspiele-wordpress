<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class KP_Owner_Menu_X {
    const OPTION = 'kp_website_studio';
    const NONCE_ACTION = 'kp_owner_web_app';

    public static function init() {
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 145 );
        add_action( 'wp_ajax_kp_owner_menu_x_save', array( __CLASS__, 'ajax_save' ) );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_theme_options' );
    }

    public static function enqueue() {
        if ( is_admin() || ! self::can_edit() ) { return; }
        $saved = get_option( self::OPTION, array() );
        $x = is_array( $saved ) && isset( $saved['menu_offset_x'] ) ? (int) $saved['menu_offset_x'] : 0;
        $path = KP_CORE_DIR . 'assets/owner-menu-x.js';
        wp_enqueue_script( 'kp-owner-menu-x', KP_CORE_URL . 'assets/owner-menu-x.js', array( 'kp-owner-web-app' ), file_exists( $path ) ? (string) filemtime( $path ) : KP_CORE_VERSION, true );
        wp_localize_script( 'kp-owner-menu-x', 'KPOwnerMenuX', array(
            'ajaxUrl' => admin_url( 'admin-ajax.php' ),
            'nonce'   => wp_create_nonce( self::NONCE_ACTION ),
            'value'   => max( -180, min( 180, $x ) ),
        ) );
    }

    public static function ajax_save() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
        $x = isset( $_POST['value'] ) ? (int) $_POST['value'] : 0;
        $x = max( -180, min( 180, $x ) );
        $settings = get_option( self::OPTION, array() );
        if ( ! is_array( $settings ) ) { $settings = array(); }
        $settings['menu_offset_x'] = $x;
        update_option( self::OPTION, $settings, false );
        $stored = get_option( self::OPTION, array() );
        if ( ! is_array( $stored ) || ! array_key_exists( 'menu_offset_x', $stored ) || (int) $stored['menu_offset_x'] !== $x ) {
            wp_send_json_error( array( 'message' => 'Die horizontale Menüposition wurde von WordPress nicht dauerhaft übernommen.' ), 500 );
        }
        wp_send_json_success( array( 'value' => $x, 'message' => 'Horizontale Menüposition dauerhaft gespeichert ✓', 'verified' => true ) );
    }
}