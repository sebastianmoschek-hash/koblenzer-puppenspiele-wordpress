<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Simple, device-specific sizing controls for the public event cards.
 * Keeps responsive design approachable for non-technical site owners.
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
    }

    public static function defaults() {
        return array(
            'mobile'  => 100,
            'tablet'  => 100,
            'laptop'  => 100,
            'desktop' => 100,
        );
    }

    public static function settings() {
        $saved = get_option( self::OPTION, array() );
        return wp_parse_args( is_array( $saved ) ? $saved : array(), self::defaults() );
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
            'title'  => 'Termine größer / kleiner',
            'href'   => admin_url( 'admin.php?page=' . self::PAGE ),
        ) );
    }

    private static function sanitize_scale( $value, $min = 85, $max = 140 ) {
        return max( $min, min( $max, (int) $value ) );
    }

    public static function save() {
        if ( ! current_user_can( 'edit_theme_options' ) ) { wp_die( 'Keine Berechtigung.' ); }
        check_admin_referer( 'kp_responsive_sizes_save' );
        $raw = isset( $_POST['kp_sizes'] ) && is_array( $_POST['kp_sizes'] ) ? wp_unslash( $_POST['kp_sizes'] ) : array();
        update_option( self::OPTION, array(
            'mobile'  => self::sanitize_scale( isset( $raw['mobile'] ) ? $raw['mobile'] : 100, 85, 140 ),
            'tablet'  => self::sanitize_scale( isset( $raw['tablet'] ) ? $raw['tablet'] : 100, 85, 135 ),
            'laptop'  => self::sanitize_scale( isset( $raw['laptop'] ) ? $raw['laptop'] : 100, 85, 130 ),
            'desktop' => self::sanitize_scale( isset( $raw['desktop'] ) ? $raw['desktop'] : 100, 85, 130 ),
        ), false );
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

    private static function slider( $name, $label, $help, $value, $min, $max ) {
        ?>
        <label class="kp-size-control">
            <span class="kp-size-control-head"><strong><?php echo esc_html( $label ); ?></strong><output id="kp-size-<?php echo esc_attr( $name ); ?>-out"><?php echo esc_html( $value ); ?> %</output></span>
            <input type="range" name="kp_sizes[<?php echo esc_attr( $name ); ?>]" value="<?php echo esc_attr( $value ); ?>" min="<?php echo esc_attr( $min ); ?>" max="<?php echo esc_attr( $max ); ?>" step="1" data-size-output="kp-size-<?php echo esc_attr( $name ); ?>-out">
            <small><?php echo esc_html( $help ); ?></small>
        </label>
        <?php
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
                    <p>Die Termin-Karten pro Gerät größer oder kleiner machen – ohne CSS. <strong>100 %</strong> ist die aktuelle Originalgröße.</p>
                </div>
                <a class="button" href="<?php echo esc_url( home_url( '/termine/' ) ); ?>" target="_blank" rel="noopener">Termine ansehen ↗</a>
            </div>

            <?php if ( isset( $_GET['kp-sizes-saved'] ) ) : ?><div class="notice notice-success is-dismissible"><p><strong>Gespeichert.</strong> Die neuen Größen sind aktiv.</p></div><?php endif; ?>
            <?php if ( isset( $_GET['kp-sizes-reset'] ) ) : ?><div class="notice notice-success is-dismissible"><p><strong>Zurückgesetzt.</strong> Alle Geräte stehen wieder auf 100 %.</p></div><?php endif; ?>

            <div class="kp-size-tip"><span class="dashicons dashicons-smartphone"></span><div><strong>Ein Regler verändert die komplette Termin-Karte passend.</strong><br>Datum, Stücktitel, Ort, Uhrzeit, Buttons und Abstände wachsen gemeinsam. Die anderen Geräte bleiben unverändert.</div></div>

            <form action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post" id="kp-size-form">
                <input type="hidden" name="action" value="kp_save_responsive_sizes">
                <?php wp_nonce_field( 'kp_responsive_sizes_save' ); ?>

                <div class="kp-size-grid">
                    <section class="kp-size-card">
                        <span class="dashicons dashicons-smartphone"></span>
                        <?php self::slider( 'mobile', 'Handy', 'Bis etwa 640 px Bildschirmbreite. Wenn Termine auf dem Smartphone zu klein wirken, hier z. B. 108–115 % wählen.', $s['mobile'], 85, 140 ); ?>
                    </section>
                    <section class="kp-size-card">
                        <span class="dashicons dashicons-tablet"></span>
                        <?php self::slider( 'tablet', 'Tablet', 'Für kleine Tablets und große Hochformat-Ansichten.', $s['tablet'], 85, 135 ); ?>
                    </section>
                    <section class="kp-size-card">
                        <span class="dashicons dashicons-laptop"></span>
                        <?php self::slider( 'laptop', 'Laptop', 'Für typische Notebook- und kleinere Desktop-Breiten.', $s['laptop'], 85, 130 ); ?>
                    </section>
                    <section class="kp-size-card">
                        <span class="dashicons dashicons-desktop"></span>
                        <?php self::slider( 'desktop', 'Großer Bildschirm', 'Für breite Desktop-Monitore.', $s['desktop'], 85, 130 ); ?>
                    </section>
                </div>

                <div class="kp-size-actions">
                    <?php submit_button( 'Größen speichern', 'primary', 'submit', false ); ?>
                    <span>Änderungen wirken nach dem Speichern sofort auf die Terminanzeigen.</span>
                </div>
            </form>

            <form action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post" class="kp-size-reset" onsubmit="return confirm('Alle Anzeigegrößen wieder auf 100 % setzen?');">
                <input type="hidden" name="action" value="kp_reset_responsive_sizes">
                <?php wp_nonce_field( 'kp_responsive_sizes_reset' ); ?>
                <button type="submit" class="button-link">Auf 100 % zurücksetzen</button>
            </form>
        </div>
        <style id="kp-responsive-sizes-admin-css">
          .kp-size-wrap{max-width:1050px}.kp-size-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin:20px 0}.kp-size-kicker{display:block;color:#b45309;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.kp-size-head h1{margin:4px 0 7px;font-size:32px}.kp-size-head p{max-width:680px;margin:0;color:#50575e;font-size:16px;line-height:1.5}.kp-size-tip{display:flex;gap:13px;margin:18px 0;padding:17px;border-left:4px solid #f07a22;border-radius:12px;background:#fff7ed;line-height:1.5}.kp-size-tip>.dashicons{width:28px;height:28px;color:#f07a22;font-size:28px}.kp-size-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.kp-size-card{padding:20px;border:1px solid #dcdcde;border-radius:16px;background:#fff;box-shadow:0 5px 18px rgba(0,0,0,.04)}.kp-size-card>.dashicons{width:30px;height:30px;margin-bottom:8px;color:#f07a22;font-size:30px}.kp-size-control{display:block}.kp-size-control-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.kp-size-control-head strong{font-size:18px}.kp-size-control output{padding:4px 8px;border-radius:999px;background:#17110e;color:#fff;font-weight:700}.kp-size-control input[type=range]{width:100%;margin:18px 0 10px;accent-color:#f07a22}.kp-size-control small{display:block;color:#646970;line-height:1.45}.kp-size-actions{display:flex;align-items:center;gap:14px;margin:22px 0 10px}.kp-size-actions span{color:#646970}.kp-size-reset{margin-top:8px}@media(max-width:782px){.kp-size-wrap{margin-right:10px}.kp-size-head{flex-direction:column}.kp-size-head h1{font-size:27px}.kp-size-grid{grid-template-columns:1fr}.kp-size-card{padding:18px}.kp-size-actions{align-items:flex-start;flex-direction:column}.kp-size-actions .button{width:100%;min-height:46px;font-size:16px}}
        </style>
        <script id="kp-responsive-sizes-admin-js">
        (()=>{document.querySelectorAll('#kp-size-form input[type="range"]').forEach(el=>{const out=document.getElementById(el.dataset.sizeOutput);const sync=()=>{if(out)out.textContent=el.value+' %'};el.addEventListener('input',sync);sync();});})();
        </script>
        <?php
    }

    private static function n( $base, $scale ) {
        return round( (float) $base * ( (float) $scale / 100 ), 3 );
    }

    private static function device_rules( $scale, $mode ) {
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

    public static function frontend_css() {
        $s = self::settings();
        ?>
        <style id="kp-responsive-sizes-css">
        @media(max-width:640px){<?php self::device_rules( (int) $s['mobile'], 'mobile' ); ?>}
        @media(min-width:641px) and (max-width:900px){<?php self::device_rules( (int) $s['tablet'], 'tablet' ); ?>}
        @media(min-width:901px) and (max-width:1399px){<?php self::device_rules( (int) $s['laptop'], 'laptop' ); ?>}
        @media(min-width:1400px){<?php self::device_rules( (int) $s['desktop'], 'desktop' ); ?>}
        </style>
        <?php
    }
}
