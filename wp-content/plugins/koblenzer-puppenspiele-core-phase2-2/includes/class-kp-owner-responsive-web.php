<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Responsive-size controls for the owner web app. */
final class KP_Owner_Responsive_Web {
    const NONCE_ACTION = 'kp_owner_responsive_web';

    public static function init() {
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 96 );
        add_action( 'wp_ajax_kp_owner_sizes_save', array( __CLASS__, 'ajax_save' ) );
        add_action( 'admin_bar_menu', array( __CLASS__, 'clean_frontend_admin_bar' ), 1300 );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function edit_mode() {
        return self::can_edit() && isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    }

    private static function devices() {
        return array(
            'mobile'  => 'Handy',
            'tablet'  => 'Tablet',
            'laptop'  => 'Laptop',
            'desktop' => 'Großer Bildschirm',
        );
    }

    private static function areas() {
        return array(
            'header'       => 'Kopfbereich & Headerbild',
            'navigation'   => 'Navigation',
            'hero'         => 'Startseite: Begrüßung',
            'termine'      => 'Termine',
            'home_booking' => 'Startseite: Buchungsbox',
            'aktuelles'    => 'Aktuelles',
            'theater'      => 'Das Theater & Ensemble',
            'repertoire'   => 'Repertoire',
            'referenzen'   => 'Referenzen',
            'booking'      => 'Jetzt buchen',
            'kontakt'      => 'Kontakt',
            'faq'          => 'Kita / Schule FAQ',
            'legal'        => 'Impressum & Datenschutz',
            'generic'      => 'Neue / sonstige Seiten',
            'footer'       => 'Footer',
        );
    }

    private static function defaults() {
        $out = array();
        foreach ( self::devices() as $device => $label ) { $out[ 'all_' . $device ] = 100; }
        foreach ( self::areas() as $area => $label ) {
            foreach ( self::devices() as $device => $device_label ) { $out[ $area . '_' . $device ] = 100; }
        }
        return $out;
    }

    private static function settings() {
        $saved = get_option( KP_Responsive_Sizes::OPTION, array() );
        return wp_parse_args( is_array( $saved ) ? $saved : array(), self::defaults() );
    }

    private static function sanitize_scale( $value, $min, $max ) {
        return max( $min, min( $max, (int) $value ) );
    }

    private static function sanitize_settings( $raw ) {
        $out = array();
        if ( ! is_array( $raw ) ) { $raw = array(); }
        foreach ( self::devices() as $device => $label ) {
            $key = 'all_' . $device;
            $out[ $key ] = self::sanitize_scale( isset( $raw[ $key ] ) ? $raw[ $key ] : 100, 90, 120 );
        }
        foreach ( self::areas() as $area => $label ) {
            foreach ( self::devices() as $device => $device_label ) {
                $key = $area . '_' . $device;
                $out[ $key ] = self::sanitize_scale(
                    isset( $raw[ $key ] ) ? $raw[ $key ] : 100,
                    'termine' === $area ? 85 : 90,
                    'termine' === $area ? 140 : 120
                );
            }
        }
        return $out;
    }

    public static function enqueue() {
        if ( is_admin() || ! self::can_edit() ) { return; }
        wp_enqueue_script(
            'kp-owner-responsive-web',
            KP_CORE_URL . 'assets/owner-responsive-web.js',
            array( 'kp-owner-web-app' ),
            KP_CORE_VERSION,
            true
        );
        wp_add_inline_script(
            'kp-owner-responsive-web',
            'window.KPOwnerResponsiveWeb=' . wp_json_encode( array(
                'editMode' => self::edit_mode(),
                'ajaxUrl'  => admin_url( 'admin-ajax.php' ),
                'nonce'    => wp_create_nonce( self::NONCE_ACTION ),
                'settings' => self::settings(),
                'defaults' => self::defaults(),
                'devices'  => self::devices(),
                'areas'    => self::areas(),
            ) ) . ';',
            'before'
        );
    }

    public static function ajax_save() {
        if ( ! self::can_edit() || ! current_user_can( 'edit_theme_options' ) ) {
            wp_send_json_error( array( 'message' => 'Keine Berechtigung für Anzeigegrößen.' ), 403 );
        }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
        $raw = isset( $_POST['settings'] ) ? json_decode( wp_unslash( $_POST['settings'] ), true ) : array();
        $clean = self::sanitize_settings( $raw );
        update_option( KP_Responsive_Sizes::OPTION, $clean, false );
        if ( get_option( KP_Responsive_Sizes::OPTION, array() ) !== $clean ) {
            wp_send_json_error( array( 'message' => 'Anzeigegrößen konnten nicht dauerhaft bestätigt werden.' ), 500 );
        }
        wp_send_json_success( array( 'message' => 'Anzeigegrößen gespeichert ✓', 'settings' => $clean ) );
    }

    public static function clean_frontend_admin_bar( $bar ) {
        if ( is_admin() || ! self::can_edit() ) { return; }
        foreach ( array( 'kp-website-studio', 'kp-responsive-sizes' ) as $id ) { $bar->remove_node( $id ); }
    }
}
