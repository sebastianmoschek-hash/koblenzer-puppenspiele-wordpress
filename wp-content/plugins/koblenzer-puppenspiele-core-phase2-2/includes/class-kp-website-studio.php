<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Mobile-first design studio for non-technical site editors.
 *
 * The goal is to expose the visual settings that used to live in CSS/PHP as
 * friendly WordPress controls. Defaults preserve the existing theatre design.
 */
final class KP_Website_Studio {
    const OPTION = 'kp_website_studio';
    const PAGE   = 'kp-website-studio';

    public static function init() {
        add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ), 30 );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'admin_assets' ) );
        add_action( 'admin_post_kp_save_website_studio', array( __CLASS__, 'save' ) );
        add_action( 'admin_post_kp_reset_website_studio', array( __CLASS__, 'reset' ) );
        add_action( 'admin_bar_menu', array( __CLASS__, 'admin_bar' ), 90 );
    }

    public static function defaults() {
        return array(
            'accent_color'        => '#f07a22',
            'accent_dark'         => '#c95c10',
            'background_color'    => '#080706',
            'nav_color'           => '#17110e',
            'surface_color'       => '#241813',
            'text_color'          => '#f7f1eb',
            'muted_color'         => '#c9bcb1',
            'line_color'          => '#4b352a',
            'content_width'       => 720,
            'wide_width'          => 1040,
            'card_radius'         => 16,
            'button_radius'       => 999,
            'body_font'           => 'system',
            'heading_font'        => 'georgia',
            'motion'              => 1,
            'show_topbar'         => 1,
            'topbar_left'         => 'Mobiles Figurentheater aus Koblenz',
            'topbar_right'        => 'Seit 1995',
            'show_header_image'   => 1,
            'header_image_id'     => 0,
            'header_max_width'    => 860,
            'header_side_gap'     => 32,
            'header_radius'       => 0,
            'header_vertical_gap' => 7,
            'desktop_nav_opacity' => 100,
            'desktop_nav_height'  => 44,
            'desktop_nav_radius'  => 999,
            'menu_color'          => '#3a261c',
            'menu_opacity'        => 74,
            'menu_blur'           => 22,
            'menu_width'          => 320,
            'menu_radius'         => 21,
            'menu_offset_y'       => 0,
            'menu_border_opacity' => 30,
            'menu_scrim_opacity'  => 3,
            'menu_item_padding'   => 9,
            'menu_item_gap'       => 2,
            'menu_font_delta'     => 0,
            'menu_button_size'    => 52,
        );
    }

    private static function schema() {
        return array(
            'accent_color'        => array( 'type' => 'color' ),
            'accent_dark'         => array( 'type' => 'color' ),
            'background_color'    => array( 'type' => 'color' ),
            'nav_color'           => array( 'type' => 'color' ),
            'surface_color'       => array( 'type' => 'color' ),
            'text_color'          => array( 'type' => 'color' ),
            'muted_color'         => array( 'type' => 'color' ),
            'line_color'          => array( 'type' => 'color' ),
            'content_width'       => array( 'type' => 'int', 'min' => 560, 'max' => 980 ),
            'wide_width'          => array( 'type' => 'int', 'min' => 820, 'max' => 1440 ),
            'card_radius'         => array( 'type' => 'int', 'min' => 0, 'max' => 36 ),
            'button_radius'       => array( 'type' => 'int', 'min' => 0, 'max' => 999 ),
            'body_font'           => array( 'type' => 'choice', 'choices' => array( 'system', 'humanist', 'classic' ) ),
            'heading_font'        => array( 'type' => 'choice', 'choices' => array( 'georgia', 'palatino', 'system' ) ),
            'motion'              => array( 'type' => 'bool' ),
            'show_topbar'         => array( 'type' => 'bool' ),
            'topbar_left'         => array( 'type' => 'text', 'max' => 80 ),
            'topbar_right'        => array( 'type' => 'text', 'max' => 50 ),
            'show_header_image'   => array( 'type' => 'bool' ),
            'header_image_id'     => array( 'type' => 'int', 'min' => 0, 'max' => 999999999 ),
            'header_max_width'    => array( 'type' => 'int', 'min' => 540, 'max' => 1400 ),
            'header_side_gap'     => array( 'type' => 'int', 'min' => 0, 'max' => 100 ),
            'header_radius'       => array( 'type' => 'int', 'min' => 0, 'max' => 36 ),
            'header_vertical_gap' => array( 'type' => 'int', 'min' => 0, 'max' => 40 ),
            'desktop_nav_opacity' => array( 'type' => 'int', 'min' => 0, 'max' => 100 ),
            'desktop_nav_height'  => array( 'type' => 'int', 'min' => 36, 'max' => 72 ),
            'desktop_nav_radius'  => array( 'type' => 'int', 'min' => 0, 'max' => 999 ),
            'menu_color'          => array( 'type' => 'color' ),
            'menu_opacity'        => array( 'type' => 'int', 'min' => 30, 'max' => 100 ),
            'menu_blur'           => array( 'type' => 'int', 'min' => 0, 'max' => 40 ),
            'menu_width'          => array( 'type' => 'int', 'min' => 220, 'max' => 360 ),
            'menu_radius'         => array( 'type' => 'int', 'min' => 0, 'max' => 36 ),
            'menu_offset_y'       => array( 'type' => 'int', 'min' => -120, 'max' => 180 ),
            'menu_border_opacity' => array( 'type' => 'int', 'min' => 0, 'max' => 100 ),
            'menu_scrim_opacity'  => array( 'type' => 'int', 'min' => 0, 'max' => 45 ),
            'menu_item_padding'   => array( 'type' => 'int', 'min' => 5, 'max' => 18 ),
            'menu_item_gap'       => array( 'type' => 'int', 'min' => 0, 'max' => 12 ),
            'menu_font_delta'     => array( 'type' => 'int', 'min' => -4, 'max' => 6 ),
            'menu_button_size'    => array( 'type' => 'int', 'min' => 44, 'max' => 72 ),
        );
    }

    public static function settings() {
        $saved = get_option( self::OPTION, array() );
        return wp_parse_args( is_array( $saved ) ? $saved : array(), self::defaults() );
    }

    public static function admin_menu() {
        add_submenu_page( 'kp-puppenspiele', 'Website Studio', 'Website Studio', 'edit_theme_options', self::PAGE, array( __CLASS__, 'page' ) );
    }

    public static function admin_bar( $bar ) {
        if ( ! is_admin_bar_showing() || ! current_user_can( 'edit_theme_options' ) ) { return; }
        $bar->add_node( array(
            'id'    => 'kp-website-studio',
            'title' => 'Website gestalten',
            'href'  => admin_url( 'admin.php?page=' . self::PAGE ),
            'meta'  => array( 'title' => 'Website Studio öffnen' ),
        ) );
    }

    public static function admin_assets( $hook ) {
        if ( false === strpos( (string) $hook, self::PAGE ) ) { return; }
        wp_enqueue_media();
        wp_enqueue_style( 'kp-website-studio-admin', KP_CORE_URL . 'assets/website-studio-admin.css', array(), KP_CORE_VERSION );
        wp_enqueue_script( 'kp-website-studio-admin', KP_CORE_URL . 'assets/website-studio-admin.js', array(), KP_CORE_VERSION, true );
    }

    private static function sanitize( $raw ) {
        $defaults = self::defaults();
        $clean = array();
        foreach ( self::schema() as $key => $rule ) {
            $value = isset( $raw[ $key ] ) ? wp_unslash( $raw[ $key ] ) : null;
            switch ( $rule['type'] ) {
                case 'bool':
                    $clean[ $key ] = empty( $value ) ? 0 : 1;
                    break;
                case 'color':
                    $color = sanitize_hex_color( (string) $value );
                    $clean[ $key ] = $color ? $color : $defaults[ $key ];
                    break;
                case 'int':
                    $number = (int) $value;
                    if ( isset( $rule['min'] ) ) { $number = max( (int) $rule['min'], $number ); }
                    if ( isset( $rule['max'] ) ) { $number = min( (int) $rule['max'], $number ); }
                    $clean[ $key ] = $number;
                    break;
                case 'choice':
                    $clean[ $key ] = in_array( $value, $rule['choices'], true ) ? $value : $defaults[ $key ];
                    break;
                case 'text':
                    $text = sanitize_text_field( (string) $value );
                    if ( isset( $rule['max'] ) && function_exists( 'mb_substr' ) ) { $text = mb_substr( $text, 0, (int) $rule['max'] ); }
                    $clean[ $key ] = $text;
                    break;
            }
        }
        return wp_parse_args( $clean, $defaults );
    }

    public static function save() {
        if ( ! current_user_can( 'edit_theme_options' ) ) { wp_die( 'Keine Berechtigung.' ); }
        check_admin_referer( 'kp_website_studio_save' );
        $raw = isset( $_POST['kp_studio'] ) && is_array( $_POST['kp_studio'] ) ? $_POST['kp_studio'] : array();
        update_option( self::OPTION, self::sanitize( $raw ), false );
        wp_safe_redirect( add_query_arg( 'kp-studio-saved', '1', admin_url( 'admin.php?page=' . self::PAGE ) ) );
        exit;
    }

    public static function reset() {
        if ( ! current_user_can( 'edit_theme_options' ) ) { wp_die( 'Keine Berechtigung.' ); }
        check_admin_referer( 'kp_website_studio_reset' );
        delete_option( self::OPTION );
        wp_safe_redirect( add_query_arg( 'kp-studio-reset', '1', admin_url( 'admin.php?page=' . self::PAGE ) ) );
        exit;
    }

    private static function range( $name, $label, $value, $min, $max, $step, $unit, $help = '' ) {
        ?>
        <label class="kp-studio-control">
            <span class="kp-studio-control-head"><strong><?php echo esc_html( $label ); ?></strong><output data-output-for="<?php echo esc_attr( $name ); ?>"><?php echo esc_html( $value . $unit ); ?></output></span>
            <input type="range" name="kp_studio[<?php echo esc_attr( $name ); ?>]" value="<?php echo esc_attr( $value ); ?>" min="<?php echo esc_attr( $min ); ?>" max="<?php echo esc_attr( $max ); ?>" step="<?php echo esc_attr( $step ); ?>" data-studio-key="<?php echo esc_attr( $name ); ?>" data-unit="<?php echo esc_attr( $unit ); ?>">
            <?php if ( $help ) : ?><small><?php echo esc_html( $help ); ?></small><?php endif; ?>
        </label>
        <?php
    }

    private static function color( $name, $label, $value, $help = '' ) {
        ?>
        <label class="kp-studio-color-control">
            <span><strong><?php echo esc_html( $label ); ?></strong><?php if ( $help ) : ?><small><?php echo esc_html( $help ); ?></small><?php endif; ?></span>
            <span class="kp-studio-color-input"><input type="color" name="kp_studio[<?php echo esc_attr( $name ); ?>]" value="<?php echo esc_attr( $value ); ?>" data-studio-key="<?php echo esc_attr( $name ); ?>"><code><?php echo esc_html( strtoupper( $value ) ); ?></code></span>
        </label>
        <?php
    }

    private static function toggle( $name, $label, $value, $help = '' ) {
        ?>
        <label class="kp-studio-toggle-row">
            <span><strong><?php echo esc_html( $label ); ?></strong><?php if ( $help ) : ?><small><?php echo esc_html( $help ); ?></small><?php endif; ?></span>
            <span class="kp-studio-switch"><input type="hidden" name="kp_studio[<?php echo esc_attr( $name ); ?>]" value="0"><input type="checkbox" name="kp_studio[<?php echo esc_attr( $name ); ?>]" value="1" <?php checked( $value, 1 ); ?> data-studio-key="<?php echo esc_attr( $name ); ?>"><i></i></span>
        </label>
        <?php
    }

    public static function page() {
        if ( ! current_user_can( 'edit_theme_options' ) ) { return; }
        $s = self::settings();
        $preview_url = add_query_arg( 'kp_studio_preview', '1', home_url( '/' ) );
        $image_url = $s['header_image_id'] ? wp_get_attachment_image_url( (int) $s['header_image_id'], 'medium' ) : '';
        $saved = isset( $_GET['kp-studio-saved'] );
        $reset = isset( $_GET['kp-studio-reset'] );
        include KP_CORE_DIR . 'includes/views/website-studio-page.php';
    }
}
