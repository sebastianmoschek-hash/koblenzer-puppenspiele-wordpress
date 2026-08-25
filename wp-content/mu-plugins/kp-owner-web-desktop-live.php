<?php
/**
 * Desktop Chrome local-live companion.
 *
 * Android keeps using KPLocalLive. Desktop Chrome uses getDisplayMedia and a
 * loopback-only helper (Ollama/Gemma) without consuming Gemini/OpenAI AI APIs.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

const KP_OWNER_DESKTOP_LIVE_BRANCH = 'feature/webapp-primary-agent';
const KP_OWNER_DESKTOP_LIVE_NONCE = 'kp_owner_desktop_live_asset';

function kp_owner_desktop_live_can_use() {
    return is_user_logged_in() && current_user_can( 'edit_pages' );
}

function kp_owner_desktop_live_is_staging() {
    $host = strtolower( (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST ) );
    return 'neu.koblenzer-puppenspiele.de' === $host;
}

add_action( 'wp_enqueue_scripts', static function () {
    if ( is_admin() || ! kp_owner_desktop_live_can_use() || ! defined( 'KP_CORE_URL' ) ) { return; }

    wp_enqueue_script(
        'kp-owner-web-desktop-live',
        KP_CORE_URL . 'assets/owner-web-agent-desktop-live.js',
        array( 'kp-owner-web-agent-fast-chat' ),
        ( defined( 'KP_CORE_VERSION' ) ? KP_CORE_VERSION : '1' ) . '-desktop-live-20260825-1',
        true
    );
}, 245 );

/**
 * Chrome 2026 Local Network Access may gate loopback requests behind a browser
 * permission. Keep the top-level document eligible for that permission.
 */
add_action( 'send_headers', static function () {
    if ( kp_owner_desktop_live_can_use() ) {
        header( 'Permissions-Policy: loopback-network=(self), on-device-speech-recognition=(self)' );
    }
}, 20 );

/**
 * On staging the new browser asset is read directly from the feature branch,
 * preserving the fast commit -> reload development loop.
 */
add_filter( 'script_loader_src', static function ( $src, $handle ) {
    if ( 'kp-owner-web-desktop-live' !== $handle || ! kp_owner_desktop_live_is_staging() ) { return $src; }
    if ( ! function_exists( 'kp_ai_repair_token' ) || ! kp_ai_repair_token() ) { return $src; }
    return add_query_arg(
        array(
            'action' => 'kp_owner_desktop_live_asset',
            'nonce'  => wp_create_nonce( KP_OWNER_DESKTOP_LIVE_NONCE ),
            'v'      => time(),
        ),
        admin_url( 'admin-ajax.php' )
    );
}, 1001, 2 );

add_action( 'wp_ajax_kp_owner_desktop_live_asset', static function () {
    if ( ! kp_owner_desktop_live_is_staging() || ! kp_owner_desktop_live_can_use() ) {
        status_header( 403 );
        exit;
    }
    check_ajax_referer( KP_OWNER_DESKTOP_LIVE_NONCE, 'nonce' );
    if ( ! function_exists( 'kp_ai_repair_gh' ) || ! function_exists( 'kp_ai_repair_gh_path' ) || ! function_exists( 'kp_ai_repair_token' ) || ! kp_ai_repair_token() ) {
        status_header( 503 );
        exit;
    }

    $path = 'wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/owner-web-agent-desktop-live.js';
    try {
        $response = kp_ai_repair_gh(
            'GET',
            '/contents/' . kp_ai_repair_gh_path( $path ) . '?ref=' . rawurlencode( KP_OWNER_DESKTOP_LIVE_BRANCH ),
            null,
            array( 200 )
        );
        $content = base64_decode( (string) ( $response['data']['content'] ?? '' ), true );
        if ( false === $content ) {
            throw new RuntimeException( 'Desktop-Live-Asset konnte nicht dekodiert werden.' );
        }
        nocache_headers();
        header( 'Content-Type: application/javascript; charset=UTF-8' );
        header( 'Cache-Control: private, no-store, max-age=0' );
        header( 'X-Content-Type-Options: nosniff' );
        echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- allowlisted source file.
        exit;
    } catch ( Throwable $e ) {
        status_header( 502 );
        header( 'Content-Type: text/plain; charset=UTF-8' );
        echo 'Desktop-Live-Asset konnte nicht geladen werden.';
        exit;
    }
} );
