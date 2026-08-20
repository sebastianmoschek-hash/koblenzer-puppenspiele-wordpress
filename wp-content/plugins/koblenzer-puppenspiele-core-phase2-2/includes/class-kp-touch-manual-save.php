<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Keeps drag/zoom changes as local editor drafts until the owner explicitly
 * presses the orange Save button.
 */
final class KP_Touch_Manual_Save {
    public static function init() {
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 190 );
    }

    public static function enqueue() {
        if ( is_admin() ) { return; }

        $gate_path = KP_CORE_DIR . 'assets/touch-manual-save-gate.js';
        wp_enqueue_script(
            'kp-touch-manual-save-gate',
            KP_CORE_URL . 'assets/touch-manual-save-gate.js',
            array( 'kp-touch-free-layout' ),
            file_exists( $gate_path ) ? (string) filemtime( $gate_path ) : KP_CORE_VERSION,
            true
        );

        if ( wp_script_is( 'kp-touch-editor-bridge', 'registered' ) || wp_script_is( 'kp-touch-editor-bridge', 'enqueued' ) ) {
            wp_dequeue_script( 'kp-touch-editor-bridge' );
            wp_deregister_script( 'kp-touch-editor-bridge' );
        }

        $bridge_path = KP_CORE_DIR . 'assets/touch-editor-bridge.js';
        wp_enqueue_script(
            'kp-touch-editor-bridge',
            KP_CORE_URL . 'assets/touch-editor-bridge.js',
            array( 'kp-touch-manual-save-gate' ),
            file_exists( $bridge_path ) ? (string) filemtime( $bridge_path ) : KP_CORE_VERSION,
            true
        );
    }
}
