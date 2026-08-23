<?php
/**
 * Lightweight 48-hour checkpoints for FE2 page-content saves.
 *
 * A text/image/style edit in the direct frontend editor changes only the FE2
 * global option plus one page entry. The legacy owner checkpoint copied every
 * editor option (including every FE2 page) into one growing option before each
 * text save. On mature staging data that can make admin-ajax.php appear hung.
 *
 * For an explicit unified-save group this file creates the checkpoint first,
 * storing only the global FE2 value and the affected page entry. The core
 * history hook at priority 1 then sees the same group and deliberately reuses
 * this checkpoint. Other save actions keep the existing full checkpoint.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

const KP_FAST_FE_HISTORY_OPTION = 'kp_owner_history_v1';
const KP_FAST_FE_GLOBAL_OPTION  = 'kp_frontend_editor_global_v1';
const KP_FAST_FE_PAGES_OPTION   = 'kp_frontend_editor_pages_v1';
const KP_FAST_FE_RETENTION      = 172800;
const KP_FAST_FE_MAX_ITEMS      = 80;

function kp_fast_fe_history_prune( $items ) {
    if ( ! is_array( $items ) ) { return array(); }
    $cutoff = time() - KP_FAST_FE_RETENTION;
    $items = array_values( array_filter( $items, static function ( $item ) use ( $cutoff ) {
        return is_array( $item ) && isset( $item['ts'] ) && (int) $item['ts'] >= $cutoff;
    } ) );
    if ( count( $items ) > KP_FAST_FE_MAX_ITEMS ) {
        $items = array_slice( $items, -KP_FAST_FE_MAX_ITEMS );
    }
    return $items;
}

function kp_fast_fe_history_option_state( $name ) {
    $sentinel = new stdClass();
    $value = get_option( $name, $sentinel );
    return array(
        'exists' => $value !== $sentinel,
        'value'  => $value !== $sentinel ? $value : null,
    );
}

function kp_fast_fe_history_extra_options() {
    $out = array();
    foreach ( array(
        'kp_ai_image_replacements_global_v1',
        'kp_ai_image_replacements_pages_v1',
        'kp_ai_elements_pages_v1',
    ) as $name ) {
        $out[ $name ] = kp_fast_fe_history_option_state( $name );
    }
    return $out;
}

function kp_fast_fe_history_page_key() {
    $key = isset( $_POST['page_key'] ) ? strtolower( sanitize_text_field( wp_unslash( $_POST['page_key'] ) ) ) : '';
    return preg_match( '/^(post-[0-9]+|path-[a-f0-9]{16})$/', $key ) ? $key : '';
}

function kp_fast_fe_history_group() {
    $group = isset( $_POST['kp_history_group'] ) ? sanitize_key( wp_unslash( (string) $_POST['kp_history_group'] ) ) : '';
    return substr( $group, 0, 80 );
}

function kp_fast_fe_history_checkpoint() {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }

    $group = kp_fast_fe_history_group();
    $page_key = kp_fast_fe_history_page_key();
    // Keep legacy/direct requests on the proven full checkpoint. The optimized
    // path is only used for the one orange Save transaction we can identify.
    if ( ! $group || ! $page_key ) { return; }

    if ( class_exists( 'KP_Frontend_Editor_V2' ) && defined( 'KP_Frontend_Editor_V2::NONCE_ACTION' ) ) {
        $nonce = isset( $_POST['nonce'] ) ? (string) wp_unslash( $_POST['nonce'] ) : '';
        if ( ! wp_verify_nonce( $nonce, KP_Frontend_Editor_V2::NONCE_ACTION ) ) { return; }
    }

    $items = kp_fast_fe_history_prune( get_option( KP_FAST_FE_HISTORY_OPTION, array() ) );
    if ( $items ) {
        $last = end( $items );
        if ( is_array( $last ) && ! empty( $last['group'] ) && hash_equals( (string) $last['group'], $group ) ) {
            return; // A specialist request from this same Save already checkpointed.
        }
    }

    $pages = get_option( KP_FAST_FE_PAGES_OPTION, array() );
    if ( ! is_array( $pages ) ) { $pages = array(); }
    $page_exists = array_key_exists( $page_key, $pages );

    $state = array(
        'options' => array(
            KP_FAST_FE_GLOBAL_OPTION => kp_fast_fe_history_option_state( KP_FAST_FE_GLOBAL_OPTION ),
        ),
        'entity' => null,
        'extra_options' => kp_fast_fe_history_extra_options(),
        'entities' => array(),
        'frontend_page_delta' => array(
            'page_key' => $page_key,
            'exists'   => $page_exists,
            'value'    => $page_exists ? $pages[ $page_key ] : null,
        ),
    );

    $now = time();
    $items[] = array(
        'id'       => gmdate( 'YmdHis', $now ) . '-' . wp_generate_password( 8, false, false ),
        'ts'       => $now,
        'label'    => 'Seite geändert',
        'user'     => get_current_user_id(),
        'group'    => $group,
        'checksum' => hash( 'sha256', wp_json_encode( $state ) ),
        'state'    => $state,
    );
    update_option( KP_FAST_FE_HISTORY_OPTION, kp_fast_fe_history_prune( $items ), false );
}
add_action( 'wp_ajax_kp_fe_v2_save', 'kp_fast_fe_history_checkpoint', 0 );

function kp_fast_fe_history_restore_page_delta( $state ) {
    if ( ! is_array( $state ) || empty( $state['frontend_page_delta'] ) || ! is_array( $state['frontend_page_delta'] ) ) { return; }
    $delta = $state['frontend_page_delta'];
    $key = isset( $delta['page_key'] ) ? strtolower( sanitize_text_field( (string) $delta['page_key'] ) ) : '';
    if ( ! preg_match( '/^(post-[0-9]+|path-[a-f0-9]{16})$/', $key ) ) { return; }

    $pages = get_option( KP_FAST_FE_PAGES_OPTION, array() );
    if ( ! is_array( $pages ) ) { $pages = array(); }
    if ( ! empty( $delta['exists'] ) ) { $pages[ $key ] = $delta['value'] ?? array(); }
    else { unset( $pages[ $key ] ); }
    update_option( KP_FAST_FE_PAGES_OPTION, $pages, false );
    if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
}

function kp_fast_fe_history_find_state( $version_id = '' ) {
    $items = kp_fast_fe_history_prune( get_option( KP_FAST_FE_HISTORY_OPTION, array() ) );
    if ( ! $items ) { return array(); }
    if ( '' === $version_id ) {
        $item = end( $items );
        return is_array( $item ) && isset( $item['state'] ) && is_array( $item['state'] ) ? $item['state'] : array();
    }
    foreach ( $items as $item ) {
        if ( is_array( $item ) && isset( $item['id'] ) && hash_equals( (string) $item['id'], (string) $version_id ) ) {
            return isset( $item['state'] ) && is_array( $item['state'] ) ? $item['state'] : array();
        }
    }
    return array();
}

add_action( 'plugins_loaded', static function () {
    // Core restore intentionally ignores unknown state keys. Re-merge the one
    // page entry after core has restored its normal option snapshot.
    add_action( 'wp_ajax_kp_owner_history_undo', static function () {
        if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
        $state = kp_fast_fe_history_find_state();
        if ( empty( $state['frontend_page_delta'] ) ) { return; }
        register_shutdown_function( static function () use ( $state ) {
            kp_fast_fe_history_restore_page_delta( $state );
        } );
    }, 4 );

    add_action( 'wp_ajax_kp_owner_history_restore', static function () {
        if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
        $id = isset( $_POST['version_id'] ) ? sanitize_text_field( wp_unslash( $_POST['version_id'] ) ) : '';
        if ( ! $id ) { return; }
        $state = kp_fast_fe_history_find_state( $id );
        if ( empty( $state['frontend_page_delta'] ) ) { return; }
        register_shutdown_function( static function () use ( $state ) {
            kp_fast_fe_history_restore_page_delta( $state );
        } );
    }, 4 );
} );
