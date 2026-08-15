<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Owner-friendly editing experience.
 *
 * Keeps the full WordPress editors available, but gives non-technical editors
 * a very small set of obvious everyday actions that also work well on phones.
 */
final class KP_Owner_Experience {
    const PAGE = 'kp-schnell-bearbeiten';

    public static function init() {
        add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ), 20 );
        add_action( 'admin_bar_menu', array( __CLASS__, 'admin_bar' ), 85 );
        add_action( 'init', array( __CLASS__, 'make_shortcode_pages_visual' ), 95 );
    }

    public static function admin_menu() {
        add_submenu_page(
            'kp-puppenspiele',
            'Schnell bearbeiten',
            'Schnell bearbeiten',
            'edit_pages',
            self::PAGE,
            array( __CLASS__, 'page' ),
            1
        );
    }

    public static function admin_bar( $bar ) {
        if ( ! is_admin_bar_showing() || ! current_user_can( 'edit_pages' ) ) { return; }

        $bar->add_node( array(
            'id'    => 'kp-quick-edit',
            'title' => '✏️ Schnell bearbeiten',
            'href'  => admin_url( 'admin.php?page=' . self::PAGE ),
        ) );
        $bar->add_node( array(
            'id'     => 'kp-quick-termin',
            'parent' => 'kp-quick-edit',
            'title'  => 'Termin hinzufügen',
            'href'   => admin_url( 'post-new.php?post_type=kp_termin' ),
        ) );
        if ( current_user_can( 'edit_theme_options' ) ) {
            $bar->add_node( array(
                'id'     => 'kp-quick-design',
                'parent' => 'kp-quick-edit',
                'title'  => 'Website gestalten',
                'href'   => admin_url( 'admin.php?page=kp-website-studio' ),
            ) );
        }
    }

    private static function edit_page_url( $slug ) {
        if ( 'startseite' === $slug ) {
            $front = (int) get_option( 'page_on_front' );
            if ( $front ) {
                $url = get_edit_post_link( $front, 'raw' );
                if ( $url ) { return $url; }
            }
        }
        $page = get_page_by_path( $slug, OBJECT, 'page' );
        if ( $page ) {
            $url = get_edit_post_link( $page->ID, 'raw' );
            if ( $url ) { return $url; }
        }
        return admin_url( 'edit.php?post_type=page' );
    }

    private static function card( $icon, $title, $text, $url, $primary = false ) {
        $class = 'kp-owner-hub-card' . ( $primary ? ' is-primary' : '' );
        ?>
        <a class="<?php echo esc_attr( $class ); ?>" href="<?php echo esc_url( $url ); ?>">
            <span class="dashicons <?php echo esc_attr( $icon ); ?>"></span>
            <strong><?php echo esc_html( $title ); ?></strong>
            <small><?php echo esc_html( $text ); ?></small>
        </a>
        <?php
    }

    public static function page() {
        if ( ! current_user_can( 'edit_pages' ) ) { return; }
        ?>
        <div class="wrap kp-owner-hub">
            <div class="kp-owner-hub-head">
                <div>
                    <span class="kp-owner-kicker">Koblenzer Puppenspiele</span>
                    <h1>Schnell bearbeiten</h1>
                    <p>Die häufigsten Aufgaben ohne Technik-Menüs. Auf dem Handy einfach eine Karte antippen.</p>
                </div>
                <a class="button" href="<?php echo esc_url( home_url( '/' ) ); ?>" target="_blank" rel="noopener">Website ansehen ↗</a>
            </div>

            <div class="kp-owner-steps">
                <div><b>1</b><span><strong>Aufgabe wählen</strong><small>Text, Bild, Termin oder Design</small></span></div>
                <div><b>2</b><span><strong>Direkt bearbeiten</strong><small>anklicken, tippen, ziehen</small></span></div>
                <div><b>3</b><span><strong>Speichern</strong><small>WordPress übernimmt den Rest</small></span></div>
            </div>

            <h2>Am häufigsten</h2>
            <div class="kp-owner-hub-grid">
                <?php self::card( 'dashicons-plus-alt2', 'Termin hinzufügen', 'Stück, Datum, Uhrzeit, Ort und Link eintragen.', admin_url( 'post-new.php?post_type=kp_termin' ), true ); ?>
                <?php self::card( 'dashicons-edit-page', 'Startseite bearbeiten', 'Texte und Blöcke direkt visuell ändern.', self::edit_page_url( 'startseite' ) ); ?>
                <?php self::card( 'dashicons-megaphone', 'Aktuelles bearbeiten', 'Neuigkeiten als echte WordPress-Blöcke ändern.', self::edit_page_url( 'aktuelles' ) ); ?>
                <?php self::card( 'dashicons-format-image', 'Bild hochladen', 'Foto direkt vom Handy oder Computer hochladen.', admin_url( 'media-new.php' ) ); ?>
                <?php self::card( 'dashicons-format-gallery', 'Repertoire', 'Stücke, Texte, Bilder und Angaben pflegen.', admin_url( 'edit.php?post_type=kp_repertoire' ) ); ?>
                <?php self::card( 'dashicons-calendar-alt', 'Alle Termine', 'Vorhandene Vorstellungen ändern, kopieren oder löschen.', admin_url( 'edit.php?post_type=kp_termin' ) ); ?>
            </div>

            <h2>Seiten & Inhalte</h2>
            <div class="kp-owner-hub-grid">
                <?php self::card( 'dashicons-groups', 'Das Theater', 'Ensemble- und Theaterseite visuell bearbeiten.', self::edit_page_url( 'das-theater' ) ); ?>
                <?php self::card( 'dashicons-admin-page', 'Buchungsseite', 'Texte und Hinweise zur Buchung anpassen.', self::edit_page_url( 'jetzt-buchen' ) ); ?>
                <?php self::card( 'dashicons-email', 'Kontaktseite', 'Kontaktseite öffnen; das Formular bleibt geschützt.', self::edit_page_url( 'kontakt' ) ); ?>
                <?php self::card( 'dashicons-admin-page', 'Alle Seiten & Texte', 'Alle normalen WordPress-Seiten anzeigen.', admin_url( 'edit.php?post_type=page' ) ); ?>
                <?php self::card( 'dashicons-plus-alt2', 'Neue Seite', 'Neue Seite anlegen und fertige Theater-Bausteine einsetzen.', admin_url( 'post-new.php?post_type=page' ) ); ?>
                <?php self::card( 'dashicons-admin-media', 'Mediathek', 'Bilder suchen, austauschen oder löschen.', admin_url( 'upload.php' ) ); ?>
            </div>

            <h2>Gestaltung</h2>
            <div class="kp-owner-hub-grid">
                <?php if ( current_user_can( 'edit_theme_options' ) ) : ?>
                    <?php self::card( 'dashicons-admin-customizer', 'Website Studio', 'Farben, Transparenz, Header, Menü und Abstände mit Reglern ändern.', admin_url( 'admin.php?page=kp-website-studio' ), true ); ?>
                    <?php self::card( 'dashicons-menu-alt3', 'Menü sortieren', 'Seiten hinzufügen, entfernen und per Drag & Drop verschieben.', admin_url( 'site-editor.php?path=/navigation' ) ); ?>
                    <?php self::card( 'dashicons-layout', 'Profi-Modus', 'Kompletter WordPress-Site-Editor für freie Layoutänderungen.', admin_url( 'site-editor.php' ) ); ?>
                <?php endif; ?>
            </div>

            <div class="kp-owner-tip">
                <span class="dashicons dashicons-lightbulb"></span>
                <div><strong>Für neue Seiten:</strong> Im Block-Inserter unter <em>Muster → Koblenzer Puppenspiele</em> stehen fertige Bereiche wie „Text + Bild“, „Text + Button“ und „Drei Karten“. Danach lassen sich die Blöcke einfach verschieben und überschreiben.</div>
            </div>
        </div>
        <style id="kp-owner-hub-css">
          .kp-owner-hub{max-width:1180px}.kp-owner-hub-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin:18px 0 20px}.kp-owner-kicker{display:block;margin-bottom:4px;color:#b45309;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.kp-owner-hub h1{margin:0 0 8px;font-size:32px}.kp-owner-hub-head p{max-width:700px;margin:0;color:#50575e;font-size:16px;line-height:1.5}.kp-owner-hub h2{margin:30px 0 12px;font-size:20px}.kp-owner-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.kp-owner-steps>div{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #dcdcde;border-radius:14px;background:#fff}.kp-owner-steps b{display:grid;place-items:center;flex:0 0 34px;height:34px;border-radius:50%;background:#f07a22;color:#fff;font-size:15px}.kp-owner-steps span{display:flex;flex-direction:column;gap:2px}.kp-owner-steps small{color:#646970}.kp-owner-hub-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.kp-owner-hub-card{display:flex;min-height:116px;box-sizing:border-box;flex-direction:column;gap:7px;padding:20px;border:1px solid #dcdcde;border-radius:16px;background:#fff;color:#1d2327;text-decoration:none;box-shadow:0 5px 18px rgba(0,0,0,.04)}.kp-owner-hub-card:hover,.kp-owner-hub-card:focus{border-color:#f07a22;color:#1d2327;box-shadow:0 10px 28px rgba(0,0,0,.08)}.kp-owner-hub-card.is-primary{border-color:#17110e;background:#17110e;color:#fff}.kp-owner-hub-card.is-primary:hover,.kp-owner-hub-card.is-primary:focus{border-color:#f07a22;color:#fff}.kp-owner-hub-card .dashicons{width:28px;height:28px;color:#f07a22;font-size:28px}.kp-owner-hub-card strong{font-size:18px}.kp-owner-hub-card small{color:inherit;font-size:13px;line-height:1.45;opacity:.72}.kp-owner-tip{display:flex;gap:12px;margin:28px 0;padding:18px;border-left:4px solid #f07a22;border-radius:10px;background:#fff7ed;line-height:1.55}.kp-owner-tip .dashicons{color:#f07a22}@media(max-width:960px){.kp-owner-hub-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:782px){.kp-owner-hub{margin-right:10px}.kp-owner-hub-head{flex-direction:column}.kp-owner-hub h1{font-size:27px}.kp-owner-steps,.kp-owner-hub-grid{grid-template-columns:1fr}.kp-owner-hub-card{min-height:92px;padding:17px}.kp-owner-hub-card strong{font-size:17px}.kp-owner-hub-head .button{min-height:44px;display:inline-flex;align-items:center}.kp-owner-tip{font-size:13px}}
        </style>
        <?php
    }

    /** Turn selected shortcode-only pages into real draggable Gutenberg blocks. */
    public static function make_shortcode_pages_visual() {
        $pages = array(
            'aktuelles'     => array( '[kp_aktuelles]', self::aktuelles_blocks() ),
            'jetzt-buchen'  => array( '[kp_booking]', self::booking_blocks() ),
        );

        foreach ( $pages as $slug => $spec ) {
            $page = get_page_by_path( $slug, OBJECT, 'page' );
            if ( ! $page || trim( (string) $page->post_content ) !== $spec[0] ) { continue; }
            wp_update_post( array(
                'ID'           => $page->ID,
                'post_content' => $spec[1],
            ) );
        }
    }

    private static function aktuelles_blocks() {
        return <<<'BLOCKS'
<!-- wp:group {"className":"kp-finish kp-current","layout":{"type":"default"}} -->
<div class="wp-block-group kp-finish kp-current"><!-- wp:paragraph {"className":"kp-finish-kicker"} -->
<p class="kp-finish-kicker">Neu &amp; sehenswert</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Was gerade auf der Bühne passiert</h2>
<!-- /wp:heading -->

<!-- wp:group {"className":"kp-finish-grid kp-finish-grid-3","layout":{"type":"default"}} -->
<div class="wp-block-group kp-finish-grid kp-finish-grid-3"><!-- wp:group {"className":"kp-finish-card","layout":{"type":"default"}} -->
<div class="wp-block-group kp-finish-card"><!-- wp:paragraph {"className":"kp-finish-tag"} --><p class="kp-finish-tag">Neuproduktion 2026</p><!-- /wp:paragraph --><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Zum Glück gibt’s FREUNDE</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Die drei Freunde aus Mullewapp sind als liebevolle, reduzierte Produktion für kleine Theateranfänger*innen unterwegs – flexibel für Kitas, Familienfeste und Festivals.</p><!-- /wp:paragraph --><!-- wp:paragraph --><p><a href="/repertoire/zum-glueck-gibts-freunde/">Zum Stück →</a></p><!-- /wp:paragraph --></div>
<!-- /wp:group -->

<!-- wp:group {"className":"kp-finish-card","layout":{"type":"default"}} -->
<div class="wp-block-group kp-finish-card"><!-- wp:paragraph {"className":"kp-finish-tag"} --><p class="kp-finish-tag">Unterwegs</p><!-- /wp:paragraph --><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Gastspiele &amp; Familienprogramm</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Die Koblenzer Puppenspiele spielen in Kulturhäusern, Bibliotheken, Schulen, Kitas, auf Festivals und bei Veranstaltern in der Region und darüber hinaus.</p><!-- /wp:paragraph --><!-- wp:paragraph --><p><a href="/termine/">Aktuelle Termine →</a></p><!-- /wp:paragraph --></div>
<!-- /wp:group -->

<!-- wp:group {"className":"kp-finish-card","layout":{"type":"default"}} -->
<div class="wp-block-group kp-finish-card"><!-- wp:paragraph {"className":"kp-finish-tag"} --><p class="kp-finish-tag">Für Veranstalter</p><!-- /wp:paragraph --><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Theater kommt zu Ihnen</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Viele Produktionen bringen Bühne, Licht und Ton bereits mit. Für Gruppen, Einrichtungen und Kulturveranstaltungen erstellen wir gern ein passendes Angebot.</p><!-- /wp:paragraph --><!-- wp:paragraph --><p><a href="/jetzt-buchen/">Gastspiel anfragen →</a></p><!-- /wp:paragraph --></div>
<!-- /wp:group --></div>
<!-- /wp:group --></div>
<!-- /wp:group -->
BLOCKS;
    }

    private static function booking_blocks() {
        return <<<'BLOCKS'
<!-- wp:group {"className":"kp-finish kp-booking-page","layout":{"type":"default"}} -->
<div class="wp-block-group kp-finish kp-booking-page"><!-- wp:paragraph {"className":"kp-finish-kicker"} --><p class="kp-finish-kicker">Gastspiel anfragen</p><!-- /wp:paragraph --><!-- wp:heading --><h2 class="wp-block-heading">Figurentheater direkt bei Ihnen</h2><!-- /wp:heading --><!-- wp:paragraph {"className":"kp-finish-lead"} --><p class="kp-finish-lead">Ob Kita, Schule, Kulturhaus, Stadtfest, Bibliothek oder Familienveranstaltung: Senden Sie uns am besten mehrere Wunschtermine, den Ort, die ungefähre Publikumsgröße und – falls schon entschieden – Ihr Wunschstück.</p><!-- /wp:paragraph -->

<!-- wp:group {"className":"kp-finish-grid kp-finish-grid-3","layout":{"type":"default"}} -->
<div class="wp-block-group kp-finish-grid kp-finish-grid-3"><!-- wp:group {"className":"kp-finish-card","layout":{"type":"default"}} --><div class="wp-block-group kp-finish-card"><!-- wp:paragraph --><p><strong>1</strong></p><!-- /wp:paragraph --><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Stück auswählen</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Altersempfehlung, Dauer, Spielweise und technische Anforderungen stehen direkt beim jeweiligen Repertoire-Stück.</p><!-- /wp:paragraph --><!-- wp:paragraph --><p><a href="/repertoire/">Repertoire ansehen →</a></p><!-- /wp:paragraph --></div><!-- /wp:group -->

<!-- wp:group {"className":"kp-finish-card","layout":{"type":"default"}} --><div class="wp-block-group kp-finish-card"><!-- wp:paragraph --><p><strong>2</strong></p><!-- /wp:paragraph --><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Wunschtermine senden</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Mehrere mögliche Termine helfen uns, Ensemble, Aufführungsrechte und Tourenplanung schnell abzugleichen.</p><!-- /wp:paragraph --></div><!-- /wp:group -->

<!-- wp:group {"className":"kp-finish-card","layout":{"type":"default"}} --><div class="wp-block-group kp-finish-card"><!-- wp:paragraph --><p><strong>3</strong></p><!-- /wp:paragraph --><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Individuelles Angebot</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Sie erhalten ein professionelles, transparentes Angebot passend zu Veranstaltung, Gruppengröße und Anfahrt.</p><!-- /wp:paragraph --></div><!-- /wp:group --></div>
<!-- /wp:group -->

<!-- wp:group {"className":"kp-finish-cta","layout":{"type":"flex","flexWrap":"wrap","justifyContent":"space-between"}} -->
<div class="wp-block-group kp-finish-cta"><!-- wp:group {"layout":{"type":"default"}} --><div class="wp-block-group"><!-- wp:paragraph {"className":"kp-finish-tag"} --><p class="kp-finish-tag">Direkter Kontakt</p><!-- /wp:paragraph --><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Ihre Anfrage darf unkompliziert sein.</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Eine kurze Nachricht mit Ort, Anlass, Personenzahl und Wunschzeitraum reicht für den ersten Schritt.</p><!-- /wp:paragraph --></div><!-- /wp:group --><!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button {"className":"kp-finish-button"} --><div class="wp-block-button kp-finish-button"><a class="wp-block-button__link wp-element-button" href="/kontakt/">Kontakt aufnehmen</a></div><!-- /wp:button --></div><!-- /wp:buttons --></div>
<!-- /wp:group --></div>
<!-- /wp:group -->
BLOCKS;
    }
}
