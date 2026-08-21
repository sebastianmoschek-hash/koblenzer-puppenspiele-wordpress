<?php
/**
 * Plugin Name: Koblenzer Puppenspiele – Inhalte & Design
 * Description: Einfache Verwaltung für Inhalte, direkte visuelle Bearbeitung und installierbare Besitzer-Web-App direkt auf der Website.
 * Version: 4.5.14
 * Author: Koblenzer Puppenspiele
 * Requires at least: 6.6
 * Requires PHP: 7.4
 * Text Domain: koblenzer-puppenspiele-core
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'KP_CORE_VERSION', '4.5.14' );
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
require_once KP_CORE_DIR . 'includes/class-kp-frontend-card-controls.php';
require_once KP_CORE_DIR . 'includes/class-kp-owner-web-app.php';
require_once KP_CORE_DIR . 'includes/class-kp-owner-responsive-web.php';
require_once KP_CORE_DIR . 'includes/class-kp-owner-menu-x.php';
require_once KP_CORE_DIR . 'includes/class-kp-design-presets.php';
require_once KP_CORE_DIR . 'includes/class-kp-google-calendar-import.php';
require_once KP_CORE_DIR . 'includes/class-kp-calendar-owner-ui.php';
require_once KP_CORE_DIR . 'includes/class-kp-ticket-display.php';
require_once KP_CORE_DIR . 'includes/class-kp-social-menu-extensions.php';
require_once KP_CORE_DIR . 'includes/class-kp-instagram-profile-migration.php';
require_once KP_CORE_DIR . 'includes/class-kp-social-studio-clarity.php';
require_once KP_CORE_DIR . 'includes/class-kp-image-position.php';
require_once KP_CORE_DIR . 'includes/class-kp-owner-web-app-extensions.php';
require_once KP_CORE_DIR . 'includes/class-kp-touch-gestures.php';
require_once KP_CORE_DIR . 'includes/class-kp-touch-free-layout.php';
require_once KP_CORE_DIR . 'includes/class-kp-touch-manual-save.php';
require_once KP_CORE_DIR . 'includes/class-kp-touch-persistence.php';
require_once KP_CORE_DIR . 'includes/class-kp-home-landing-template.php';

add_action( 'plugins_loaded', static function () {
    KP_Bundled_Images::init();
    KP_Termine::instance();
    KP_Repertoire::instance();
    KP_Referenzen::init();
    KP_Ensemble::init();
    KP_Site_Finish::init();
    KP_Contact::init();
    KP_Legal::init();
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
    KP_Frontend_Card_Controls::init();
    KP_Owner_Web_App::init();
    KP_Owner_Responsive_Web::init();
    KP_Owner_Menu_X::init();
    KP_Design_Presets::init();
    KP_Google_Calendar_Import::init();
    KP_Calendar_Owner_UI::init();
    KP_Ticket_Display::init();
    KP_Social_Menu_Extensions::init();
    KP_Instagram_Profile_Migration::init();
    KP_Social_Studio_Clarity::init();
    KP_Image_Position::init();
    KP_Owner_Web_App_Extensions::init();
    KP_Touch_Gestures::init();
    KP_Touch_Free_Layout::init();
    KP_Touch_Manual_Save::init();
    KP_Touch_Persistence::init();
    KP_Home_Landing_Template::init();
} );

/* The old dashboard remains a technical fallback. Normal owner work now starts
 * on the visible website; this admin shortcut is deliberately kept only for
 * emergency/professional access if WordPress itself ever needs maintenance. */
add_action( 'admin_footer-toplevel_page_kp-puppenspiele', static function () {
    if ( ! current_user_can( 'edit_theme_options' ) ) {
        return;
    }
    $studio_url = admin_url( 'admin.php?page=kp-website-studio' );
    ?>
    <script id="kp-studio-dashboard-shortcut">
    (() => {
      const cards = [...document.querySelectorAll('.kp-admin-card')];
      const card = cards.find((item) => item.querySelector('strong')?.textContent.trim() === 'Website gestalten');
      if (!card) return;
      card.href = <?php echo wp_json_encode( $studio_url ); ?>;
      const title = card.querySelector('strong');
      const help = card.querySelector('small');
      if (title) title.textContent = 'Website Studio';
      if (help) help.textContent = 'Technische Reserve – die normale Gestaltung läuft direkt auf der Website';
    })();
    </script>
    <?php
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
