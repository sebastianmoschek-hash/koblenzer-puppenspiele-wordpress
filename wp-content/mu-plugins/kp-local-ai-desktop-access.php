<?php
/**
 * Front-end-only capability bridge for the local desktop Homepage AI.
 *
 * The local Chrome helper should be visible to logged-in homepage editors even
 * when their role does not carry the protected server-side repair capability.
 * This bridge exists only while wp_footer callbacks render. It does not persist
 * a capability and is therefore absent from AJAX/REST repair requests.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_local_ai_desktop_footer_cap( $allcaps, $caps, $args, $user ) {
    if ( ! is_user_logged_in() || is_admin() ) { return $allcaps; }
    if ( function_exists( 'wp_doing_ajax' ) && wp_doing_ajax() ) { return $allcaps; }

    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
    if ( str_contains( $ua, 'KoblenzerPuppenspieleTechnician/' ) ) { return $allcaps; }

    $editor_mode = isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    if ( empty( $allcaps['edit_pages'] ) && ! $editor_mode ) { return $allcaps; }

    if ( in_array( 'kp_ai_repair_code', (array) $caps, true ) ) {
        $allcaps['kp_ai_repair_code'] = true;
    }
    return $allcaps;
}

add_action( 'wp_footer', static function () {
    add_filter( 'user_has_cap', 'kp_local_ai_desktop_footer_cap', 10, 4 );
}, 1 );

add_action( 'wp_footer', static function () {
    remove_filter( 'user_has_cap', 'kp_local_ai_desktop_footer_cap', 10 );
}, 999 );
