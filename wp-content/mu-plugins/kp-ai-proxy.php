<?php
/**
 * Bootstrap the central AI proxy endpoint.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

require_once __DIR__ . '/inc/class-kp-ai-proxy.php';

KP_AI_Proxy::init();
