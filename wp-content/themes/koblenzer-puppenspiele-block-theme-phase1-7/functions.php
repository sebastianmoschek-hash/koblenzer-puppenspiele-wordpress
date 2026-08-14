<?php
/**
 * Theme setup for the Koblenzer Puppenspiele Block Theme.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'after_setup_theme', function () {
    add_theme_support( 'wp-block-styles' );
    add_theme_support( 'editor-styles' );
    add_theme_support( 'post-thumbnails' );
    add_editor_style( 'style.css' );
} );

// Run late so the final theme polish can deliberately override the content
// plugin's legacy frontend CSS without relying on brittle load-order luck.
add_action( 'wp_enqueue_scripts', function () {
    $theme = wp_get_theme();
    wp_enqueue_style(
        'koblenzer-puppenspiele-theme',
        get_stylesheet_uri(),
        array(),
        $theme->get( 'Version' )
    );

    $theater_css = get_theme_file_path( 'assets/theater-polish.css' );
    if ( file_exists( $theater_css ) ) {
        wp_enqueue_style(
            'koblenzer-puppenspiele-theater-polish',
            get_theme_file_uri( 'assets/theater-polish.css' ),
            array( 'koblenzer-puppenspiele-theme' ),
            (string) filemtime( $theater_css )
        );
    }

    $finish_css = get_theme_file_path( 'assets/site-finish.css' );
    if ( file_exists( $finish_css ) ) {
        wp_enqueue_style(
            'koblenzer-puppenspiele-site-finish',
            get_theme_file_uri( 'assets/site-finish.css' ),
            array( 'koblenzer-puppenspiele-theme', 'koblenzer-puppenspiele-theater-polish' ),
            (string) filemtime( $finish_css )
        );
    }

    $compat_css = get_theme_file_path( 'assets/compat-overrides.css' );
    if ( file_exists( $compat_css ) ) {
        wp_enqueue_style(
            'koblenzer-puppenspiele-compat-overrides',
            get_theme_file_uri( 'assets/compat-overrides.css' ),
            array( 'koblenzer-puppenspiele-site-finish' ),
            (string) filemtime( $compat_css )
        );
    }

    $image_fallback = get_theme_file_path( 'assets/image-fallback.js' );
    if ( file_exists( $image_fallback ) ) {
        wp_enqueue_script(
            'koblenzer-puppenspiele-image-fallback',
            get_theme_file_uri( 'assets/image-fallback.js' ),
            array(),
            (string) filemtime( $image_fallback ),
            true
        );
    }
}, 100 );

add_action( 'init', function () {
    register_block_pattern_category(
        'koblenzer-puppenspiele',
        array( 'label' => __( 'Koblenzer Puppenspiele', 'koblenzer-puppenspiele' ) )
    );
} );
