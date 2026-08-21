<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Safe canonicalization for the supplied Koblenzer Puppenspiele Instagram profile. */
final class KP_Instagram_Profile_Migration {
    const OPTION = 'kp_website_studio';
    const MARKER = 'kp_instagram_profile_canonical_v1';
    const URL    = 'https://www.instagram.com/koblenzer_puppenspiele/';

    public static function init() {
        add_action( 'init', array( __CLASS__, 'migrate' ), 36 );
        add_filter( 'option_' . self::OPTION, array( __CLASS__, 'canonicalize_runtime' ), 20 );
    }

    private static function is_known_profile( $current ) {
        $current = trim( (string) $current );
        if ( '' === $current ) { return true; }
        $parts = wp_parse_url( $current );
        $host = strtolower( (string) ( $parts['host'] ?? '' ) );
        $path = untrailingslashit( strtolower( (string) ( $parts['path'] ?? '' ) ) );
        return in_array( $host, array( 'instagram.com', 'www.instagram.com' ), true )
            && '/koblenzer_puppenspiele' === $path;
    }

    public static function canonicalize_runtime( $saved ) {
        if ( ! is_array( $saved ) ) { return $saved; }
        $current = (string) ( $saved['instagram_url'] ?? '' );
        if ( self::is_known_profile( $current ) ) {
            $saved['instagram_url'] = self::URL;
        }
        return $saved;
    }

    public static function migrate() {
        if ( get_option( self::MARKER, false ) ) { return; }

        $saved = get_option( self::OPTION, array() );
        if ( ! is_array( $saved ) ) { $saved = array(); }
        $current = trim( (string) ( $saved['instagram_url'] ?? '' ) );

        if ( self::is_known_profile( $current ) && self::URL !== $current ) {
            $saved['instagram_url'] = self::URL;
            update_option( self::OPTION, $saved, false );
        }

        update_option( self::MARKER, '1', false );
    }
}
