<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Permanent but locked maintenance bridge for STAGING only.
 *
 * Authentication is intentionally not a reusable HTTP password. A GitHub
 * workflow that already owns the staging FTP deployment credentials places a
 * short-lived, random, one-time request file in WP_CONTENT_DIR. This bridge
 * consumes that file atomically, deletes it before executing anything, and only
 * supports a small allow-list of maintenance/design operations.
 *
 * No arbitrary PHP, SQL, option names or filesystem paths can be supplied.
 */
final class KP_Staging_Maintenance_Bridge {
    const HOST = 'neu.koblenzer-puppenspiele.de';
    const REQUEST_DIR = '.kp-staging-maintenance-requests';
    const MAX_REQUEST_AGE = 300;

    public static function init() {
        if ( ! self::is_staging() ) { return; }
        add_action( 'init', array( __CLASS__, 'maybe_health' ), 0 );
        add_action( 'init', array( __CLASS__, 'maybe_handle' ), 1 );
    }

    private static function is_staging() {
        $home_host = strtolower( (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST ) );
        $http_host = isset( $_SERVER['HTTP_HOST'] ) ? strtolower( preg_replace( '/:\d+$/', '', (string) wp_unslash( $_SERVER['HTTP_HOST'] ) ) ) : '';
        return self::HOST === $home_host && ( '' === $http_host || self::HOST === $http_host );
    }

    private static function request_dir() {
        return trailingslashit( WP_CONTENT_DIR ) . self::REQUEST_DIR;
    }

