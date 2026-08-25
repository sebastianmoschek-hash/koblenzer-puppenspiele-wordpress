<?php
/**
 * Primary installable web-app agent for the Koblenzer Puppenspiele owner.
 *
 * The web app is now the main maintenance surface. It keeps two primary actions
 * (Bearbeiten / KI) on the visible website and talks directly to the protected
 * WordPress AI + repair endpoints. Android remains optional for local Gemma.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_owner_web_agent_can_use() {
    return is_user_logged_in() && current_user_can( 'edit_pages' );
}

add_filter( 'body_class', static function ( $classes ) {
    if ( kp_owner_web_agent_can_use() ) {
        $classes[] = 'kp-owner-web-agent-enabled';
    }
    return $classes;
} );

add_action( 'wp_enqueue_scripts', static function () {
    if ( is_admin() || ! kp_owner_web_agent_can_use() || ! defined( 'KP_CORE_URL' ) ) { return; }

    $version = ( defined( 'KP_CORE_VERSION' ) ? KP_CORE_VERSION : '1' ) . '-web-agent-20260825-1';

    wp_enqueue_style(
        'kp-owner-web-agent',
        KP_CORE_URL . 'assets/owner-web-agent.css',
        array( 'kp-owner-web-app' ),
        $version
    );
    wp_enqueue_script(
        'kp-owner-web-agent',
        KP_CORE_URL . 'assets/owner-web-agent.js',
        array( 'kp-owner-web-app' ),
        $version,
        true
    );

    $edit_mode = isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    $config = array(
        'ajaxUrl'       => admin_url( 'admin-ajax.php' ),
        'canEdit'       => true,
        'editMode'      => $edit_mode,
        'openAi'        => isset( $_GET['kp_ai'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_ai'] ) ),
        'homeUrl'       => home_url( '/' ),
        'aiNonce'       => defined( 'KP_AI_NONCE' ) ? wp_create_nonce( KP_AI_NONCE ) : '',
        'repairNonce'   => defined( 'KP_AI_REPAIR_NONCE' ) ? wp_create_nonce( KP_AI_REPAIR_NONCE ) : '',
        'aiConnected'   => function_exists( 'kp_ai_key' ) && (bool) kp_ai_key(),
        'repairReady'   => function_exists( 'kp_mobile_emergency_ready' ) && kp_mobile_emergency_ready(),
        'canMerge'      => current_user_can( 'kp_ai_repair_merge' ),
        'maxCiPolls'    => 24,
        'ciPollMs'      => 5000,
    );
    wp_add_inline_script(
        'kp-owner-web-agent',
        'window.KPOwnerWebAgent=' . wp_json_encode( $config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . ';',
        'before'
    );
}, 240 );
