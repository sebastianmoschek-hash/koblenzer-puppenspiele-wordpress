<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }
if ( ! defined( 'KP_OPENROUTER_API_KEY' ) ) {
    define( 'KP_OPENROUTER_API_KEY', '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' );
}
if ( ! defined( 'KP_OR_MODEL' ) ) {
    define( 'KP_OR_MODEL', 'meta-llama/llama-4-scout:free' );
}
if ( ! defined( 'KP_OR_MODEL_FALLBACK' ) ) {
    define( 'KP_OR_MODEL_FALLBACK', 'qwen/qwen2.5-vl-7b-instruct:free' );
}
