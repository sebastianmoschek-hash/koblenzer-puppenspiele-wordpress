<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Front-end application of Website Studio settings. */
final class KP_Website_Studio_Frontend {
    public static function init() {
        add_action( 'wp_head', array( __CLASS__, 'frontend_css' ), 220 );
        add_filter( 'render_block_core/image', array( __CLASS__, 'header_image' ), 20, 2 );
        add_filter( 'render_block', array( __CLASS__, 'header_text' ), 20, 2 );
    }

    private static function font_stack( $type, $heading = false ) {
        if ( $heading ) {
            if ( 'palatino' === $type ) { return "Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif"; }
            if ( 'system' === $type ) { return "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"; }
            return "Georgia, 'Times New Roman', serif";
        }
        if ( 'humanist' === $type ) { return "Optima, Candara, 'Segoe UI', system-ui, sans-serif"; }
        if ( 'classic' === $type ) { return "Georgia, 'Times New Roman', serif"; }
        return "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    }

    private static function hex_to_rgb( $hex ) {
        $hex = ltrim( (string) $hex, '#' );
        if ( 3 === strlen( $hex ) ) { $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2]; }
        return array( hexdec( substr( $hex, 0, 2 ) ), hexdec( substr( $hex, 2, 2 ) ), hexdec( substr( $hex, 4, 2 ) ) );
    }

    private static function rgba( $hex, $opacity ) {
        $rgb = self::hex_to_rgb( $hex );
        $alpha = max( 0, min( 1, (float) $opacity ) );
        return 'rgba(' . $rgb[0] . ',' . $rgb[1] . ',' . $rgb[2] . ',' . rtrim( rtrim( number_format( $alpha, 3, '.', '' ), '0' ), '.' ) . ')';
    }

    private static function shade( $hex, $percent ) {
        $rgb = self::hex_to_rgb( $hex );
        $factor = max( 0, 1 + ( (float) $percent / 100 ) );
        $r = min( 255, max( 0, (int) round( $rgb[0] * $factor ) ) );
        $g = min( 255, max( 0, (int) round( $rgb[1] * $factor ) ) );
        $b = min( 255, max( 0, (int) round( $rgb[2] * $factor ) ) );
        return sprintf( '#%02x%02x%02x', $r, $g, $b );
    }

    private static function css_vars( $s ) {
        $menu_opacity = (int) $s['menu_opacity'] / 100;
        $menu_mid      = max( 0.05, ( (int) $s['menu_opacity'] - 6 ) / 100 );
        $menu_end      = max( 0.05, ( (int) $s['menu_opacity'] + 2 ) / 100 );
        $menu_start    = min( 1, $menu_opacity + .03 );
        $border_alpha  = (int) $s['menu_border_opacity'] / 100;
        $scrim_alpha   = (int) $s['menu_scrim_opacity'] / 100;

        return array(
            '--kp-studio-accent'              => $s['accent_color'],
            '--kp-studio-accent-dark'         => $s['accent_dark'],
            '--kp-studio-bg'                  => $s['background_color'],
            '--kp-studio-nav'                 => $s['nav_color'],
            '--kp-studio-surface'             => $s['surface_color'],
            '--kp-studio-text'                => $s['text_color'],
            '--kp-studio-muted'               => $s['muted_color'],
            '--kp-studio-line'                => $s['line_color'],
            '--kp-studio-content-width'       => (int) $s['content_width'] . 'px',
            '--kp-studio-wide-width'          => (int) $s['wide_width'] . 'px',
            '--kp-studio-card-radius'         => (int) $s['card_radius'] . 'px',
            '--kp-studio-button-radius'       => (int) $s['button_radius'] . 'px',
            '--kp-studio-header-max-width'    => (int) $s['header_max_width'] . 'px',
            '--kp-studio-header-side-gap'     => (int) $s['header_side_gap'] . 'px',
            '--kp-studio-header-radius'       => (int) $s['header_radius'] . 'px',
            '--kp-studio-header-gap'          => (int) $s['header_vertical_gap'] . 'px',
            '--kp-studio-desktop-nav-opacity' => (int) $s['desktop_nav_opacity'] . '%',
            '--kp-studio-desktop-nav-height'  => (int) $s['desktop_nav_height'] . 'px',
            '--kp-studio-desktop-nav-radius'  => (int) $s['desktop_nav_radius'] . 'px',
            '--kp-studio-menu-bg-start'       => self::rgba( $s['menu_color'], $menu_start ),
            '--kp-studio-menu-bg-mid'         => self::rgba( self::shade( $s['menu_color'], -52 ), $menu_mid ),
            '--kp-studio-menu-bg-end'         => self::rgba( self::shade( $s['menu_color'], -76 ), $menu_end ),
            '--kp-studio-menu-border'         => self::rgba( $s['accent_color'], $border_alpha ),
            '--kp-studio-menu-scrim'          => self::rgba( $s['background_color'], $scrim_alpha ),
            '--kp-studio-menu-blur'           => (int) $s['menu_blur'] . 'px',
            '--kp-studio-menu-width'          => (int) $s['menu_width'] . 'px',
            '--kp-studio-menu-radius'         => (int) $s['menu_radius'] . 'px',
            '--kp-studio-menu-offset-y'       => (int) $s['menu_offset_y'] . 'px',
            '--kp-studio-menu-item-padding'   => (int) $s['menu_item_padding'] . 'px',
            '--kp-studio-menu-item-gap'       => (int) $s['menu_item_gap'] . 'px',
            '--kp-studio-menu-font-delta'     => (int) $s['menu_font_delta'] . 'px',
            '--kp-studio-menu-button-size'    => (int) $s['menu_button_size'] . 'px',
            '--kp-studio-body-font'           => self::font_stack( $s['body_font'], false ),
            '--kp-studio-heading-font'        => self::font_stack( $s['heading_font'], true ),
        );
    }

