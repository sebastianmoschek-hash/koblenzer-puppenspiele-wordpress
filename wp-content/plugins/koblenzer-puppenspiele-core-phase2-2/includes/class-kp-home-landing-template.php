<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Keeps the repository front-page template authoritative on staging.
 *
 * WordPress block themes can store a customized wp_template post in the
 * database. That database record takes precedence over templates/front-page.html.
 * Staging still has such an older record, so merely deploying the new theme file
 * is not enough. On staging only, synchronize the active front-page wp_template
 * record with the repository file and also normalize queried template objects as
 * a defensive fallback.
 */
final class KP_Home_Landing_Template {
    const SYNC_OPTION = 'kp_home_landing_template_fingerprint_v1';

    public static function init() {
        add_action( 'init', array( __CLASS__, 'sync_staging_database_template' ), 90 );
        add_filter( 'get_block_template', array( __CLASS__, 'prefer_theme_front_page' ), 999, 3 );
        add_filter( 'get_block_templates', array( __CLASS__, 'prefer_theme_front_page_list' ), 999, 3 );
    }

    private static function is_staging() {
        return 'neu.koblenzer-puppenspiele.de' === strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
    }

    private static function theme_content() {
        $path = trailingslashit( get_stylesheet_directory() ) . 'templates/front-page.html';
        if ( ! is_readable( $path ) ) {
            return '';
        }

        $content = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        if ( ! is_string( $content ) || false === strpos( $content, 'kp-home-landing' ) ) {
            return '';
        }
        return $content;
    }

    public static function sync_staging_database_template() {
        if ( ! self::is_staging() ) {
            return;
        }

        $content = self::theme_content();
        if ( '' === $content ) {
            return;
        }

        $fingerprint = hash( 'sha256', $content );
        if ( $fingerprint === get_option( self::SYNC_OPTION, '' ) ) {
            return;
        }

        $templates = get_posts( array(
            'post_type'        => 'wp_template',
            'post_status'      => 'any',
            'posts_per_page'   => -1,
            'name'             => 'front-page',
            'suppress_filters' => true,
        ) );

        $stylesheet = (string) get_stylesheet();
        $updated = 0;
        foreach ( $templates as $template_post ) {
            $theme_terms = wp_get_post_terms( $template_post->ID, 'wp_theme', array( 'fields' => 'slugs' ) );
            if ( ! is_wp_error( $theme_terms ) && $theme_terms && ! in_array( $stylesheet, $theme_terms, true ) ) {
                continue;
            }

            if ( (string) $template_post->post_content === $content ) {
                ++$updated;
                continue;
            }

            $result = wp_update_post( array(
                'ID'           => (int) $template_post->ID,
                'post_content' => $content,
                'post_status'  => 'publish',
            ), true );

            if ( ! is_wp_error( $result ) ) {
                clean_post_cache( (int) $template_post->ID );
                ++$updated;
            }
        }

        // If there is no DB override, the theme file is already authoritative.
        // If there is one, record the fingerprint only after at least one matching
        // template was successfully synchronized.
        if ( ! $templates || $updated > 0 ) {
            update_option( self::SYNC_OPTION, $fingerprint, false );
        }
    }

    private static function override_object( $template ) {
        if ( ! $template ) {
            return $template;
        }

        $slug = isset( $template->slug ) ? (string) $template->slug : '';
        if ( 'front-page' !== $slug ) {
            return $template;
        }

        $content = self::theme_content();
        if ( '' === $content ) {
            return $template;
        }

        $template->content = $content;
        $template->source  = 'theme';
        $template->origin  = 'theme';
        return $template;
    }

    public static function prefer_theme_front_page( $template, $id, $template_type ) {
        if ( 'wp_template' !== $template_type ) {
            return $template;
        }
        return self::override_object( $template );
    }

    public static function prefer_theme_front_page_list( $templates, $query, $template_type ) {
        if ( 'wp_template' !== $template_type || ! is_array( $templates ) ) {
            return $templates;
        }
        foreach ( $templates as $index => $template ) {
            $templates[ $index ] = self::override_object( $template );
        }
        return $templates;
    }
}
