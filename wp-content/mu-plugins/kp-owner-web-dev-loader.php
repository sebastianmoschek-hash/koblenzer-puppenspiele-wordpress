<?php
/**
 * Staging-only development asset loader for the primary owner web app.
 *
 * Small browser UI/chat changes can be tested immediately after a GitHub commit
 * without waiting for a full CircleCI deploy. Only three allowlisted JS/CSS
 * assets are proxied from the private feature branch, server-side credentials
 * never reach the browser, and production never enables this loader.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

const KP_OWNER_WEB_DEV_BRANCH = 'feature/webapp-primary-agent';
const KP_OWNER_WEB_DEV_NONCE = 'kp_owner_web_dev_asset';

function kp_owner_web_dev_is_staging() {
    $host = strtolower( (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST ) );
    return 'neu.koblenzer-puppenspiele.de' === $host;
}

function kp_owner_web_dev_ready() {
    return kp_owner_web_dev_is_staging()
        && is_user_logged_in()
        && current_user_can( 'edit_pages' )
        && function_exists( 'kp_ai_repair_gh' )
        && function_exists( 'kp_ai_repair_gh_path' )
        && function_exists( 'kp_ai_repair_token' )
        && (bool) kp_ai_repair_token();
}

function kp_owner_web_dev_assets() {
    $base = 'wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/';
    return array(
        'main-js' => array(
            'path' => $base . 'owner-web-agent.js',
            'type' => 'application/javascript; charset=UTF-8',
        ),
        'fast-chat-js' => array(
            'path' => $base . 'owner-web-agent-fast-chat.js',
            'type' => 'application/javascript; charset=UTF-8',
        ),
        'main-css' => array(
            'path' => $base . 'owner-web-agent.css',
            'type' => 'text/css; charset=UTF-8',
        ),
    );
}

function kp_owner_web_dev_asset_url( $asset ) {
    return add_query_arg(
        array(
            'action' => 'kp_owner_web_dev_asset',
            'asset'  => $asset,
            'nonce'  => wp_create_nonce( KP_OWNER_WEB_DEV_NONCE ),
            'v'      => time(),
        ),
        admin_url( 'admin-ajax.php' )
    );
}

add_filter( 'script_loader_src', static function ( $src, $handle ) {
    if ( ! kp_owner_web_dev_ready() ) { return $src; }
    if ( 'kp-owner-web-agent' === $handle ) {
        return kp_owner_web_dev_asset_url( 'main-js' );
    }
    if ( 'kp-owner-web-agent-fast-chat' === $handle ) {
        return kp_owner_web_dev_asset_url( 'fast-chat-js' );
    }
    return $src;
}, 999, 2 );

add_filter( 'style_loader_src', static function ( $src, $handle ) {
    if ( ! kp_owner_web_dev_ready() || 'kp-owner-web-agent' !== $handle ) { return $src; }
    return kp_owner_web_dev_asset_url( 'main-css' );
}, 999, 2 );

add_action( 'wp_ajax_kp_owner_web_dev_asset', static function () {
    if ( ! kp_owner_web_dev_is_staging() || ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) {
        status_header( 403 );
        exit;
    }
    check_ajax_referer( KP_OWNER_WEB_DEV_NONCE, 'nonce' );

    $asset = isset( $_GET['asset'] ) ? sanitize_key( wp_unslash( $_GET['asset'] ) ) : '';
    $assets = kp_owner_web_dev_assets();
    if ( ! isset( $assets[ $asset ] ) ) {
        status_header( 404 );
        exit;
    }
    if ( ! function_exists( 'kp_ai_repair_gh' ) || ! function_exists( 'kp_ai_repair_gh_path' ) || ! function_exists( 'kp_ai_repair_token' ) || ! kp_ai_repair_token() ) {
        status_header( 503 );
        exit;
    }

    try {
        $record = $assets[ $asset ];
        $response = kp_ai_repair_gh(
            'GET',
            '/contents/' . kp_ai_repair_gh_path( $record['path'] ) . '?ref=' . rawurlencode( KP_OWNER_WEB_DEV_BRANCH ),
            null,
            array( 200 )
        );
        $content = base64_decode( (string) ( $response['data']['content'] ?? '' ), true );
        if ( false === $content ) {
            throw new RuntimeException( 'GitHub-Asset konnte nicht dekodiert werden.' );
        }

        nocache_headers();
        header( 'Content-Type: ' . $record['type'] );
        header( 'Cache-Control: private, no-store, max-age=0' );
        header( 'X-Content-Type-Options: nosniff' );
        echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- trusted allowlisted source file.
        exit;
    } catch ( Throwable $e ) {
        status_header( 502 );
        header( 'Content-Type: text/plain; charset=UTF-8' );
        echo 'Staging-Dev-Asset konnte nicht geladen werden.';
        exit;
    }
} );
