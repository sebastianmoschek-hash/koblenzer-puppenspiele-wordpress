<?php
/**
 * Theme setup for the Koblenzer Puppenspiele Block Theme.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'after_setup_theme', function () {
    add_theme_support( 'wp-block-styles' );
    add_theme_support( 'editor-styles' );
    add_theme_support( 'post-thumbnails' );
    add_editor_style( 'style.css' );
} );

// Run late so the final theme polish can deliberately override the content
// plugin's legacy frontend CSS without relying on brittle load-order luck.
add_action( 'wp_enqueue_scripts', function () {
    $theme = wp_get_theme();
    wp_enqueue_style(
        'koblenzer-puppenspiele-theme',
        get_stylesheet_uri(),
        array(),
        $theme->get( 'Version' )
    );

    $theater_css = get_theme_file_path( 'assets/theater-polish.css' );
    if ( file_exists( $theater_css ) ) {
        wp_enqueue_style(
            'koblenzer-puppenspiele-theater-polish',
            get_theme_file_uri( 'assets/theater-polish.css' ),
            array( 'koblenzer-puppenspiele-theme' ),
            (string) filemtime( $theater_css )
        );
    }

    $finish_css = get_theme_file_path( 'assets/site-finish.css' );
    if ( file_exists( $finish_css ) ) {
        wp_enqueue_style(
            'koblenzer-puppenspiele-site-finish',
            get_theme_file_uri( 'assets/site-finish.css' ),
            array( 'koblenzer-puppenspiele-theme', 'koblenzer-puppenspiele-theater-polish' ),
            (string) filemtime( $finish_css )
        );
    }

    $compat_css = get_theme_file_path( 'assets/compat-overrides.css' );
    if ( file_exists( $compat_css ) ) {
        wp_enqueue_style(
            'koblenzer-puppenspiele-compat-overrides',
            get_theme_file_uri( 'assets/compat-overrides.css' ),
            array( 'koblenzer-puppenspiele-site-finish' ),
            (string) filemtime( $compat_css )
        );
    }

    // Mobile navigation polish is owned by the core plugin. Do not enqueue the
    // older phone-only QA override here: it forced the trigger back to the
    // bottom-right and replaced the floating panel with a full-screen menu.

    $image_fallback = get_theme_file_path( 'assets/image-fallback.js' );
    if ( file_exists( $image_fallback ) ) {
        wp_enqueue_script(
            'koblenzer-puppenspiele-image-fallback',
            get_theme_file_uri( 'assets/image-fallback.js' ),
            array(),
            (string) filemtime( $image_fallback ),
            true
        );
    }
}, 100 );

/**
 * Friendly reusable page building blocks.
 *
 * They show up in the WordPress pattern inserter and give non-technical
 * editors a safe starting point for new pages. Every block stays fully
 * editable and draggable in the normal visual editor.
 */
