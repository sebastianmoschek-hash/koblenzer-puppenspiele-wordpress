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

add_action( 'wp_enqueue_scripts', function () {
    $theme = wp_get_theme();
    wp_enqueue_style(
        'koblenzer-puppenspiele-theme',
        get_stylesheet_uri(),
        array(),
        $theme->get( 'Version' )
    );
} );

add_action( 'init', function () {
    register_block_pattern_category(
        'koblenzer-puppenspiele',
        array( 'label' => __( 'Koblenzer Puppenspiele', 'koblenzer-puppenspiele' ) )
    );
} );
