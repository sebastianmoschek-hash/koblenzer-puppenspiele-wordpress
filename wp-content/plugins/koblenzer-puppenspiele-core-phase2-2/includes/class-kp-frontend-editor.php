<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Direct front-end editing for non-technical site owners.
 *
 * Native blocks are tagged during server rendering and their safe content/style
 * overrides are applied server-side. Dynamic shortcode areas receive a small
 * client-side fallback layer. Structured Termine/Repertoire stay real CPT data
 * and are edited through dedicated AJAX forms instead of fragile DOM rewrites.
 */
final class KP_Frontend_Editor {
    const GLOBAL_OPTION = 'kp_frontend_editor_global_v1';
    const PAGES_OPTION  = 'kp_frontend_editor_pages_v1';
    const NONCE_ACTION  = 'kp_frontend_editor';

    public static function init() {
        add_filter( 'render_block', array( __CLASS__, 'render_block' ), 100, 2 );
        add_action( 'wp_head', array( __CLASS__, 'frontend_styles' ), 275 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_editor_assets' ), 50 );
        add_action( 'wp_footer', array( __CLASS__, 'frontend_bootstrap' ), 300 );
        add_action( 'admin_bar_menu', array( __CLASS__, 'admin_bar' ), 70 );
        add_action( 'admin_footer', array( __CLASS__, 'owner_hub_shortcut' ), 40 );

        add_action( 'wp_ajax_kp_frontend_editor_save', array( __CLASS__, 'ajax_save' ) );
        add_action( 'wp_ajax_kp_frontend_editor_record', array( __CLASS__, 'ajax_record' ) );
        add_action( 'wp_ajax_kp_frontend_editor_record_save', array( __CLASS__, 'ajax_record_save' ) );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function edit_mode() {
        return self::can_edit() && isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    }

    private static function page_key() {
        $id = (int) get_queried_object_id();
        if ( $id > 0 ) { return 'post-' . $id; }
        $uri  = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/';
        $path = (string) wp_parse_url( $uri, PHP_URL_PATH );
        return 'path-' . substr( hash( 'sha256', $path ?: '/' ), 0, 16 );
    }

    private static function page_data() {
        $all = get_option( self::PAGES_OPTION, array() );
        if ( ! is_array( $all ) ) { $all = array(); }
        $key = self::page_key();
        return isset( $all[ $key ] ) && is_array( $all[ $key ] ) ? $all[ $key ] : array();
    }

    private static function global_data() {
        $data = get_option( self::GLOBAL_OPTION, array() );
        return is_array( $data ) ? $data : array();
    }

    private static function editable_block_names() {
        return array(
            'core/paragraph', 'core/heading', 'core/button', 'core/image',
            'core/navigation-link', 'core/list-item', 'core/group', 'core/cover',
            'core/columns', 'core/column', 'core/buttons', 'core/media-text',
        );
    }

    private static function block_key( $block ) {
        $name  = isset( $block['blockName'] ) ? (string) $block['blockName'] : '';
        $attrs = isset( $block['attrs'] ) && is_array( $block['attrs'] ) ? $block['attrs'] : array();
        $inner = isset( $block['innerHTML'] ) ? trim( (string) $block['innerHTML'] ) : '';
        return 'b-' . substr( hash( 'sha256', $name . '|' . wp_json_encode( $attrs ) . '|' . $inner ), 0, 18 );
    }

    private static function first_tag_attribute( $html, $name, $value ) {
        if ( class_exists( 'WP_HTML_Tag_Processor' ) ) {
            $p = new WP_HTML_Tag_Processor( $html );
            if ( $p->next_tag() ) {
                $p->set_attribute( $name, $value );
                return $p->get_updated_html();
            }
        }
        return preg_replace( '/^(\s*<[a-zA-Z0-9:-]+)(\s|>)/', '$1 ' . $name . '="' . esc_attr( $value ) . '"$2', $html, 1 );
    }

    private static function replace_simple_inner( $html, $replacement ) {
        if ( preg_match( '/^(\s*<([a-zA-Z0-9:-]+)\b[^>]*>)(.*)(<\/\2>\s*)$/s', $html, $m ) ) {
            return $m[1] . $replacement . $m[4];
        }
        return $html;
    }

    private static function replace_anchor( $html, $label, $href ) {
        if ( $href ) {
            if ( class_exists( 'WP_HTML_Tag_Processor' ) ) {
                $p = new WP_HTML_Tag_Processor( $html );
                if ( $p->next_tag( 'a' ) ) {
                    $p->set_attribute( 'href', $href );
                    $html = $p->get_updated_html();
                }
            } else {
                $html = preg_replace( '/(<a\b[^>]*\bhref=")[^"]*(")/i', '$1' . esc_attr( $href ) . '$2', $html, 1 );
            }
        }
        if ( '' !== $label ) {
            $html = preg_replace_callback(
                '/(<a\b[^>]*>)(.*?)(<\/a>)/is',
                static function ( $m ) use ( $label ) { return $m[1] . esc_html( $label ) . $m[3]; },
                $html,
                1
            );
        }
        return $html;
    }

    private static function replace_image( $html, $src, $alt ) {
        if ( ! $src ) { return $html; }
        if ( class_exists( 'WP_HTML_Tag_Processor' ) ) {
            $p = new WP_HTML_Tag_Processor( $html );
            if ( $p->next_tag( 'img' ) ) {
                $p->set_attribute( 'src', $src );
                $p->set_attribute( 'alt', $alt );
                $p->remove_attribute( 'srcset' );
                $p->remove_attribute( 'sizes' );
                return $p->get_updated_html();
            }
        }
        return preg_replace_callback(
            '/<img\b[^>]*>/i',
            static function ( $m ) use ( $src, $alt ) {
                $tag = preg_replace( '/\s+src=("[^"]*"|\'[^\']*\')/i', '', $m[0] );
                $tag = preg_replace( '/\s+srcset=("[^"]*"|\'[^\']*\')/i', '', $tag );
                $tag = preg_replace( '/\s+sizes=("[^"]*"|\'[^\']*\')/i', '', $tag );
                $tag = preg_replace( '/\s+alt=("[^"]*"|\'[^\']*\')/i', '', $tag );
                return preg_replace( '/\s*\/?\>$/', ' src="' . esc_url( $src ) . '" alt="' . esc_attr( $alt ) . '">', $tag );
            },
            $html,
            1
        );
    }

    private static function merged_block_override( $key ) {
        $global = self::global_data();
        $page   = self::page_data();
        $result = array();
        if ( isset( $global['blocks'][ $key ] ) && is_array( $global['blocks'][ $key ] ) ) {
            $result = $global['blocks'][ $key ];
        }
        if ( isset( $page['blocks'][ $key ] ) && is_array( $page['blocks'][ $key ] ) ) {
            $result = array_replace_recursive( $result, $page['blocks'][ $key ] );
        }
        return $result;
    }

    public static function render_block( $block_content, $block ) {
        if ( is_admin() || empty( $block['blockName'] ) || ! in_array( $block['blockName'], self::editable_block_names(), true ) ) {
            return $block_content;
        }

        $key = self::block_key( $block );
        $ov  = self::merged_block_override( $key );

        if ( ! empty( $ov['content'] ) && is_array( $ov['content'] ) ) {
            $content = $ov['content'];
            $type = isset( $content['type'] ) ? $content['type'] : '';
            if ( 'html' === $type && isset( $content['value'] ) ) {
                $block_content = self::replace_simple_inner( $block_content, wp_kses_post( $content['value'] ) );
            } elseif ( 'link' === $type ) {
                $label = isset( $content['label'] ) ? sanitize_text_field( $content['label'] ) : '';
                $href  = isset( $content['href'] ) ? esc_url_raw( $content['href'] ) : '';
                $block_content = self::replace_anchor( $block_content, $label, $href );
            } elseif ( 'image' === $type ) {
                $src = isset( $content['src'] ) ? esc_url_raw( $content['src'] ) : '';
                $alt = isset( $content['alt'] ) ? sanitize_text_field( $content['alt'] ) : '';
                $block_content = self::replace_image( $block_content, $src, $alt );
            }
        }

        $block_content = self::first_tag_attribute( $block_content, 'data-kp-edit-key', $key );
        $block_content = self::first_tag_attribute( $block_content, 'data-kp-block-name', $block['blockName'] );
        return $block_content;
    }

    private static function css_for_style( $style ) {
        if ( ! is_array( $style ) ) { return ''; }
        $css = array();
        if ( isset( $style['font_px'] ) && (float) $style['font_px'] >= 8 && (float) $style['font_px'] <= 120 ) {
            $css[] = 'font-size:' . round( (float) $style['font_px'], 2 ) . 'px!important';
        }
        if ( isset( $style['padding_y'] ) && (float) $style['padding_y'] >= 0 && (float) $style['padding_y'] <= 180 ) {
            $css[] = 'padding-top:' . round( (float) $style['padding_y'], 2 ) . 'px!important';
            $css[] = 'padding-bottom:' . round( (float) $style['padding_y'], 2 ) . 'px!important';
        }
        if ( isset( $style['width_pct'] ) && (int) $style['width_pct'] >= 30 && (int) $style['width_pct'] <= 100 ) {
            $css[] = 'width:' . (int) $style['width_pct'] . '%!important';
            $css[] = 'max-width:' . (int) $style['width_pct'] . '%!important';
        }
        if ( ! empty( $style['color'] ) && sanitize_hex_color( $style['color'] ) ) {
            $css[] = 'color:' . sanitize_hex_color( $style['color'] ) . '!important';
        }
        if ( ! empty( $style['background'] ) && sanitize_hex_color( $style['background'] ) ) {
            $css[] = 'background-color:' . sanitize_hex_color( $style['background'] ) . '!important';
        }
        if ( isset( $style['radius'] ) && (int) $style['radius'] >= 0 && (int) $style['radius'] <= 80 ) {
            $css[] = 'border-radius:' . (int) $style['radius'] . 'px!important';
        }
        if ( ! empty( $style['align'] ) && in_array( $style['align'], array( 'left', 'center', 'right' ), true ) ) {
            $css[] = 'text-align:' . $style['align'] . '!important';
        }
        if ( ! empty( $style['hidden'] ) ) { $css[] = 'display:none!important'; }
        return implode( ';', $css );
    }

    private static function collect_style_rules() {
        $global = self::global_data();
        $page   = self::page_data();
        $blocks = array();
        foreach ( array( $global, $page ) as $data ) {
            if ( empty( $data['blocks'] ) || ! is_array( $data['blocks'] ) ) { continue; }
            foreach ( $data['blocks'] as $key => $value ) {
                if ( ! isset( $blocks[ $key ] ) ) { $blocks[ $key ] = array(); }
                if ( is_array( $value ) ) { $blocks[ $key ] = array_replace_recursive( $blocks[ $key ], $value ); }
            }
        }
        return $blocks;
    }

    public static function frontend_styles() {
        if ( is_admin() ) { return; }
        $blocks = self::collect_style_rules();
        $devices = array(
            'mobile'  => '@media(max-width:640px)',
            'tablet'  => '@media(min-width:641px) and (max-width:900px)',
            'laptop'  => '@media(min-width:901px) and (max-width:1400px)',
            'desktop' => '@media(min-width:1401px)',
        );
        $out = '';
        foreach ( $devices as $device => $media ) {
            $rules = '';
            foreach ( $blocks as $key => $value ) {
                if ( empty( $value['styles'][ $device ] ) ) { continue; }
                $css = self::css_for_style( $value['styles'][ $device ] );
                if ( $css ) { $rules .= '[data-kp-edit-key="' . esc_attr( $key ) . '"]{' . $css . '}'; }
            }
            if ( $rules ) { $out .= $media . '{' . $rules . '}'; }
        }
        if ( $out || self::edit_mode() ) {
            echo '<style id="kp-frontend-editor-persisted">' . $out . '</style>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
        }
    }

    public static function enqueue_editor_assets() {
        if ( ! self::edit_mode() ) { return; }
        wp_enqueue_media();
        wp_enqueue_style( 'dashicons' );
        wp_enqueue_style( 'kp-frontend-editor', KP_CORE_URL . 'assets/frontend-editor.css', array(), KP_CORE_VERSION );
        wp_enqueue_script( 'kp-frontend-editor', KP_CORE_URL . 'assets/frontend-editor.js', array(), KP_CORE_VERSION, true );
    }

    private static function current_url( $edit = false ) {
        $uri  = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/';
        $path = (string) wp_parse_url( $uri, PHP_URL_PATH );
        $url  = home_url( $path ?: '/' );
        return $edit ? add_query_arg( 'kp_edit', '1', $url ) : $url;
    }

    public static function admin_bar( $bar ) {
        if ( is_admin() || ! self::can_edit() ) { return; }
        $bar->add_node( array(
            'id'    => 'kp-frontend-edit',
            'title' => self::edit_mode() ? '✓ Bearbeitungsmodus aktiv' : '✏️ Website direkt bearbeiten',
            'href'  => self::edit_mode() ? self::current_url( false ) : self::current_url( true ),
            'meta'  => array( 'class' => 'kp-frontend-edit-adminbar' ),
        ) );
    }

    public static function owner_hub_shortcut() {
        if ( ! self::can_edit() ) { return; }
        $screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
        if ( ! $screen || false === strpos( (string) $screen->id, 'kp-schnell-bearbeiten' ) ) { return; }
        $url = add_query_arg( 'kp_edit', '1', home_url( '/' ) );
        ?>
        <script id="kp-owner-direct-edit-shortcut">
        document.addEventListener('DOMContentLoaded',()=>{
          const grid=document.querySelector('.kp-owner-hub-grid');
          if(!grid||document.querySelector('.kp-owner-direct-edit-card'))return;
          const a=document.createElement('a');
          a.className='kp-owner-hub-card is-primary kp-owner-direct-edit-card';
          a.href=<?php echo wp_json_encode( $url ); ?>;
          a.innerHTML='<span class="dashicons dashicons-welcome-view-site"></span><strong>Website direkt bearbeiten</strong><small>Homepage öffnen, Element antippen, ändern und speichern – fast wie in Canva.</small>';
          grid.prepend(a);
        });
        </script>
        <?php
    }

    public static function frontend_bootstrap() {
        if ( is_admin() ) { return; }
        $global = self::global_data();
        $page = self::page_data();
        $payload = array(
            'editMode'       => self::edit_mode(),
            'canEdit'        => self::can_edit(),
            'ajaxUrl'        => admin_url( 'admin-ajax.php' ),
            'nonce'          => self::can_edit() ? wp_create_nonce( self::NONCE_ACTION ) : '',
            'pageKey'        => self::page_key(),
            'global'         => $global,
            'page'           => $page,
            'exitUrl'        => self::current_url( false ),
            'editUrl'        => self::current_url( true ),
            'pageEditorUrl'  => ( get_queried_object_id() && current_user_can( 'edit_post', get_queried_object_id() ) ) ? get_edit_post_link( get_queried_object_id(), 'raw' ) : '',
            'siteEditorUrl'  => current_user_can( 'edit_theme_options' ) ? admin_url( 'site-editor.php' ) : '',
            'studioUrl'      => current_user_can( 'edit_theme_options' ) ? admin_url( 'admin.php?page=kp-website-studio' ) : '',
            'termineUrl'     => admin_url( 'edit.php?post_type=kp_termin' ),
            'newTerminUrl'   => admin_url( 'post-new.php?post_type=kp_termin' ),
            'repertoireUrl'  => admin_url( 'edit.php?post_type=kp_repertoire' ),
            'navigationUrl'  => current_user_can( 'edit_theme_options' ) ? admin_url( 'site-editor.php?path=/navigation' ) : '',
        );
        echo '<script id="kp-frontend-editor-config">window.KPFrontendEditor=' . wp_json_encode( $payload ) . ';</script>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }

    private static function sanitize_content( $content ) {
        if ( ! is_array( $content ) ) { return array(); }
        $type = isset( $content['type'] ) ? sanitize_key( $content['type'] ) : '';
        if ( 'html' === $type ) {
            return array( 'type' => 'html', 'value' => isset( $content['value'] ) ? wp_kses_post( $content['value'] ) : '' );
        }
        if ( 'link' === $type ) {
            return array(
                'type'  => 'link',
                'label' => isset( $content['label'] ) ? sanitize_text_field( $content['label'] ) : '',
                'href'  => isset( $content['href'] ) ? esc_url_raw( $content['href'] ) : '',
            );
        }
        if ( 'image' === $type ) {
            return array(
                'type'          => 'image',
                'src'           => isset( $content['src'] ) ? esc_url_raw( $content['src'] ) : '',
                'alt'           => isset( $content['alt'] ) ? sanitize_text_field( $content['alt'] ) : '',
                'attachment_id' => isset( $content['attachment_id'] ) ? absint( $content['attachment_id'] ) : 0,
            );
        }
        return array();
    }

    private static function sanitize_style( $style ) {
        if ( ! is_array( $style ) ) { return array(); }
        $out = array();
        if ( isset( $style['font_px'] ) ) { $out['font_px'] = max( 8, min( 120, (float) $style['font_px'] ) ); }
        if ( isset( $style['padding_y'] ) ) { $out['padding_y'] = max( 0, min( 180, (float) $style['padding_y'] ) ); }
        if ( isset( $style['width_pct'] ) ) { $out['width_pct'] = max( 30, min( 100, (int) $style['width_pct'] ) ); }
        if ( ! empty( $style['color'] ) && sanitize_hex_color( $style['color'] ) ) { $out['color'] = sanitize_hex_color( $style['color'] ); }
        if ( ! empty( $style['background'] ) && sanitize_hex_color( $style['background'] ) ) { $out['background'] = sanitize_hex_color( $style['background'] ); }
        if ( isset( $style['radius'] ) ) { $out['radius'] = max( 0, min( 80, (int) $style['radius'] ) ); }
        if ( ! empty( $style['align'] ) && in_array( $style['align'], array( 'left', 'center', 'right' ), true ) ) { $out['align'] = $style['align']; }
        $out['hidden'] = ! empty( $style['hidden'] ) ? 1 : 0;
        return $out;
    }

    private static function sanitize_scope_data( $data ) {
        $out = array( 'blocks' => array(), 'dom' => array(), 'order' => array() );
        if ( ! is_array( $data ) ) { return $out; }

        if ( ! empty( $data['blocks'] ) && is_array( $data['blocks'] ) ) {
            foreach ( array_slice( $data['blocks'], 0, 250, true ) as $key => $item ) {
                $key = preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) $key ) );
                if ( ! $key || ! is_array( $item ) ) { continue; }
                $clean = array();
                if ( isset( $item['content'] ) ) { $clean['content'] = self::sanitize_content( $item['content'] ); }
                if ( ! empty( $item['styles'] ) && is_array( $item['styles'] ) ) {
                    foreach ( array( 'mobile', 'tablet', 'laptop', 'desktop' ) as $device ) {
                        if ( isset( $item['styles'][ $device ] ) ) { $clean['styles'][ $device ] = self::sanitize_style( $item['styles'][ $device ] ); }
                    }
                }
                if ( $clean ) { $out['blocks'][ $key ] = $clean; }
            }
        }

        if ( ! empty( $data['dom'] ) && is_array( $data['dom'] ) ) {
            foreach ( array_slice( $data['dom'], 0, 250, true ) as $key => $item ) {
                $key = preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) $key ) );
                if ( ! $key || ! is_array( $item ) ) { continue; }
                $clean = array();
                if ( isset( $item['content'] ) ) { $clean['content'] = self::sanitize_content( $item['content'] ); }
                if ( ! empty( $item['styles'] ) && is_array( $item['styles'] ) ) {
                    foreach ( array( 'mobile', 'tablet', 'laptop', 'desktop' ) as $device ) {
                        if ( isset( $item['styles'][ $device ] ) ) { $clean['styles'][ $device ] = self::sanitize_style( $item['styles'][ $device ] ); }
                    }
                }
                if ( $clean ) { $out['dom'][ $key ] = $clean; }
            }
        }

        if ( ! empty( $data['order'] ) && is_array( $data['order'] ) ) {
            foreach ( array_slice( $data['order'], 0, 60 ) as $key ) {
                $key = preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) $key ) );
                if ( $key ) { $out['order'][] = $key; }
            }
        }
        return $out;
    }

    public static function ajax_save() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
        $raw = isset( $_POST['payload'] ) ? wp_unslash( $_POST['payload'] ) : '';
        $payload = json_decode( $raw, true );
        if ( ! is_array( $payload ) ) { wp_send_json_error( array( 'message' => 'Ungültige Daten.' ), 400 ); }

        $global = self::sanitize_scope_data( isset( $payload['global'] ) ? $payload['global'] : array() );
        $page   = self::sanitize_scope_data( isset( $payload['page'] ) ? $payload['page'] : array() );
        update_option( self::GLOBAL_OPTION, $global, false );
        $all = get_option( self::PAGES_OPTION, array() );
        if ( ! is_array( $all ) ) { $all = array(); }
        $all[ self::page_key() ] = $page;
        if ( count( $all ) > 120 ) { $all = array_slice( $all, -120, null, true ); }
        update_option( self::PAGES_OPTION, $all, false );
        wp_send_json_success( array( 'message' => 'Gespeichert.' ) );
    }

    private static function normalize( $text ) {
        $text = remove_accents( wp_strip_all_tags( (string) $text ) );
        $text = strtolower( $text );
        $text = preg_replace( '/[^a-z0-9]+/u', ' ', $text );
        return trim( preg_replace( '/\s+/', ' ', $text ) );
    }

    private static function repertoire_options() {
        $posts = get_posts( array( 'post_type' => 'kp_repertoire', 'post_status' => 'publish', 'posts_per_page' => -1, 'orderby' => 'title', 'order' => 'ASC' ) );
        $out = array();
        foreach ( $posts as $post ) { $out[] = array( 'id' => (int) $post->ID, 'title' => $post->post_title ); }
        return $out;
    }

    private static function find_termin( $signature ) {
        $title = isset( $signature['title'] ) ? self::normalize( $signature['title'] ) : '';
        $city  = isset( $signature['city'] ) ? self::normalize( $signature['city'] ) : '';
        $time  = isset( $signature['time'] ) ? sanitize_text_field( $signature['time'] ) : '';
        $posts = get_posts( array( 'post_type' => 'kp_termin', 'post_status' => array( 'publish', 'draft', 'future' ), 'posts_per_page' => -1 ) );
        $best = 0; $best_score = -1;
        foreach ( $posts as $post ) {
            $rep_id = absint( get_post_meta( $post->ID, '_kp_repertoire_id', true ) );
            $shown_title = $rep_id ? get_the_title( $rep_id ) : $post->post_title;
            $score = 0;
            if ( $title && self::normalize( $shown_title ) === $title ) { $score += 6; }
            elseif ( $title && false !== strpos( self::normalize( $shown_title ), $title ) ) { $score += 3; }
            if ( $city && self::normalize( get_post_meta( $post->ID, '_kp_city', true ) ) === $city ) { $score += 4; }
            if ( $time && get_post_meta( $post->ID, '_kp_time', true ) === $time ) { $score += 3; }
            if ( $score > $best_score ) { $best_score = $score; $best = (int) $post->ID; }
        }
        return $best_score >= 5 ? $best : 0;
    }

    private static function find_repertoire( $signature ) {
        $href = isset( $signature['href'] ) ? esc_url_raw( $signature['href'] ) : '';
        if ( $href ) {
            $path = trim( (string) wp_parse_url( $href, PHP_URL_PATH ), '/' );
            $parts = array_values( array_filter( explode( '/', $path ) ) );
            $slug = $parts ? end( $parts ) : '';
            if ( $slug ) {
                $post = get_page_by_path( sanitize_title( $slug ), OBJECT, 'kp_repertoire' );
                if ( $post ) { return (int) $post->ID; }
            }
        }
        $title = isset( $signature['title'] ) ? self::normalize( $signature['title'] ) : '';
        if ( $title ) {
            foreach ( get_posts( array( 'post_type' => 'kp_repertoire', 'post_status' => 'any', 'posts_per_page' => -1 ) ) as $post ) {
                if ( self::normalize( $post->post_title ) === $title ) { return (int) $post->ID; }
            }
        }
        return 0;
    }

    public static function ajax_record() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
        $type = isset( $_POST['type'] ) ? sanitize_key( wp_unslash( $_POST['type'] ) ) : '';
        $raw  = isset( $_POST['signature'] ) ? wp_unslash( $_POST['signature'] ) : '';
        $signature = json_decode( $raw, true );
        if ( ! is_array( $signature ) ) { $signature = array(); }

        if ( 'termin' === $type ) {
            $id = self::find_termin( $signature );
            if ( ! $id || ! current_user_can( 'edit_post', $id ) ) { wp_send_json_error( array( 'message' => 'Termin konnte nicht eindeutig gefunden werden. Bitte über „Alle Termine“ öffnen.' ) ); }
            wp_send_json_success( array(
                'type' => 'termin', 'id' => $id, 'title' => get_the_title( $id ),
                'date' => get_post_meta( $id, '_kp_date', true ), 'time' => get_post_meta( $id, '_kp_time', true ),
                'end_time' => get_post_meta( $id, '_kp_end_time', true ), 'city' => get_post_meta( $id, '_kp_city', true ),
                'venue' => get_post_meta( $id, '_kp_venue', true ), 'address' => get_post_meta( $id, '_kp_address', true ),
                'status' => get_post_meta( $id, '_kp_status', true ) ?: 'standard', 'note' => get_post_meta( $id, '_kp_note', true ),
                'ticket_url' => get_post_meta( $id, '_kp_ticket_url', true ), 'info_url' => get_post_meta( $id, '_kp_info_url', true ),
                'repertoire_id' => absint( get_post_meta( $id, '_kp_repertoire_id', true ) ), 'repertoire' => self::repertoire_options(),
                'edit_url' => get_edit_post_link( $id, 'raw' ),
            ) );
        }

        if ( 'repertoire' === $type ) {
            $id = self::find_repertoire( $signature );
            if ( ! $id || ! current_user_can( 'edit_post', $id ) ) { wp_send_json_error( array( 'message' => 'Stück konnte nicht eindeutig gefunden werden.' ) ); }
            $post = get_post( $id );
            $complex = has_blocks( $post->post_content );
            wp_send_json_success( array(
                'type' => 'repertoire', 'id' => $id, 'title' => $post->post_title, 'excerpt' => $post->post_excerpt,
                'description' => $complex ? '' : wp_strip_all_tags( $post->post_content ), 'complex' => $complex,
                'age' => get_post_meta( $id, '_kp_rep_age', true ), 'duration' => get_post_meta( $id, '_kp_rep_duration', true ),
                'players' => get_post_meta( $id, '_kp_rep_players', true ), 'play_style' => get_post_meta( $id, '_kp_rep_play_style', true ),
                'technical' => get_post_meta( $id, '_kp_rep_technical', true ), 'rights' => get_post_meta( $id, '_kp_rep_rights', true ),
                'premiere' => get_post_meta( $id, '_kp_rep_premiere', true ), 'bookable' => get_post_meta( $id, '_kp_rep_bookable', true ) !== '0',
                'thumbnail_id' => get_post_thumbnail_id( $id ), 'thumbnail_url' => get_the_post_thumbnail_url( $id, 'medium_large' ),
                'edit_url' => get_edit_post_link( $id, 'raw' ),
            ) );
        }
        wp_send_json_error( array( 'message' => 'Unbekannter Datentyp.' ), 400 );
    }

    private static function clean_url_field( $value ) { return $value ? esc_url_raw( $value ) : ''; }

    public static function ajax_record_save() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
        $type = isset( $_POST['type'] ) ? sanitize_key( wp_unslash( $_POST['type'] ) ) : '';
        $id   = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;
        $raw  = isset( $_POST['fields'] ) ? wp_unslash( $_POST['fields'] ) : '';
        $f    = json_decode( $raw, true );
        if ( ! $id || ! is_array( $f ) || ! current_user_can( 'edit_post', $id ) ) { wp_send_json_error( array( 'message' => 'Speichern nicht erlaubt.' ), 403 ); }

        if ( 'termin' === $type && 'kp_termin' === get_post_type( $id ) ) {
            $title = isset( $f['title'] ) ? sanitize_text_field( $f['title'] ) : get_the_title( $id );
            wp_update_post( array( 'ID' => $id, 'post_title' => $title ) );
            $map = array(
                '_kp_date' => 'date', '_kp_time' => 'time', '_kp_end_time' => 'end_time', '_kp_city' => 'city',
                '_kp_venue' => 'venue', '_kp_address' => 'address', '_kp_status' => 'status', '_kp_note' => 'note',
            );
            foreach ( $map as $meta => $field ) {
                $value = isset( $f[ $field ] ) ? sanitize_textarea_field( $f[ $field ] ) : '';
                if ( '' === $value ) { delete_post_meta( $id, $meta ); } else { update_post_meta( $id, $meta, $value ); }
            }
            foreach ( array( '_kp_ticket_url' => 'ticket_url', '_kp_info_url' => 'info_url' ) as $meta => $field ) {
                $value = isset( $f[ $field ] ) ? self::clean_url_field( $f[ $field ] ) : '';
                if ( $value ) { update_post_meta( $id, $meta, $value ); } else { delete_post_meta( $id, $meta ); }
            }
            $rep_id = isset( $f['repertoire_id'] ) ? absint( $f['repertoire_id'] ) : 0;
            if ( $rep_id && 'kp_repertoire' !== get_post_type( $rep_id ) ) { $rep_id = 0; }
            if ( $rep_id ) { update_post_meta( $id, '_kp_repertoire_id', $rep_id ); } else { delete_post_meta( $id, '_kp_repertoire_id' ); }
            $date = get_post_meta( $id, '_kp_date', true );
            $time = get_post_meta( $id, '_kp_time', true );
            if ( $date ) { update_post_meta( $id, '_kp_sort', $date . ' ' . ( $time ?: '23:59' ) ); }
            wp_send_json_success( array( 'message' => 'Termin gespeichert.' ) );
        }

        if ( 'repertoire' === $type && 'kp_repertoire' === get_post_type( $id ) ) {
            $update = array( 'ID' => $id );
            if ( isset( $f['title'] ) ) { $update['post_title'] = sanitize_text_field( $f['title'] ); }
            if ( isset( $f['excerpt'] ) ) { $update['post_excerpt'] = sanitize_textarea_field( $f['excerpt'] ); }
            if ( isset( $f['description'] ) && empty( $f['complex'] ) ) { $update['post_content'] = '<p>' . esc_html( sanitize_textarea_field( $f['description'] ) ) . '</p>'; }
            wp_update_post( $update );
            $map = array(
                '_kp_rep_age' => 'age', '_kp_rep_duration' => 'duration', '_kp_rep_players' => 'players',
                '_kp_rep_play_style' => 'play_style', '_kp_rep_technical' => 'technical', '_kp_rep_rights' => 'rights', '_kp_rep_premiere' => 'premiere',
            );
            foreach ( $map as $meta => $field ) {
                $value = isset( $f[ $field ] ) ? sanitize_textarea_field( $f[ $field ] ) : '';
                if ( '' === $value ) { delete_post_meta( $id, $meta ); } else { update_post_meta( $id, $meta, $value ); }
            }
            update_post_meta( $id, '_kp_rep_bookable', ! empty( $f['bookable'] ) ? '1' : '0' );
            $thumb = isset( $f['thumbnail_id'] ) ? absint( $f['thumbnail_id'] ) : 0;
            if ( $thumb && wp_attachment_is_image( $thumb ) ) { set_post_thumbnail( $id, $thumb ); }
            wp_send_json_success( array( 'message' => 'Stück gespeichert.' ) );
        }
        wp_send_json_error( array( 'message' => 'Datensatz konnte nicht gespeichert werden.' ), 400 );
    }
}
