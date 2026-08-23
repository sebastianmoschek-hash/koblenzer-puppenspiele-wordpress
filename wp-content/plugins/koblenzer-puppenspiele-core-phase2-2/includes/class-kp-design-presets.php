<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Reliable factory-reset and three owner design presets for the front-end studio.
 * Presets deliberately do not change the header image; they are visual-style presets.
 */
final class KP_Design_Presets {
    const OPTION = 'kp_design_presets_v1';
    const RESET_MARKER = 'kp_design_factory_reset_20260820';
    const NONCE_ACTION = 'kp_owner_web_app';

    public static function init() {
        add_action( 'init', array( __CLASS__, 'restore_staging_factory_once' ), 95 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 120 );
        add_action( 'wp_ajax_kp_design_preset_save', array( __CLASS__, 'ajax_save' ) );
        add_action( 'wp_ajax_kp_design_preset_load', array( __CLASS__, 'ajax_load' ) );
        add_action( 'wp_ajax_kp_design_factory_defaults', array( __CLASS__, 'ajax_defaults' ) );
    }

    private static function can_design() {
        return is_user_logged_in() && current_user_can( 'edit_theme_options' );
    }

    public static function restore_staging_factory_once() {
        if ( get_option( self::RESET_MARKER ) ) { return; }
        $host = strtolower( (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST ) );
        if ( 'neu.koblenzer-puppenspiele.de' !== $host ) { return; }
        if ( ! class_exists( 'KP_Website_Studio' ) ) { return; }
        update_option( KP_Website_Studio::OPTION, KP_Website_Studio::defaults(), false );
        update_option( self::RESET_MARKER, gmdate( 'c' ), false );
    }

    public static function enqueue() {
        if ( ! self::can_design() || is_admin() ) { return; }
        wp_enqueue_script(
            'kp-design-presets',
            KP_CORE_URL . 'assets/design-presets.js',
            array( 'kp-owner-web-app' ),
            KP_CORE_VERSION,
            true
        );
    }

    private static function presets() {
        $saved = get_option( self::OPTION, array() );
        return is_array( $saved ) ? $saved : array();
    }

    private static function sanitize_settings( $raw ) {
        $defaults = KP_Website_Studio::defaults();
        $clean = array();
        if ( ! is_array( $raw ) ) { $raw = array(); }
        foreach ( $defaults as $key => $default ) {
            // Header pictures are content, not part of a visual preset.
            if ( 'header_image_id' === $key ) { continue; }
            $value = array_key_exists( $key, $raw ) ? $raw[ $key ] : $default;
            if ( is_int( $default ) ) {
                $clean[ $key ] = (int) $value;
            } elseif ( is_string( $default ) && 0 === strpos( $default, '#' ) ) {
                $color = sanitize_hex_color( (string) $value );
                $clean[ $key ] = $color ? $color : $default;
            } else {
                $clean[ $key ] = sanitize_text_field( (string) $value );
            }
        }
        if ( ! in_array( $clean['body_font'] ?? '', array( 'system', 'humanist', 'classic' ), true ) ) { $clean['body_font'] = $defaults['body_font']; }
        if ( ! in_array( $clean['heading_font'] ?? '', array( 'georgia', 'palatino', 'system' ), true ) ) { $clean['heading_font'] = $defaults['heading_font']; }
        // Horizontal menu position is persisted by a dedicated runtime and is
        // therefore not part of KP_Website_Studio::defaults(), but it is still
        // visual design and must travel with an owner design preset.
        $clean['menu_offset_x'] = max( -180, min( 180, (int) ( $raw['menu_offset_x'] ?? 0 ) ) );
        return $clean;
    }

    private static function slot() {
        $slot = isset( $_POST['slot'] ) ? absint( $_POST['slot'] ) : 0;
        return $slot >= 1 && $slot <= 3 ? $slot : 0;
    }

    public static function ajax_save() {
        if ( ! self::can_design() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
        $slot = self::slot();
        if ( ! $slot ) { wp_send_json_error( array( 'message' => 'Ungültiger Preset-Slot.' ), 400 ); }
        $raw = isset( $_POST['settings'] ) ? json_decode( wp_unslash( $_POST['settings'] ), true ) : array();
        $presets = self::presets();
        $presets[ $slot ] = array(
            'settings' => self::sanitize_settings( $raw ),
            'saved_at' => current_time( 'mysql' ),
        );
        update_option( self::OPTION, $presets, false );
        wp_send_json_success( array( 'message' => 'Preset ' . $slot . ' gespeichert ✓', 'slot' => $slot ) );
    }

    public static function ajax_load() {
        if ( ! self::can_design() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
        $slot = self::slot();
        $presets = self::presets();
        if ( ! $slot || empty( $presets[ $slot ]['settings'] ) || ! is_array( $presets[ $slot ]['settings'] ) ) {
            wp_send_json_error( array( 'message' => 'Preset ' . $slot . ' ist noch leer.' ), 404 );
        }
        wp_send_json_success( array(
            'message' => 'Preset ' . $slot . ' geladen – zum Übernehmen „Design speichern“ drücken.',
            'settings' => self::sanitize_settings( $presets[ $slot ]['settings'] ),
            'slot' => $slot,
        ) );
    }

    public static function ajax_defaults() {
        if ( ! self::can_design() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
        $defaults = KP_Website_Studio::defaults();
        // Keep current header image while resetting visual controls in the live editor.
        unset( $defaults['header_image_id'] );
        $defaults['menu_offset_x'] = 0;
        wp_send_json_success( array(
            'message' => 'Ursprüngliche Werkseinstellungen geladen – zum Übernehmen „Design speichern“ drücken.',
            'settings' => $defaults,
        ) );
    }
}