    public static function frontend_css() {
        $s = KP_Website_Studio::settings();
        $vars = self::css_vars( $s );
        ?>
        <style id="kp-website-studio-vars">
        :root{
        <?php foreach ( $vars as $name => $value ) : ?>
          <?php echo $name; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>:<?php echo $value; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;
        <?php endforeach; ?>
          --kp-orange:var(--kp-studio-accent);
          --kp-orange-dark:var(--kp-studio-accent-dark);
          --kp-black:var(--kp-studio-bg);
          --kp-brown:var(--kp-studio-nav);
          --kp-brown-2:var(--kp-studio-surface);
          --kp-cream:var(--kp-studio-text);
          --kp-muted:var(--kp-studio-muted);
          --kp-line:var(--kp-studio-line);
          --wp--preset--color--orange:var(--kp-studio-accent);
          --wp--preset--color--orange-dark:var(--kp-studio-accent-dark);
          --wp--preset--color--black:var(--kp-studio-bg);
          --wp--preset--color--brown:var(--kp-studio-nav);
          --wp--preset--color--brown-2:var(--kp-studio-surface);
          --wp--preset--color--cream:var(--kp-studio-text);
          --wp--preset--color--muted:var(--kp-studio-muted);
          --wp--style--global--content-size:var(--kp-studio-content-width);
          --wp--style--global--wide-size:var(--kp-studio-wide-width);
        }
        body{background:var(--kp-studio-bg)!important;color:var(--kp-studio-text)!important;font-family:var(--kp-studio-body-font)!important}
        h1,h2,h3,h4,h5,h6,.wp-block-heading,.kp-termine-heading,.kp-termine-month{font-family:var(--kp-studio-heading-font)!important}
        a:not(.wp-element-button):not(.kp-termine-button){--wp--style--color--link:var(--kp-studio-accent)}
        .wp-element-button,.wp-block-button__link,.kp-termine-button{border-radius:var(--kp-studio-button-radius)!important}
        .kp-card,.kp-cta,.kp-image-frame img{border-radius:var(--kp-studio-card-radius)!important}
        .kp-termine{--kp-orange:var(--kp-studio-accent);--kp-orange-dark:var(--kp-studio-accent-dark);--kp-black:var(--kp-studio-bg);--kp-brown:var(--kp-studio-nav);--kp-brown-2:var(--kp-studio-surface);--kp-cream:var(--kp-studio-text);--kp-muted:var(--kp-studio-muted);--kp-line:var(--kp-studio-line)}
        .kp-hero{border-top-color:var(--kp-studio-accent)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--kp-studio-bg) 88%,var(--kp-studio-surface) 12%),color-mix(in srgb,var(--kp-studio-bg) 66%,var(--kp-studio-surface) 34%))!important}
        .kp-cta{border-color:var(--kp-studio-line)!important;border-left-color:var(--kp-studio-accent)!important;background:linear-gradient(135deg,color-mix(in srgb,var(--kp-studio-surface) 88%,var(--kp-studio-bg) 12%),color-mix(in srgb,var(--kp-studio-surface) 74%,var(--kp-studio-accent) 26%))!important}
        .kp-footer{border-top-color:var(--kp-studio-line)!important}
        .kp-header-stage{width:calc(100% - (var(--kp-studio-header-side-gap) * 2))!important;max-width:var(--kp-studio-header-max-width)!important;margin:var(--kp-studio-header-gap) auto!important;border-radius:var(--kp-studio-header-radius)!important;overflow:hidden!important}
        .kp-header-photo img{border-radius:var(--kp-studio-header-radius)!important}
        <?php if ( empty( $s['show_topbar'] ) ) : ?>.kp-topbar{display:none!important}<?php endif; ?>
        <?php if ( empty( $s['show_header_image'] ) ) : ?>.kp-header-stage{display:none!important}<?php endif; ?>
        @media(min-width:782px){.kp-navigation-bar{background:color-mix(in srgb,var(--kp-studio-nav) var(--kp-studio-desktop-nav-opacity),transparent)!important}.kp-site-nav{min-height:var(--kp-studio-desktop-nav-height)!important}.kp-site-nav .wp-block-navigation-item__content{border-radius:var(--kp-studio-desktop-nav-radius)!important}}
        @media(max-width:781px){
          .kp-header-stage{width:100%!important;max-width:none!important;margin:0 auto!important}
          .kp-site-nav .wp-block-navigation__responsive-container-open{width:var(--kp-studio-menu-button-size)!important;min-width:var(--kp-studio-menu-button-size)!important;height:var(--kp-studio-menu-button-size)!important;min-height:var(--kp-studio-menu-button-size)!important;background:var(--kp-studio-accent)!important}
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open,.kp-site-nav .wp-block-navigation__responsive-container.has-modal-open{background:var(--kp-studio-menu-scrim)!important}
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,.kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close{top:max(12px,calc(var(--kp-menu-button-top,72px) - 8px + var(--kp-studio-menu-offset-y)))!important;width:min(74vw,var(--kp-studio-menu-width))!important;max-height:calc(100dvh - max(12px,calc(var(--kp-menu-button-top,72px) - 8px + var(--kp-studio-menu-offset-y))) - 12px)!important;max-width:calc(100vw - 96px)!important;border-color:var(--kp-studio-menu-border)!important;border-radius:var(--kp-studio-menu-radius)!important;background:linear-gradient(155deg,var(--kp-studio-menu-bg-start) 0%,var(--kp-studio-menu-bg-mid) 48%,var(--kp-studio-menu-bg-end) 100%)!important;-webkit-backdrop-filter:blur(var(--kp-studio-menu-blur)) saturate(1.18)!important;backdrop-filter:blur(var(--kp-studio-menu-blur)) saturate(1.18)!important}
          body.admin-bar .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,body.admin-bar .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close{top:max(58px,calc(var(--kp-menu-button-top,72px) - 8px + var(--kp-studio-menu-offset-y)))!important;max-height:calc(100dvh - max(58px,calc(var(--kp-menu-button-top,72px) - 8px + var(--kp-studio-menu-offset-y))) - 12px)!important}
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container,.kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container{gap:var(--kp-studio-menu-item-gap)!important}
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item__content,.kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item__content{padding:var(--kp-studio-menu-item-padding) 11px!important;font-size:clamp(calc(1rem + var(--kp-studio-menu-font-delta)),calc(4.15vw + var(--kp-studio-menu-font-delta)),calc(1.22rem + var(--kp-studio-menu-font-delta)))!important}
        }
        <?php if ( empty( $s['motion'] ) ) : ?>*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}<?php endif; ?>
        </style>
        <?php
    }

    public static function header_image( $block_content, $block ) {
        $s = KP_Website_Studio::settings();
        if ( empty( $s['header_image_id'] ) ) { return $block_content; }
        $class = isset( $block['attrs']['className'] ) ? (string) $block['attrs']['className'] : '';
        if ( false === strpos( $class, 'kp-header-photo' ) ) { return $block_content; }
        $url = wp_get_attachment_image_url( (int) $s['header_image_id'], 'full' );
        if ( ! $url ) { return $block_content; }
        if ( class_exists( 'WP_HTML_Tag_Processor' ) ) {
            $processor = new WP_HTML_Tag_Processor( $block_content );
            if ( $processor->next_tag( 'img' ) ) {
                $processor->set_attribute( 'src', $url );
                $srcset = wp_get_attachment_image_srcset( (int) $s['header_image_id'], 'full' );
                $sizes  = wp_get_attachment_image_sizes( (int) $s['header_image_id'], 'full' );
                if ( $srcset ) { $processor->set_attribute( 'srcset', $srcset ); }
                if ( $sizes ) { $processor->set_attribute( 'sizes', $sizes ); }
                $alt = get_post_meta( (int) $s['header_image_id'], '_wp_attachment_image_alt', true );
                if ( '' !== $alt ) { $processor->set_attribute( 'alt', $alt ); }
                return $processor->get_updated_html();
            }
        }
        return $block_content;
    }

    public static function header_text( $block_content, $block ) {
        $class = isset( $block['attrs']['className'] ) ? (string) $block['attrs']['className'] : '';
        if ( false === strpos( $class, 'kp-topbar' ) ) { return $block_content; }
        $s = KP_Website_Studio::settings();
        $texts = array( esc_html( $s['topbar_left'] ), esc_html( $s['topbar_right'] ) );
        $i = 0;
        return preg_replace_callback(
            '~(<p\b[^>]*>)(.*?)(</p>)~is',
            static function ( $matches ) use ( &$i, $texts ) {
                if ( $i > 1 ) { return $matches[0]; }
                $replacement = $matches[1] . $texts[ $i ] . $matches[3];
                $i++;
                return $replacement;
            },
            $block_content
        );
    }
}
