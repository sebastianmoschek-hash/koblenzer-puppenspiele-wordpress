<?php
/**
 * Legacy wp_ajax_kp_ai_plan hook kept as a thin alias to the central proxy.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

require_once __DIR__ . '/kp-ai-proxy.php';

add_action( 'wp_ajax_kp_ai_plan', static function () {
    KP_AI_Proxy::ajax_proxy();
}, 1 );