    private static function json_response( $success, $data, $status = 200 ) {
        nocache_headers();
        status_header( (int) $status );
        header( 'Content-Type: application/json; charset=' . get_option( 'blog_charset' ) );
        echo wp_json_encode( array( 'success' => (bool) $success, 'data' => $data ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
        exit;
    }

    public static function maybe_health() {
        if ( ! isset( $_GET['kp_staging_bridge_health'] ) ) { return; }
        self::json_response( true, array(
            'active'  => true,
            'host'    => self::HOST,
            'version' => defined( 'KP_CORE_VERSION' ) ? KP_CORE_VERSION : '',
            'mode'    => 'one-time-file',
        ) );
    }

    public static function maybe_handle() {
        if ( 'POST' !== strtoupper( isset( $_SERVER['REQUEST_METHOD'] ) ? (string) $_SERVER['REQUEST_METHOD'] : '' ) ) { return; }
        $token = isset( $_POST['kp_staging_maint'] ) ? strtolower( sanitize_text_field( wp_unslash( $_POST['kp_staging_maint'] ) ) ) : '';
        if ( ! preg_match( '/^[a-f0-9]{64}$/', $token ) ) { return; }

        $request = self::consume_request( $token );
        if ( is_wp_error( $request ) ) {
            self::json_response( false, array( 'message' => $request->get_error_message() ), 403 );
        }

        $operation = isset( $request['operation'] ) ? sanitize_key( (string) $request['operation'] ) : 'diagnose';
        $payload   = isset( $request['payload'] ) && is_array( $request['payload'] ) ? $request['payload'] : array();
        $action    = null;

        switch ( $operation ) {
            case 'diagnose':
                break;
            case 'cache_flush':
                $action = array(
                    'cache_flushed' => function_exists( 'wp_cache_flush' ) ? (bool) wp_cache_flush() : false,
                );
                break;
            case 'sync_front_page_template':
                $action = self::sync_front_page_template();
                if ( is_wp_error( $action ) ) {
                    self::json_response( false, array(
                        'message'     => $action->get_error_message(),
                        'operation'   => $operation,
                        'diagnostics' => self::diagnostics(),
                    ), 500 );
                }
                break;
            case 'studio_patch':
                $action = self::studio_patch( $payload );
                if ( is_wp_error( $action ) ) {
                    self::json_response( false, array(
                        'message'     => $action->get_error_message(),
                        'operation'   => $operation,
                        'diagnostics' => self::diagnostics(),
                    ), 400 );
                }
                break;
            default:
                self::json_response( false, array( 'message' => 'Unsupported maintenance operation.' ), 400 );
        }

        self::json_response( true, array(
            'request_id'  => isset( $request['request_id'] ) ? sanitize_text_field( (string) $request['request_id'] ) : '',
            'operation'   => $operation,
            'action'      => $action,
            'diagnostics' => self::diagnostics(),
        ) );
    }

    private static function consume_request( $token ) {
        $dir = self::request_dir();
        $path = $dir . '/' . $token . '.json';
        $running = $dir . '/' . $token . '.running';

        if ( ! is_dir( $dir ) || ! is_file( $path ) ) {
            return new WP_Error( 'missing_request', 'Maintenance request not found.' );
        }
        $mtime = @filemtime( $path );
        if ( ! $mtime || abs( time() - (int) $mtime ) > self::MAX_REQUEST_AGE ) {
            @unlink( $path );
            return new WP_Error( 'expired_request', 'Maintenance request expired.' );
        }
        if ( ! @rename( $path, $running ) ) {
            return new WP_Error( 'busy_request', 'Maintenance request is already being consumed.' );
        }

        $raw = @file_get_contents( $running );
        @unlink( $running ); // one-time: remove before executing the requested action.
        if ( ! is_string( $raw ) || '' === $raw || strlen( $raw ) > 65536 ) {
            return new WP_Error( 'invalid_request', 'Maintenance request is invalid.' );
        }
        $request = json_decode( $raw, true );
        if ( ! is_array( $request ) ) {
            return new WP_Error( 'invalid_json', 'Maintenance request JSON is invalid.' );
        }
        $file_token = isset( $request['token'] ) ? strtolower( (string) $request['token'] ) : '';
        if ( ! hash_equals( $token, $file_token ) ) {
            return new WP_Error( 'token_mismatch', 'Maintenance request token mismatch.' );
        }
        $expires = isset( $request['expires_at'] ) ? (int) $request['expires_at'] : 0;
        if ( $expires < time() || $expires > time() + self::MAX_REQUEST_AGE + 60 ) {
            return new WP_Error( 'request_expired', 'Maintenance request is outside its permitted time window.' );
        }
        return $request;
    }

    private static function option_shape( $name ) {
        $value = get_option( $name, null );
        if ( is_array( $value ) ) {
            return array(
                'type'  => 'array',
                'count' => count( $value ),
                'keys'  => array_slice( array_map( 'strval', array_keys( $value ) ), 0, 40 ),
            );
        }
        if ( is_object( $value ) ) { return array( 'type' => 'object' ); }
        if ( null === $value ) { return array( 'type' => 'missing' ); }
        return array( 'type' => gettype( $value ), 'value' => is_scalar( $value ) ? (string) $value : '' );
    }

    private static function front_templates() {
        $posts = get_posts( array(
            'post_type'      => 'wp_template',
            'post_status'    => array( 'publish', 'draft' ),
            'posts_per_page' => 50,
            'orderby'        => 'ID',
            'order'          => 'ASC',
        ) );
        $out = array();
        foreach ( $posts as $post ) {
            if ( 'front-page' !== $post->post_name ) { continue; }
            $themes = wp_get_post_terms( $post->ID, 'wp_theme', array( 'fields' => 'names' ) );
            $out[] = array(
                'id'      => (int) $post->ID,
                'slug'    => (string) $post->post_name,
                'status'  => (string) $post->post_status,
                'themes'  => is_wp_error( $themes ) ? array() : array_values( $themes ),
                'length'  => strlen( (string) $post->post_content ),
                'updated' => (string) $post->post_modified_gmt,
            );
        }
        return $out;
    }

    private static function studio_snapshot() {
        $saved = get_option( 'kp_website_studio', array() );
        if ( ! is_array( $saved ) ) { $saved = array(); }
        $allowed = array_keys( self::studio_rules() );
        $out = array();
        foreach ( $allowed as $key ) {
            if ( array_key_exists( $key, $saved ) ) { $out[ $key ] = $saved[ $key ]; }
        }
        return $out;
    }

    private static function diagnostics() {
        global $wp_version;
        return array(
            'host'             => strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) ),
            'home_url'         => home_url( '/' ),
            'wp_version'       => (string) $wp_version,
            'theme'            => get_stylesheet(),
            'plugin_version'   => defined( 'KP_CORE_VERSION' ) ? KP_CORE_VERSION : '',
            'page_on_front'    => (int) get_option( 'page_on_front' ),
            'show_on_front'    => (string) get_option( 'show_on_front' ),
            'front_templates'  => self::front_templates(),
            'studio'           => self::studio_snapshot(),
            'options'          => array(
                'website_studio'       => self::option_shape( 'kp_website_studio' ),
                'touch_free_global'    => self::option_shape( 'kp_touch_free_layout_global_v1' ),
                'touch_free_pages'     => self::option_shape( 'kp_touch_free_layout_pages_v1' ),
                'touch_gesture_global' => self::option_shape( 'kp_touch_gestures_global_v1' ),
                'touch_gesture_pages'  => self::option_shape( 'kp_touch_gestures_pages_v1' ),
                'frontend_global'      => self::option_shape( 'kp_frontend_editor_global_v1' ),
                'frontend_pages'       => self::option_shape( 'kp_frontend_editor_pages_v1' ),
            ),
        );
    }

