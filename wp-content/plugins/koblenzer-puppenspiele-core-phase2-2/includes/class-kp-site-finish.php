<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class KP_Site_Finish {
    const VERSION = '1.0.0';
    const OPTION = 'kp_site_finish_version';

    public static function init() {
        add_action( 'init', array( __CLASS__, 'ensure_pages' ), 60 );
        add_action( 'init', array( __CLASS__, 'maybe_seed' ), 70 );
        add_shortcode( 'kp_aktuelles', array( __CLASS__, 'shortcode_aktuelles' ) );
        add_shortcode( 'kp_booking', array( __CLASS__, 'shortcode_booking' ) );
        add_shortcode( 'kp_contact', array( __CLASS__, 'shortcode_contact' ) );
        add_shortcode( 'kp_kita_faq', array( __CLASS__, 'shortcode_kita_faq' ) );
    }

    public static function ensure_pages() {
        $pages = array(
            'aktuelles' => array( 'Aktuelles', '[kp_aktuelles]' ),
            'jetzt-buchen' => array( 'Jetzt buchen', '[kp_booking]' ),
            'kontakt' => array( 'Kontakt', '[kp_contact]' ),
            'kita-schule-faq' => array( 'Kita / Schule FAQ', '[kp_kita_faq]' ),
        );
        foreach ( $pages as $slug => $spec ) {
            $page = get_page_by_path( $slug, OBJECT, 'page' );
            if ( ! $page ) {
                wp_insert_post( array(
                    'post_type' => 'page', 'post_status' => 'publish', 'post_title' => $spec[0],
                    'post_name' => $slug, 'post_content' => $spec[1], 'comment_status' => 'closed',
                ) );
            } elseif ( trim( (string) $page->post_content ) === '' ) {
                wp_update_post( array( 'ID' => $page->ID, 'post_content' => $spec[1] ) );
            }
        }
    }

    public static function maybe_seed() {
        if ( get_option( self::OPTION ) === self::VERSION ) { return; }
        if ( ! post_type_exists( 'kp_repertoire' ) || ! post_type_exists( 'kp_termin' ) || ! post_type_exists( 'kp_referenz' ) || ! post_type_exists( 'kp_ensemble' ) ) { return; }

        self::seed_repertoire();
        self::seed_termine();
        self::seed_references();
        self::seed_ensemble();
        self::link_termine_to_repertoire();
        update_option( self::OPTION, self::VERSION, false );
        flush_rewrite_rules( false );
    }

    private static function json_data( $filename ) {
        $path = KP_CORE_DIR . 'data/' . $filename;
        if ( ! file_exists( $path ) ) { return array(); }
        $data = json_decode( file_get_contents( $path ), true );
        return is_array( $data ) ? $data : array();
    }

    private static function import_image( $folder, $filename, $title ) {
        $filename = wp_basename( (string) $filename );
        if ( $filename === '' ) { return 0; }
        $asset_key = $folder . '/' . $filename;
        $existing = get_posts( array(
            'post_type' => 'attachment', 'post_status' => 'inherit', 'posts_per_page' => 1, 'fields' => 'ids',
            'meta_key' => '_kp_seed_asset', 'meta_value' => $asset_key,
        ) );
        if ( $existing ) { return (int) $existing[0]; }

        $source = KP_CORE_DIR . 'assets/' . $folder . '/' . $filename;
        if ( ! file_exists( $source ) ) { return 0; }
        $upload = wp_upload_bits( $filename, null, file_get_contents( $source ) );
        if ( ! empty( $upload['error'] ) ) { return 0; }
        $filetype = wp_check_filetype( $upload['file'], null );
        $attachment_id = wp_insert_attachment( array(
            'post_mime_type' => $filetype['type'], 'post_title' => sanitize_text_field( $title ), 'post_status' => 'inherit',
        ), $upload['file'] );
        if ( is_wp_error( $attachment_id ) ) { return 0; }
        require_once ABSPATH . 'wp-admin/includes/image.php';
        wp_update_attachment_metadata( $attachment_id, wp_generate_attachment_metadata( $attachment_id, $upload['file'] ) );
        update_post_meta( $attachment_id, '_kp_seed_asset', $asset_key );
        update_post_meta( $attachment_id, '_wp_attachment_image_alt', sanitize_text_field( $title ) );
        return (int) $attachment_id;
    }

    private static function seed_repertoire() {
        foreach ( self::json_data( 'legacy-repertoire.json' ) as $index => $item ) {
            $key = sanitize_key( $item['legacy_key'] ?? '' );
            if ( ! $key || empty( $item['title'] ) ) { continue; }
            $found = get_posts( array(
                'post_type' => 'kp_repertoire', 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids',
                'meta_key' => '_kp_rep_legacy_key', 'meta_value' => $key,
            ) );
            if ( $found ) { $post_id = (int) $found[0]; }
            else {
                $post_id = wp_insert_post( array(
                    'post_type' => 'kp_repertoire', 'post_status' => 'publish',
                    'post_title' => sanitize_text_field( $item['title'] ),
                    'post_name' => sanitize_title( $item['slug'] ?? $item['title'] ),
                    'post_excerpt' => sanitize_textarea_field( $item['summary'] ?? '' ),
                    'post_content' => '<p>' . esc_html( $item['summary'] ?? '' ) . '</p>',
                    'menu_order' => (int) $index,
                ) );
                if ( is_wp_error( $post_id ) ) { continue; }
                update_post_meta( $post_id, '_kp_rep_legacy_key', $key );
            }
            if ( ! empty( $item['category'] ) ) { wp_set_object_terms( $post_id, sanitize_text_field( $item['category'] ), 'kp_repertoire_category', false ); }
            $fields = array(
                '_kp_rep_age' => 'age', '_kp_rep_duration' => 'duration', '_kp_rep_players' => 'players',
                '_kp_rep_play_style' => 'play_style', '_kp_rep_technical' => 'technical', '_kp_rep_rights' => 'rights',
                '_kp_rep_premiere' => 'premiere', '_kp_rep_old_url' => 'old_url',
            );
            foreach ( $fields as $meta => $field ) {
                if ( isset( $item[ $field ] ) && $item[ $field ] !== '' ) { update_post_meta( $post_id, $meta, sanitize_textarea_field( $item[ $field ] ) ); }
            }
            update_post_meta( $post_id, '_kp_rep_bookable', '1' );
            if ( ! empty( $item['aliases'] ) && is_array( $item['aliases'] ) ) { update_post_meta( $post_id, '_kp_rep_aliases', array_map( 'sanitize_text_field', $item['aliases'] ) ); }
            if ( ! has_post_thumbnail( $post_id ) && ! empty( $item['card_image'] ) ) {
                $img = self::import_image( 'legacy-repertoire', $item['card_image'], $item['title'] . ' – Titelbild' );
                if ( $img ) { set_post_thumbnail( $post_id, $img ); }
            }
            if ( ! get_post_meta( $post_id, '_kp_rep_info_image_id', true ) && ! empty( $item['info_image'] ) ) {
                $img = self::import_image( 'legacy-repertoire', $item['info_image'], $item['title'] . ' – Infoblatt' );
                if ( $img ) { update_post_meta( $post_id, '_kp_rep_info_image_id', $img ); }
            }
        }
    }

    private static function seed_termine() {
        foreach ( self::json_data( 'legacy-termine-2026-2027.json' ) as $item ) {
            $key = sanitize_text_field( $item['legacy_key'] ?? '' );
            $date = sanitize_text_field( $item['date'] ?? '' );
            if ( ! $key || ! $date || empty( $item['title'] ) ) { continue; }
            $found = get_posts( array(
                'post_type' => 'kp_termin', 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids',
                'meta_key' => '_kp_legacy_key', 'meta_value' => $key,
            ) );
            if ( $found ) { continue; }
            $post_id = wp_insert_post( array(
                'post_type' => 'kp_termin', 'post_status' => 'publish', 'post_title' => sanitize_text_field( $item['title'] ),
            ) );
            if ( is_wp_error( $post_id ) ) { continue; }
            $time = sanitize_text_field( $item['time'] ?? '' );
            update_post_meta( $post_id, '_kp_legacy_key', $key );
            update_post_meta( $post_id, '_kp_date', $date );
            if ( $time ) { update_post_meta( $post_id, '_kp_time', $time ); }
            update_post_meta( $post_id, '_kp_city', sanitize_text_field( $item['city'] ?? '' ) );
            update_post_meta( $post_id, '_kp_venue', sanitize_text_field( $item['venue'] ?? '' ) );
            update_post_meta( $post_id, '_kp_status', sanitize_key( $item['status'] ?? 'standard' ) );
            if ( ! empty( $item['ticket_url'] ) ) { update_post_meta( $post_id, '_kp_ticket_url', esc_url_raw( $item['ticket_url'] ) ); }
            if ( ! empty( $item['info_url'] ) ) { update_post_meta( $post_id, '_kp_info_url', esc_url_raw( $item['info_url'] ) ); }
            update_post_meta( $post_id, '_kp_sort', $date . ' ' . ( $time ?: '23:59' ) );
        }
    }

    private static function seed_references() {
        foreach ( self::json_data( 'legacy-referenzen.json' ) as $index => $item ) {
            if ( empty( $item['title'] ) ) { continue; }
            $key = md5( strtolower( trim( (string) $item['title'] . '|' . (string) ( $item['url'] ?? '' ) ) ) );
            $found = get_posts( array(
                'post_type' => 'kp_referenz', 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids',
                'meta_key' => '_kp_referenz_legacy_key', 'meta_value' => $key,
            ) );
            if ( $found ) { $post_id = (int) $found[0]; }
            else {
                $post_id = wp_insert_post( array(
                    'post_type' => 'kp_referenz', 'post_status' => 'publish', 'post_title' => sanitize_text_field( $item['title'] ),
                    'menu_order' => (int) $index,
                ) );
                if ( is_wp_error( $post_id ) ) { continue; }
                update_post_meta( $post_id, '_kp_referenz_legacy_key', $key );
            }
            update_post_meta( $post_id, '_kp_referenz_url', esc_url_raw( $item['url'] ?? '' ) );
            update_post_meta( $post_id, '_kp_referenz_note', sanitize_text_field( $item['note'] ?? '' ) );
            if ( ! has_post_thumbnail( $post_id ) && ! empty( $item['bundled_image'] ) ) {
                $img = self::import_image( 'legacy-referenzen', $item['bundled_image'], $item['title'] );
                if ( $img ) { set_post_thumbnail( $post_id, $img ); }
            }
        }
    }

    private static function seed_ensemble() {
        foreach ( self::json_data( 'legacy-ensemble.json' ) as $index => $item ) {
            if ( empty( $item['title'] ) ) { continue; }
            $slug = sanitize_title( $item['slug'] ?? $item['title'] );
            $existing = get_page_by_path( $slug, OBJECT, 'kp_ensemble' );
            if ( $existing ) { $post_id = (int) $existing->ID; }
            else {
                $post_id = wp_insert_post( array(
                    'post_type' => 'kp_ensemble', 'post_status' => 'publish', 'post_title' => sanitize_text_field( $item['title'] ),
                    'post_name' => $slug, 'post_content' => ! empty( $item['bio'] ) ? '<p>' . esc_html( $item['bio'] ) . '</p>' : '',
                    'menu_order' => (int) $index,
                ) );
                if ( is_wp_error( $post_id ) ) { continue; }
            }
            update_post_meta( $post_id, '_kp_ensemble_role', sanitize_text_field( $item['role'] ?? '' ) );
            update_post_meta( $post_id, '_kp_ensemble_born', sanitize_text_field( $item['born'] ?? '' ) );
            update_post_meta( $post_id, '_kp_ensemble_short', sanitize_text_field( $item['short'] ?? '' ) );
            update_post_meta( $post_id, '_kp_ensemble_url', esc_url_raw( $item['url'] ?? '' ) );
            update_post_meta( $post_id, '_kp_ensemble_featured', ! empty( $item['featured'] ) ? '1' : '0' );
            if ( ! has_post_thumbnail( $post_id ) && ! empty( $item['bundled_image'] ) ) {
                $img = self::import_image( 'legacy-ensemble', $item['bundled_image'], $item['title'] );
                if ( $img ) { set_post_thumbnail( $post_id, $img ); }
            }
        }
    }

    private static function normalize( $text ) {
        $text = strtolower( remove_accents( wp_strip_all_tags( (string) $text ) ) );
        $text = preg_replace( '/[^a-z0-9]+/u', ' ', $text );
        return trim( preg_replace( '/\\s+/', ' ', $text ) );
    }

    private static function link_termine_to_repertoire() {
        $map = array();
        foreach ( get_posts( array( 'post_type' => 'kp_repertoire', 'post_status' => 'publish', 'posts_per_page' => -1 ) ) as $rep ) {
            $map[ self::normalize( $rep->post_title ) ] = $rep->ID;
            $aliases = get_post_meta( $rep->ID, '_kp_rep_aliases', true );
            if ( is_array( $aliases ) ) { foreach ( $aliases as $alias ) { $map[ self::normalize( $alias ) ] = $rep->ID; } }
        }
        foreach ( get_posts( array( 'post_type' => 'kp_termin', 'post_status' => 'publish', 'posts_per_page' => -1 ) ) as $termin ) {
            if ( get_post_meta( $termin->ID, '_kp_repertoire_id', true ) ) { continue; }
            $key = self::normalize( $termin->post_title );
            if ( isset( $map[ $key ] ) ) { update_post_meta( $termin->ID, '_kp_repertoire_id', (int) $map[ $key ] ); }
        }
    }

    public static function shortcode_aktuelles() {
        ob_start(); ?>
        <section class="kp-finish kp-current">
            <p class="kp-finish-kicker">Neu & sehenswert</p>
            <h2>Was gerade auf der Bühne passiert</h2>
            <div class="kp-finish-grid kp-finish-grid-3">
                <article class="kp-finish-card"><span class="kp-finish-tag">Neuproduktion 2026</span><h3>Zum Glück gibt’s FREUNDE</h3><p>Die drei Freunde aus Mullewapp sind als liebevolle, reduzierte Produktion für kleine Theateranfänger*innen unterwegs – flexibel für Kitas, Familienfeste und Festivals.</p><a href="/repertoire/zum-glueck-gibts-freunde/">Zum Stück →</a></article>
                <article class="kp-finish-card"><span class="kp-finish-tag">Unterwegs</span><h3>Gastspiele & Familienprogramm</h3><p>Die Koblenzer Puppenspiele spielen in Kulturhäusern, Bibliotheken, Schulen, Kitas, auf Festivals und bei Veranstaltern in der Region und darüber hinaus.</p><a href="/termine/">Aktuelle Termine →</a></article>
                <article class="kp-finish-card"><span class="kp-finish-tag">Für Veranstalter</span><h3>Theater kommt zu Ihnen</h3><p>Viele Produktionen bringen Bühne, Licht und Ton bereits mit. Für Gruppen, Einrichtungen und Kulturveranstaltungen erstellen wir gern ein passendes Angebot.</p><a href="/jetzt-buchen/">Gastspiel anfragen →</a></article>
            </div>
        </section>
        <?php return ob_get_clean();
    }

    public static function shortcode_booking() {
        ob_start(); ?>
        <section class="kp-finish kp-booking-page">
            <p class="kp-finish-kicker">Gastspiel anfragen</p>
            <h2>Figurentheater direkt bei Ihnen</h2>
            <p class="kp-finish-lead">Ob Kita, Schule, Kulturhaus, Stadtfest, Bibliothek oder Familienveranstaltung: Senden Sie uns am besten mehrere Wunschtermine, den Ort, die ungefähre Publikumsgröße und – falls schon entschieden – Ihr Wunschstück.</p>
            <div class="kp-finish-grid kp-finish-grid-3">
                <article class="kp-finish-card"><strong>1</strong><h3>Stück auswählen</h3><p>Altersempfehlung, Dauer, Spielweise und technische Anforderungen stehen direkt beim jeweiligen Repertoire-Stück.</p><a href="/repertoire/">Repertoire ansehen →</a></article>
                <article class="kp-finish-card"><strong>2</strong><h3>Wunschtermine senden</h3><p>Mehrere mögliche Termine helfen uns, Ensemble, Aufführungsrechte und Tourenplanung schnell abzugleichen.</p></article>
                <article class="kp-finish-card"><strong>3</strong><h3>Individuelles Angebot</h3><p>Sie erhalten ein professionelles, transparentes Angebot passend zu Veranstaltung, Gruppengröße und Anfahrt.</p></article>
            </div>
            <div class="kp-finish-cta"><div><span class="kp-finish-tag">Direkter Kontakt</span><h3>Ihre Anfrage darf unkompliziert sein.</h3><p>Eine kurze Nachricht mit Ort, Anlass, Personenzahl und Wunschzeitraum reicht für den ersten Schritt.</p></div><a class="kp-finish-button" href="/kontakt/">Kontakt aufnehmen</a></div>
        </section>
        <?php return ob_get_clean();
    }

    public static function shortcode_contact() {
        $email = sanitize_email( get_option( 'admin_email' ) );
        ob_start(); ?>
        <section class="kp-finish kp-contact-page">
            <p class="kp-finish-kicker">Kontakt</p>
            <h2>Vorhang auf für Ihre Anfrage</h2>
            <p class="kp-finish-lead">Für Gastspielanfragen nennen Sie uns bitte möglichst Ort, Anlass, ungefähre Personenzahl und mehrere Wunschtermine. So können wir deutlich schneller prüfen, was möglich ist.</p>
            <div class="kp-finish-grid kp-finish-grid-2">
                <article class="kp-finish-card"><span class="kp-finish-tag">E-Mail</span><h3>Schreiben Sie uns</h3><p><?php echo $email ? '<a href="mailto:' . esc_attr( $email ) . '">' . esc_html( $email ) . '</a>' : 'Nutzen Sie bitte die im Impressum hinterlegte Kontaktadresse.'; ?></p><p>Wir melden uns mit den nächsten sinnvollen Schritten zurück.</p></article>
                <article class="kp-finish-card"><span class="kp-finish-tag">Für Buchungen hilfreich</span><h3>Diese Angaben sparen Rückfragen</h3><p>Wunschstück · 2–3 mögliche Termine · Spielort · Publikumsgröße · Altersgruppe · Ansprechpartner*in</p><a href="/jetzt-buchen/">Hinweise zur Buchung →</a></article>
            </div>
        </section>
        <?php return ob_get_clean();
    }

    public static function shortcode_kita_faq() {
        $items = array(
            'Kommen Sie in Kitas und Schulen?' => 'Ja. Viele Produktionen sind ausdrücklich für mobile Gastspiele konzipiert.',
            'Wie lange dauert der Aufbau?' => 'Je nach Produktion meist etwa 30 bis 60 Minuten; der Abbau ist in der Regel schneller.',
            'Was wird vor Ort benötigt?' => 'Eine normale Stromversorgung und eine Parkmöglichkeit möglichst nah am Spielort. Die genauen Maße stehen beim jeweiligen Stück.',
            'Muss der Raum verdunkelbar sein?' => 'Nein. Die Produktionen sind so geplant, dass sie in üblichen Veranstaltungs- und Gruppenräumen funktionieren.',
            'Wie frage ich einen freien Termin an?' => 'Am besten schicken Sie mehrere Wunschtermine, Ort, Gruppengröße und das gewünschte Stück. So können wir schnell konkret antworten.',
            'Wie wird abgerechnet?' => 'Nach dem Gastspiel erhalten Sie eine ordnungsgemäße Rechnung. Das konkrete Angebot hängt von Produktion, Gruppengröße und Anfahrt ab.',
        );
        ob_start(); ?>
        <section class="kp-finish kp-faq-page"><p class="kp-finish-kicker">Kita & Schule</p><h2>Die häufigsten Fragen</h2><div class="kp-faq-list">
        <?php foreach ( $items as $q => $a ) : ?><details class="kp-faq-item"><summary><?php echo esc_html( $q ); ?></summary><p><?php echo esc_html( $a ); ?></p></details><?php endforeach; ?>
        </div><div class="kp-finish-cta"><div><h3>Noch etwas offen?</h3><p>Schreiben Sie uns kurz, was Sie planen. Wir sagen Ihnen, welche Produktion und welcher Rahmen sinnvoll sind.</p></div><a class="kp-finish-button" href="/kontakt/">Frage senden</a></div></section>
        <?php return ob_get_clean();
    }
}
