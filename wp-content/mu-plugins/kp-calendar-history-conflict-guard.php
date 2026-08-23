<?php
/**
 * Conflict guard for reversible calendar actions.
 *
 * An older Undo/Redo step must never overwrite a calendar state that has been
 * changed meanwhile (for example in a second tab). The actual restore handler
 * runs only when the current WordPress state still matches the side of the
 * history entry we are leaving.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class KP_Calendar_History_Conflict_Guard {
    const META = 'kp_calendar_undo_redo_v1';

    public static function init() {
        add_action( 'wp_ajax_kp_calendar_history_undo', array( __CLASS__, 'guard_undo' ), 0 );
        add_action( 'wp_ajax_kp_calendar_history_redo', array( __CLASS__, 'guard_redo' ), 0 );
    }

    private static function authorize() {
        if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) {
            wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 );
        }
        check_ajax_referer( 'kp_owner_web_app', 'nonce' );
    }

    private static function option_snapshot( $key ) {
        $sentinel = '__kp_calendar_history_missing__';
        $value = get_option( $key, $sentinel );
        return array(
            'exists' => $sentinel !== $value,
            'value'  => $sentinel !== $value ? $value : null,
        );
    }

    private static function feed_option_key() {
        return class_exists( 'KP_Google_Calendar_Import' ) ? KP_Google_Calendar_Import::FEED_OPTION : 'kp_auftritte_ical_readonly_url';
    }

    private static function kp_meta_snapshot( $post_id ) {
        $all = get_post_meta( $post_id );
        $out = array();
        foreach ( $all as $key => $values ) {
            if ( 0 !== strpos( (string) $key, '_kp_' ) ) { continue; }
            $out[ $key ] = is_array( $values ) ? array_values( $values ) : array( $values );
        }
        return $out;
    }

    private static function post_snapshot( $post_id ) {
        $post_id = absint( $post_id );
        $post = get_post( $post_id );
        if ( ! $post || 'kp_termin' !== $post->post_type ) { return null; }
        return array(
            'id'           => $post_id,
            'post_title'   => (string) $post->post_title,
            'post_status'  => (string) $post->post_status,
            'post_content' => (string) $post->post_content,
            'post_excerpt' => (string) $post->post_excerpt,
            'post_name'    => (string) $post->post_name,
            'meta'         => self::kp_meta_snapshot( $post_id ),
        );
    }

    private static function google_ids() {
        $ids = get_posts( array(
            'post_type'      => 'kp_termin',
            'post_status'    => array( 'publish', 'draft', 'pending', 'private', 'future', 'trash' ),
            'posts_per_page' => -1,
            'fields'         => 'ids',
            'meta_query'     => array( array( 'key' => '_kp_google_occurrence_key', 'compare' => 'EXISTS' ) ),
            'orderby'        => 'ID',
            'order'          => 'ASC',
        ) );
        return array_values( array_map( 'absint', is_array( $ids ) ? $ids : array() ) );
    }

    private static function sync_snapshot() {
        $posts = array();
        foreach ( self::google_ids() as $id ) {
            $post = self::post_snapshot( $id );
            if ( $post ) { $posts[ (string) $id ] = $post; }
        }
        return array(
            'posts'     => $posts,
            'last_sync' => self::option_snapshot( 'kp_auftritte_last_sync' ),
        );
    }

    private static function current_for( $entry, $expected ) {
        $action = isset( $entry['action'] ) ? (string) $entry['action'] : '';
        if ( 'kp_calendar_owner_save_feed' === $action ) {
            return array( 'kind' => 'feed', 'feed' => self::option_snapshot( self::feed_option_key() ) );
        }
        if ( 'kp_calendar_owner_sync' === $action ) {
            return array( 'kind' => 'sync', 'sync' => self::sync_snapshot() );
        }
        if ( in_array( $action, array( 'kp_calendar_owner_update_draft', 'kp_calendar_owner_publish' ), true ) ) {
            $post_id = absint( $expected['post']['id'] ?? 0 );
            $post = self::post_snapshot( $post_id );
            return $post ? array( 'kind' => 'post', 'post' => $post ) : null;
        }
        return null;
    }

    private static function is_list_array( $array ) {
        if ( ! is_array( $array ) ) { return false; }
        $index = 0;
        foreach ( array_keys( $array ) as $key ) {
            if ( $key !== $index ) { return false; }
            ++$index;
        }
        return true;
    }

    private static function normalize( $value ) {
        if ( ! is_array( $value ) ) { return $value; }
        if ( self::is_list_array( $value ) ) {
            return array_map( array( __CLASS__, 'normalize' ), $value );
        }
        ksort( $value, SORT_STRING );
        foreach ( $value as $key => $item ) { $value[ $key ] = self::normalize( $item ); }
        return $value;
    }

    private static function same( $left, $right ) {
        return wp_json_encode( self::normalize( $left ) ) === wp_json_encode( self::normalize( $right ) );
    }

    private static function find_entry( $id ) {
        $items = get_user_meta( get_current_user_id(), self::META, true );
        if ( ! is_array( $items ) ) { return null; }
        foreach ( array_reverse( $items ) as $item ) {
            if ( is_array( $item ) && isset( $item['id'] ) && hash_equals( (string) $item['id'], (string) $id ) ) { return $item; }
        }
        return null;
    }

    private static function guard( $undo ) {
        self::authorize();
        $id = isset( $_POST['action_id'] ) ? sanitize_text_field( wp_unslash( $_POST['action_id'] ) ) : '';
        $entry = self::find_entry( $id );
        if ( ! $entry ) { return; } // Let the canonical handler return its normal 404.

        $expected_state = $undo ? 'active' : 'undone';
        if ( $expected_state !== ( $entry['state'] ?? '' ) ) { return; } // Canonical handler owns state errors.
        $expected = $undo ? ( $entry['after'] ?? null ) : ( $entry['before'] ?? null );
        if ( ! is_array( $expected ) ) { return; }
        $current = self::current_for( $entry, $expected );
        if ( null === $current || ! self::same( $current, $expected ) ) {
            wp_send_json_error( array(
                'message' => 'Rückgängig wurde gestoppt: Der Kalenderstand wurde inzwischen an anderer Stelle geändert. Neuere Änderungen bleiben unangetastet.',
            ), 409 );
        }
    }

    public static function guard_undo() { self::guard( true ); }
    public static function guard_redo() { self::guard( false ); }
}

KP_Calendar_History_Conflict_Guard::init();
