<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Owner web-app controls for social profiles.
 * Horizontal menu positioning is owned exclusively by KP_Owner_Menu_X.
 */
final class KP_Owner_Web_App_Extensions {
    const NONCE_ACTION = 'kp_owner_web_app';
    const OPTION       = 'kp_website_studio';

    public static function init() {
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 145 );
        add_action( 'wp_ajax_kp_owner_social_menu_save', array( __CLASS__, 'ajax_save' ) );
    }

    private static function can_design() {
        return is_user_logged_in() && current_user_can( 'edit_theme_options' );
    }

    private static function clean_social_url( $platform, $raw ) {
        $url = esc_url_raw( trim( (string) $raw ) );
        if ( ! $url ) { return ''; }
        $host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
        $allowed = array(
            'instagram' => array( 'instagram.com', 'www.instagram.com' ),
            'facebook'  => array( 'facebook.com', 'www.facebook.com', 'm.facebook.com' ),
            'youtube'   => array( 'youtube.com', 'www.youtube.com', 'youtu.be' ),
            'tiktok'    => array( 'tiktok.com', 'www.tiktok.com' ),
        );
        return isset( $allowed[ $platform ] ) && in_array( $host, $allowed[ $platform ], true ) ? $url : '';
    }

    private static function settings() {
        $saved = get_option( self::OPTION, array() );
        if ( ! is_array( $saved ) ) { $saved = array(); }
        $defaults = class_exists( 'KP_Social_Menu_Extensions' ) ? KP_Social_Menu_Extensions::defaults() : array(
            'menu_offset_x' => 0,
            'instagram_url' => '',
            'facebook_url' => '',
            'youtube_url' => '',
            'tiktok_url' => '',
            'instagram_label' => 'Instagram',
            'instagram_show_footer' => 1,
            'instagram_show_menu' => 1,
            'instagram_show_topbar' => 0,
            'instagram_show_home' => 0,
        );
        return wp_parse_args( $saved, $defaults );
    }

    public static function enqueue() {
        if ( is_admin() || ! self::can_design() ) { return; }
        $path = KP_CORE_DIR . 'assets/owner-web-app-extensions.js';
        wp_enqueue_script(
            'kp-owner-web-app-extensions',
            KP_CORE_URL . 'assets/owner-web-app-extensions.js',
            array( 'kp-owner-web-app' ),
            file_exists( $path ) ? (string) filemtime( $path ) : KP_CORE_VERSION,
            true
        );
        wp_localize_script( 'kp-owner-web-app-extensions', 'KPOwnerWebAppExtensions', array(
            'ajaxUrl'  => admin_url( 'admin-ajax.php' ),
            'nonce'    => wp_create_nonce( self::NONCE_ACTION ),
            'settings' => self::settings(),
        ) );
    }

    public static function ajax_save() {
        if ( ! self::can_design() ) {
            wp_send_json_error( array( 'message' => 'Keine Berechtigung für Designänderungen.' ), 403 );
        }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );

        $raw = isset( $_POST['settings'] ) ? json_decode( wp_unslash( $_POST['settings'] ), true ) : array();
        if ( ! is_array( $raw ) ) { $raw = array(); }
        $current = get_option( self::OPTION, array() );
        if ( ! is_array( $current ) ) { $current = array(); }

        // Deliberately do NOT touch menu_offset_x here. The dedicated menu-X
        // control owns that setting so a stale Social form can never overwrite it.
        foreach ( array( 'instagram', 'facebook', 'youtube', 'tiktok' ) as $platform ) {
            $key = $platform . '_url';
            $current[ $key ] = self::clean_social_url( $platform, isset( $raw[ $key ] ) ? $raw[ $key ] : '' );
        }
        $label = sanitize_text_field( (string) ( $raw['instagram_label'] ?? 'Instagram' ) );
        $current['instagram_label'] = $label ? mb_substr( $label, 0, 40 ) : 'Instagram';
        foreach ( array( 'instagram_show_footer', 'instagram_show_menu', 'instagram_show_topbar', 'instagram_show_home' ) as $key ) {
            $current[ $key ] = empty( $raw[ $key ] ) ? 0 : 1;
        }

        update_option( self::OPTION, $current, false );
        wp_send_json_success( array(
            'message'  => 'Social gespeichert ✓',
            'settings' => self::settings(),
        ) );
    }
}
