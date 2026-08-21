<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Repairs the unified owner design save verification.
 *
 * KP_Owner_Save_Coordinator intentionally preserves menu_offset_x in the same
 * kp_website_studio option. The core design sanitizer does not own that key,
 * therefore comparing the complete stored option strictly against the design
 * payload reports a false failure even though WordPress persisted the design.
 */
final class KP_Owner_Save_Readback_Fix {
    public static function init() {
        remove_action( 'wp_ajax_kp_owner_design_save', array( 'KP_Owner_Web_App', 'ajax_design_save' ) );
        add_action( 'wp_ajax_kp_owner_design_save', array( __CLASS__, 'ajax_design_save' ) );
    }

    private static function can_edit() {
        return is_user_logged_in()
            && current_user_can( 'edit_pages' )
            && current_user_can( 'edit_theme_options' );
    }

    private static function sanitize_design( $raw ) {
        // Keep one canonical sanitizer instead of duplicating the design schema.
        $method = new ReflectionMethod( 'KP_Owner_Web_App', 'sanitize_design' );
        if ( method_exists( $method, 'setAccessible' ) ) {
            $method->setAccessible( true );
        }
        return $method->invoke( null, is_array( $raw ) ? $raw : array() );
    }

    private static function design_matches( $stored, $clean ) {
        if ( ! is_array( $stored ) || ! is_array( $clean ) ) { return false; }
        // Extra keys owned by parallel controls (currently menu_offset_x) are
        // valid and must not make a successful design write look like a failure.
        foreach ( $clean as $key => $expected ) {
            if ( ! array_key_exists( $key, $stored ) || $stored[ $key ] !== $expected ) {
                return false;
            }
        }
        return true;
    }

    public static function ajax_design_save() {
        if ( ! self::can_edit() ) {
            wp_send_json_error( array( 'message' => 'Keine Berechtigung für Designänderungen.' ), 403 );
        }
        check_ajax_referer( KP_Owner_Web_App::NONCE_ACTION, 'nonce' );
        $raw = isset( $_POST['settings'] ) ? json_decode( wp_unslash( $_POST['settings'] ), true ) : array();
        $clean = self::sanitize_design( $raw );

        update_option( KP_Website_Studio::OPTION, $clean, false );
        $stored = get_option( KP_Website_Studio::OPTION, array() );
        if ( ! self::design_matches( $stored, $clean ) ) {
            wp_send_json_error( array( 'message' => 'Design konnte nicht dauerhaft bestätigt werden.' ), 500 );
        }

        // Return the complete stored option so the browser keeps parallel keys
        // in its baseline instead of treating them as a later phantom change.
        wp_send_json_success( array(
            'message'  => 'Design dauerhaft gespeichert ✓',
            'settings' => is_array( $stored ) ? $stored : $clean,
            'verified' => true,
        ) );
    }
}
