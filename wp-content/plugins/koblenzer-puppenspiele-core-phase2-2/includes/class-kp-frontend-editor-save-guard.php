<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Reliable persistence layer for the direct front-end editor.
 *
 * The editor saves through admin-ajax.php, therefore page-specific data must use
 * the explicit page identity sent by the browser instead of the AJAX request URL.
 * Success is returned only after WordPress reads the written data back and the
 * persisted values match what was requested.
 */
final class KP_Frontend_Editor_Save_Guard {
    public static function init() {
        remove_action( 'wp_ajax_kp_frontend_editor_save', array( 'KP_Frontend_Editor', 'ajax_save' ) );
        add_action( 'wp_ajax_kp_frontend_editor_save', array( __CLASS__, 'ajax_save' ) );

        remove_action( 'wp_ajax_kp_frontend_editor_record_save', array( 'KP_Frontend_Editor', 'ajax_record_save' ) );
        add_action( 'wp_ajax_kp_frontend_editor_record_save', array( __CLASS__, 'ajax_record_save' ) );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function sanitize_content( $content ) {
        if ( ! is_array( $content ) ) { return array(); }
        $type = isset( $content['type'] ) ? sanitize_key( $content['type'] ) : '';
        if ( 'html' === $type ) {
            return array( 'type' => 'html', 'value' => isset( $content['value'] ) ? wp_kses_post( $content['value'] ) : '' );
        }
        if ( 'link' === $type ) {
            return array(
                'type'  => 'link',
                'label' => isset( $content['label'] ) ? sanitize_text_field( $content['label'] ) : '',
                'href'  => isset( $content['href'] ) ? esc_url_raw( $content['href'] ) : '',
            );
        }
        if ( 'image' === $type ) {
            return array(
                'type'          => 'image',
                'src'           => isset( $content['src'] ) ? esc_url_raw( $content['src'] ) : '',
                'alt'           => isset( $content['alt'] ) ? sanitize_text_field( $content['alt'] ) : '',
                'attachment_id' => isset( $content['attachment_id'] ) ? absint( $content['attachment_id'] ) : 0,
            );
        }
        return array();
    }

    private static function sanitize_style( $style ) {
        if ( ! is_array( $style ) ) { return array(); }
        $out = array();
        if ( isset( $style['font_px'] ) ) { $out['font_px'] = max( 8, min( 120, (float) $style['font_px'] ) ); }
        if ( isset( $style['padding_y'] ) ) { $out['padding_y'] = max( 0, min( 180, (float) $style['padding_y'] ) ); }
        if ( isset( $style['width_pct'] ) ) { $out['width_pct'] = max( 30, min( 100, (int) $style['width_pct'] ) ); }
        if ( ! empty( $style['color'] ) && sanitize_hex_color( $style['color'] ) ) { $out['color'] = sanitize_hex_color( $style['color'] ); }
        if ( ! empty( $style['background'] ) && sanitize_hex_color( $style['background'] ) ) { $out['background'] = sanitize_hex_color( $style['background'] ); }
        if ( isset( $style['radius'] ) ) { $out['radius'] = max( 0, min( 80, (int) $style['radius'] ) ); }
        if ( ! empty( $style['align'] ) && in_array( $style['align'], array( 'left', 'center', 'right' ), true ) ) { $out['align'] = $style['align']; }
        $out['hidden'] = ! empty( $style['hidden'] ) ? 1 : 0;
        return $out;
    }

    private static function sanitize_scope_data( $data ) {
        $out = array( 'blocks' => array(), 'dom' => array(), 'order' => array() );
        if ( ! is_array( $data ) ) { return $out; }

        foreach ( array( 'blocks', 'dom' ) as $collection ) {
            if ( empty( $data[ $collection ] ) || ! is_array( $data[ $collection ] ) ) { continue; }
            foreach ( array_slice( $data[ $collection ], 0, 250, true ) as $key => $item ) {
                $key = preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) $key ) );
                if ( ! $key || ! is_array( $item ) ) { continue; }
                $clean = array();
                if ( isset( $item['content'] ) ) { $clean['content'] = self::sanitize_content( $item['content'] ); }
                if ( ! empty( $item['styles'] ) && is_array( $item['styles'] ) ) {
                    foreach ( array( 'mobile', 'tablet', 'laptop', 'desktop' ) as $device ) {
                        if ( isset( $item['styles'][ $device ] ) ) { $clean['styles'][ $device ] = self::sanitize_style( $item['styles'][ $device ] ); }
                    }
                }
                if ( $clean ) { $out[ $collection ][ $key ] = $clean; }
            }
        }

        if ( ! empty( $data['order'] ) && is_array( $data['order'] ) ) {
            foreach ( array_slice( $data['order'], 0, 60 ) as $key ) {
                $key = preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) $key ) );
                if ( $key ) { $out['order'][] = $key; }
            }
        }
        return $out;
    }

    private static function requested_page_key() {
        $page_key = isset( $_POST['page_key'] ) ? sanitize_text_field( wp_unslash( $_POST['page_key'] ) ) : '';

        if ( preg_match( '/^post-(\d+)$/', $page_key, $match ) ) {
            $post_id = absint( $match[1] );
            if ( $post_id && current_user_can( 'edit_post', $post_id ) ) { return 'post-' . $post_id; }
            return '';
        }

        $page_path = isset( $_POST['page_path'] ) ? wp_unslash( $_POST['page_path'] ) : '';
        $page_path = is_string( $page_path ) ? (string) wp_parse_url( $page_path, PHP_URL_PATH ) : '';
        if ( ! $page_path ) { return ''; }
        if ( '/' !== $page_path[0] ) { $page_path = '/' . $page_path; }
        $expected = 'path-' . substr( hash( 'sha256', $page_path ), 0, 16 );
        return hash_equals( $expected, $page_key ) ? $expected : '';
    }

    public static function ajax_save() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( KP_Frontend_Editor::NONCE_ACTION, 'nonce' );

        $page_key = self::requested_page_key();
        if ( ! $page_key ) {
            wp_send_json_error( array( 'message' => 'Die bearbeitete Seite konnte nicht sicher erkannt werden. Bitte Seite neu laden und erneut speichern.' ), 400 );
        }

        $raw = isset( $_POST['payload'] ) ? wp_unslash( $_POST['payload'] ) : '';
        $payload = json_decode( $raw, true );
        if ( ! is_array( $payload ) ) { wp_send_json_error( array( 'message' => 'Ungültige Speicherdaten.' ), 400 ); }

        $global = self::sanitize_scope_data( isset( $payload['global'] ) ? $payload['global'] : array() );
        $page   = self::sanitize_scope_data( isset( $payload['page'] ) ? $payload['page'] : array() );

        update_option( KP_Frontend_Editor::GLOBAL_OPTION, $global, false );
        $all = get_option( KP_Frontend_Editor::PAGES_OPTION, array() );
        if ( ! is_array( $all ) ) { $all = array(); }
        $all[ $page_key ] = $page;
        if ( count( $all ) > 120 ) { $all = array_slice( $all, -120, null, true ); }
        update_option( KP_Frontend_Editor::PAGES_OPTION, $all, false );

        // Read back from WordPress. A green check is only allowed after this passes.
        $stored_global = get_option( KP_Frontend_Editor::GLOBAL_OPTION, array() );
        $stored_pages  = get_option( KP_Frontend_Editor::PAGES_OPTION, array() );
        $stored_page   = is_array( $stored_pages ) && isset( $stored_pages[ $page_key ] ) ? $stored_pages[ $page_key ] : null;

        if ( $stored_global !== $global || $stored_page !== $page ) {
            wp_send_json_error( array( 'message' => 'WordPress konnte die Änderung nicht dauerhaft bestätigen. Bitte erneut versuchen.' ), 500 );
        }

        wp_send_json_success( array(
            'message'  => 'Dauerhaft gespeichert.',
            'page_key' => $page_key,
            'verified' => true,
            'checksum' => hash( 'sha256', wp_json_encode( array( $global, $page ) ) ),
        ) );
    }

    private static function update_meta_value( $id, $meta, $value ) {
        if ( '' === $value ) { delete_post_meta( $id, $meta ); }
        else { update_post_meta( $id, $meta, $value ); }
    }

    private static function verify_meta_values( $id, $expected ) {
        foreach ( $expected as $meta => $value ) {
            if ( (string) get_post_meta( $id, $meta, true ) !== (string) $value ) { return false; }
        }
        return true;
    }

    public static function ajax_record_save() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( KP_Frontend_Editor::NONCE_ACTION, 'nonce' );

        $type = isset( $_POST['type'] ) ? sanitize_key( wp_unslash( $_POST['type'] ) ) : '';
        $id   = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;
        $raw  = isset( $_POST['fields'] ) ? wp_unslash( $_POST['fields'] ) : '';
        $f    = json_decode( $raw, true );
        if ( ! $id || ! is_array( $f ) || ! current_user_can( 'edit_post', $id ) ) {
            wp_send_json_error( array( 'message' => 'Speichern nicht erlaubt.' ), 403 );
        }

        if ( 'termin' === $type && 'kp_termin' === get_post_type( $id ) ) {
            $title = isset( $f['title'] ) ? sanitize_text_field( $f['title'] ) : (string) get_post_field( 'post_title', $id, 'raw' );
            $updated = wp_update_post( array( 'ID' => $id, 'post_title' => $title ), true );
            if ( is_wp_error( $updated ) ) { wp_send_json_error( array( 'message' => $updated->get_error_message() ), 500 ); }

            $status = isset( $f['status'] ) ? sanitize_key( $f['status'] ) : 'standard';
            $allowed_statuses = array( 'standard', 'free', 'planned', 'box_office', 'sold_out', 'closed', 'cancelled' );
            if ( ! in_array( $status, $allowed_statuses, true ) ) { $status = 'standard'; }

            $expected = array(
                '_kp_date'     => isset( $f['date'] ) ? sanitize_text_field( $f['date'] ) : '',
                '_kp_time'     => isset( $f['time'] ) ? sanitize_text_field( $f['time'] ) : '',
                '_kp_end_time' => isset( $f['end_time'] ) ? sanitize_text_field( $f['end_time'] ) : '',
                '_kp_city'     => isset( $f['city'] ) ? sanitize_text_field( $f['city'] ) : '',
                '_kp_venue'    => isset( $f['venue'] ) ? sanitize_text_field( $f['venue'] ) : '',
                '_kp_address'  => isset( $f['address'] ) ? sanitize_text_field( $f['address'] ) : '',
                '_kp_status'   => $status,
                '_kp_note'     => isset( $f['note'] ) ? sanitize_textarea_field( $f['note'] ) : '',
                '_kp_ticket_url' => isset( $f['ticket_url'] ) ? esc_url_raw( $f['ticket_url'] ) : '',
                '_kp_info_url'   => isset( $f['info_url'] ) ? esc_url_raw( $f['info_url'] ) : '',
            );
            foreach ( $expected as $meta => $value ) { self::update_meta_value( $id, $meta, $value ); }

            $rep_id = isset( $f['repertoire_id'] ) ? absint( $f['repertoire_id'] ) : 0;
            if ( $rep_id && 'kp_repertoire' !== get_post_type( $rep_id ) ) { $rep_id = 0; }
            self::update_meta_value( $id, '_kp_repertoire_id', $rep_id ? (string) $rep_id : '' );
            $expected['_kp_repertoire_id'] = $rep_id ? (string) $rep_id : '';

            if ( $expected['_kp_date'] ) {
                $sort = $expected['_kp_date'] . ' ' . ( $expected['_kp_time'] ?: '23:59' );
                update_post_meta( $id, '_kp_sort', $sort );
                $expected['_kp_sort'] = $sort;
            } else {
                delete_post_meta( $id, '_kp_sort' );
                $expected['_kp_sort'] = '';
            }

            if ( (string) get_post_field( 'post_title', $id, 'raw' ) !== $title || ! self::verify_meta_values( $id, $expected ) ) {
                wp_send_json_error( array( 'message' => 'Der Termin wurde nicht vollständig gespeichert. Bitte erneut versuchen.' ), 500 );
            }

            wp_send_json_success( array( 'message' => 'Termin dauerhaft gespeichert.', 'verified' => true, 'id' => $id ) );
        }

        if ( 'repertoire' === $type && 'kp_repertoire' === get_post_type( $id ) ) {
            $update = array( 'ID' => $id );
            $expected_title = (string) get_post_field( 'post_title', $id, 'raw' );
            $expected_excerpt = (string) get_post_field( 'post_excerpt', $id, 'raw' );
            $expected_content = null;

            if ( isset( $f['title'] ) ) {
                $expected_title = sanitize_text_field( $f['title'] );
                $update['post_title'] = $expected_title;
            }
            if ( isset( $f['excerpt'] ) ) {
                $expected_excerpt = sanitize_textarea_field( $f['excerpt'] );
                $update['post_excerpt'] = $expected_excerpt;
            }
            if ( isset( $f['description'] ) && empty( $f['complex'] ) ) {
                $description = sanitize_textarea_field( $f['description'] );
                $expected_content = '<p>' . esc_html( $description ) . '</p>';
                $update['post_content'] = $expected_content;
            }

            $updated = wp_update_post( $update, true );
            if ( is_wp_error( $updated ) ) { wp_send_json_error( array( 'message' => $updated->get_error_message() ), 500 ); }

            $expected = array(
                '_kp_rep_age'        => isset( $f['age'] ) ? sanitize_text_field( $f['age'] ) : '',
                '_kp_rep_duration'   => isset( $f['duration'] ) ? sanitize_text_field( $f['duration'] ) : '',
                '_kp_rep_players'    => isset( $f['players'] ) ? sanitize_text_field( $f['players'] ) : '',
                '_kp_rep_play_style' => isset( $f['play_style'] ) ? sanitize_text_field( $f['play_style'] ) : '',
                '_kp_rep_technical'  => isset( $f['technical'] ) ? sanitize_textarea_field( $f['technical'] ) : '',
                '_kp_rep_rights'     => isset( $f['rights'] ) ? sanitize_text_field( $f['rights'] ) : '',
                '_kp_rep_premiere'   => isset( $f['premiere'] ) ? sanitize_text_field( $f['premiere'] ) : '',
                '_kp_rep_bookable'   => ! empty( $f['bookable'] ) ? '1' : '0',
            );
            foreach ( $expected as $meta => $value ) { self::update_meta_value( $id, $meta, $value ); }

            $verify_thumb = false;
            $expected_thumb = get_post_thumbnail_id( $id );
            if ( array_key_exists( 'thumbnail_id', $f ) ) {
                $verify_thumb = true;
                $thumb = absint( $f['thumbnail_id'] );
                if ( $thumb && wp_attachment_is_image( $thumb ) ) {
                    set_post_thumbnail( $id, $thumb );
                    $expected_thumb = $thumb;
                } elseif ( ! $thumb ) {
                    delete_post_thumbnail( $id );
                    $expected_thumb = 0;
                }
            }

            $record_ok = (string) get_post_field( 'post_title', $id, 'raw' ) === $expected_title
                && (string) get_post_field( 'post_excerpt', $id, 'raw' ) === $expected_excerpt
                && self::verify_meta_values( $id, $expected );
            if ( null !== $expected_content ) {
                $record_ok = $record_ok && (string) get_post_field( 'post_content', $id, 'raw' ) === $expected_content;
            }
            if ( $verify_thumb ) {
                $record_ok = $record_ok && (int) get_post_thumbnail_id( $id ) === (int) $expected_thumb;
            }

            if ( ! $record_ok ) {
                wp_send_json_error( array( 'message' => 'Das Stück wurde nicht vollständig gespeichert. Bitte erneut versuchen.' ), 500 );
            }

            wp_send_json_success( array( 'message' => 'Stück dauerhaft gespeichert.', 'verified' => true, 'id' => $id ) );
        }

        wp_send_json_error( array( 'message' => 'Datensatz konnte nicht gespeichert werden.' ), 400 );
    }
}
