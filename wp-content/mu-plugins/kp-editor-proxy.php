<?php
/**
 * Backwards-compatible proxy bootstrap for the KP editor.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

require_once __DIR__ . '/inc/class-kp-ai-proxy.php';

if ( ! defined( 'KP_AI_PROXY_BOOTSTRAPPED' ) && class_exists( 'KP_AI_Proxy' ) ) {
	define( 'KP_AI_PROXY_BOOTSTRAPPED', true );
	KP_AI_Proxy::init();
}
