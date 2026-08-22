<?php
/**
 * KP web-app branding override.
 *
 * Keeps the website/editor runtime untouched while giving the installable PWA
 * the short, recognisable KP identity requested for phone home screens.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_webapp_brand_icon_url() {
    return content_url( '/plugins/koblenzer-puppenspiele-core-phase2-2/assets/kp-app-icon.svg' );
}

function kp_webapp_brand_manifest_url() {
    return add_query_arg(
        array(
            'kp_webapp_manifest' => '1',
            'kp_brand'           => 'kp-1',
        ),
        home_url( '/' )
    );
}

function kp_webapp_brand_meta() {
    if ( is_admin() ) { return; }

    $theme = '#f07a22';
    if ( class_exists( 'KP_Website_Studio' ) ) {
        $settings = KP_Website_Studio::settings();
        if ( ! empty( $settings['accent_color'] ) ) {
            $theme = $settings['accent_color'];
        }
    }

    $icon = kp_webapp_brand_icon_url();
    echo '<link rel="manifest" href="' . esc_url( kp_webapp_brand_manifest_url() ) . '">';
    echo '<meta name="application-name" content="KP">';
    echo '<meta name="theme-color" content="' . esc_attr( $theme ) . '">';
    echo '<meta name="mobile-web-app-capable" content="yes">';
    echo '<meta name="apple-mobile-web-app-capable" content="yes">';
    echo '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">';
    echo '<meta name="apple-mobile-web-app-title" content="KP">';
    echo '<link rel="icon" href="' . esc_url( $icon ) . '" type="image/svg+xml">';
    echo '<link rel="apple-touch-icon" href="' . esc_url( $icon ) . '">';
}

function kp_webapp_brand_manifest() {
    if ( ! isset( $_GET['kp_webapp_manifest'] ) ) { return; }

    $theme = '#f07a22';
    $background = '#080706';
    if ( class_exists( 'KP_Website_Studio' ) ) {
        $settings = KP_Website_Studio::settings();
        if ( ! empty( $settings['accent_color'] ) ) { $theme = $settings['accent_color']; }
        if ( ! empty( $settings['background_color'] ) ) { $background = $settings['background_color']; }
    }

    $manifest = array(
        'id'               => home_url( '/' ),
        'name'             => 'KP',
        'short_name'       => 'KP',
        'description'      => 'KP – Koblenzer Puppenspiele.',
        'lang'             => 'de-DE',
        'start_url'        => home_url( '/' ),
        'scope'            => home_url( '/' ),
        'display'          => 'standalone',
        'orientation'      => 'any',
        'background_color' => $background,
        'theme_color'      => $theme,
        'icons'            => array(
            array(
                'src'     => kp_webapp_brand_icon_url(),
                'sizes'   => 'any',
                'type'    => 'image/svg+xml',
                'purpose' => 'any maskable',
            ),
        ),
        'shortcuts'        => array(
            array( 'name' => 'Termine', 'url' => home_url( '/termine/' ) ),
            array( 'name' => 'Repertoire', 'url' => home_url( '/repertoire/' ) ),
        ),
    );

    nocache_headers();
    header( 'Content-Type: application/manifest+json; charset=utf-8' );
    echo wp_json_encode( $manifest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    exit;
}

add_action( 'plugins_loaded', static function () {
    // Replace only the old PWA head metadata; all editor/web-app functionality stays intact.
    if ( class_exists( 'KP_Owner_Web_App' ) ) {
        remove_action( 'wp_head', array( 'KP_Owner_Web_App', 'web_app_meta' ), 3 );
    }
    add_action( 'wp_head', 'kp_webapp_brand_meta', 3 );

    // Run before the original endpoint so the KP-branded manifest is authoritative.
    add_action( 'template_redirect', 'kp_webapp_brand_manifest', -100 );
}, 100 );