add_action( 'init', function () {
    register_block_pattern_category(
        'koblenzer-puppenspiele',
        array( 'label' => __( 'Koblenzer Puppenspiele', 'koblenzer-puppenspiele' ) )
    );

    if ( ! function_exists( 'register_block_pattern' ) ) {
        return;
    }

    register_block_pattern(
        'koblenzer-puppenspiele/text-bild',
        array(
            'title'       => __( 'Theater – Text + Bild', 'koblenzer-puppenspiele' ),
            'description' => __( 'Ein einfacher zweispaltiger Bereich mit Text und einem Bild zum Austauschen.', 'koblenzer-puppenspiele' ),
            'categories'  => array( 'koblenzer-puppenspiele' ),
            'content'     => '<!-- wp:group {"align":"wide","style":{"spacing":{"padding":{"top":"2rem","bottom":"2rem"}}},"layout":{"type":"constrained"}} --><div class="wp-block-group alignwide" style="padding-top:2rem;padding-bottom:2rem"><!-- wp:columns {"verticalAlignment":"center"} --><div class="wp-block-columns are-vertically-aligned-center"><!-- wp:column {"verticalAlignment":"center"} --><div class="wp-block-column is-vertically-aligned-center"><!-- wp:heading --><h2 class="wp-block-heading">Überschrift ändern</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Hier den Text anklicken und direkt überschreiben. Absätze, Links und Hervorhebungen lassen sich wie in einem normalen Textprogramm bearbeiten.</p><!-- /wp:paragraph --></div><!-- /wp:column --><!-- wp:column {"verticalAlignment":"center"} --><div class="wp-block-column is-vertically-aligned-center"><!-- wp:image {"sizeSlug":"large","linkDestination":"none"} --><figure class="wp-block-image size-large"><img alt="Bild auswählen oder hierher ziehen"/></figure><!-- /wp:image --></div><!-- /wp:column --></div><!-- /wp:columns --></div><!-- /wp:group -->',
        )
    );

    register_block_pattern(
        'koblenzer-puppenspiele/text-button',
        array(
            'title'       => __( 'Theater – Überschrift + Text + Button', 'koblenzer-puppenspiele' ),
            'description' => __( 'Ein klarer Textbereich mit einem auffälligen Aktionsbutton.', 'koblenzer-puppenspiele' ),
            'categories'  => array( 'koblenzer-puppenspiele' ),
            'content'     => '<!-- wp:group {"align":"wide","className":"kp-cta","style":{"spacing":{"padding":{"top":"2rem","right":"2rem","bottom":"2rem","left":"2rem"}}},"layout":{"type":"constrained"}} --><div class="wp-block-group alignwide kp-cta" style="padding-top:2rem;padding-right:2rem;padding-bottom:2rem;padding-left:2rem"><!-- wp:heading --><h2 class="wp-block-heading">Ihre Überschrift</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Diesen Text einfach anklicken und ändern.</p><!-- /wp:paragraph --><!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button">Button bearbeiten</a></div><!-- /wp:button --></div><!-- /wp:buttons --></div><!-- /wp:group -->',
        )
    );

    register_block_pattern(
        'koblenzer-puppenspiele/drei-karten',
        array(
            'title'       => __( 'Theater – Drei Karten', 'koblenzer-puppenspiele' ),
            'description' => __( 'Drei leicht bearbeitbare Karten für Angebote, Hinweise oder Themen.', 'koblenzer-puppenspiele' ),
            'categories'  => array( 'koblenzer-puppenspiele' ),
            'content'     => '<!-- wp:columns {"align":"wide"} --><div class="wp-block-columns alignwide"><!-- wp:column --><div class="wp-block-column"><!-- wp:group {"className":"kp-card","style":{"spacing":{"padding":{"top":"1.5rem","right":"1.5rem","bottom":"1.5rem","left":"1.5rem"}}},"layout":{"type":"constrained"}} --><div class="wp-block-group kp-card" style="padding-top:1.5rem;padding-right:1.5rem;padding-bottom:1.5rem;padding-left:1.5rem"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Karte 1</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Text anklicken und ändern.</p><!-- /wp:paragraph --></div><!-- /wp:group --></div><!-- /wp:column --><!-- wp:column --><div class="wp-block-column"><!-- wp:group {"className":"kp-card","style":{"spacing":{"padding":{"top":"1.5rem","right":"1.5rem","bottom":"1.5rem","left":"1.5rem"}}},"layout":{"type":"constrained"}} --><div class="wp-block-group kp-card" style="padding-top:1.5rem;padding-right:1.5rem;padding-bottom:1.5rem;padding-left:1.5rem"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Karte 2</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Text anklicken und ändern.</p><!-- /wp:paragraph --></div><!-- /wp:group --></div><!-- /wp:column --><!-- wp:column --><div class="wp-block-column"><!-- wp:group {"className":"kp-card","style":{"spacing":{"padding":{"top":"1.5rem","right":"1.5rem","bottom":"1.5rem","left":"1.5rem"}}},"layout":{"type":"constrained"}} --><div class="wp-block-group kp-card" style="padding-top:1.5rem;padding-right:1.5rem;padding-bottom:1.5rem;padding-left:1.5rem"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Karte 3</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Text anklicken und ändern.</p><!-- /wp:paragraph --></div><!-- /wp:group --></div><!-- /wp:column --></div><!-- /wp:columns -->',
        )
    );
} );

/**
 * Add the everyday editing shortcuts to the simplified Puppenspiele dashboard.
 * This deliberately keeps WordPress' full editors available, but removes the
 * need to hunt for them in the normal admin navigation.
 */
