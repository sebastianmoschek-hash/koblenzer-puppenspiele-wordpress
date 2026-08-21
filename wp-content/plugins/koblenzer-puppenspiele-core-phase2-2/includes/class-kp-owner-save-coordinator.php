<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Unified owner-save glue and safety guards. */
final class KP_Owner_Save_Coordinator {
    public static function init() {
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 215 );
        add_filter( 'pre_update_option_kp_website_studio', array( __CLASS__, 'preserve_parallel_design_keys' ), 10, 2 );
    }

    public static function preserve_parallel_design_keys( $value, $old_value ) {
        if ( ! is_array( $value ) ) { return $value; }
        if ( is_array( $old_value ) && array_key_exists( 'menu_offset_x', $old_value ) && ! array_key_exists( 'menu_offset_x', $value ) ) {
            $value['menu_offset_x'] = max( -180, min( 180, (int) $old_value['menu_offset_x'] ) );
        }
        return $value;
    }

    public static function enqueue() {
        if ( is_admin() || ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
        $js = KP_CORE_DIR . 'assets/owner-save-coordinator.js';
        $css = KP_CORE_DIR . 'assets/owner-save-coordinator.css';
        wp_enqueue_style(
            'kp-owner-save-coordinator',
            KP_CORE_URL . 'assets/owner-save-coordinator.css',
            array( 'kp-owner-web-app' ),
            file_exists( $css ) ? (string) filemtime( $css ) : KP_CORE_VERSION
        );
        wp_enqueue_script(
            'kp-owner-save-coordinator',
            KP_CORE_URL . 'assets/owner-save-coordinator.js',
            array( 'kp-owner-web-app', 'kp-owner-responsive-web', 'kp-owner-menu-x', 'kp-image-position', 'kp-touch-persistence' ),
            file_exists( $js ) ? (string) filemtime( $js ) : KP_CORE_VERSION,
            true
        );
    }
}
