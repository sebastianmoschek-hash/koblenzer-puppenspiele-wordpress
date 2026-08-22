<?php
/**
 * Extension for the 48-hour owner history.
 *
 * The core history class predates AI drafts and grouped saves that can touch
 * several posts in one orange Save transaction. This extension augments the
 * latest core checkpoint with those extra option states and every affected
 * entity, then restores them alongside the core snapshot.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_history_ext_option_names() {
    return array(
        'kp_ai_image_replacements_global_v1',
        'kp_ai_image_replacements_pages_v1',
        'kp_ai_elements_pages_v1',
    );
}

function kp_history_ext_capture_options() {
    $out = array();
    foreach ( kp_history_ext_option_names() as $name ) {
        $sentinel = new stdClass();
        $value = get_option( $name, $sentinel );
        $out[ $name ] = array(
            'exists' => $value !== $sentinel,
            'value'  => $value !== $sentinel ? $value : null,
        );
    }
    return $out;
}

function kp_history_ext_capture_entity( $id ) {
    $id = absint( $id );
    if ( ! $id || ! current_user_can( 'edit_post', $id ) ) { return null; }
    $post = get_post( $id );
    if ( ! $post ) { return null; }

    $meta = array();
    foreach ( get_post_meta( $id ) as $key => $values ) {
        if ( '_thumbnail_id' !== $key && 0 !== strpos( $key, '_kp_' ) ) { continue; }
        $meta[ $key ] = array_values( $values );
    }
    $terms = array();
    foreach ( get_object_taxonomies( $post->post_type ) as $taxonomy ) {
        $ids = wp_get_object_terms( $id, $taxonomy, array( 'fields' => 'ids' ) );
        if ( ! is_wp_error( $ids ) ) { $terms[ $taxonomy ] = array_map( 'intval', $ids ); }
    }
    return array(
        'id'           => $id,
        'post_type'    => (string) $post->post_type,
        'post_status'  => (string) $post->post_status,
        'post_title'   => (string) $post->post_title,
        'post_name'    => (string) $post->post_name,
        'post_excerpt' => (string) $post->post_excerpt,
        'post_content' => (string) $post->post_content,
        'menu_order'   => (int) $post->menu_order,
        'meta'         => $meta,
        'terms'        => $terms,
    );
}

function kp_history_ext_restore_entity( $entity ) {
    if ( ! is_array( $entity ) || empty( $entity['id'] ) ) { return; }
    $id = absint( $entity['id'] );
    if ( ! $id || ! current_user_can( 'edit_post', $id ) || ! get_post( $id ) ) { return; }
    $result = wp_update_post( array(
        'ID'           => $id,
        'post_status'  => sanitize_key( $entity['post_status'] ?? 'publish' ),
        'post_title'   => (string) ( $entity['post_title'] ?? '' ),
        'post_name'    => sanitize_title( $entity['post_name'] ?? '' ),
        'post_excerpt' => (string) ( $entity['post_excerpt'] ?? '' ),
        'post_content' => (string) ( $entity['post_content'] ?? '' ),
        'menu_order'   => (int) ( $entity['menu_order'] ?? 0 ),
    ), true );
    if ( is_wp_error( $result ) ) { return; }

    foreach ( get_post_meta( $id ) as $key => $values ) {
        if ( '_thumbnail_id' === $key || 0 === strpos( $key, '_kp_' ) ) { delete_post_meta( $id, $key ); }
    }
    foreach ( (array) ( $entity['meta'] ?? array() ) as $key => $values ) {
        if ( '_thumbnail_id' !== $key && 0 !== strpos( $key, '_kp_' ) ) { continue; }
        foreach ( (array) $values as $value ) { add_post_meta( $id, $key, maybe_unserialize( $value ) ); }
    }
    foreach ( (array) ( $entity['terms'] ?? array() ) as $taxonomy => $ids ) {
        if ( taxonomy_exists( $taxonomy ) ) { wp_set_object_terms( $id, array_map( 'intval', (array) $ids ), $taxonomy, false ); }
    }
}

function kp_history_ext_restore_state( $state ) {
    if ( ! is_array( $state ) ) { return; }
    foreach ( (array) ( $state['extra_options'] ?? array() ) as $name => $entry ) {
        if ( ! in_array( $name, kp_history_ext_option_names(), true ) || ! is_array( $entry ) ) { continue; }
        if ( empty( $entry['exists'] ) ) { delete_option( $name ); }
        else { update_option( $name, $entry['value'], false ); }
    }
    $seen = array();
    foreach ( (array) ( $state['entities'] ?? array() ) as $entity ) {
        $id = absint( is_array( $entity ) ? ( $entity['id'] ?? 0 ) : 0 );
        if ( ! $id || isset( $seen[ $id ] ) ) { continue; }
        $seen[ $id ] = true;
        kp_history_ext_restore_entity( $entity );
    }
    if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
}

function kp_history_ext_request_allowed() {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return false; }
    if ( class_exists( 'KP_Owner_Web_App' ) && defined( 'KP_Owner_Web_App::NONCE_ACTION' ) ) {
        $nonce = isset( $_POST['nonce'] ) ? (string) wp_unslash( $_POST['nonce'] ) : '';
        return (bool) wp_verify_nonce( $nonce, KP_Owner_Web_App::NONCE_ACTION );
    }
    return true;
}

function kp_history_ext_augment_latest() {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    $items = get_option( 'kp_owner_history_v1', array() );
    if ( ! is_array( $items ) || ! $items ) { return; }
    $index = count( $items ) - 1;
    if ( ! isset( $items[ $index ]['state'] ) || ! is_array( $items[ $index ]['state'] ) ) { return; }

    $group = isset( $_POST['kp_history_group'] ) ? substr( sanitize_key( wp_unslash( (string) $_POST['kp_history_group'] ) ), 0, 80 ) : '';
    if ( $group && ! empty( $items[ $index ]['group'] ) && ! hash_equals( (string) $items[ $index ]['group'], $group ) ) { return; }

    $state =& $items[ $index ]['state'];
    if ( ! isset( $state['extra_options'] ) ) { $state['extra_options'] = kp_history_ext_capture_options(); }
    if ( ! isset( $state['entities'] ) || ! is_array( $state['entities'] ) ) { $state['entities'] = array(); }

    $id = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;
    if ( $id ) {
        $already = false;
        if ( isset( $state['entity']['id'] ) && $id === absint( $state['entity']['id'] ) ) { $already = true; }
        foreach ( $state['entities'] as $existing ) {
            if ( is_array( $existing ) && $id === absint( $existing['id'] ?? 0 ) ) { $already = true; break; }
        }
        if ( ! $already ) {
            $entity = kp_history_ext_capture_entity( $id );
            if ( $entity ) { $state['entities'][] = $entity; }
        }
    }
    $items[ $index ]['checksum'] = hash( 'sha256', wp_json_encode( $state ) );
    update_option( 'kp_owner_history_v1', $items, false );
}

add_action( 'plugins_loaded', static function () {
    $actions = array(
        'kp_owner_design_save','kp_owner_sizes_save','kp_owner_menu_x_save','kp_owner_nav_save',
        'kp_fe_v2_save','kp_touch_free_layout_save','kp_touch_gesture_save','kp_image_position_save',
        'kp_canva_image_save','kp_fe_v2_record_save','kp_frontend_card_image_save','kp_frontend_card_button_save',
        'kp_ai_draft_save',
    );
    foreach ( $actions as $action ) {
        add_action( 'wp_ajax_' . $action, 'kp_history_ext_augment_latest', 2 );
    }

    add_action( 'wp_ajax_kp_owner_history_undo', static function () {
        if ( ! kp_history_ext_request_allowed() ) { return; }
        $items = get_option( 'kp_owner_history_v1', array() );
        if ( is_array( $items ) && $items ) {
            $item = end( $items );
            kp_history_ext_restore_state( is_array( $item ) ? ( $item['state'] ?? array() ) : array() );
        }
    }, 5 );

    add_action( 'wp_ajax_kp_owner_history_restore', static function () {
        if ( ! kp_history_ext_request_allowed() ) { return; }
        $id = isset( $_POST['version_id'] ) ? sanitize_text_field( wp_unslash( $_POST['version_id'] ) ) : '';
        foreach ( (array) get_option( 'kp_owner_history_v1', array() ) as $item ) {
            if ( is_array( $item ) && isset( $item['id'] ) && hash_equals( (string) $item['id'], $id ) ) {
                kp_history_ext_restore_state( $item['state'] ?? array() );
                break;
            }
        }
    }, 5 );
} );
