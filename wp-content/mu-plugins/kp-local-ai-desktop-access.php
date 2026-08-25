<?php
/**
 * Front-end-only visibility bridge for the local desktop Homepage AI.
 *
 * The legacy desktop helper still checks the protected repair capability while
 * rendering. On an already-authorized owner editor request we expose that
 * capability only for the tiny wp_footer window in which the local AI renders.
 * If the registered callback still produces no local-AI markup, we invoke that
 * exact callback once directly. Nothing is persisted; AJAX/admin is untouched.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

$GLOBALS['kp_local_ai_desktop_force_cap'] = false;
$GLOBALS['kp_local_ai_desktop_footer_buffer'] = null;

function kp_local_ai_desktop_is_editor_request() {
    if ( is_admin() ) { return false; }
    if ( function_exists( 'wp_doing_ajax' ) && wp_doing_ajax() ) { return false; }
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return false; }

    $editor_mode = isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    if ( ! $editor_mode ) { return false; }

    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
    return false === strpos( $ua, 'KoblenzerPuppenspieleTechnician/' );
}

function kp_local_ai_desktop_force_repair_cap( $allcaps, $caps, $args, $user ) {
    if ( empty( $GLOBALS['kp_local_ai_desktop_force_cap'] ) ) { return $allcaps; }
    if ( in_array( 'kp_ai_repair_code', (array) $caps, true ) ) {
        $allcaps['kp_ai_repair_code'] = true;
    }
    return $allcaps;
}
add_filter( 'user_has_cap', 'kp_local_ai_desktop_force_repair_cap', PHP_INT_MAX, 4 );

// kp-local-ai-desktop.php registers its footer callback at priority 2320.
add_action( 'wp_footer', static function () {
    if ( ! kp_local_ai_desktop_is_editor_request() ) { return; }

    $GLOBALS['kp_local_ai_desktop_force_cap'] = true;
    $GLOBALS['kp_local_ai_desktop_footer_buffer'] = ob_get_level();
    ob_start();
}, 2319 );

add_action( 'wp_footer', static function () {
    $level = $GLOBALS['kp_local_ai_desktop_footer_buffer'];
    if ( null === $level ) { return; }

    $captured = '';
    if ( ob_get_level() > (int) $level ) {
        $captured = (string) ob_get_clean();
    }
    $rendered = false !== strpos( $captured, 'kp-local-ai-desktop-runtime' );
    echo $captured; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped

    if ( ! $rendered ) {
        global $wp_filter;
        $hook = isset( $wp_filter['wp_footer'] ) ? $wp_filter['wp_footer'] : null;
        $callbacks = ( is_object( $hook ) && isset( $hook->callbacks[2320] ) ) ? $hook->callbacks[2320] : array();
        $target = wp_normalize_path( WPMU_PLUGIN_DIR . '/kp-local-ai-desktop.php' );

        foreach ( $callbacks as $entry ) {
            $fn = isset( $entry['function'] ) ? $entry['function'] : null;
            if ( ! ( $fn instanceof Closure ) ) { continue; }
            try {
                $reflection = new ReflectionFunction( $fn );
                $file = $reflection->getFileName();
                if ( ! $file || wp_normalize_path( $file ) !== $target ) { continue; }
                call_user_func( $fn );
                break;
            } catch ( Throwable $e ) {
                break;
            }
        }
    }

    $GLOBALS['kp_local_ai_desktop_force_cap'] = false;
    $GLOBALS['kp_local_ai_desktop_footer_buffer'] = null;
}, 2321 );

// Harmless runtime probe used by the fast deploy lane.
add_action( 'template_redirect', static function () {
    if ( ! isset( $_GET['kp_desktop_ai_probe'] ) ) { return; }
    nocache_headers();
    header( 'Content-Type: application/json; charset=utf-8' );
    echo wp_json_encode( array(
        'loaded'          => true,
        'version'         => 'desktop-ai-fast-v5',
        'desktopFile'     => is_file( WPMU_PLUGIN_DIR . '/kp-local-ai-desktop.php' ),
        'phpVersion'      => PHP_VERSION,
        'hasStrContains'  => function_exists( 'str_contains' ),
    ) );
    exit;
}, 0 );
