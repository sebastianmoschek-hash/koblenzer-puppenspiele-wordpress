<?php
/**
 * Front-end-only capability bridge for the local desktop Homepage AI.
 *
 * The visible owner editor itself is gated by `edit_pages`. On that same
 * front-end edit request we temporarily expose the local desktop AI bridge to
 * the existing repair-capability check. AJAX/admin requests are never widened.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_local_ai_desktop_request_cap( $allcaps, $caps, $args, $user ) {
    if ( is_admin() ) { return $allcaps; }
    if ( function_exists( 'wp_doing_ajax' ) && wp_doing_ajax() ) { return $allcaps; }

    $editor_mode = isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    if ( ! $editor_mode || empty( $allcaps['edit_pages'] ) ) { return $allcaps; }

    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
    if ( str_contains( $ua, 'KoblenzerPuppenspieleTechnician/' ) ) { return $allcaps; }

    if ( in_array( 'kp_ai_repair_code', (array) $caps, true ) ) {
        $allcaps['kp_ai_repair_code'] = true;
    }
    return $allcaps;
}
add_filter( 'user_has_cap', 'kp_local_ai_desktop_request_cap', 10, 4 );

// Harmless staging/runtime probe so the fast lane can verify that WordPress
// actually loaded this MU plugin, not merely that FTP accepted the file.
add_action( 'template_redirect', static function () {
    if ( ! isset( $_GET['kp_desktop_ai_probe'] ) ) { return; }
    nocache_headers();
    header( 'Content-Type: application/json; charset=utf-8' );
    echo wp_json_encode( array(
        'loaded'      => true,
        'version'     => 'desktop-ai-fast-v3',
        'desktopFile' => is_file( WPMU_PLUGIN_DIR . '/kp-local-ai-desktop.php' ),
    ) );
    exit;
}, 0 );
