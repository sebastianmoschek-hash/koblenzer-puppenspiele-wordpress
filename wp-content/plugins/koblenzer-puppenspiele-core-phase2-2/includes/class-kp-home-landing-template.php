<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Keeps the repository front-page template authoritative.
 *
 * The staging site has a previously customized wp_template record in the
 * database. WordPress prefers that record over templates/front-page.html,
 * which made repository landing-page changes invisible on the live staging
 * homepage. For the front page only, use the current theme file so Git/QA and
 * the actually rendered homepage cannot drift apart.
 */
final class KP_Home_Landing_Template {
    public static function init() {
        add_filter( 'get_block_template', array( __CLASS__, 'prefer_theme_front_page' ), 999, 3 );
    }

    public static function prefer_theme_front_page( $template, $id, $template_type ) {
        if ( ! $template || 'wp_template' !== $template_type ) {
            return $template;
        }

        $slug = isset( $template->slug ) ? (string) $template->slug : '';
        if ( 'front-page' !== $slug ) {
            return $template;
        }

        $path = trailingslashit( get_stylesheet_directory() ) . 'templates/front-page.html';
        if ( ! is_readable( $path ) ) {
            return $template;
        }

        $content = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        if ( ! is_string( $content ) || false === strpos( $content, 'kp-home-landing' ) ) {
            return $template;
        }

        $template->content = $content;
        $template->source  = 'theme';
        $template->origin  = 'theme';

        return $template;
    }
}
