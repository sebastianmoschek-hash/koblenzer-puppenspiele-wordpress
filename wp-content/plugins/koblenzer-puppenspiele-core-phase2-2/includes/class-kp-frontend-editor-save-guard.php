<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Reliable persistence layer for the direct front-end editor.
 *
 * The editor saves through admin-ajax.php, therefore page-specific data must use
 * the explicit page identity sent by the browser instead of the AJAX request URL.
 * A success response is only returned after the written options are read back and
 * verified. This prevents a green "saved" state when data was stored elsewhere.
 */
final class KP_Frontend_Editor_Save_Guard {
    public static function init() {
        remove_action( 'wp_ajax_kp_frontend_editor_save', array( 'KP_Frontend_Editor', 'ajax_save' ) );
        add_action( 'wp_ajax_kp_frontend_editor_save', array( __CLASS__, 'ajax_save' ) );
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
}