    private static function sync_front_page_template() {
        $path = trailingslashit( get_stylesheet_directory() ) . 'templates/front-page.html';
        if ( ! is_readable( $path ) ) {
            return new WP_Error( 'missing_template', 'Theme front-page.html is not readable.' );
        }
        $content = file_get_contents( $path );
        if ( ! is_string( $content ) || false === strpos( $content, 'kp-home-landing' ) ) {
            return new WP_Error( 'unexpected_template', 'Theme front-page.html does not contain the landing-page marker.' );
        }
        $posts = get_posts( array(
            'post_type'      => 'wp_template',
            'post_status'    => array( 'publish', 'draft' ),
            'posts_per_page' => 50,
        ) );
        $updated = array();
        foreach ( $posts as $post ) {
            if ( 'front-page' !== $post->post_name ) { continue; }
            $themes = wp_get_post_terms( $post->ID, 'wp_theme', array( 'fields' => 'names' ) );
            if ( is_wp_error( $themes ) || ! in_array( get_stylesheet(), $themes, true ) ) { continue; }
            $result = wp_update_post( array( 'ID' => $post->ID, 'post_content' => $content ), true );
            if ( is_wp_error( $result ) ) { return $result; }
            $updated[] = (int) $post->ID;
        }
        if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
        return array( 'updated_template_ids' => $updated, 'content_length' => strlen( $content ) );
    }

    private static function studio_rules() {
        return array(
            'accent_color'        => array( 'type' => 'color' ),
            'accent_dark'         => array( 'type' => 'color' ),
            'background_color'    => array( 'type' => 'color' ),
            'nav_color'           => array( 'type' => 'color' ),
            'surface_color'       => array( 'type' => 'color' ),
            'text_color'          => array( 'type' => 'color' ),
            'muted_color'         => array( 'type' => 'color' ),
            'line_color'          => array( 'type' => 'color' ),
            'content_width'       => array( 'type' => 'int', 'min' => 560, 'max' => 980 ),
            'wide_width'          => array( 'type' => 'int', 'min' => 820, 'max' => 1440 ),
            'card_radius'         => array( 'type' => 'int', 'min' => 0, 'max' => 36 ),
            'button_radius'       => array( 'type' => 'int', 'min' => 0, 'max' => 999 ),
            'body_font'           => array( 'type' => 'choice', 'choices' => array( 'system', 'humanist', 'classic' ) ),
            'heading_font'        => array( 'type' => 'choice', 'choices' => array( 'georgia', 'palatino', 'system' ) ),
            'motion'              => array( 'type' => 'bool' ),
            'show_topbar'         => array( 'type' => 'bool' ),
            'topbar_left'         => array( 'type' => 'text', 'max' => 80 ),
            'topbar_right'        => array( 'type' => 'text', 'max' => 50 ),
            'show_header_image'   => array( 'type' => 'bool' ),
            'header_image_id'     => array( 'type' => 'int', 'min' => 0, 'max' => 999999999 ),
            'header_max_width'    => array( 'type' => 'int', 'min' => 540, 'max' => 1400 ),
            'header_side_gap'     => array( 'type' => 'int', 'min' => 0, 'max' => 100 ),
            'header_radius'       => array( 'type' => 'int', 'min' => 0, 'max' => 36 ),
            'header_vertical_gap' => array( 'type' => 'int', 'min' => 0, 'max' => 40 ),
            'desktop_nav_opacity' => array( 'type' => 'int', 'min' => 0, 'max' => 100 ),
            'desktop_nav_height'  => array( 'type' => 'int', 'min' => 36, 'max' => 72 ),
            'desktop_nav_radius'  => array( 'type' => 'int', 'min' => 0, 'max' => 999 ),
            'menu_color'          => array( 'type' => 'color' ),
            'menu_opacity'        => array( 'type' => 'int', 'min' => 30, 'max' => 100 ),
            'menu_blur'           => array( 'type' => 'int', 'min' => 0, 'max' => 40 ),
            'menu_width'          => array( 'type' => 'int', 'min' => 220, 'max' => 360 ),
            'menu_radius'         => array( 'type' => 'int', 'min' => 0, 'max' => 36 ),
            'menu_offset_y'       => array( 'type' => 'int', 'min' => -120, 'max' => 180 ),
            'menu_border_opacity' => array( 'type' => 'int', 'min' => 0, 'max' => 100 ),
            'menu_scrim_opacity'  => array( 'type' => 'int', 'min' => 0, 'max' => 45 ),
            'menu_item_padding'   => array( 'type' => 'int', 'min' => 5, 'max' => 18 ),
            'menu_item_gap'       => array( 'type' => 'int', 'min' => 0, 'max' => 12 ),
            'menu_font_delta'     => array( 'type' => 'int', 'min' => -4, 'max' => 6 ),
            'menu_button_size'    => array( 'type' => 'int', 'min' => 44, 'max' => 72 ),
            'menu_offset_x'       => array( 'type' => 'int', 'min' => -140, 'max' => 140 ),
        );
    }

