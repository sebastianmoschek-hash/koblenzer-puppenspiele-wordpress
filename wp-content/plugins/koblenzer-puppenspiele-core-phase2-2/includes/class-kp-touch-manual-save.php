<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Makes drag/zoom edits explicit-save only.
 *
 * The gesture runtimes still emit their normal save requests so the existing
 * bridge can track snapshots/undo, but a JS gate loaded before that bridge keeps
 * those requests as local drafts until the owner presses the orange Save button.
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

        /* KP_Touch_Free_Layout enqueues the editor bridge earlier. Re-register it
         here so the save gate is guaranteed to exist before the bridge captures
         window.fetch and before its capture-phase Save handler is registered. */
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
