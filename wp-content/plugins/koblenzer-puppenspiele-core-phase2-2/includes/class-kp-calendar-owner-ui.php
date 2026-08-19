<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Owner-facing Google calendar controls for the read-only "Auftritte" importer. */
final class KP_Calendar_Owner_UI {
    const NONCE_ACTION = 'kp_owner_web_app';

    public static function init() {
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 130 );
        add_action( 'wp_ajax_kp_calendar_owner_state', array( __CLASS__, 'ajax_state' ) );
        add_action( 'wp_ajax_kp_calendar_owner_save_feed', array( __CLASS__, 'ajax_save_feed' ) );
        add_action( 'wp_ajax_kp_calendar_owner_sync', array( __CLASS__, 'ajax_sync' ) );
        add_action( 'wp_ajax_kp_calendar_owner_update_draft', array( __CLASS__, 'ajax_update_draft' ) );
        add_action( 'wp_ajax_kp_calendar_owner_publish', array( __CLASS__, 'ajax_publish' ) );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function guard() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
    }

    public static function enqueue() {
        if ( is_admin() || ! self::can_edit() ) { return; }
        wp_enqueue_style( 'kp-calendar-owner-ui', KP_CORE_URL . 'assets/calendar-owner-ui.css', array( 'kp-owner-web-app' ), KP_CORE_VERSION );
        wp_enqueue_script( 'kp-calendar-owner-ui', KP_CORE_URL . 'assets/calendar-owner-ui.js', array( 'kp-owner-web-app' ), KP_CORE_VERSION, true );
    }

    private static function feed_url() {
        if ( defined( 'KP_AUFTRITTE_ICAL_READONLY_URL' ) && KP_AUFTRITTE_ICAL_READONLY_URL ) {
            return esc_url_raw( KP_AUFTRITTE_ICAL_READONLY_URL );
        }
        return esc_url_raw( (string) get_option( KP_Google_Calendar_Import::FEED_OPTION, '' ) );
    }

    private static function draft_rows() {
        $ids = get_posts( array(
            'post_type'      => 'kp_termin',
            'post_status'    => 'draft',
            'posts_per_page' => 100,
            'fields'         => 'ids',
            'meta_query'     => array( array( 'key' => '_kp_google_occurrence_key', 'compare' => 'EXISTS' ) ),
            'meta_key'       => '_kp_sort',
            'orderby'        => 'meta_value',
            'order'          => 'ASC',
        ) );
        $rows = array();
        foreach ( $ids as $id ) {
            $rows[] = array(
                'id'         => (int) $id,
                'title'      => get_the_title( $id ),
                'date'       => (string) get_post_meta( $id, '_kp_date', true ),
                'time'       => (string) get_post_meta( $id, '_kp_time', true ),
                'city'       => (string) get_post_meta( $id, '_kp_city', true ),
                'venue'      => (string) get_post_meta( $id, '_kp_venue', true ),
                'address'    => (string) get_post_meta( $id, '_kp_address', true ),
                'status'     => (string) get_post_meta( $id, '_kp_status', true ) ?: 'planned',
                'ticket_url' => (string) get_post_meta( $id, '_kp_ticket_url', true ),
                'info_url'   => (string) get_post_meta( $id, '_kp_info_url', true ),
            );
        }
        return $rows;
    }

    private static function state_payload() {
        $last = get_option( 'kp_auftritte_last_sync', array() );
        return array(
            'configured' => (bool) self::feed_url(),
            'last_sync'   => is_array( $last ) ? $last : array(),
            'drafts'      => self::draft_rows(),
        );
    }

    public static function ajax_state() {
        self::guard();
        wp_send_json_success( self::state_payload() );
    }

    public static function ajax_save_feed() {
        self::guard();
        if ( defined( 'KP_AUFTRITTE_ICAL_READONLY_URL' ) && KP_AUFTRITTE_ICAL_READONLY_URL ) {
            wp_send_json_error( array( 'message' => 'Die Kalenderadresse ist serverseitig fest konfiguriert.' ), 409 );
        }
        $raw = isset( $_POST['url'] ) ? trim( wp_unslash( $_POST['url'] ) ) : '';
        $url = esc_url_raw( $raw );
        $parts = wp_parse_url( $url );
        $host = strtolower( (string) ( $parts['host'] ?? '' ) );
        if ( ! $url || 'https' !== strtolower( (string) ( $parts['scheme'] ?? '' ) ) || ! in_array( $host, array( 'calendar.google.com', 'www.google.com' ), true ) || false === stripos( $url, '.ics' ) ) {
            wp_send_json_error( array( 'message' => 'Bitte die geheime iCal-Adresse des Google-Kalenders als HTTPS-.ics-Link einfügen.' ), 400 );
        }
        update_option( KP_Google_Calendar_Import::FEED_OPTION, $url, false );
        if ( self::feed_url() !== $url ) { wp_send_json_error( array( 'message' => 'Kalenderadresse konnte nicht dauerhaft gespeichert werden.' ), 500 ); }
        wp_send_json_success( array( 'message' => 'Nur-Lese-Kalender verbunden ✓', 'state' => self::state_payload() ) );
    }

    public static function ajax_sync() {
        self::guard();
        $result = KP_Google_Calendar_Import::sync();
        if ( is_wp_error( $result ) ) { wp_send_json_error( array( 'message' => $result->get_error_message() ), 502 ); }
        if ( empty( $result['configured'] ) ) { wp_send_json_error( array( 'message' => 'Bitte zuerst die iCal-Adresse hinterlegen.' ), 400 ); }
        wp_send_json_success( array( 'message' => 'Kalender synchronisiert ✓', 'stats' => $result, 'state' => self::state_payload() ) );
    }

    private static function google_draft_id() {
        $id = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;
        if ( ! $id || 'kp_termin' !== get_post_type( $id ) || 'draft' !== get_post_status( $id ) || ! get_post_meta( $id, '_kp_google_occurrence_key', true ) ) {
            wp_send_json_error( array( 'message' => 'Dieser Kalenderentwurf ist nicht mehr verfügbar.' ), 404 );
        }
        return $id;
    }

    public static function ajax_update_draft() {
        self::guard();
        $id = self::google_draft_id();
        $fields = isset( $_POST['fields'] ) ? json_decode( wp_unslash( $_POST['fields'] ), true ) : array();
        if ( ! is_array( $fields ) ) { $fields = array(); }
        $title = sanitize_text_field( (string) ( $fields['title'] ?? '' ) );
        $date  = sanitize_text_field( (string) ( $fields['date'] ?? '' ) );
        if ( ! $title || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ) { wp_send_json_error( array( 'message' => 'Titel und gültiges Datum sind erforderlich.' ), 400 ); }
        wp_update_post( array( 'ID' => $id, 'post_title' => $title ) );
        $map = array( '_kp_date' => 'date', '_kp_time' => 'time', '_kp_city' => 'city', '_kp_venue' => 'venue', '_kp_address' => 'address' );
        foreach ( $map as $meta => $key ) {
            $value = sanitize_text_field( (string) ( $fields[ $key ] ?? '' ) );
            if ( '' === $value ) { delete_post_meta( $id, $meta ); } else { update_post_meta( $id, $meta, $value ); }
        }
        $allowed = array( 'standard', 'free', 'planned', 'box_office', 'sold_out', 'closed', 'cancelled' );
        $status = sanitize_key( (string) ( $fields['status'] ?? 'planned' ) );
        update_post_meta( $id, '_kp_status', in_array( $status, $allowed, true ) ? $status : 'planned' );
        foreach ( array( '_kp_ticket_url' => 'ticket_url', '_kp_info_url' => 'info_url' ) as $meta => $key ) {
            $value = esc_url_raw( (string) ( $fields[ $key ] ?? '' ) );
            if ( $value ) { update_post_meta( $id, $meta, $value ); } else { delete_post_meta( $id, $meta ); }
        }
        $time = (string) get_post_meta( $id, '_kp_time', true );
        update_post_meta( $id, '_kp_sort', $date . ' ' . ( $time ?: '23:59' ) );
        wp_send_json_success( array( 'message' => 'Entwurf gespeichert ✓', 'state' => self::state_payload() ) );
    }

    public static function ajax_publish() {
        self::guard();
        $id = self::google_draft_id();
        $result = wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ), true );
        if ( is_wp_error( $result ) ) { wp_send_json_error( array( 'message' => $result->get_error_message() ), 500 ); }
        update_post_meta( $id, KP_Google_Calendar_Import::LOCK_META, '1' );
        wp_send_json_success( array( 'message' => 'Termin veröffentlicht und gegen Google-Überschreiben gesperrt ✓', 'state' => self::state_payload() ) );
    }
}