    private static function sanitize_studio_value( $key, $value, $rule ) {
        switch ( $rule['type'] ) {
            case 'color':
                $color = sanitize_hex_color( (string) $value );
                return $color ? $color : new WP_Error( 'invalid_color', 'Invalid color for ' . $key . '.' );
            case 'int':
                if ( ! is_numeric( $value ) ) { return new WP_Error( 'invalid_number', 'Invalid number for ' . $key . '.' ); }
                return max( (int) $rule['min'], min( (int) $rule['max'], (int) $value ) );
            case 'bool':
                return empty( $value ) ? 0 : 1;
            case 'choice':
                $choice = sanitize_key( (string) $value );
                return in_array( $choice, $rule['choices'], true ) ? $choice : new WP_Error( 'invalid_choice', 'Invalid choice for ' . $key . '.' );
            case 'text':
                $text = sanitize_text_field( (string) $value );
                if ( function_exists( 'mb_substr' ) ) { $text = mb_substr( $text, 0, (int) $rule['max'] ); }
                else { $text = substr( $text, 0, (int) $rule['max'] ); }
                return $text;
        }
        return new WP_Error( 'invalid_rule', 'Unsupported design rule.' );
    }

    private static function studio_patch( $payload ) {
        $patch = isset( $payload['patch'] ) && is_array( $payload['patch'] ) ? $payload['patch'] : array();
        if ( ! $patch || count( $patch ) > 24 ) {
            return new WP_Error( 'invalid_patch', 'Design patch must contain 1 to 24 allowed settings.' );
        }
        $rules = self::studio_rules();
        $saved = get_option( 'kp_website_studio', array() );
        if ( ! is_array( $saved ) ) { $saved = array(); }
        $before = array();
        $after = array();

        foreach ( $patch as $key => $value ) {
            $key = sanitize_key( (string) $key );
            if ( ! isset( $rules[ $key ] ) ) {
                return new WP_Error( 'forbidden_setting', 'Design setting is not allowed: ' . $key );
            }
            $clean = self::sanitize_studio_value( $key, $value, $rules[ $key ] );
            if ( is_wp_error( $clean ) ) { return $clean; }
            $before[ $key ] = array_key_exists( $key, $saved ) ? $saved[ $key ] : null;
            $saved[ $key ] = $clean;
            $after[ $key ] = $clean;
        }

        update_option( 'kp_website_studio', $saved, false );
        $verified = get_option( 'kp_website_studio', array() );
        if ( ! is_array( $verified ) ) { $verified = array(); }
        foreach ( $after as $key => $value ) {
            if ( ! array_key_exists( $key, $verified ) || $verified[ $key ] !== $value ) {
                return new WP_Error( 'design_readback_failed', 'WordPress did not confirm the design setting: ' . $key );
            }
        }
        if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
        return array( 'before' => $before, 'after' => $after, 'verified' => true );
    }
}
