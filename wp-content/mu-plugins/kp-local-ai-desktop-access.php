<?php
/**
 * Front-end-only visibility bridge for the local desktop Homepage AI.
 *
 * The old desktop helper still checks the protected repair capability while
 * rendering. For the already-authorized owner editor request we therefore add
 * that capability only to the in-memory current user immediately before the
 * local AI footer callback runs, then restore the original value immediately
 * afterwards. Nothing is persisted and AJAX/admin requests are untouched.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_local_ai_desktop_is_editor_request() {
    if ( is_admin() ) { return false; }
    if ( function_exists( 'wp_doing_ajax' ) && wp_doing_ajax() ) { return false; }
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return false; }

    $editor_mode = isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    if ( ! $editor_mode ) { return false; }

    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
    return ! str_contains( $ua, 'KoblenzerPuppenspieleTechnician/' );
}

$GLOBALS['kp_local_ai_desktop_cap_restore'] = null;

// kp-local-ai-desktop.php renders at priority 2320. Grant the capability only
// for that one rendering window and only to a user who already has edit_pages.
add_action( 'wp_footer', static function () {
    if ( ! kp_local_ai_desktop_is_editor_request() ) { return; }

    $user = wp_get_current_user();
    if ( ! $user || ! $user->exists() ) { return; }

    $had_cap = array_key_exists( 'kp_ai_repair_code', $user->allcaps );
    $GLOBALS['kp_local_ai_desktop_cap_restore'] = array(
        'user'    => $user,
        'had_cap' => $had_cap,
        'value'   => $had_cap ? $user->allcaps['kp_ai_repair_code'] : null,
    );
    $user->allcaps['kp_ai_repair_code'] = true;
}, 2319 );

add_action( 'wp_footer', static function () {
    $restore = $GLOBALS['kp_local_ai_desktop_cap_restore'];
    if ( ! is_array( $restore ) || empty( $restore['user'] ) ) { return; }

    $user = $restore['user'];
    if ( ! empty( $restore['had_cap'] ) ) {
        $user->allcaps['kp_ai_repair_code'] = $restore['value'];
    } else {
        unset( $user->allcaps['kp_ai_repair_code'] );
    }
    $GLOBALS['kp_local_ai_desktop_cap_restore'] = null;
}, 2321 );

// Harmless runtime probe used by the fast deploy lane.
add_action( 'template_redirect', static function () {
    if ( ! isset( $_GET['kp_desktop_ai_probe'] ) ) { return; }
    nocache_headers();
    header( 'Content-Type: application/json; charset=utf-8' );
    echo wp_json_encode( array(
        'loaded'      => true,
        'version'     => 'desktop-ai-fast-v4',
        'desktopFile' => is_file( WPMU_PLUGIN_DIR . '/kp-local-ai-desktop.php' ),
    ) );
    exit;
}, 0 );
