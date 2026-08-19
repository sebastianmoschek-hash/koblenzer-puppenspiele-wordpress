<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Read-only import of the Google "Auftritte" calendar via an iCal feed.
 *
 * Safety contract:
 * - HTTP GET only; this class contains no Google write/delete operation.
 * - Calendar events are never changed or deleted.
 * - Missing source events never delete/unpublish WordPress records.
 * - New occurrences are WordPress drafts and require an explicit publish action.
 * - Published WordPress records are never overwritten by later calendar syncs.
 * - Internal calendar notes (fees, phone numbers, e-mails etc.) are not copied
 *   into public-facing event fields.
 */
final class KP_Google_Calendar_Import {
    const CALENDAR_ID = '0s797sb5rrhql2r4o1oegis02o@group.calendar.google.com';
    const FEED_OPTION = 'kp_auftritte_ical_readonly_url';
    const CRON_HOOK   = 'kp_auftritte_readonly_sync';
    const LOCK_META   = '_kp_google_import_locked';

    public static function init() {
        add_action( 'init', array( __CLASS__, 'ensure_cron' ), 100 );
        add_action( self::CRON_HOOK, array( __CLASS__, 'sync' ) );
        add_action( 'transition_post_status', array( __CLASS__, 'lock_when_published' ), 10, 3 );
    }

