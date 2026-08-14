<?php
/**
 * Plugin Name: Koblenzer Puppenspiele – Inhalte
 * Description: Einfache Verwaltung für Termine, Repertoire, Referenzen und Ensemble der Koblenzer Puppenspiele.
 * Version: 3.4.1
 * Author: Koblenzer Puppenspiele
 * Requires at least: 6.6
 * Requires PHP: 7.4
 * Text Domain: koblenzer-puppenspiele-core
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'KP_CORE_VERSION', '3.4.1' );
define( 'KP_CORE_FILE', __FILE__ );
define( 'KP_CORE_DIR', plugin_dir_path( __FILE__ ) );
define( 'KP_CORE_URL', plugin_dir_url( __FILE__ ) );

require_once KP_CORE_DIR . 'includes/class-kp-termine.php';
require_once KP_CORE_DIR . 'includes/class-kp-repertoire.php';
require_once KP_CORE_DIR . 'includes/class-kp-referenzen.php';
require_once KP_CORE_DIR . 'includes/class-kp-ensemble.php';
require_once KP_CORE_DIR . 'includes/class-kp-site-finish.php';
require_once KP_CORE_DIR . 'includes/class-kp-contact.php';
require_once KP_CORE_DIR . 'includes/class-kp-legal.php';

add_action( 'plugins_loaded', static function () {
    KP_Termine::instance();
    KP_Repertoire::instance();
    KP_Referenzen::init();
    KP_Ensemble::init();
    KP_Site_Finish::init();
    KP_Contact::init();
    KP_Legal::init();
} );

add_action( 'init', static function () {
    KP_Referenzen::ensure_references_page();
}, 30 );

register_activation_hook( __FILE__, static function () {
    KP_Termine::instance()->register_post_type();
    KP_Repertoire::instance()->register_post_type();
    KP_Referenzen::register_post_type();
    KP_Ensemble::register_post_type();
    KP_Referenzen::ensure_references_page();
    KP_Site_Finish::ensure_pages();
    KP_Legal::ensure_pages();
    flush_rewrite_rules();
} );