add_action( 'admin_footer-toplevel_page_kp-puppenspiele', function () {
    if ( ! current_user_can( 'edit_pages' ) ) {
        return;
    }

    $aktuelles = get_page_by_path( 'aktuelles' );
    $links = array(
        'pages'      => admin_url( 'edit.php?post_type=page' ),
        'new_page'   => admin_url( 'post-new.php?post_type=page' ),
        'media'      => admin_url( 'media-new.php' ),
        'navigation' => admin_url( 'site-editor.php?path=/navigation' ),
        'studio'     => admin_url( 'admin.php?page=kp-website-studio' ),
        'aktuelles'  => $aktuelles ? get_edit_post_link( $aktuelles->ID, 'raw' ) : admin_url( 'edit.php?post_type=page' ),
    );
    ?>
    <style id="kp-owner-dashboard-polish">
      .kp-owner-heading{margin:32px 0 4px;font-size:22px}.kp-owner-subtitle{margin:0 0 14px;color:#646970;font-size:14px}.kp-owner-howto{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0 6px}.kp-owner-howto>div{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid #dcdcde;border-radius:12px;background:#fff}.kp-owner-howto b{display:grid;place-items:center;flex:0 0 30px;height:30px;border-radius:50%;background:#f07a22;color:#fff}.kp-owner-howto span{font-size:13px;line-height:1.35}.kp-owner-card-new{position:relative}.kp-owner-card-new::after{content:"EINFACH";position:absolute;top:14px;right:14px;padding:3px 7px;border-radius:999px;background:#fff3e8;color:#9a4300;font-size:10px;font-weight:800;letter-spacing:.08em}@media(max-width:782px){.kp-owner-howto{grid-template-columns:1fr}.kp-owner-heading{margin-top:24px}.kp-admin-card{min-height:88px;padding:18px}.kp-admin-card strong{font-size:18px}.kp-owner-card-new::after{top:10px;right:10px}}
    </style>
    <script id="kp-owner-dashboard-shortcuts">
    (() => {
      const grid = document.querySelector('.kp-admin-grid');
      if (!grid || grid.dataset.ownerShortcuts === '1') return;
      grid.dataset.ownerShortcuts = '1';

      const links = <?php echo wp_json_encode( $links ); ?>;
      const wrap = grid.parentElement;
      const heading = document.createElement('h2');
      heading.className = 'kp-owner-heading';
      heading.textContent = 'Tägliche Pflege';
      const subtitle = document.createElement('p');
      subtitle.className = 'kp-owner-subtitle';
      subtitle.textContent = 'Texte, Bilder und Seiten direkt bearbeiten – ohne Technik-Menüs.';
      const howto = document.createElement('div');
      howto.className = 'kp-owner-howto';
      howto.innerHTML = '<div><b>1</b><span><strong>Aufgabe wählen</strong><br>z. B. Text oder Termin</span></div><div><b>2</b><span><strong>Direkt bearbeiten</strong><br>antippen, ziehen, Bild wählen</span></div><div><b>3</b><span><strong>Speichern</strong><br>WordPress übernimmt den Rest</span></div>';

      wrap.insertBefore(heading, grid);
      wrap.insertBefore(subtitle, grid);
      wrap.insertBefore(howto, grid);

      const cards = [
        ['dashicons-edit-page','Seiten & Texte','Startseite, Theater, Kontakt und weitere Seiten bearbeiten',links.pages],
        ['dashicons-plus-alt2','Neue Seite','Neue Seite anlegen und mit Bausteinen per Drag & Drop gestalten',links.new_page],
        ['dashicons-format-image','Bild hochladen','Foto direkt vom Handy oder Computer in die Mediathek laden',links.media],
        ['dashicons-megaphone','Aktuelles ändern','Neuigkeiten auf der Aktuelles-Seite bearbeiten',links.aktuelles],
        ['dashicons-menu-alt3','Menü sortieren','Menüpunkte hinzufügen, entfernen und verschieben',links.navigation],
        ['dashicons-admin-customizer','Website Studio','Farben, Transparenz, Header, Menü und Abstände mit Reglern ändern',links.studio],
      ];

      for (const [icon,title,help,url] of cards) {
        const a = document.createElement('a');
        a.className = 'kp-admin-card kp-owner-card-new';
        a.href = url;
        a.innerHTML = `<span class="dashicons ${icon}"></span><strong>${title}</strong><small>${help}</small>`;
        grid.appendChild(a);
      }
    })();
    </script>
    <?php
} );
