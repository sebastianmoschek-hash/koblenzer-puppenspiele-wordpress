<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Loads the touch editor bridge after both gesture runtimes.
 *
 * Drag/zoom persistence is owned by the runtimes themselves: changes remain
 * local until the orange frontend-editor Save button explicitly calls flush().
 * There is deliberately no fetch interception or simulated save response here.
 */
final class KP_Touch_Manual_Save {
    public static function init() {
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 190 );
    }

    public static function enqueue() {
        if ( is_admin() ) { return; }

        if ( wp_script_is( 'kp-touch-editor-bridge', 'registered' ) || wp_script_is( 'kp-touch-editor-bridge', 'enqueued' ) ) {
            wp_dequeue_script( 'kp-touch-editor-bridge' );
            wp_deregister_script( 'kp-touch-editor-bridge' );
        }

        $bridge_path = KP_CORE_DIR . 'assets/touch-editor-bridge.js';
        wp_enqueue_script(
            'kp-touch-editor-bridge',
            KP_CORE_URL . 'assets/touch-editor-bridge.js',
            array( 'kp-touch-free-layout', 'kp-touch-gestures' ),
            file_exists( $bridge_path ) ? (string) filemtime( $bridge_path ) : KP_CORE_VERSION,
            true
        );
    }
}
