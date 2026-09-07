<?php
/**
 * Text Patcher Service for KP Frontend Editor V2.
 *
 * Handles merging Android/IME composition text patches into the save payload.
 * Extracted from KP_Frontend_Editor_V2 to keep the main class focused on orchestration.
 *
 * @package Koblenzer_Puppenspiele_Core
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class KP_Text_Patcher {

    /**
     * Parse and sanitize incoming text patches from the AJAX request.
     *
     * Expected $_POST['kp_text_patches'] format:
     * [
     *   { "scope": "global|page", "collection": "blocks|dom", "key": "data-kp-key", "html": "<p>...</p>" },
     *   ...
     * ]
     *
     * @return array[] Sanitized patch items.
     */
    public static function parse_request() {
        $raw = isset( $_POST['kp_text_patches'] ) ? wp_unslash( $_POST['kp_text_patches'] ) : '';
        $items = $raw ? json_decode( $raw, true ) : array();
        if ( ! is_array( $items ) ) {
            return array();
        }

        $out = array();
        foreach ( array_slice( $items, 0, 80 ) as $item ) {
            if ( ! is_array( $item ) ) {
                continue;
            }
            $scope = isset( $item['scope'] ) && 'global' === $item['scope'] ? 'global' : 'page';
            $collection = isset( $item['collection'] ) && 'dom' === $item['collection'] ? 'dom' : 'blocks';
            $key = isset( $item['key'] ) ? sanitize_key( $item['key'] ) : '';
            if ( ! $key ) {
                continue;
            }
            $clean_html = isset( $item['html'] ) ? wp_kses_post( $item['html'] ) : '';
            $clean_html = preg_replace( '/\x{200B}/u', '', $clean_html );

            $out[] = array(
                'scope'      => $scope,
                'collection' => $collection,
                'key'        => $key,
                'html'       => $clean_html,
            );
        }
        return $out;
    }

    /**
     * Apply parsed text patches to the global and page payload arrays.
     *
     * Modifies $global and $page by reference.
     *
     * @param array $global Global settings array (passed by reference).
     * @param array $page   Page settings array (passed by reference).
     * @param array $patches Sanitized patches from parse_request().
     * @return void
     */
    public static function apply( &$global, &$page, array $patches ) {
        foreach ( $patches as $patch ) {
            $target =& $page;
            if ( 'global' === $patch['scope'] ) {
                $target =& $global;
            }
            $collection = $patch['collection'];
            $key = $patch['key'];

            if ( ! isset( $target[ $collection ] ) || ! is_array( $target[ $collection ] ) ) {
                $target[ $collection ] = array();
            }
            if ( ! isset( $target[ $collection ][ $key ] ) || ! is_array( $target[ $collection ][ $key ] ) ) {
                $target[ $collection ][ $key ] = array();
            }
            $target[ $collection ][ $key ]['content'] = array(
                'type'  => 'html',
                'value' => $patch['html'],
            );
            unset( $target );
        }
    }
}