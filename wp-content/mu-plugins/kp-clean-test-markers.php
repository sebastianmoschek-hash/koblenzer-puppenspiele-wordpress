<?php
/**
 * Staging Text-Save Artifact Cleanup
 *
 * Automatically scrubs test artifacts like [KP-SAVE-...] from frontend editor options.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'init', static function () {
    // The isolated staging text-save lab must observe its marker after the real
    // Save reload before it restores the original snapshot. Outside that short,
    // authenticated E2E route this scrubber still removes artifacts left by an
    // interrupted test on the very next request.
    $text_e2e = isset( $_GET['kp_e2e_text'] ) ? sanitize_text_field( wp_unslash( $_GET['kp_e2e_text'] ) ) : '';
    if ( '1' === $text_e2e && current_user_can( 'manage_options' ) ) { return; }

    $options = array( 'kp_frontend_editor_global_v1', 'kp_frontend_editor_pages_v1' );
    foreach ( $options as $opt ) {
        $val = get_option( $opt, null );
        if ( ! is_array( $val ) ) { continue; }
        $cleaned = false;
        array_walk_recursive( $val, static function ( &$item ) use ( &$cleaned ) {
            if ( is_string( $item ) && preg_match( '/\s*\[KP-SAVE-[a-z0-9]+\]/i', $item ) ) {
                $item = preg_replace( '/\s*\[KP-SAVE-[a-z0-9]+\]/i', '', $item );
                $cleaned = true;
            }
        } );
        if ( $cleaned ) {
            update_option( $opt, $val, false );
            if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
        }
    }
}, 5 );
