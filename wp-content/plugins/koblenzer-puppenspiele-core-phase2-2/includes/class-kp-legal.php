<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class KP_Legal {
    const ORIGINAL_IMPRINT = 'https://www.koblenzer-puppenspiele.de/kontakt-impressum.html';

    public static function init() {
        add_action( 'init', array( __CLASS__, 'ensure_pages' ), 65 );
        add_shortcode( 'kp_impressum', array( __CLASS__, 'impressum' ) );
        add_shortcode( 'kp_datenschutz', array( __CLASS__, 'datenschutz' ) );
    }

    public static function ensure_pages() {
        self::ensure_page( 'impressum', 'Impressum', '[kp_impressum]' );
        self::ensure_page( 'datenschutz', 'Datenschutz', '[kp_datenschutz]' );
    }

    private static function ensure_page( $slug, $title, $content ) {
        $page = get_page_by_path( $slug, OBJECT, 'page' );
        if ( ! $page ) {
            wp_insert_post( array(
                'post_type' => 'page',
                'post_status' => 'publish',
                'post_title' => $title,
                'post_name' => $slug,
                'post_content' => $content,
                'comment_status' => 'closed',
            ) );
            return;
        }
        if ( trim( (string) $page->post_content ) === '' ) {
            wp_update_post( array( 'ID' => $page->ID, 'post_content' => $content ) );
        }
    }

    private static function original_imprint_html() {
        $cache = get_transient( 'kp_original_imprint_html' );
        if ( is_string( $cache ) && $cache !== '' ) { return $cache; }

        $response = wp_remote_get( self::ORIGINAL_IMPRINT, array( 'timeout' => 12, 'redirection' => 3 ) );
        if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) { return ''; }
        $html = wp_remote_retrieve_body( $response );
        if ( ! $html ) { return ''; }

        if ( class_exists( 'DOMDocument' ) ) {
            $previous = libxml_use_internal_errors( true );
            $doc = new DOMDocument();
            $doc->loadHTML( '<?xml encoding="utf-8" ?>' . $html );
            $xpath = new DOMXPath( $doc );
            foreach ( $xpath->query( '//script|//style|//nav|//header|//footer|//form|//noscript' ) as $node ) {
                $node->parentNode->removeChild( $node );
            }
            $candidates = array(
                '//*[@id="wsite-content"]',
                '//*[contains(concat(" ", normalize-space(@class), " "), " wsite-section-content ")]',
                '//main',
                '//body',
            );
            $picked = null;
            foreach ( $candidates as $query ) {
                $nodes = $xpath->query( $query );
                if ( $nodes && $nodes->length ) { $picked = $nodes->item( 0 ); break; }
            }
            if ( $picked ) {
                $inner = '';
                foreach ( $picked->childNodes as $child ) { $inner .= $doc->saveHTML( $child ); }
                $html = $inner;
            }
            libxml_clear_errors();
            libxml_use_internal_errors( $previous );
        }

        $html = wp_kses_post( $html );
        if ( strlen( wp_strip_all_tags( $html ) ) > 80 ) {
            set_transient( 'kp_original_imprint_html', $html, 12 * HOUR_IN_SECONDS );
            return $html;
        }
        return '';
    }

    public static function impressum() {
        $original = self::original_imprint_html();
        ob_start(); ?>
        <section class="kp-finish kp-legal-page">
            <p class="kp-finish-kicker">Rechtliches</p>
            <h2>Impressum & Kontaktangaben</h2>
            <p class="kp-finish-lead">Die rechtlichen Angaben werden aus der bestehenden offiziellen Website der Koblenzer Puppenspiele übernommen, damit Kontaktdaten nicht versehentlich abweichen.</p>
            <div class="kp-finish-card kp-legal-card">
                <?php if ( $original ) : ?>
                    <div class="kp-legal-original"><?php echo $original; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></div>
                <?php else : ?>
                    <p>Die Originalangaben konnten gerade nicht automatisch geladen werden.</p>
                    <p><a href="<?php echo esc_url( self::ORIGINAL_IMPRINT ); ?>" target="_blank" rel="noopener">Kontakt / Impressum der bestehenden Website öffnen →</a></p>
                    <?php if ( class_exists( 'KP_Contact' ) && defined( 'KP_CORE_VERSION' ) ) : ?>
                        <p>E-Mail: <a href="mailto:koblenzer-puppenspiele@gmx.de">koblenzer-puppenspiele@gmx.de</a></p>
                    <?php endif; ?>
                <?php endif; ?>
            </div>
        </section>
        <?php return ob_get_clean();
    }

    public static function datenschutz() {
        ob_start(); ?>
        <section class="kp-finish kp-legal-page">
            <p class="kp-finish-kicker">Datenschutz</p>
            <h2>Datenschutzhinweise</h2>
            <p class="kp-finish-lead">Diese Seite beschreibt die technisch tatsächlich verwendeten Funktionen der neuen Website. Verantwortliche Kontaktangaben finden Sie im <a href="/impressum/">Impressum</a>.</p>
            <div class="kp-finish-grid kp-finish-grid-2 kp-legal-grid">
                <article class="kp-finish-card"><h3>Kontaktformular</h3><p>Wenn Sie das Kontaktformular nutzen, werden die von Ihnen eingegebenen Angaben ausschließlich zur Bearbeitung Ihrer Anfrage per E-Mail an die Koblenzer Puppenspiele übermittelt. Das Formular legt keine eigene dauerhafte Kopie Ihrer Nachricht in WordPress an.</p></article>
                <article class="kp-finish-card"><h3>Pflichtangaben</h3><p>Für eine Anfrage werden Name, eine gültige E-Mail-Adresse, Ihre Nachricht und die Bestätigung des Datenschutzhinweises benötigt. Weitere Angaben wie Telefon, Spielort, Einrichtung oder Wunschtermine sind freiwillig.</p></article>
                <article class="kp-finish-card"><h3>Spam-Schutz</h3><p>Das Formular verwendet einen lokalen, unsichtbaren Honeypot und eine WordPress-Sicherheitsprüfung. Dafür wird kein externes CAPTCHA und kein zusätzliches Werbe- oder Tracking-Netzwerk eingebunden.</p></article>
                <article class="kp-finish-card"><h3>Serverbetrieb</h3><p>Beim Aufruf einer Website fallen technisch notwendige Verbindungsdaten beim Webserver an. Umfang und Aufbewahrung dieser Serverprotokolle richten sich nach den Einstellungen des Hosting-Anbieters.</p></article>
            </div>
            <div class="kp-finish-card kp-legal-review"><h3>Hinweis vor der Veröffentlichung</h3><p>Die technische Beschreibung ist auf den aktuellen Staging-Stand abgestimmt. Vor der endgültigen Veröffentlichung sollte die Datenschutzerklärung noch mit den tatsächlich eingesetzten Hosting-, Statistik-, Cookie- und Drittanbieter-Diensten abgeglichen und rechtlich geprüft werden.</p></div>
        </section>
        <?php return ob_get_clean();
    }
}
