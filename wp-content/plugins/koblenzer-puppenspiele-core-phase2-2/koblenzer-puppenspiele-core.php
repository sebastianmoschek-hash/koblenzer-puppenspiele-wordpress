<?php
/**
 * Plugin Name: Koblenzer Puppenspiele – Inhalte & Design
 * Description: Einfache Verwaltung für Inhalte sowie ein mobiles Website Studio und direkte visuelle Bearbeitung auf der Website.
 * Version: 4.0.3
 * Author: Koblenzer Puppenspiele
 * Requires at least: 6.6
 * Requires PHP: 7.4
 * Text Domain: koblenzer-puppenspiele-core
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'KP_CORE_VERSION', '4.0.3' );
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
require_once KP_CORE_DIR . 'includes/class-kp-frontend-editor.php';

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
    KP_Frontend_Editor::init();
} );

/* The small runtime also runs for normal visitors so saved visual changes in
 * dynamic shortcode areas and saved section order are applied. The compatibility
 * helper preserves every existing appointment status. The inline helper loads
 * after the base editor and turns ordinary text clicks into Word-like editing
 * without opening the large design panel automatically. */
add_action( 'wp_enqueue_scripts', static function () {
    wp_enqueue_script( 'kp-frontend-editor-compat', KP_CORE_URL . 'assets/frontend-editor-compat.js', array(), KP_CORE_VERSION, true );
    wp_enqueue_script( 'kp-frontend-editor', KP_CORE_URL . 'assets/frontend-editor.js', array( 'kp-frontend-editor-compat' ), KP_CORE_VERSION, true );
    wp_enqueue_script( 'kp-frontend-editor-inline', KP_CORE_URL . 'assets/frontend-editor-inline.js', array( 'kp-frontend-editor' ), KP_CORE_VERSION, true );
}, 40 );

/* Make the page-specific editor config available before footer scripts execute.
 * KP_Frontend_Editor also refreshes the config late in wp_footer; repeating this
 * assignment is harmless and keeps the runtime reliable with different themes. */
add_action( 'wp_footer', array( 'KP_Frontend_Editor', 'frontend_bootstrap' ), 5 );

/* On the simplified Puppenspiele dashboard, the existing "Website gestalten"
 * card should lead to the friendly Studio instead of dropping non-technical
 * editors straight into WordPress' advanced Site Editor. The advanced editor
 * remains available from the Studio under "Profi-Modus". */
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
      if (help) help.textContent = 'Farben, Menü, Header und Layout – einfach mit Reglern';
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