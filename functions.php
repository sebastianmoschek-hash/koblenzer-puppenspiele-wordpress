<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }
add_action( 'init', function () {
    register_block_pattern_category(
        'koblenzer-puppenspiele',
        array( 'label' => __( 'Koblenzer Puppenspiele', 'koblenzer-puppenspiele' ) )
    );
} );
