<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** One-time safe canonicalization for the supplied Koblenzer Puppenspiele profile. */
final class KP_Instagram_Profile_Migration {
    const OPTION = 'kp_website_studio';
    const MARKER = 'kp_instagram_profile_canonical_v1';
    const URL    = 'https://www.instagram.com/koblenzer_puppenspiele/';

    public static function init() {
        add_action( 'init', array( __CLASS__, 'migrate' ), 36 );
    }

    public static function migrate() {
        if ( get_option( self::MARKER, false ) ) { return; }

        $saved = get_option( self::OPTION, array() );
        if ( ! is_array( $saved ) ) { $saved = array(); }
        $current = trim( (string) ( $saved['instagram_url'] ?? '' ) );
        $replace = '' === $current;

        if ( ! $replace ) {
            $parts = wp_parse_url( $current );
            $host = strtolower( (string) ( $parts['host'] ?? '' ) );
            $path = untrailingslashit( strtolower( (string) ( $parts['path'] ?? '' ) ) );
            $replace = in_array( $host, array( 'instagram.com', 'www.instagram.com' ), true )
                && '/koblenzer_puppenspiele' === $path;
        }

        if ( $replace && self::URL !== $current ) {
            $saved['instagram_url'] = self::URL;
            update_option( self::OPTION, $saved, false );
        }

        update_option( self::MARKER, '1', false );
    }
}
