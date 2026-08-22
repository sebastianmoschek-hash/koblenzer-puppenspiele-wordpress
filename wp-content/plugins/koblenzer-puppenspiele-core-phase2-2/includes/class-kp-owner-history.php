<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Short-term owner version history for visual/content maintenance.
 *
 * Stores compact snapshots for 48 hours. Unified owner saves carry an explicit
 * transaction id so every orange Save tap is exactly one undo step, independent
 * of request timing. Legacy/specialist saves retain the short burst fallback.
 */
final class KP_Owner_History {
    const OPTION = 'kp_owner_history_v1';
    const RETENTION = 172800; // 48 hours.
    const MAX_ITEMS = 80;
    const BURST_SECONDS = 3;

    private static $checkpointed = false;

    public static function init() {
        $labels = array(
            'kp_owner_design_save'          => 'Design geändert',
            'kp_owner_sizes_save'           => 'Anzeigegrößen geändert',
            'kp_owner_menu_x_save'          => 'Menüposition geändert',
            'kp_owner_nav_save'             => 'Navigation geändert',
            'kp_fe_v2_save'                 => 'Seite geändert',
            'kp_touch_free_layout_save'     => 'Position / Größe geändert',
            'kp_touch_gesture_save'         => 'Position / Größe geändert',
            'kp_image_position_save'        => 'Bildposition geändert',
            'kp_fe_v2_record_save'          => 'Inhalt geändert',
            'kp_frontend_card_image_save'   => 'Bild geändert',
            'kp_frontend_card_button_save'  => 'Button geändert',
        );
        foreach ( $labels as $action => $label ) {
            add_action( 'wp_ajax_' . $action, static function () use ( $label ) {
                self::checkpoint( $label );
            }, 1 );
        }

        add_action( 'wp_ajax_kp_owner_history_list', array( __CLASS__, 'ajax_list' ) );
        add_action( 'wp_ajax_kp_owner_history_undo', array( __CLASS__, 'ajax_undo' ) );
        add_action( 'wp_ajax_kp_owner_history_restore', array( __CLASS__, 'ajax_restore' ) );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function option_names() {
        return array(
            'kp_website_studio',
            'kp_responsive_sizes',
            'kp_owner_navigation_v1',
            'kp_frontend_editor_global_v1',
            'kp_frontend_editor_pages_v1',
            'kp_touch_free_layout_global_v1',
            'kp_touch_free_layout_pages_v1',
            'kp_touch_gestures_global_v1',
            'kp_touch_gestures_pages_v1',
            'kp_image_position_global_v1',
            'kp_image_position_pages_v1',
        );
    }

    private static function prune( $items ) {
        if ( ! is_array( $items ) ) { return array(); }
        $cutoff = time() - self::RETENTION;
        $items = array_values( array_filter( $items, static function ( $item ) use ( $cutoff ) {
            return is_array( $item ) && isset( $item['ts'] ) && (int) $item['ts'] >= $cutoff;
        } ) );
        if ( count( $items ) > self::MAX_ITEMS ) {
            $items = array_slice( $items, -self::MAX_ITEMS );
        }
        return $items;
    }

    private static function items() {
        return self::prune( get_option( self::OPTION, array() ) );
    }

    private static function target_entity() {
        $id = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;
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
            'id'           => (int) $id,
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

    private static function state() {
        $options = array();
        foreach ( self::option_names() as $name ) {
            $exists = false;
            $value = get_option( $name, '__kp_missing__' );
            if ( '__kp_missing__' !== $value ) { $exists = true; }
            $options[ $name ] = array( 'exists' => $exists, 'value' => $exists ? $value : null );
        }
        return array(
            'options' => $options,
            'entity'  => self::target_entity(),
        );
    }

    private static function checksum( $state ) {
        return hash( 'sha256', wp_json_encode( $state ) );
    }

    private static function request_group() {
        if ( ! isset( $_POST['kp_history_group'] ) ) { return ''; }
        $group = sanitize_key( wp_unslash( (string) $_POST['kp_history_group'] ) );
        return substr( $group, 0, 80 );
    }

    public static function checkpoint( $label = 'Website geändert', $force = false ) {
        if ( self::$checkpointed || ! self::can_edit() ) { return ''; }
        self::$checkpointed = true;
        $items = self::items();
        $now = time();
        $group = self::request_group();

        if ( ! $force && $items ) {
            $last = end( $items );
            // Explicit unified-save transaction: only requests from the exact
            // same orange Save tap may share one checkpoint.
            if ( $group && is_array( $last ) && ! empty( $last['group'] )
                && hash_equals( (string) $last['group'], $group ) ) {
                return isset( $last['id'] ) ? (string) $last['id'] : '';
            }
            // Legacy/specialist fallback when no transaction id is available.
            if ( ! $group && is_array( $last ) && isset( $last['ts'], $last['user'] )
                && (int) $last['user'] === get_current_user_id()
                && $now - (int) $last['ts'] <= self::BURST_SECONDS ) {
                return isset( $last['id'] ) ? (string) $last['id'] : '';
            }
        }

        $state = self::state();
        $last = $items ? end( $items ) : null;
        $checksum = self::checksum( $state );
        // For explicit transactions do not deduplicate against a previous save:
        // a new orange Save tap must remain an independent undo step.
        if ( ! $group && is_array( $last ) && isset( $last['checksum'] ) && hash_equals( (string) $last['checksum'], $checksum ) ) {
            return isset( $last['id'] ) ? (string) $last['id'] : '';
        }

        $id = gmdate( 'YmdHis', $now ) . '-' . wp_generate_password( 8, false, false );
        $items[] = array(
            'id'       => $id,
            'ts'       => $now,
            'label'    => sanitize_text_field( (string) $label ),
            'user'     => get_current_user_id(),
            'group'    => $group,
            'checksum' => $checksum,
            'state'    => $state,
        );
        $items = self::prune( $items );
        update_option( self::OPTION, $items, false );
        return $id;
    }

    private static function restore_entity( $entity ) {
        if ( ! is_array( $entity ) || empty( $entity['id'] ) ) { return true; }
        $id = absint( $entity['id'] );
        if ( ! $id || ! current_user_can( 'edit_post', $id ) || ! get_post( $id ) ) { return false; }
        $updated = wp_update_post( array(
            'ID'           => $id,
            'post_status'  => sanitize_key( isset( $entity['post_status'] ) ? $entity['post_status'] : 'publish' ),
            'post_title'   => isset( $entity['post_title'] ) ? (string) $entity['post_title'] : '',
            'post_name'    => isset( $entity['post_name'] ) ? sanitize_title( $entity['post_name'] ) : '',
            'post_excerpt' => isset( $entity['post_excerpt'] ) ? (string) $entity['post_excerpt'] : '',
            'post_content' => isset( $entity['post_content'] ) ? (string) $entity['post_content'] : '',
            'menu_order'   => isset( $entity['menu_order'] ) ? (int) $entity['menu_order'] : 0,
        ), true );
        if ( is_wp_error( $updated ) ) { return false; }

        $current_meta = get_post_meta( $id );
        foreach ( $current_meta as $key => $values ) {
            if ( '_thumbnail_id' === $key || 0 === strpos( $key, '_kp_' ) ) { delete_post_meta( $id, $key ); }
        }
        if ( ! empty( $entity['meta'] ) && is_array( $entity['meta'] ) ) {
            foreach ( $entity['meta'] as $key => $values ) {
                if ( '_thumbnail_id' !== $key && 0 !== strpos( $key, '_kp_' ) ) { continue; }
                foreach ( (array) $values as $value ) { add_post_meta( $id, $key, maybe_unserialize( $value ) ); }
            }
        }
        if ( ! empty( $entity['terms'] ) && is_array( $entity['terms'] ) ) {
            foreach ( $entity['terms'] as $taxonomy => $ids ) {
                if ( taxonomy_exists( $taxonomy ) ) { wp_set_object_terms( $id, array_map( 'intval', (array) $ids ), $taxonomy, false ); }
            }
        }
        return true;
    }

    private static function restore_state( $state ) {
        if ( ! is_array( $state ) || empty( $state['options'] ) || ! is_array( $state['options'] ) ) { return false; }
        foreach ( self::option_names() as $name ) {
            if ( ! array_key_exists( $name, $state['options'] ) ) { continue; }
            $entry = $state['options'][ $name ];
            if ( ! is_array( $entry ) || empty( $entry['exists'] ) ) { delete_option( $name ); }
            else { update_option( $name, $entry['value'], false ); }
        }
        if ( isset( $state['entity'] ) && ! self::restore_entity( $state['entity'] ) ) { return false; }
        if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
        return true;
    }

    private static function public_items( $items ) {
        $out = array();
        foreach ( array_reverse( self::prune( $items ) ) as $index => $item ) {
            $out[] = array(
                'id'    => (string) $item['id'],
                'ts'    => (int) $item['ts'],
                'label' => (string) $item['label'],
                'undo'  => $index < 10,
            );
        }
        return $out;
    }

    private static function authorize() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( KP_Owner_Web_App::NONCE_ACTION, 'nonce' );
    }

    public static function ajax_list() {
        self::authorize();
        $items = self::items();
        update_option( self::OPTION, $items, false );
        wp_send_json_success( array(
            'items' => self::public_items( $items ),
            'retention_hours' => 48,
            'undo_steps' => min( 10, count( $items ) ),
        ) );
    }

    public static function ajax_undo() {
        self::authorize();
        $items = self::items();
        if ( ! $items ) { wp_send_json_error( array( 'message' => 'Keine gespeicherte Änderung zum Rückgängigmachen vorhanden.' ), 404 ); }
        $item = array_pop( $items );
        if ( ! self::restore_state( isset( $item['state'] ) ? $item['state'] : array() ) ) {
            wp_send_json_error( array( 'message' => 'Der vorherige Stand konnte nicht vollständig wiederhergestellt werden.' ), 500 );
        }
        update_option( self::OPTION, self::prune( $items ), false );
        wp_send_json_success( array(
            'message' => 'Letzte Speicherung rückgängig ✓',
            'restored' => array( 'id' => $item['id'], 'ts' => $item['ts'], 'label' => $item['label'] ),
            'remaining_undo_steps' => min( 10, count( $items ) ),
        ) );
    }

    public static function ajax_restore() {
        self::authorize();
        $id = isset( $_POST['version_id'] ) ? sanitize_text_field( wp_unslash( $_POST['version_id'] ) ) : '';
        $items = self::items();
        $target = null;
        foreach ( $items as $item ) {
            if ( isset( $item['id'] ) && hash_equals( (string) $item['id'], $id ) ) { $target = $item; break; }
        }
        if ( ! $target ) { wp_send_json_error( array( 'message' => 'Diese Version ist nicht mehr verfügbar.' ), 404 ); }

        self::$checkpointed = false;
        self::checkpoint( 'Vor Versions-Wiederherstellung', true );
        if ( ! self::restore_state( isset( $target['state'] ) ? $target['state'] : array() ) ) {
            wp_send_json_error( array( 'message' => 'Die gewählte Version konnte nicht vollständig wiederhergestellt werden.' ), 500 );
        }
        wp_send_json_success( array(
            'message' => 'Version wiederhergestellt ✓',
            'restored' => array( 'id' => $target['id'], 'ts' => $target['ts'], 'label' => $target['label'] ),
        ) );
    }
}
