<?php
/**
 * Gemini API compatibility guard.
 * Gemini 3.7 Flash deprecated the legacy sampling knobs used by older models.
 * Strip them server-side so the direct editor remains compatible even if an
 * older request builder still contains one of those keys.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_filter( 'http_request_args', static function ( $args, $url ) {
    if ( ! is_string( $url ) || false === strpos( $url, 'generativelanguage.googleapis.com/' ) ) { return $args; }
    if ( false === strpos( $url, 'gemini-3.7-flash' ) ) { return $args; }
    if ( empty( $args['body'] ) || ! is_string( $args['body'] ) ) { return $args; }
    $body = json_decode( $args['body'], true );
    if ( ! is_array( $body ) ) { return $args; }
    if ( isset( $body['generationConfig'] ) && is_array( $body['generationConfig'] ) ) {
        unset( $body['generationConfig']['temperature'], $body['generationConfig']['topP'], $body['generationConfig']['topK'] );
    }
    if ( isset( $body['generation_config'] ) && is_array( $body['generation_config'] ) ) {
        unset( $body['generation_config']['temperature'], $body['generation_config']['top_p'], $body['generation_config']['top_k'] );
    }
    $args['body'] = wp_json_encode( $body );
    return $args;
}, 20, 2 );
