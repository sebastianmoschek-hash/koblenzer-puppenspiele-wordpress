<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class KP_Bundled_Images {
    private static $cache = array();

    public static function init() {
        add_filter( 'image_downsize', array( __CLASS__, 'downsize' ), 5, 3 );
        add_filter( 'wp_get_attachment_url', array( __CLASS__, 'attachment_url' ), 5, 2 );
    }

    private static function bundled( $attachment_id ) {
        $attachment_id = absint( $attachment_id );
        if ( isset( self::$cache[ $attachment_id ] ) ) { return self::$cache[ $attachment_id ]; }
        $file = (string) get_post_meta( $attachment_id, '_wp_attached_file', true );
        $filename = wp_basename( $file );
        if ( '' === $filename ) { return self::$cache[ $attachment_id ] = false; }
        foreach ( array( 'legacy-ensemble', 'legacy-repertoire', 'legacy-referenzen' ) as $folder ) {
            $path = KP_CORE_DIR . 'assets/' . $folder . '/' . $filename;
            if ( file_exists( $path ) ) {
                $size = @getimagesize( $path );
                return self::$cache[ $attachment_id ] = array(
                    'url' => KP_CORE_URL . 'assets/' . $folder . '/' . rawurlencode( $filename ),
                    'width' => is_array( $size ) ? (int) $size[0] : 0,
                    'height' => is_array( $size ) ? (int) $size[1] : 0,
                );
            }
        }
        return self::$cache[ $attachment_id ] = false;
    }

    public static function attachment_url( $url, $attachment_id ) {
        $bundled = self::bundled( $attachment_id );
        return $bundled ? $bundled['url'] : $url;
    }

    public static function downsize( $downsize, $attachment_id, $size ) {
        $bundled = self::bundled( $attachment_id );
        if ( ! $bundled ) { return $downsize; }
        return array( $bundled['url'], $bundled['width'], $bundled['height'], false );
    }
}