    public static function ensure_cron() {
        if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
            wp_schedule_event( time() + 300, 'hourly', self::CRON_HOOK );
        }
    }

    public static function lock_when_published( $new_status, $old_status, $post ) {
        if ( ! $post || 'kp_termin' !== $post->post_type || 'publish' !== $new_status ) { return; }
        if ( get_post_meta( $post->ID, '_kp_google_occurrence_key', true ) ) {
            update_post_meta( $post->ID, self::LOCK_META, '1' );
        }
    }

    private static function feed_url() {
        if ( defined( 'KP_AUFTRITTE_ICAL_READONLY_URL' ) && KP_AUFTRITTE_ICAL_READONLY_URL ) {
            return esc_url_raw( KP_AUFTRITTE_ICAL_READONLY_URL );
        }
        return esc_url_raw( (string) get_option( self::FEED_OPTION, '' ) );
    }

    public static function sync() {
        $url = self::feed_url();
        if ( ! $url ) { return array( 'created' => 0, 'updated' => 0, 'skipped' => 0, 'configured' => false ); }

        // Deliberately GET-only. There is no code path in this class that writes to Google.
        $response = wp_safe_remote_get( $url, array( 'timeout' => 20, 'redirection' => 2, 'user-agent' => 'Koblenzer-Puppenspiele-Readonly-Calendar/1.0' ) );
        if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
            return new WP_Error( 'kp_calendar_fetch', 'Der Nur-Lese-Kalender konnte nicht geladen werden.' );
        }
        $body = (string) wp_remote_retrieve_body( $response );
        if ( false === strpos( $body, 'BEGIN:VCALENDAR' ) ) {
            return new WP_Error( 'kp_calendar_format', 'Der Kalenderfeed hat kein gültiges iCal-Format.' );
        }

        $events = self::parse_ical( $body );
        $stats = array( 'created' => 0, 'updated' => 0, 'skipped' => 0, 'configured' => true );
        foreach ( $events as $event ) {
            if ( ! self::is_performance( $event ) ) { ++$stats['skipped']; continue; }
            $normalized = self::normalize_event( $event );
            foreach ( $normalized as $item ) {
                $result = self::upsert_draft( $item );
                if ( 'created' === $result ) { ++$stats['created']; }
                elseif ( 'updated' === $result ) { ++$stats['updated']; }
                else { ++$stats['skipped']; }
            }
        }
        update_option( 'kp_auftritte_last_sync', array( 'at' => current_time( 'mysql' ), 'stats' => $stats ), false );
        return $stats;
    }

    private static function unfold( $text ) {
        $text = str_replace( array( "\r\n", "\r" ), "\n", $text );
        return preg_replace( "/\n[ \t]/", '', $text );
    }

    private static function decode_ical_text( $value ) {
        return trim( str_replace( array( '\\n', '\\N', '\\,', '\\;', '\\\\' ), array( "\n", "\n", ',', ';', '\\' ), (string) $value ) );
    }

    private static function parse_ical( $body ) {
        $body = self::unfold( $body );
        preg_match_all( '/BEGIN:VEVENT\n(.*?)\nEND:VEVENT/s', $body, $matches );
        $events = array();
        foreach ( $matches[1] ?? array() as $chunk ) {
            $event = array();
            foreach ( explode( "\n", $chunk ) as $line ) {
                if ( false === strpos( $line, ':' ) ) { continue; }
                list( $raw_key, $value ) = explode( ':', $line, 2 );
                $key = strtoupper( strtok( $raw_key, ';' ) );
                if ( in_array( $key, array( 'UID', 'SUMMARY', 'LOCATION', 'DESCRIPTION', 'DTSTART', 'DTEND', 'STATUS' ), true ) ) {
                    $event[ strtolower( $key ) ] = self::decode_ical_text( $value );
                }
            }
            if ( ! empty( $event['uid'] ) && ! empty( $event['dtstart'] ) ) { $events[] = $event; }
        }
        return $events;
    }

    private static function normalized_title( $title ) {
        $title = html_entity_decode( (string) $title, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
        $title = str_replace( array( '„', '“', '”', '"', "'" ), '', $title );
        $title = preg_replace( '/\s+(weihnachten|weihnachtsfassung)\s*$/iu', '', $title );
        return trim( preg_replace( '/\s+/u', ' ', $title ) );
    }

    private static function is_performance( $event ) {
        $title = self::normalized_title( $event['summary'] ?? '' );
        if ( ! $title ) { return false; }
        $deny = '/\b(sperrtermin|urlaub|mallorca|frei\b|vorbereitung|probe|proben|privat|blocker)\b/iu';
        if ( preg_match( $deny, $title ) ) { return false; }

        // Strongest signal: title matches an existing repertoire item or common show title.
        $needle = sanitize_title( $title );
        foreach ( get_posts( array( 'post_type' => 'kp_repertoire', 'post_status' => 'publish', 'posts_per_page' => -1 ) ) as $rep ) {
            $rep_title = self::normalized_title( $rep->post_title );
            if ( sanitize_title( $rep_title ) === $needle ) { return true; }
            if ( strlen( $needle ) > 5 && false !== strpos( sanitize_title( $rep_title ), $needle ) ) { return true; }
        }
        return false;
    }

    private static function parse_date( $raw ) {
        if ( preg_match( '/^(\d{4})(\d{2})(\d{2})/', (string) $raw, $m ) ) { return $m[1] . '-' . $m[2] . '-' . $m[3]; }
        return '';
    }

    private static function extract_times( $event ) {
        $raw = ( $event['description'] ?? '' ) . "\n" . ( $event['location'] ?? '' );
        preg_match_all( '/(?<!\d)([0-2]?\d)[\.:]([0-5]\d)\s*(?:uhr)?\b/iu', $raw, $m, PREG_SET_ORDER );
        $times = array();
        foreach ( $m as $hit ) {
            $hour = (int) $hit[1];
            if ( $hour > 23 ) { continue; }
            $time = sprintf( '%02d:%02d', $hour, (int) $hit[2] );
            if ( ! in_array( $time, $times, true ) ) { $times[] = $time; }
        }
        if ( ! $times && preg_match_all( '/(?<!\d)([0-2]?\d)\s*uhr\b/iu', $raw, $whole, PREG_SET_ORDER ) ) {
            foreach ( $whole as $hit ) {
                $hour = (int) $hit[1];
                if ( $hour <= 23 ) { $times[] = sprintf( '%02d:00', $hour ); }
            }
        }
        return array_values( array_unique( $times ) );
    }

    private static function public_place( $event ) {
        $location = trim( (string) ( $event['location'] ?? '' ) );
        $description = trim( (string) ( $event['description'] ?? '' ) );
        $city = '';
        $venue = '';
        $address = '';

        if ( preg_match( '/spielort\s*:\s*([^\n,;]+)/iu', $description, $m ) ) { $venue = trim( $m[1] ); }

        $lines = array_values( array_filter( array_map( 'trim', preg_split( '/\r?\n/u', $location ) ) ) );
        $contact_words = '/\b(telefon|tel\.?|fax|e-?mail|mail|mobil|geschäftsleitung|leitung|koordination|www\.|https?:\/\/)/iu';
        $public_lines = array_values( array_filter( $lines, static function ( $line ) use ( $contact_words ) {
            return ! preg_match( $contact_words, $line ) && ! preg_match( '/@/', $line );
        } ) );

        foreach ( $public_lines as $line ) {
            if ( preg_match( '/\b(\d{5})\s+([\p{L}][\p{L}\- .]+)$/u', $line, $m ) ) {
                $city = trim( $m[2] );
                if ( preg_match( '/(straße|str\.|weg|platz|allee|gasse|ring|ufer|markt|graben|hauptstraße|schulstr\.)\s*\d+/iu', $line ) ) { $address = $line; }
            }
            if ( ! $address && preg_match( '/\b\p{L}+(?:straße|str\.|weg|platz|allee|gasse|ring|ufer)\s+\d+/iu', $line ) ) { $address = $line; }
        }

        if ( ! $venue && $public_lines ) {
            foreach ( $public_lines as $line ) {
                if ( ! preg_match( '/^\d{5}\b/', $line ) && ! preg_match( '/\b(straße|str\.|weg|platz|allee|gasse|ring|ufer)\s+\d+/iu', $line ) ) {
                    $venue = $line;
                    break;
                }
            }
        }

        if ( ! $city && $location ) {
            if ( preg_match( '/\b\d{5}\s+([\p{L}][\p{L}\- ]+)/u', $location, $m ) ) { $city = trim( $m[1] ); }
            elseif ( preg_match( '/(?:,|\bin\b)\s*([A-ZÄÖÜ][\p{L}\-]+(?:[ -][A-ZÄÖÜ][\p{L}\-]+)?)\s*$/u', $location, $m ) ) { $city = trim( $m[1] ); }
            elseif ( count( $public_lines ) === 1 ) {
                $tokens = preg_split( '/[ ,]+/', $public_lines[0] );
                $city = $tokens ? trim( end( $tokens ) ) : '';
            }
        }

        return array(
            'city' => sanitize_text_field( $city ),
            'venue' => sanitize_text_field( $venue ),
            'address' => sanitize_text_field( $address ),
        );
    }

    private static function repertoire_id_for_title( $title ) {
        $needle = sanitize_title( self::normalized_title( $title ) );
        foreach ( get_posts( array( 'post_type' => 'kp_repertoire', 'post_status' => 'publish', 'posts_per_page' => -1 ) ) as $rep ) {
            if ( sanitize_title( self::normalized_title( $rep->post_title ) ) === $needle ) { return (int) $rep->ID; }
        }
        return 0;
    }

    private static function normalize_event( $event ) {
        $date = self::parse_date( $event['dtstart'] ?? '' );
        $title = self::normalized_title( $event['summary'] ?? '' );
        if ( ! $date || ! $title ) { return array(); }
        $times = self::extract_times( $event );
        if ( ! $times ) { $times = array( '' ); }
        $place = self::public_place( $event );
        $rep_id = self::repertoire_id_for_title( $title );
        $items = array();
        foreach ( $times as $time ) {
            $items[] = array(
                'source_uid' => sanitize_text_field( $event['uid'] ),
                'occurrence_key' => hash( 'sha256', self::CALENDAR_ID . '|' . $event['uid'] . '|' . $date . '|' . $time ),
                'source_hash' => hash( 'sha256', wp_json_encode( $event ) ),
                'title' => sanitize_text_field( $title ),
                'date' => $date,
                'time' => sanitize_text_field( $time ),
                'city' => $place['city'],
                'venue' => $place['venue'],
                'address' => $place['address'],
                'repertoire_id' => $rep_id,
                // Raw source stays private in post meta for owner review only.
                'source_summary' => sanitize_text_field( $event['summary'] ?? '' ),
                'source_location' => sanitize_textarea_field( $event['location'] ?? '' ),
                'source_description' => sanitize_textarea_field( $event['description'] ?? '' ),
            );
        }
        return $items;
    }

    private static function existing_id( $occurrence_key ) {
        $ids = get_posts( array(
            'post_type' => 'kp_termin', 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids',
            'meta_key' => '_kp_google_occurrence_key', 'meta_value' => $occurrence_key,
        ) );
        return $ids ? (int) $ids[0] : 0;
    }

    private static function upsert_draft( $item ) {
        $id = self::existing_id( $item['occurrence_key'] );
        if ( $id ) {
            if ( 'publish' === get_post_status( $id ) || '1' === get_post_meta( $id, self::LOCK_META, true ) ) { return 'skipped'; }
            if ( get_post_meta( $id, '_kp_google_source_hash', true ) === $item['source_hash'] ) { return 'skipped'; }
            wp_update_post( array( 'ID' => $id, 'post_title' => $item['title'] ) );
            self::write_meta( $id, $item );
            return 'updated';
        }

        $id = wp_insert_post( array(
            'post_type' => 'kp_termin',
            'post_status' => 'draft',
            'post_title' => $item['title'],
        ), true );
        if ( is_wp_error( $id ) ) { return 'skipped'; }
        self::write_meta( $id, $item );
        update_post_meta( $id, '_kp_google_imported_at', current_time( 'mysql' ) );
        return 'created';
    }

    private static function write_meta( $id, $item ) {
        update_post_meta( $id, '_kp_google_calendar_id', self::CALENDAR_ID );
        update_post_meta( $id, '_kp_google_event_uid', $item['source_uid'] );
        update_post_meta( $id, '_kp_google_occurrence_key', $item['occurrence_key'] );
        update_post_meta( $id, '_kp_google_source_hash', $item['source_hash'] );
        update_post_meta( $id, '_kp_google_source_summary', $item['source_summary'] );
        update_post_meta( $id, '_kp_google_source_location', $item['source_location'] );
        update_post_meta( $id, '_kp_google_source_description', $item['source_description'] );
        update_post_meta( $id, '_kp_date', $item['date'] );
        if ( $item['time'] ) { update_post_meta( $id, '_kp_time', $item['time'] ); } else { delete_post_meta( $id, '_kp_time' ); }
        if ( $item['city'] ) { update_post_meta( $id, '_kp_city', $item['city'] ); }
        if ( $item['venue'] ) { update_post_meta( $id, '_kp_venue', $item['venue'] ); }
        if ( $item['address'] ) { update_post_meta( $id, '_kp_address', $item['address'] ); }
        update_post_meta( $id, '_kp_status', 'planned' );
        update_post_meta( $id, '_kp_sort', $item['date'] . ' ' . ( $item['time'] ?: '23:59' ) );
        if ( $item['repertoire_id'] ) { update_post_meta( $id, '_kp_repertoire_id', $item['repertoire_id'] ); }
        // Never auto-fill public note/ticket/info from arbitrary private calendar text.
    }
}
