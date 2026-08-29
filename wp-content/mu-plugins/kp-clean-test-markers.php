<?php
/**
 * Staging Text-Save Artifact Cleanup
 *
 * Automatically scrubs test artifacts like [KP-SAVE-...] from frontend editor options.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'init', static function () {
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
