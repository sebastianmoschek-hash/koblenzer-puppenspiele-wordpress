<?php
/** Public, non-secret capability marker for local-AI deployment verification. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

const KP_LOCAL_AI_VERSION = 'local-first-v1';

add_action( 'template_redirect', static function () {
    if ( ! isset( $_GET['kp_local_ai_marker'] ) || '1' !== sanitize_text_field( wp_unslash( $_GET['kp_local_ai_marker'] ) ) ) { return; }
    wp_send_json( array(
        'version'        => KP_LOCAL_AI_VERSION,
        'primaryMode'    => 'local-chat',
        'desktopLocalAi' => true,
        'androidLocalAi' => true,
        'cloudModel'     => false,
        'emergencyGemini'=> 'handoff-only',
    ) );
} );
