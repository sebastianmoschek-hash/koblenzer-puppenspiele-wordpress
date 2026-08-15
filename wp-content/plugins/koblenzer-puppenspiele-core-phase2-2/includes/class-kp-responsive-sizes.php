<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Friendly responsive sizing controls for the complete public website.
 *
 * Editors can change the visual size of each major area independently for
 * phone, tablet, laptop and desktop without touching CSS. 100% always means
 * the carefully tested original design.
 */
final class KP_Responsive_Sizes {
    const OPTION = 'kp_responsive_sizes';
    const PAGE   = 'kp-responsive-sizes';

    public static function init() {
        add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ), 32 );
        add_action( 'admin_post_kp_save_responsive_sizes', array( __CLASS__, 'save' ) );
        add_action( 'admin_post_kp_reset_responsive_sizes', array( __CLASS__, 'reset' ) );
        add_action( 'admin_bar_menu', array( __CLASS__, 'admin_bar' ), 92 );
        add_action( 'wp_head', array( __CLASS__, 'frontend_css' ), 240 );
        add_filter( 'body_class', array( __CLASS__, 'body_classes' ) );
    }

    private static function devices() {
        return array(
            'mobile'  => array( 'Handy', 'dashicons-smartphone', 'bis 640 px' ),
            'tablet'  => array( 'Tablet', 'dashicons-tablet', '641–900 px' ),
            'laptop'  => array( 'Laptop', 'dashicons-laptop', '901–1399 px' ),
            'desktop' => array( 'Großer Bildschirm', 'dashicons-desktop', 'ab 1400 px' ),
        );
    }

    /**
     * Every public area that should be adjustable by a non-technical editor.
     * selector is intentionally limited to the visible content, not full-page
     * background wrappers, so scaling does not create blank borders.
     */
    private static function areas() {
        return array(
            'header' => array(
                'Kopfbereich & Headerbild',
                'Logo-/Headerbild und obere Inf Zeile.',
                '.kp-topbar > *,.kp-header-stage',
                'dashicons-format-image',
            ),
            'navigation' => array(
                'Navigation',
                'Menüleiste am Laptop/Desktop sowie Menübutton und Menüpunkte mobil.',
                '',
                'dashicons-menu-alt3',
            ),
            'hero' => array(
                'Startseite: Begrüßung',
                'Große Hauptüberschrift, Einführung und die beiden Start-Buttons.',
                '.kp-hero > .wp-block-group',
                'dashicons-welcome-view-site',
            ),
            'termine' => array(
                'Termine',
                'Alle Termin-Karten – auf der Startseite und auf der Terminseite.',
                '',
                'dashicons-calendar-alt',
            ),
            'home_booking' => array(
                'Startseite: Buchungsbox',
                'Die Box „Sie möchten die Koblenzer Puppenspiele buchen?“',
                '.kp-booking-section .kp-cta',
                'dashicons-tickets-alt',
            ),
            'aktuelles' => array(
                'Aktuelles',
                'Überschrift, Karten, Texte und Buttons auf „Aktuelles“.',
                '.kp-size-page-aktuelles main > .wp-block-post-title,.kp-size-page-aktuelles main > .wp-block-post-content',
                'dashicons-megaphone',
            ),
            'theater' => array(
                'Das Theater & Ensemble',
                'Theaterseite sowie die Detailseiten der Menschen dahinter.',
                '.kp-size-page-das-theater main > .wp-block-post-title,.kp-size-page-das-theater main > .wp-block-post-content,.single-kp_ensemble main > *',
                'dashicons-groups',
            ),
            'repertoire' => array(
                'Repertoire',
                'Stückkarten, Repertoireseite und einzelne Stückseiten.',
                '.kp-size-page-repertoire main > .wp-block-post-title,.kp-size-page-repertoire main > .wp-block-post-content,.single-kp_repertoire main > *',
                'dashicons-format-gallery',
            ),
            'referenzen' => array(
                'Referenzen',
                'Überschrift, Referenzkarten und Texte.',
                '.kp-size-page-referenzen main > .wp-block-post-title,.kp-size-page-referenzen main > .wp-block-post-content',
                'dashicons-awards',
            ),
            'booking' => array(
                'Jetzt buchen',
                'Die komplette Buchungsseite mit Text, Schritten und Formular-/Kontaktbereich.',
                '.kp-size-page-jetzt-buchen main > .wp-block-post-title,.kp-size-page-jetzt-buchen main > .wp-block-post-content',
                'dashicons-email-alt',
            ),
            'kontakt' => array(
                'Kontakt',
                'Kontaktseite, Hinweise und Formular.',
                '.kp-size-page-kontakt main > .wp-block-post-title,.kp-size-page-kontakt main > .wp-block-post-content',
                'dashicons-email',
            ),
            'faq' => array(
                'Kita / Schule FAQ',
                'Fragen und Antworten für Einrichtungen.',
                '.kp-size-page-kita-schule-faq main > .wp-block-post-title,.kp-size-page-kita-schule-faq main > .wp-block-post-content',
                'dashicons-editor-help',
            ),
            'legal' => array(
                'Impressum & Datenschutz',
                'Die beiden rechtlichen Informationsseiten.',
                '.kp-size-page-impressum main > .wp-block-post-title,.kp-size-page-impressum main > .wp-block-post-content,.kp-size-page-datenschutz main > .wp-block-post-title,.kp-size-page-datenschutz main > .wp-block-post-content',
                'dashicons-privacy',
            ),
            'generic' => array(
                'Neue / sonstige Seiten',
                'Gilt automatisch für neue normale Seiten, die später ergänzt werden.',
                '.kp-size-page-generic main > .wp-block-post-title,.kp-size-page-generic main > .wp-block-post-content',
                'dashicons-admin-page',
            ),
            'footer' => array(
                'Fußbereich',
                'Name, Kurzbeschreibung sowie Impressum-/Datenschutz-Links ganz unten.',
                '.kp-footer > *',
                'dashicons-arrow-down-alt2',
            ),
        );
    }

    private static function known_page_slugs() {
        return array( 'aktuelles', 'das-theater', 'repertoire', 'termine', 'referenzen', 'jetzt-buchen', 'kontakt', 'kita-schule-faq', 'impressum', 'datenschutz' );
    }

    public static function body_classes( $classes ) {
        if ( is_front_page() ) {
            $classes[] = 'kp-size-front-page';
        }
        if ( is_page() ) {
            $post = get_queried_object();
            if ( $post && ! empty( $post->post_name ) ) {
                $slug = sanitize_title( $post->post_name );
                $classes[] = 'kp-size-page-' . sanitize_html_class( $slug );
                if ( ! is_front_page() && ! in_array( $slug, self::known_page_slugs(), true ) ) {
                    $classes[] = 'kp-size-page-generic';
                }
            }
        }
        return $classes;
    }

    public static function defaults() {
        $defaults = array();
        foreach ( self::devices() as $device => $spec ) {
            $defaults[ 'all_' . $device ] = 100;
        }
        foreach ( self::areas() as $area => $spec ) {
            foreach ( self::devices() as $device => $device_spec ) {
                $defaults[ $area . '_' . $device ] = 100;
            }
        }
        return $defaults;
    }

    public static function settings() {
        $saved = get_option( self::OPTION, array() );
        $saved = is_array( $saved ) ? $saved : array();

        /* Migrate the first Termine-only version without losing user choices. */
        foreach ( self::devices() as $device => $spec ) {
            $new_key = 'termine_' . $device;
            if ( ! isset( $saved[ $new_key ] ) && isset( $saved[ $device ] ) ) {
                $saved[ $new_key ] = (int) $saved[ $device ];
            }
        }
        return wp_parse_args( $saved, self::defaults() );
    }

    public static function admin_menu() {
        add_submenu_page(
            'kp-puppenspiele',
            'Anzeigegrößen',
            'Anzeigegrößen',
            'edit_theme_options',
            self::PAGE,
            array( __CLASS__, 'page' ),
            8
        );
    }

    public static function admin_bar( $bar ) {
        if ( ! is_admin_bar_showing() || ! current_user_can( 'edit_theme_options' ) ) { return; }
        $bar->add_node( array(
            'id'     => 'kp-responsive-sizes',
            'parent' => 'kp-quick-edit',
            'title'  => 'Anzeigegrößen',
            'href'   => admin_url( 'admin.php?page=' . self::PAGE ),
        ) );
    }

    private static function sanitize_scale( $value, $min = 85, $max = 125 ) {
        return max( $min, min( $max, (int) $value ) );
    }

    public static function save() {
        if ( ! current_user_can( 'edit_theme_options' ) ) { wp_die( 'Keine Berechtigung.' ); }
        check_admin_referer( 'kp_responsive_sizes_save' );
        $raw = isset( $_POST['kp_sizes'] ) && is_array( $_POST['kp_sizes'] ) ? wp_unslash( $_POST['kp_sizes'] ) : array();
        $clean = array();

        foreach ( self::devices() as $device => $spec ) {
            $key = 'all_' . $device;
            $clean[ $key ] = self::sanitize_scale( isset( $raw[ $key ] ) ? $raw[ $key ] : 100, 90, 120 );
        }
        foreach ( self::areas() as $area => $spec ) {
            foreach ( self::devices() as $device => $device_spec ) {
                $key = $area . '_' . $device;
                $min = 'termine' === $area ? 85 : 90;
                $max = 'termine' === $area ? 140 : 120;
                $clean[ $key ] = self::sanitize_scale( isset( $raw[ $key ] ) ? $raw[ $key ] : 100, $min, $max );
            }
        }

        update_option( self::OPTION, $clean, false );
        wp_safe_redirect( add_query_arg( 'kp-sizes-saved', '1', admin_url( 'admin.php?page=' . self::PAGE ) ) );
        exit;
    }

    public static function reset() {
        if ( ! current_user_can( 'edit_theme_options' ) ) { wp_die( 'Keine Berechtigung.' ); }
        check_admin_referer( 'kp_responsive_sizes_reset' );
        delete_option( self::OPTION );
        wp_safe_redirect( add_query_arg( 'kp-sizes-reset', '1', admin_url( 'admin.php?page=' . self::PAGE ) ) );
        exit;
    }

    private static function slider( $name, $label, $value, $min, $max, $help = '' ) {
        ?>
        <label class="kp-size-control">
            <span class="kp-size-control-head"><strong><?php echo esc_html( $label ); ?></strong><output id="kp-size-<?php echo esc_attr( $name ); ?>-out"><?php echo esc_html( $value ); ?> %</output></span>
            <input type="range" name="kp_sizes[<?php echo esc_attr( $name ); ?>]" value="<?php echo esc_attr( $value ); ?>" min="<?php echo esc_attr( $min ); ?>" max="<?php echo esc_attr( $max ); ?>" step="1" data-size-output="kp-size-<?php echo esc_attr( $name ); ?>-out">
            <?php if ( $help ) : ?><small><?php echo esc_html( $help ); ?></small><?php endif; ?>
        </label>
        <?php
    }

    private static function device_sliders( $prefix, $s, $wide = false ) {
        $min = $wide ? 85 : 90;
        $max = $wide ? 140 : 120;
        foreach ( self::devices() as $device => $spec ) {
            $key = $prefix . '_' . $device;
            ?>
            <div class="kp-size-device-row">
                <span class="dashicons <?php echo esc_attr( $spec[1] ); ?>"></span>
                <?php self::slider( $key, $spec[0], isset( $s[ $key ] ) ? $s[ $key ] : 100, $min, $max, $spec[2] ); ?>
            </div>
            <?php
        }
    }

    public static function page() {
        if ( ! current_user_can( 'edit_theme_options' ) ) { return; }
        $s = self::settings();
        ?>
        <div class="wrap kp-size-wrap">
            <div class="kp-size-head">
                <div>
                    <span class="kp-size-kicker">Koblenzer Puppenspiele</span>
                    <h1>Anzeigegrößen</h1>
                    <p>Handy, Tablet, Laptop und Desktop getrennt einstellen. <strong>100 %</strong> ist immer die getestete Originalgröße – kein CSS und kein Code nötig.</p>
                </div>
                <a class="button" href="<?php echo esc_url( home_url( '/' ) ); ?>" target="_blank" rel="noopener">Website ansehen ↗</a>
            </div>

            <?php if ( isset( $_GET['kp-sizes-saved'] ) ) : ?><div class="notice notice-success is-dismissible"><p><strong>Gespeichert.</strong> Die neuen Größen sind aktiv.</p></div><?php endif; ?>
            <?php if ( isset( $_GET['kp-sizes-reset'] ) ) : ?><div class="notice notice-success is-dismissible"><p><strong>Zurückgesetzt.</strong> Alle Bereiche stehen wieder auf 100 %.</p></div><?php endif; ?>

            <div class="kp-size-tip"><span class="dashicons dashicons-move"></span><div><strong>Ganz einfach:</strong> Bereich öffnen, Gerät wählen, Regler schieben, speichern. Die Einstellung verändert Schrift, Karten und Bedienelemente gemeinsam. Für normale Änderungen reichen meist 95–115 %.</div></div>

            <form action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post" id="kp-size-form">
                <input type="hidden" name="action" value="kp_save_responsive_sizes">
                <?php wp_nonce_field( 'kp_responsive_sizes_save' ); ?>

                <section class="kp-size-master">
                    <div class="kp-size-section-title">
                        <span class="dashicons dashicons-editor-expand"></span>
                        <div><h2>Alles gemeinsam größer / kleiner</h2><p>Praktisch, wenn die komplette Website auf einem Gerät insgesamt etwas größer oder kleiner wirken soll.</p></div>
                    </div>
                    <div class="kp-size-grid">
                        <?php foreach ( self::devices() as $device => $spec ) : $key = 'all_' . $device; ?>
                            <section class="kp-size-card">
                                <span class="dashicons <?php echo esc_attr( $spec[1] ); ?>"></span>
                                <?php self::slider( $key, $spec[0], $s[ $key ], 90, 120, $spec[2] ); ?>
                            </section>
                        <?php endforeach; ?>
                    </div>
                    <p class="kp-size-muted">Die einzelnen Bereiche unten sind eine Feinabstimmung. Beispiel: „Handy gesamt 105 %“ und „Termine Handy 110 %“ macht die Termine zusätzlich etwas größer.</p>
                </section>

                <h2 class="kp-size-subhead">Einzelne Bereiche</h2>
                <div class="kp-size-areas">
                    <?php foreach ( self::areas() as $area => $spec ) : ?>
                        <details class="kp-size-area" <?php echo 'termine' === $area ? 'open' : ''; ?>>
                            <summary>
                                <span class="dashicons <?php echo esc_attr( $spec[3] ); ?>"></span>
                                <span><strong><?php echo esc_html( $spec[0] ); ?></strong><small><?php echo esc_html( $spec[1] ); ?></small></span>
                                <span class="dashicons dashicons-arrow-down-alt2 kp-size-chevron"></span>
                            </summary>
                            <div class="kp-size-area-body">
                                <?php self::device_sliders( $area, $s, 'termine' === $area ); ?>
                            </div>
                        </details>
                    <?php endforeach; ?>
                </div>

                <div class="kp-size-actions">
                    <?php submit_button( 'Anzeigegrößen speichern', 'primary', 'submit', false ); ?>
                    <span>Die Änderung wird erst mit „Speichern“ veröffentlicht.</span>
                </div>
            </form>

            <form action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post" class="kp-size-reset" onsubmit="return confirm('Wirklich alle Anzeigegrößen wieder auf 100 % setzen?');">
                <input type="hidden" name="action" value="kp_reset_responsive_sizes">
                <?php wp_nonce_field( 'kp_responsive_sizes_reset' ); ?>
                <button type="submit" class="button-link">Alle Größen auf 100 % zurücksetzen</button>
            </form>
        </div>
        <style id="kp-responsive-sizes-admin-css">
          .kp-size-wrap{max-width:1100px}.kp-size-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin:20px 0}.kp-size-kicker{display:block;color:#b45309;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.kp-size-head h1{margin:4px 0 7px;font-size:32px}.kp-size-head p{max-width:720px;margin:0;color:#50575e;font-size:16px;line-height:1.5}.kp-size-tip{display:flex;gap:13px;margin:18px 0;padding:17px;border-left:4px solid #f07a22;border-radius:12px;background:#fff7ed;line-height:1.5}.kp-size-tip>.dashicons{width:28px;height:28px;color:#f07a22;font-size:28px}.kp-size-master{margin:20px 0;padding:20px;border:1px solid #dcdcde;border-radius:18px;background:#f6f7f7}.kp-size-section-title{display:flex;gap:12px;align-items:flex-start;margin-bottom:15px}.kp-size-section-title>.dashicons{width:30px;height:30px;color:#f07a22;font-size:30px}.kp-size-section-title h2{margin:0 0 3px}.kp-size-section-title p,.kp-size-muted{margin:0;color:#646970;line-height:1.45}.kp-size-muted{margin-top:13px;font-size:13px}.kp-size-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.kp-size-card{padding:17px;border:1px solid #dcdcde;border-radius:14px;background:#fff}.kp-size-card>.dashicons{width:26px;height:26px;margin-bottom:6px;color:#f07a22;font-size:26px}.kp-size-subhead{margin:30px 0 12px}.kp-size-areas{display:grid;gap:10px}.kp-size-area{border:1px solid #dcdcde;border-radius:15px;background:#fff;overflow:hidden}.kp-size-area summary{display:grid;grid-template-columns:34px minmax(0,1fr) 24px;align-items:center;gap:10px;padding:16px 18px;cursor:pointer;list-style:none}.kp-size-area summary::-webkit-details-marker{display:none}.kp-size-area summary>.dashicons:first-child{width:28px;height:28px;color:#f07a22;font-size:28px}.kp-size-area summary strong{display:block;font-size:17px}.kp-size-area summary small{display:block;margin-top:2px;color:#646970;line-height:1.35}.kp-size-chevron{transition:transform .18s ease}.kp-size-area[open] .kp-size-chevron{transform:rotate(180deg)}.kp-size-area-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px;padding:2px 18px 18px;border-top:1px solid #f0f0f1}.kp-size-device-row{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;align-items:start;padding:14px 0;border-bottom:1px solid #f0f0f1}.kp-size-device-row>.dashicons{margin-top:2px;color:#8c8f94}.kp-size-control{display:block}.kp-size-control-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.kp-size-control-head strong{font-size:15px}.kp-size-control output{padding:3px 8px;border-radius:999px;background:#17110e;color:#fff;font-size:12px;font-weight:700}.kp-size-control input[type=range]{width:100%;margin:12px 0 5px;accent-color:#f07a22}.kp-size-control small{display:block;color:#646970;font-size:11px}.kp-size-actions{display:flex;align-items:center;gap:14px;margin:24px 0 10px}.kp-size-actions span{color:#646970}.kp-size-reset{margin:10px 0 30px}@media(max-width:782px){.kp-size-wrap{margin-right:10px}.kp-size-head{flex-direction:column}.kp-size-head h1{font-size:27px}.kp-size-grid,.kp-size-area-body{grid-template-columns:1fr}.kp-size-master{padding:15px}.kp-size-area summary{padding:15px}.kp-size-area-body{padding:0 15px 15px}.kp-size-actions{align-items:flex-start;flex-direction:column}.kp-size-actions .button{width:100%;min-height:46px;font-size:16px}}
        </style>
        <script id="kp-responsive-sizes-admin-js">
        (()=>{document.querySelectorAll('#kp-size-form input[type="range"]').forEach(el=>{const out=document.getElementById(el.dataset.sizeOutput);const sync=()=>{if(out)out.textContent=el.value+' %'};el.addEventListener('input',sync);sync();});})();
        </script>
        <?php
    }

    private static function n( $base, $scale ) {
        return round( (float) $base * ( (float) $scale / 100 ), 3 );
    }

    private static function effective_scale( $s, $area, $device ) {
        $all  = isset( $s[ 'all_' . $device ] ) ? (int) $s[ 'all_' . $device ] : 100;
        $area_scale = isset( $s[ $area . '_' . $device ] ) ? (int) $s[ $area . '_' . $device ] : 100;
        return max( 75, min( 150, (int) round( $all * $area_scale / 100 ) ) );
    }

    private static function zoom_rule( $selector, $scale ) {
        if ( ! $selector || 100 === (int) $scale ) { return; }
        $zoom = round( (float) $scale / 100, 3 );
        echo $selector . '{zoom:' . esc_html( $zoom ) . '!important}';
    }

    private static function navigation_rules( $scale, $mode ) {
        if ( 100 === (int) $scale ) { return; }
        $zoom = round( (float) $scale / 100, 3 );
        if ( in_array( $mode, array( 'mobile', 'tablet' ), true ) ) {
            ?>
            .kp-site-nav .wp-block-navigation__responsive-container-open{zoom:<?php echo esc_html( $zoom ); ?>!important}
            .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__container,.kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__container{zoom:<?php echo esc_html( $zoom ); ?>!important}
            <?php
        } else {
            ?>
            .kp-navigation-bar .wp-block-navigation__container{zoom:<?php echo esc_html( $zoom ); ?>!important}
            <?php
        }
    }

    /** Exact Termine scaling keeps the dense cards readable without relying on zoom. */
    private static function termine_rules( $scale, $mode ) {
        $mobile = 'mobile' === $mode;
        $tablet = 'tablet' === $mode;
        $date_col = $mobile ? 48 : ( $tablet ? 64 : 72 );
        $date_min = $mobile ? 48 : 60;
        $card_y   = $mobile ? .48 : .68;
        $card_x   = $mobile ? .55 : .78;
        $gap_y    = $mobile ? .42 : .72;
        $gap_x    = $mobile ? .50 : .72;
        $title    = $mobile ? .84 : .98;
        $date_num = $mobile ? 1.18 : 1.55;
        $tiny     = $mobile ? .54 : .64;
        $time     = $mobile ? .62 : .72;
        $status   = $mobile ? .55 : .65;
        $note     = $mobile ? .65 : .78;
        $place    = $mobile ? .66 : .78;
        $place_b  = $mobile ? .72 : .88;
        $address  = $mobile ? .60 : .70;
        $button   = $mobile ? .61 : .72;
        $button_h = $mobile ? 29 : 34;
        $button_y = $mobile ? .28 : .40;
        $button_x = $mobile ? .52 : .68;
        $heading  = $mobile ? 1.35 : 1.75;
        $month    = $mobile ? 1.15 : 1.45;
        ?>
        .kp-termine-heading{font-size:<?php echo esc_html( self::n( $heading, $scale ) ); ?>rem!important}
        .kp-termine-month{font-size:<?php echo esc_html( self::n( $month, $scale ) ); ?>rem!important}
        .kp-termin-card{gap:<?php echo esc_html( self::n( $gap_y, $scale ) ); ?>rem <?php echo esc_html( self::n( $gap_x, $scale ) ); ?>rem!important;padding:<?php echo esc_html( self::n( $card_y, $scale ) ); ?>rem <?php echo esc_html( self::n( $card_x, $scale ) ); ?>rem!important}
        .kp-termin-date{min-height:<?php echo esc_html( self::n( $date_min, $scale ) ); ?>px!important;padding:<?php echo esc_html( self::n( $mobile ? .22 : .30, $scale ) ); ?>rem!important}
        .kp-termin-date strong{font-size:<?php echo esc_html( self::n( $date_num, $scale ) ); ?>rem!important}
        .kp-termin-weekday,.kp-termin-date>span:last-child{font-size:<?php echo esc_html( self::n( $tiny, $scale ) ); ?>rem!important}
        .kp-termin-main h3{font-size:<?php echo esc_html( self::n( $title, $scale ) ); ?>rem!important}
        .kp-termin-time{font-size:<?php echo esc_html( self::n( $time, $scale ) ); ?>rem!important}
        .kp-termin-status{font-size:<?php echo esc_html( self::n( $status, $scale ) ); ?>rem!important}
        .kp-termin-note{font-size:<?php echo esc_html( self::n( $note, $scale ) ); ?>rem!important}
        .kp-termin-place{font-size:<?php echo esc_html( self::n( $place, $scale ) ); ?>rem!important}
        .kp-termin-place strong{font-size:<?php echo esc_html( self::n( $place_b, $scale ) ); ?>rem!important}
        .kp-termin-address{font-size:<?php echo esc_html( self::n( $address, $scale ) ); ?>rem!important}
        .kp-termine-button,.kp-termin-actions .kp-termine-button{min-height:<?php echo esc_html( self::n( $button_h, $scale ) ); ?>px!important;padding:<?php echo esc_html( self::n( $button_y, $scale ) ); ?>rem <?php echo esc_html( self::n( $button_x, $scale ) ); ?>rem!important;font-size:<?php echo esc_html( self::n( $button, $scale ) ); ?>rem!important}
        <?php if ( $mobile ) : ?>
        .kp-termin-card{grid-template-columns:<?php echo esc_html( self::n( $date_col, $scale ) ); ?>px minmax(0,1fr)!important}
        <?php elseif ( $tablet ) : ?>
        .kp-termin-card{grid-template-columns:<?php echo esc_html( self::n( $date_col, $scale ) ); ?>px minmax(0,1fr) auto!important}
        <?php else : ?>
        .kp-termin-card{grid-template-columns:<?php echo esc_html( self::n( $date_col, $scale ) ); ?>px minmax(0,1.45fr) minmax(<?php echo esc_html( self::n( 155, $scale ) ); ?>px,.8fr) auto!important}
        .kp-termin-actions{min-width:<?php echo esc_html( self::n( 92, $scale ) ); ?>px!important}
        <?php endif; ?>
        <?php
    }

    private static function device_css( $device, $s ) {
        foreach ( self::areas() as $area => $spec ) {
            $scale = self::effective_scale( $s, $area, $device );
            if ( 'termine' === $area ) {
                self::termine_rules( $scale, $device );
                /* Scale only the Termine page title; the cards are handled above. */
                self::zoom_rule( '.kp-size-page-termine main > .wp-block-post-title', $scale );
            } elseif ( 'navigation' === $area ) {
                self::navigation_rules( $scale, $device );
            } else {
                self::zoom_rule( $spec[2], $scale );
            }
        }
    }

    public static function frontend_css() {
        $s = self::settings();
        ?>
        <style id="kp-responsive-sizes-css">
        @media(max-width:640px){<?php self::device_css( 'mobile', $s ); ?>}
        @media(min-width:641px) and (max-width:900px){<?php self::device_css( 'tablet', $s ); ?>}
        @media(min-width:901px) and (max-width:1399px){<?php self::device_css( 'laptop', $s ); ?>}
        @media(min-width:1400px){<?php self::device_css( 'desktop', $s ); ?>}
        </style>
        <?php
    }
}
