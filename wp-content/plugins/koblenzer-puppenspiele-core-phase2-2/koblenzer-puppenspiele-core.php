<?php
/**
 * Plugin Name: Koblenzer Puppenspiele – Inhalte & Design
 * Description: Einfache Verwaltung für Inhalte, direkte visuelle Bearbeitung und installierbare Besitzer-Web-App direkt auf der Website.
 * Version: 4.5.29
 * Author: Koblenzer Puppenspiele
 * Requires at least: 6.6
 * Requires PHP: 7.4
 * Text Domain: koblenzer-puppenspiele-core
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'KP_CORE_VERSION', '4.5.29' );
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
require_once KP_CORE_DIR . 'includes/class-kp-bundled-images.php';
require_once KP_CORE_DIR . 'includes/class-kp-final-polish.php';
require_once KP_CORE_DIR . 'includes/class-kp-mobile-menu-glass.php';
require_once KP_CORE_DIR . 'includes/class-kp-mobile-menu-float.php';
require_once KP_CORE_DIR . 'includes/class-kp-mobile-menu-links.php';
require_once KP_CORE_DIR . 'includes/class-kp-website-studio.php';
require_once KP_CORE_DIR . 'includes/class-kp-website-studio-frontend.php';
require_once KP_CORE_DIR . 'includes/class-kp-owner-experience.php';
require_once KP_CORE_DIR . 'includes/class-kp-responsive-sizes.php';
require_once KP_CORE_DIR . 'includes/class-kp-frontend-editor-v2.php';
require_once KP_CORE_DIR . 'includes/class-kp-owner-direct-edit-cta.php';
require_once KP_CORE_DIR . 'includes/class-kp-owner-edit-focus.php';
require_once KP_CORE_DIR . 'includes/class-kp-owner-edit-reliability.php';
require_once KP_CORE_DIR . 'includes/class-kp-owner-save-coordinator.php';
require_once KP_CORE_DIR . 'includes/class-kp-owner-responsive-web.php';
require_once KP_CORE_DIR . 'includes/class-kp-owner-web-app.php';
require_once KP_CORE_DIR . 'includes/class-kp-owner-web-app-extensions.php';
require_once KP_CORE_DIR . 'includes/class-kp-frontend-card-controls.php';
require_once KP_CORE_DIR . 'includes/class-kp-image-position.php';
require_once KP_CORE_DIR . 'includes/class-kp-touch-gestures.php';
require_once KP_CORE_DIR . 'includes/class-kp-touch-free-layout.php';
require_once KP_CORE_DIR . 'includes/class-kp-touch-persistence.php';
require_once KP_CORE_DIR . 'includes/class-kp-touch-editor-bridge.php';
require_once KP_CORE_DIR . 'includes/class-kp-touch-gesture-safety.php';
require_once KP_CORE_DIR . 'includes/class-kp-touch-manual-save-gate.php';
require_once KP_CORE_DIR . 'includes/class-kp-owner-menu-x.php';
require_once KP_CORE_DIR . 'includes/class-kp-design-presets.php';
require_once KP_CORE_DIR . 'includes/class-kp-design-reset-reliability.php';

add_action( 'plugins_loaded', static function () {
    KP_Termine::init();
    KP_Repertoire::init();
    KP_Referenzen::init();
    KP_Ensemble::init();
    KP_Site_Finish::init();
    KP_Contact::init();
    KP_Legal::init();
    KP_Bundled_Images::init();
    KP_Final_Polish::init();
    KP_Mobile_Menu_Glass::init();
    KP_Mobile_Menu_Float::init();
    KP_Mobile_Menu_Links::init();
    KP_Website_Studio::init();
    KP_Website_Studio_Frontend::init();
    KP_Owner_Experience::init();
    KP_Responsive_Sizes::init();
    KP_Frontend_Editor_V2::init();
    KP_Owner_Direct_Edit_CTA::init();
    KP_Owner_Edit_Focus::init();
    KP_Owner_Edit_Reliability::init();
    KP_Owner_Save_Coordinator::init();
    KP_Owner_Responsive_Web::init();
    KP_Owner_Web_App::init();
    KP_Owner_Web_App_Extensions::init();
    KP_Frontend_Card_Controls::init();
    KP_Image_Position::init();
    KP_Touch_Gestures::init();
    KP_Touch_Free_Layout::init();
    KP_Touch_Persistence::init();
    KP_Touch_Editor_Bridge::init();
    KP_Touch_Gesture_Safety::init();
    KP_Touch_Manual_Save_Gate::init();
    KP_Owner_Menu_X::init();
    KP_Design_Presets::init();
    KP_Design_Reset_Reliability::init();
} );
