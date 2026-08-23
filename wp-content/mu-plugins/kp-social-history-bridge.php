<?php
/**
 * Include Social & Instagram saves in the owner's 48-hour safety history.
 * Social values live inside kp_website_studio, which KP_Owner_History already
 * snapshots; this hook only ensures a Social-only orange Save creates the
 * checkpoint and participates in the same kp_history_group transaction.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_ajax_kp_owner_social_menu_save', static function () {
    if ( class_exists( 'KP_Owner_History' ) ) {
        KP_Owner_History::checkpoint( 'Social geändert' );
    }
}, 1 );
