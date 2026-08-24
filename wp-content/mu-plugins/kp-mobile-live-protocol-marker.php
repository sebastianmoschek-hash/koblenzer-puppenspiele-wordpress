<?php
/** Safe public marker for verifying which Gemini Live bootstrap is deployed on staging. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
add_action( 'init', static function () {
    if ( ! isset( $_GET['kp_mobile_live_protocol'] ) ) { return; }
    nocache_headers();
    wp_send_json_success( array(
        'protocol' => 'v1beta-u1',
        'tokenMode' => 'ephemeral-one-use-unconstrained',
    ) );
}, 0 );
