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
            wp_insert_post( array( 'post_type'=>'page','post_status'=>'publish','post_title'=>$title,'post_name'=>$slug,'post_content'=>$content,'comment_status'=>'closed' ) );
        } elseif ( trim( (string) $page->post_content ) === '' ) {
            wp_update_post( array( 'ID'=>$page->ID,'post_content'=>$content ) );
        }
    }

    private static function original_imprint_html() {
        $cache=get_transient('kp_original_imprint_html');
        if(is_string($cache)&&$cache!=='') return $cache;
        $response=wp_remote_get(self::ORIGINAL_IMPRINT,array('timeout'=>12,'redirection'=>3));
        if(is_wp_error($response)||200!==(int)wp_remote_retrieve_response_code($response)) return '';
        $html=(string)wp_remote_retrieve_body($response);
        if(!$html) return '';
        if(class_exists('DOMDocument')){
            $previous=libxml_use_internal_errors(true); $doc=new DOMDocument(); $doc->loadHTML('<?xml encoding="utf-8" ?>'.$html); $xpath=new DOMXPath($doc);
            foreach($xpath->query('//script|//style|//nav|//header|//footer|//form|//noscript') as $node){$node->parentNode->removeChild($node);}
            $picked=null; foreach(array('//*[@id="wsite-content"]','//*[contains(concat(" ", normalize-space(@class), " "), " wsite-section-content ")]','//main','//body') as $query){$nodes=$xpath->query($query);if($nodes&&$nodes->length){$picked=$nodes->item(0);break;}}
            if($picked){$inner='';foreach($picked->childNodes as $child){$inner.=$doc->saveHTML($child);} $html=$inner;}
            libxml_clear_errors();libxml_use_internal_errors($previous);
        }
        $html=wp_kses_post($html);
        if(strlen(wp_strip_all_tags($html))>80){set_transient('kp_original_imprint_html',$html,12*HOUR_IN_SECONDS);return $html;}
        return '';
    }

    public static function impressum() {
        $original=self::original_imprint_html(); ob_start(); ?>
        <section class="kp-finish kp-legal-page"><p class="kp-finish-kicker">Rechtliches</p><h2>Impressum & Kontaktangaben</h2><p class="kp-finish-lead">Die Angaben werden direkt aus der bestehenden offiziellen Website übernommen, damit Namen, Anschrift und Kontaktwege nicht versehentlich abweichen.</p><div class="kp-finish-card kp-legal-card">
        <?php if($original):?><div class="kp-legal-original"><?php echo $original; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></div><?php else:?><p>Die Originalangaben konnten gerade nicht automatisch geladen werden. Es werden deshalb bewusst keine unbestätigten Kontaktdaten angezeigt.</p><p><a href="<?php echo esc_url(self::ORIGINAL_IMPRINT);?>" target="_blank" rel="noopener">Kontakt / Impressum der bestehenden Website öffnen →</a></p><?php endif;?>
        </div></section><?php return ob_get_clean();
    }

    public static function datenschutz() {
        ob_start(); ?>
        <section class="kp-finish kp-legal-page"><p class="kp-finish-kicker">Datenschutz</p><h2>Datenschutzhinweise</h2><p class="kp-finish-lead">Diese Hinweise dokumentieren den aktuellen technischen Stand der neuen Website. Verantwortliche Kontaktdaten stehen im <a href="/impressum/">Impressum</a>.</p><div class="kp-finish-grid kp-finish-grid-2 kp-legal-grid">
        <article class="kp-finish-card"><h3>Kontaktformular</h3><p>Formularangaben werden zur Bearbeitung der Anfrage per E-Mail übermittelt. Das Formular speichert selbst keine dauerhafte Kopie der Nachricht in WordPress.</p></article>
        <article class="kp-finish-card"><h3>Spam-Schutz</h3><p>Zum Schutz gegen automatisierte Einsendungen werden eine lokale WordPress-Sicherheitsprüfung und ein unsichtbares Honeypot-Feld verwendet. Es ist kein externes CAPTCHA eingebunden.</p></article>
        </div><div class="kp-finish-card kp-legal-review"><h3>Vor Produktionsfreigabe prüfen</h3><p>Vor der endgültigen Veröffentlichung muss diese Seite noch mit den tatsächlich eingesetzten Hosting-, Protokoll-, Cookie-, Statistik- und sonstigen Drittanbieter-Diensten abgeglichen und rechtlich geprüft werden. Bis dahin ist sie als technische Staging-Dokumentation zu verstehen.</p></div></section><?php return ob_get_clean();
    }
}
