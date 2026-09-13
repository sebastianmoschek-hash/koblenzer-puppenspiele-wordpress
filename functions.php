<?php
if (!defined('ABSPATH')) exit;

function kp_setup() {
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('responsive-embeds');
    add_theme_support('custom-header', array(
        'width' => 1920,
        'height' => 700,
        'flex-width' => true,
        'flex-height' => true,
        'uploads' => true,
    ));
    register_nav_menus(array(
        'primary' => __('Hauptmenü', 'koblenzer-puppenspiele'),
        'footer' => __('Footer-Menü', 'koblenzer-puppenspiele'),
    ));
}
add_action('after_setup_theme', 'kp_setup');

function kp_assets() {
    wp_enqueue_style('kp-style', get_stylesheet_uri(), array(), '2.1.0');
}
add_action('wp_enqueue_scripts', 'kp_assets');

function kp_default_menu() {
    echo '<ul class="kp-nav-list">';
    echo '<li class="menu-item"><a href="' . esc_url(home_url('/')) . '">Startseite</a></li>';
    wp_list_pages(array('title_li' => '', 'depth' => 1));
    echo '</ul>';
}
