<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

require_once __DIR__ . '/class-kp-section-action-applier.php';
require_once __DIR__ . '/class-kp-save-transaction.php';

/**
 * Koblenzer Puppenspiele – direct visual editor v2.
 *
 * Goals:
 * - durable saves (explicit page key, never derived from admin-ajax.php)
 * - direct inline text editing on the live site
 * - compact mobile inspector instead of a large form for simple text changes
 * - safe structured editors for Termine and Repertoire
 * - persistent fallback edits for dynamic shortcode output
 */
final class KP_Frontend_Editor_V2 {
    const GLOBAL_OPTION = 'kp_frontend_editor_global_v1';
    const PAGES_OPTION  = 'kp_frontend_editor_pages_v1';
    const NONCE_ACTION  = 'kp_frontend_editor_v2';

    public static function init() {
        add_filter( 'render_block', array( __CLASS__, 'render_block' ), 120, 2 );
        add_filter( 'render_block_data', array( __CLASS__, 'render_copy_context' ), 120, 3 );
        add_action( 'wp_head', array( __CLASS__, 'frontend_styles' ), 280 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ), 60 );
        add_action( 'admin_bar_menu', array( __CLASS__, 'admin_bar' ), 70 );
        add_action( 'admin_footer', array( __CLASS__, 'owner_hub_shortcut' ), 40 );

        add_action( 'wp_ajax_kp_fe_v2_save', array( __CLASS__, 'ajax_save' ) );
        add_action( 'wp_ajax_kp_fe_v2_record', array( __CLASS__, 'ajax_record' ) );
        add_action( 'wp_ajax_kp_fe_v2_record_save', array( __CLASS__, 'ajax_record_save' ) );
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

    private static function valid_page_key( $key ) {
        $key = strtolower( (string) $key );
        return preg_match( '/^(post-[0-9]+|path-[a-f0-9]{16})$/', $key ) ? $key : '';
    }

    private static function global_data() {
        $data = get_option( self::GLOBAL_OPTION, array() );
        return is_array( $data ) ? $data : array();
    }

    private static function page_data( $key = '' ) {
        $all = get_option( self::PAGES_OPTION, array() );
        if ( ! is_array( $all ) ) { return array(); }
        $key = $key ? self::valid_page_key( $key ) : self::page_key();
        return $key && isset( $all[ $key ] ) && is_array( $all[ $key ] ) ? $all[ $key ] : array();
    }

    private static function editable_block_names() {
        return array(
            'core/paragraph', 'core/heading', 'core/button', 'core/image', 'core/navigation-link',
            'core/list-item', 'core/group', 'core/cover', 'core/columns', 'core/column', 'core/buttons',
            'core/media-text', 'core/quote', 'core/pullquote', 'core/details', 'core/separator', 'core/spacer',
        );
    }

    private static function block_key( $block ) {
        $name  = isset( $block['blockName'] ) ? (string) $block['blockName'] : '';
        $attrs = isset( $block['attrs'] ) && is_array( $block['attrs'] ) ? $block['attrs'] : array();
        $anchor = preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) ( $attrs['anchor'] ?? '' ) ) );
        if ( $anchor ) { return 'a-' . $anchor; }
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

    private static function set_first_tag_attribute( $html, $name, $value ) {
        if ( class_exists( 'WP_HTML_Tag_Processor' ) ) {
            $processor = new WP_HTML_Tag_Processor( $html );
            if ( $processor->next_tag() ) {
                $processor->set_attribute( $name, $value );
                return $processor->get_updated_html();
            }
        }
        $pattern = '/^(\s*<[a-zA-Z0-9:-]+\b[^>]*?)\s+' . preg_quote( $name, '/' ) . '="[^"]*"/i';
        if ( preg_match( $pattern, $html ) ) { return preg_replace( $pattern, '$1 ' . $name . '="' . esc_attr( $value ) . '"', $html, 1 ); }
        return self::first_tag_attribute( $html, $name, $value );
    }

    private static function first_tag_attribute_value( $html, $name ) {
        if ( class_exists( 'WP_HTML_Tag_Processor' ) ) {
            $processor = new WP_HTML_Tag_Processor( $html );
            if ( $processor->next_tag() ) {
                $value = $processor->get_attribute( $name );
                return is_string( $value ) ? $value : '';
            }
        }
        return preg_match( '/^\s*<[a-zA-Z0-9:-]+\b[^>]*\s' . preg_quote( $name, '/' ) . '="([^"]*)"/i', $html, $match ) ? $match[1] : '';
    }

    private static function replace_id_reference_target( $html, $old_id, $new_id ) {
        if ( ! $old_id || $old_id === $new_id ) { return $html; }
        if ( class_exists( 'WP_HTML_Tag_Processor' ) ) {
            $processor = new WP_HTML_Tag_Processor( $html );
            while ( $processor->next_tag() ) {
                foreach ( array( 'for', 'list', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'headers' ) as $reference ) {
                    $value = $processor->get_attribute( $reference );
                    if ( ! is_string( $value ) ) { continue; }
                    $values = preg_split( '/\s+/', trim( $value ) );
                    $processor->set_attribute( $reference, implode( ' ', array_map( static function ( $item ) use ( $old_id, $new_id ) { return $item === $old_id ? $new_id : $item; }, $values ) ) );
                }
                if ( '#' . $old_id === $processor->get_attribute( 'href' ) ) { $processor->set_attribute( 'href', '#' . $new_id ); }
            }
            return $processor->get_updated_html();
        }
        $html = preg_replace_callback(
            '/\b(for|list|aria-labelledby|aria-describedby|aria-controls|aria-owns|headers)="([^"]+)"/i',
            static function ( $match ) use ( $old_id, $new_id ) {
                $values = preg_split( '/\s+/', trim( $match[2] ) );
                return $match[1] . '="' . esc_attr( implode( ' ', array_map( static function ( $item ) use ( $old_id, $new_id ) { return $item === $old_id ? $new_id : $item; }, $values ) ) ) . '"';
            },
            $html
        );
        return preg_replace( '/\bhref="#' . preg_quote( $old_id, '/' ) . '"/i', 'href="#' . esc_attr( $new_id ) . '"', $html );
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

    private static function rewrite_copy_markup( $html, $token ) {
        $token = sanitize_key( $token );
        $prefix = $token . '-';
        if ( class_exists( 'WP_HTML_Tag_Processor' ) ) {
            $ids = array();
            $collector = new WP_HTML_Tag_Processor( $html );
            $first = true;
            while ( $collector->next_tag() ) {
                $id = $collector->get_attribute( 'id' );
                if ( ! $first && is_string( $id ) && '' !== $id ) { $ids[ $id ] = $prefix . $id; }
                $first = false;
            }
            $processor = new WP_HTML_Tag_Processor( $html );
            $first = true;
            while ( $processor->next_tag() ) {
                $id = $processor->get_attribute( 'id' );
                if ( ! $first && is_string( $id ) && isset( $ids[ $id ] ) ) { $processor->set_attribute( 'id', $ids[ $id ] ); }
                foreach ( array( 'for', 'list', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'headers' ) as $reference ) {
                    $value = $processor->get_attribute( $reference );
                    if ( ! is_string( $value ) || '' === trim( $value ) ) { continue; }
                    $values = preg_split( '/\s+/', trim( $value ) );
                    $processor->set_attribute( $reference, implode( ' ', array_map( static function ( $item ) use ( $ids ) { return $ids[ $item ] ?? $item; }, $values ) ) );
                }
                $href = $processor->get_attribute( 'href' );
                if ( is_string( $href ) && strlen( $href ) > 1 && '#' === $href[0] ) {
                    $target = substr( $href, 1 );
                    if ( isset( $ids[ $target ] ) ) { $processor->set_attribute( 'href', '#' . $ids[ $target ] ); }
                }
                if ( $first ) {
                    $processor->set_attribute( 'data-kp-section-copy', $token );
                    $first = false;
                    continue;
                }
                foreach ( array( 'data-kp-edit-key', 'data-kp-dom-key' ) as $attribute ) {
                    $value = $processor->get_attribute( $attribute );
                    if ( is_string( $value ) && '' !== $value && 0 !== strpos( $value, 'dup-' . $token . '-' ) ) { $processor->set_attribute( $attribute, 'dup-' . $token . '-' . $value ); }
                }
            }
            return $processor->get_updated_html();
        }
        preg_match_all( '/\bid="([^"]+)"/i', $html, $id_matches );
        $all_ids = $id_matches[1] ?? array();
        if ( $all_ids ) { array_shift( $all_ids ); }
        $ids = array();
        foreach ( $all_ids as $id ) { $ids[ $id ] = $prefix . $id; }
        $html = preg_replace_callback(
                    '/\b(data-kp-(?:edit|dom)-key)="([^"]+)"/i',
                    static function ( $match ) use ( $token ) {
                        return 0 === strpos( $match[2], 'dup-' . $token . '-' ) ? $match[0] : $match[1] . '="' . esc_attr( 'dup-' . $token . '-' . $match[2] ) . '"';
                    },
                    $html
                );
        $html = preg_replace_callback(
            '/\b(id|for|list|aria-labelledby|aria-describedby|aria-controls|aria-owns|headers)="([^"]+)"/i',
            static function ( $match ) use ( $ids ) {
                $values = preg_split( '/\s+/', trim( $match[2] ) );
                return $match[1] . '="' . esc_attr( implode( ' ', array_map( static function ( $item ) use ( $ids ) { return $ids[ $item ] ?? $item; }, $values ) ) ) . '"';
            },
            $html
        );
        $html = preg_replace_callback(
            '/\bhref="#([^"]+)"/i',
            static function ( $match ) use ( $ids ) { return isset( $ids[ $match[1] ] ) ? 'href="#' . esc_attr( $ids[ $match[1] ] ) . '"' : $match[0]; },
            $html
        );
        return self::first_tag_attribute( $html, 'data-kp-section-copy', $token );
    }

    private static function rewrite_block_references( $block, $old_id, $new_id ) {
        $block['innerHTML'] = self::replace_id_reference_target( (string) ( $block['innerHTML'] ?? '' ), $old_id, $new_id );
        foreach ( $block['innerContent'] ?? array() as $index => $fragment ) {
            if ( is_string( $fragment ) ) { $block['innerContent'][ $index ] = self::replace_id_reference_target( $fragment, $old_id, $new_id ); }
        }
        foreach ( $block['attrs'] ?? array() as $name => $value ) {
            if ( ! is_string( $value ) ) { continue; }
            if ( in_array( $name, array( 'url', 'href' ), true ) && '#' . $old_id === $value ) { $block['attrs'][ $name ] = '#' . $new_id; }
            elseif ( in_array( $name, array( 'content', 'text' ), true ) ) { $block['attrs'][ $name ] = self::replace_id_reference_target( $value, $old_id, $new_id ); }
        }
        foreach ( $block['innerBlocks'] ?? array() as $index => $child ) { $block['innerBlocks'][ $index ] = self::rewrite_block_references( $child, $old_id, $new_id ); }
        return $block;
    }

    private static function migrate_copy_child_keys( $source, $copy, &$page, $token ) {
        foreach ( $source['innerBlocks'] ?? array() as $index => $child ) {
            $new_child = $copy['innerBlocks'][ $index ];
            $old = 'dup-' . $token . '-' . self::block_key( $child );
            $new = 'dup-' . $token . '-' . self::block_key( $new_child );
            if ( $old !== $new ) {
                $page['section_key_map'][ $old ] = array( $new );
                foreach ( array( 'blocks', 'dom' ) as $collection ) {
                    if ( isset( $page[ $collection ][ $old ] ) ) {
                        if ( ! isset( $page[ $collection ][ $new ] ) ) { $page[ $collection ][ $new ] = $page[ $collection ][ $old ]; }
                        unset( $page[ $collection ][ $old ] );
                    }
                }
            }
            self::migrate_copy_child_keys( $child, $new_child, $page, $token );
        }
    }

    private static function prepare_copied_block( $block, $anchor ) {
        if ( ! isset( $block['attrs'] ) || ! is_array( $block['attrs'] ) ) { $block['attrs'] = array(); }
        $old_id = self::first_tag_attribute_value( (string) ( $block['innerHTML'] ?? '' ), 'id' );
        if ( $old_id && $old_id !== $anchor ) { $block = self::rewrite_block_references( $block, $old_id, $anchor ); }
        $block['attrs']['anchor'] = $anchor;
        $block['innerHTML'] = self::replace_id_reference_target( (string) ( $block['innerHTML'] ?? '' ), $old_id, $anchor );
        $block['innerHTML'] = self::set_first_tag_attribute( $block['innerHTML'], 'id', $anchor );
        if ( ! empty( $block['innerContent'] ) && is_array( $block['innerContent'] ) ) {
            foreach ( $block['innerContent'] as $index => $fragment ) {
                if ( ! is_string( $fragment ) ) { continue; }
                $block['innerContent'][ $index ] = self::replace_id_reference_target( $fragment, $old_id, $anchor );
            }
            foreach ( $block['innerContent'] as $index => $fragment ) {
                if ( ! is_string( $fragment ) || false === strpos( $fragment, '<' ) ) { continue; }
                $block['innerContent'][ $index ] = self::set_first_tag_attribute( $fragment, 'id', $anchor );
                break;
            }
        }
        return $block;
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

    public static function render_copy_context( $block, $source, $parent ) {
        // Render-only metadata, outside attrs: it must not affect Gutenberg serialization or hashes.
        unset( $block['_kp_copy_context'] );
        if ( $parent instanceof WP_Block ) {
            $anchor = sanitize_key( (string) ( $parent->parsed_block['attrs']['anchor'] ?? '' ) );
            $token = 0 === strpos( $anchor, 'kp-copy-' ) ? $anchor : ( $parent->parsed_block['_kp_copy_context'] ?? '' );
            if ( $token ) { $block['_kp_copy_context'] = $token; }
        }
        return $block;
    }

    public static function render_block( $block_content, $block ) {
        if ( is_admin() || empty( $block['blockName'] ) || ! in_array( $block['blockName'], self::editable_block_names(), true ) ) {
            return $block_content;
        }
        $key = self::block_key( $block );
        if ( ! empty( $block['_kp_copy_context'] ) ) { $key = 'dup-' . $block['_kp_copy_context'] . '-' . $key; }
        $ov  = self::merged_block_override( $key );
        if ( ! empty( $ov['content'] ) && is_array( $ov['content'] ) ) {
            $content = $ov['content'];
            $type = isset( $content['type'] ) ? $content['type'] : '';
            if ( 'html' === $type && isset( $content['value'] ) ) {
                $block_content = self::replace_simple_inner( $block_content, wp_kses_post( $content['value'] ) );
            } elseif ( 'link' === $type ) {
                $block_content = self::replace_anchor(
                    $block_content,
                    isset( $content['label'] ) ? sanitize_text_field( $content['label'] ) : '',
                    isset( $content['href'] ) ? esc_url_raw( $content['href'] ) : ''
                );
            } elseif ( 'image' === $type ) {
                $block_content = self::replace_image(
                    $block_content,
                    isset( $content['src'] ) ? esc_url_raw( $content['src'] ) : '',
                    isset( $content['alt'] ) ? sanitize_text_field( $content['alt'] ) : ''
                );
            }
        }
        $block_content = self::first_tag_attribute( $block_content, 'data-kp-edit-key', $key );
        $block_content = self::first_tag_attribute( $block_content, 'data-kp-block-name', $block['blockName'] );
        $anchor = sanitize_key( (string) ( $block['attrs']['anchor'] ?? '' ) );
        if ( 0 === strpos( $anchor, 'kp-copy-' ) ) { $block_content = self::rewrite_copy_markup( $block_content, $anchor ); }
        return $block_content;
    }

    private static function css_for_style( $style ) {
        if ( ! is_array( $style ) ) { return ''; }
        $css = array();
        if ( isset( $style['font_px'] ) ) { $css[] = 'font-size:' . round( max( 8, min( 120, (float) $style['font_px'] ) ), 2 ) . 'px!important'; }
        if ( isset( $style['padding_y'] ) ) {
            $v = round( max( 0, min( 180, (float) $style['padding_y'] ) ), 2 );
            $css[] = 'padding-top:' . $v . 'px!important';
            $css[] = 'padding-bottom:' . $v . 'px!important';
        }
        if ( isset( $style['width_pct'] ) ) {
            $v = max( 30, min( 100, (int) $style['width_pct'] ) );
            $css[] = 'width:' . $v . '%!important';
            $css[] = 'max-width:' . $v . '%!important';
        }
        if ( ! empty( $style['color'] ) && sanitize_hex_color( $style['color'] ) ) { $css[] = 'color:' . sanitize_hex_color( $style['color'] ) . '!important'; }
        if ( ! empty( $style['background'] ) && sanitize_hex_color( $style['background'] ) ) { $css[] = 'background-color:' . sanitize_hex_color( $style['background'] ) . '!important'; }
        if ( isset( $style['radius'] ) ) { $css[] = 'border-radius:' . max( 0, min( 80, (int) $style['radius'] ) ) . 'px!important'; }
        if ( ! empty( $style['align'] ) && in_array( $style['align'], array( 'left', 'center', 'right' ), true ) ) { $css[] = 'text-align:' . $style['align'] . '!important'; }
        if ( ! empty( $style['hidden'] ) ) { $css[] = 'display:none!important'; }
        return implode( ';', $css );
    }

    public static function frontend_styles() {
        if ( is_admin() ) { return; }
        $global = self::global_data();
        $page   = self::page_data();
        $blocks = array();
        foreach ( array( $global, $page ) as $data ) {
            if ( empty( $data['blocks'] ) || ! is_array( $data['blocks'] ) ) { continue; }
            foreach ( $data['blocks'] as $key => $item ) {
                if ( ! isset( $blocks[ $key ] ) ) { $blocks[ $key ] = array(); }
                if ( is_array( $item ) ) { $blocks[ $key ] = array_replace_recursive( $blocks[ $key ], $item ); }
            }
        }
        $devices = array(
            'mobile'  => '@media(max-width:640px)',
            'tablet'  => '@media(min-width:641px) and (max-width:900px)',
            'laptop'  => '@media(min-width:901px) and (max-width:1400px)',
            'desktop' => '@media(min-width:1401px)',
        );
        $out = '';
        foreach ( $devices as $device => $media ) {
            $rules = '';
            foreach ( $blocks as $key => $item ) {
                if ( empty( $item['styles'][ $device ] ) ) { continue; }
                $css = self::css_for_style( $item['styles'][ $device ] );
                if ( $css ) { $rules .= '[data-kp-edit-key="' . esc_attr( $key ) . '"]{' . $css . '}'; }
            }
            if ( $rules ) { $out .= $media . '{' . $rules . '}'; }
        }
        if ( $out ) { echo '<style id="kp-fe-v2-persisted">' . $out . '</style>'; } // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }

    private static function current_url( $edit = false ) {
        $uri  = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/';
        $path = (string) wp_parse_url( $uri, PHP_URL_PATH );
        $url  = home_url( $path ?: '/' );
        return $edit ? add_query_arg( 'kp_edit', '1', $url ) : $url;
    }

    public static function enqueue_assets() {
        if ( is_admin() ) { return; }
        $js_path = KP_CORE_DIR . 'assets/frontend-editor-v2.js';
        $css_path = KP_CORE_DIR . 'assets/frontend-editor-v2.css';
        $js_version = file_exists( $js_path ) ? substr( hash_file( 'sha256', $js_path ), 0, 12 ) : KP_CORE_VERSION;
        $css_version = file_exists( $css_path ) ? substr( hash_file( 'sha256', $css_path ), 0, 12 ) : KP_CORE_VERSION;
        $asset_version = KP_CORE_VERSION . '-fe2-20260905-3-' . $js_version;
        wp_enqueue_script( 'kp-frontend-editor-v2', KP_CORE_URL . 'assets/frontend-editor-v2.js', array(), $asset_version, true );
        if ( self::edit_mode() ) {
            wp_enqueue_media();
            wp_enqueue_style( 'dashicons' );
            wp_enqueue_style( 'kp-frontend-editor-v2', KP_CORE_URL . 'assets/frontend-editor-v2.css', array(), $css_version );
        }
        $payload = array(
            'editMode'       => self::edit_mode(),
            'canEdit'        => self::can_edit(),
            'ajaxUrl'        => admin_url( 'admin-ajax.php' ),
            'nonce'          => self::can_edit() ? wp_create_nonce( self::NONCE_ACTION ) : '',
            'pageKey'        => self::page_key(),
            'global'         => self::global_data(),
            'page'           => self::page_data(),
            'exitUrl'        => self::current_url( false ),
            'editUrl'        => self::current_url( true ),
            'pageEditorUrl'  => ( get_queried_object_id() && current_user_can( 'edit_post', get_queried_object_id() ) ) ? get_edit_post_link( get_queried_object_id(), 'raw' ) : '',
            'studioUrl'      => current_user_can( 'edit_theme_options' ) ? admin_url( 'admin.php?page=kp-website-studio' ) : '',
            'termineUrl'     => admin_url( 'edit.php?post_type=kp_termin' ),
            'newTerminUrl'   => admin_url( 'post-new.php?post_type=kp_termin' ),
            'repertoireUrl'  => admin_url( 'edit.php?post_type=kp_repertoire' ),
        );
        wp_add_inline_script( 'kp-frontend-editor-v2', 'window.KPFrontendEditorV2=' . wp_json_encode( $payload ) . ';', 'before' );
    }

    public static function admin_bar( $bar ) {
        if ( is_admin() || ! self::can_edit() ) { return; }
        $bar->add_node( array(
            'id'    => 'kp-frontend-edit-v2',
            'title' => self::edit_mode() ? '✓ Direktbearbeitung aktiv' : '✏️ Website direkt bearbeiten',
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
        <script id="kp-owner-direct-edit-v2-shortcut">
        document.addEventListener('DOMContentLoaded',()=>{
          const grid=document.querySelector('.kp-owner-hub-grid');
          if(!grid||document.querySelector('.kp-owner-direct-edit-card'))return;
          const a=document.createElement('a');
          a.className='kp-owner-hub-card is-primary kp-owner-direct-edit-card';
          a.href=<?php echo wp_json_encode( $url ); ?>;
          a.innerHTML='<span class="dashicons dashicons-welcome-view-site"></span><strong>Website direkt bearbeiten</strong><small>Seite öffnen, Text oder Bild antippen, ändern und speichern.</small>';
          grid.prepend(a);
        });
        </script>
        <?php
    }

    private static function sanitize_content( $content ) {
        if ( ! is_array( $content ) ) { return array(); }
        $type = isset( $content['type'] ) ? sanitize_key( $content['type'] ) : '';
        if ( 'html' === $type ) { return array( 'type' => 'html', 'value' => isset( $content['value'] ) ? wp_kses_post( $content['value'] ) : '' ); }
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
        $out = array( 'blocks' => array(), 'dom' => array(), 'order' => array(), 'section_actions' => array() );
        if ( ! is_array( $data ) ) { return $out; }
        foreach ( array( 'blocks', 'dom' ) as $collection ) {
            if ( empty( $data[ $collection ] ) || ! is_array( $data[ $collection ] ) ) { continue; }
            foreach ( array_slice( $data[ $collection ], 0, 400, true ) as $key => $item ) {
                $key = preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) $key ) );
                if ( ! $key || ! is_array( $item ) ) { continue; }
                $clean = array();
                if ( isset( $item['content'] ) ) { $clean['content'] = self::sanitize_content( $item['content'] ); }
                if ( ! empty( $item['styles'] ) && is_array( $item['styles'] ) ) {
                    foreach ( array( 'mobile', 'tablet', 'laptop', 'desktop' ) as $device ) {
                        if ( isset( $item['styles'][ $device ] ) ) { $clean['styles'][ $device ] = self::sanitize_style( $item['styles'][ $device ] ); }
                    }
                }
                if ( $clean ) { $out[ $collection ][ $key ] = $clean; }
            }
        }
        if ( ! empty( $data['order'] ) && is_array( $data['order'] ) ) {
            foreach ( array_slice( $data['order'], 0, 80 ) as $key ) {
                $key = preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) $key ) );
                if ( $key ) { $out['order'][] = $key; }
            }
        }
        if ( ! empty( $data['section_actions'] ) && is_array( $data['section_actions'] ) ) {
            foreach ( array_slice( $data['section_actions'], 0, 10 ) as $action ) {
                if ( ! is_array( $action ) || 'duplicate' !== ( $action['type'] ?? '' ) ) { continue; }
                $key = preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) ( $action['key'] ?? '' ) ) );
                $token = preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) ( $action['token'] ?? '' ) ) );
                if ( $key && $token && strlen( $token ) <= 64 ) {
                    $out['section_actions'][] = array( 'type' => 'duplicate', 'key' => $key, 'token' => $token );
                }
            }
        }
        return $out;
    }

    private static function collect_anchor_aliases( $blocks, &$existing, &$key_map, $copy = '' ) {
        foreach ( $blocks as $block ) {
            $anchor = (string) ( $block['attrs']['anchor'] ?? '' );
            if ( ! $anchor ) { $anchor = self::first_tag_attribute_value( (string) ( $block['innerHTML'] ?? '' ), 'id' ); }
            if ( $anchor ) {
                $identity = $copy . preg_replace( '/[^a-z0-9\-]/', '', strtolower( $anchor ) );
                if ( ! $identity || isset( $existing[ $identity ] ) ) { throw new RuntimeException( 'Vorhandene HTML-Anker sind nicht eindeutig. Speichern wurde ohne Inhaltsänderung abgebrochen.' ); }
                $existing[ $identity ] = true;
            }
            // Also migrate legacy key for blocks with a public HTML id (not just explicit anchor attr).
                        $public_id = self::first_tag_attribute_value( (string) ( $block['innerHTML'] ?? '' ), 'id' );
                        if ( ! empty( $block['attrs']['anchor'] ) || $public_id ) {
                            $legacy = 'b-' . substr( hash( 'sha256', (string) $block['blockName'] . '|' . wp_json_encode( $block['attrs'] ) . '|' . trim( (string) ( $block['innerHTML'] ?? '' ) ) ), 0, 18 );
                            $key_map[ $copy . $legacy ] = array( $copy . self::block_key( $block ) );
                        }
            $child_copy = 0 === strpos( $anchor, 'kp-copy-' ) ? 'dup-' . $anchor . '-' : $copy;
            self::collect_anchor_aliases( $block['innerBlocks'] ?? array(), $existing, $key_map, $child_copy );
        }
    }

    private static function stabilize_section_blocks( &$blocks, &$page, $allowed ) {
        $existing = array();
        $key_map = array();
        self::collect_anchor_aliases( $blocks, $existing, $key_map );
        $changed = 0;
        foreach ( $blocks as $index => $block ) {
            if ( ! in_array( (string) ( $block['blockName'] ?? '' ), $allowed, true ) ) { continue; }
            if ( sanitize_key( (string) ( $block['attrs']['anchor'] ?? '' ) ) ) {
                continue;
            }
            $old_key = self::block_key( $block );
            // A public HTML ID is already an identity: never orphan incoming links.
            $anchor = self::first_tag_attribute_value( (string) ( $block['innerHTML'] ?? '' ), 'id' );
            if ( ! $anchor ) {
                do {
                    $anchor = 'kp-section-' . sanitize_key( wp_generate_uuid4() );
                } while ( isset( $existing[ $anchor ] ) );
            }
            $existing[ $anchor ] = true;
            $blocks[ $index ] = self::prepare_copied_block( $block, $anchor );
            $key_map[ $old_key ][] = self::block_key( $blocks[ $index ] );
            $changed++;
        }
        // Server-owned aliases survive a lost AJAX response and identical payload retry.
        $key_map = array_replace( isset( $page['section_key_map'] ) && is_array( $page['section_key_map'] ) ? $page['section_key_map'] : array(), $key_map );
        $page['section_key_map'] = $key_map;
        if ( ! $key_map ) { return 0; }
        foreach ( array( 'blocks', 'dom' ) as $collection ) {
            foreach ( $key_map as $old_key => $new_keys ) {
                if ( ! isset( $page[ $collection ][ $old_key ] ) ) { continue; }
                foreach ( $new_keys as $new_key ) {
                    if ( ! isset( $page[ $collection ][ $new_key ] ) ) { $page[ $collection ][ $new_key ] = $page[ $collection ][ $old_key ]; }
                }
                unset( $page[ $collection ][ $old_key ] );
            }
        }
        if ( ! empty( $page['order'] ) && is_array( $page['order'] ) ) {
            $positions = array();
            foreach ( $page['order'] as &$order_key ) {
                $old_order_key = $order_key;
                if ( empty( $key_map[ $old_order_key ] ) ) { continue; }
                $position = $positions[ $old_order_key ] ?? 0;
                $mapped = $key_map[ $old_order_key ][ min( $position, count( $key_map[ $old_order_key ] ) - 1 ) ];
                $order_key = $mapped;
                $positions[ $old_order_key ] = $position + 1;
            }
            unset( $order_key );
        }
        foreach ( $page['section_actions'] as &$action ) {
            $old_key = (string) ( $action['key'] ?? '' );
            if ( empty( $key_map[ $old_key ] ) ) { continue; }
            if ( 1 !== count( $key_map[ $old_key ] ) ) { throw new RuntimeException( 'Identische Bereiche müssen vor dem Duplizieren einmal gespeichert und neu geladen werden.' ); }
            $action['key'] = $key_map[ $old_key ][0];
        }
        unset( $action );
        return $changed;
    }

    public static function section_action_block_key( $block ) {
        return self::block_key( $block );
    }

    public static function section_action_prepare_copy( $block, $anchor ) {
        return self::prepare_copied_block( $block, $anchor );
    }

    public static function section_action_migrate_child_keys( $source, $copy, &$page, $token ) {
        self::migrate_copy_child_keys( $source, $copy, $page, $token );
    }

    public static function section_action_stabilize_blocks( &$blocks, &$page, $allowed ) {
        return self::stabilize_section_blocks( $blocks, $page, $allowed );
    }

    public static function section_action_ensure_revision( $post_id, $content ) {
        self::ensure_revision( $post_id, $content );
    }

    private static function apply_section_actions( &$page, $page_key, &$expected_post = null ) {
        return KP_Section_Action_Applier::apply( $page, $page_key, $expected_post );
        /*
        if ( ! empty( $page['duplicates'] ) ) { throw new RuntimeException( 'Vorhandene Metadatenkopien müssen vor dem Speichern geprüft und verlustfrei migriert werden.' ); }
        $actions = isset( $page['section_actions'] ) && is_array( $page['section_actions'] ) ? $page['section_actions'] : array();
        $page['section_actions'] = array();
        if ( ! preg_match( '/^post-([0-9]+)$/', (string) $page_key, $match ) ) {
            if ( ! $actions ) { return 0; }
            throw new RuntimeException( 'Bereiche können nur auf einer gespeicherten WordPress-Seite dupliziert werden.' );
        }
        $post_id = (int) $match[1];
        if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
            throw new RuntimeException( 'Keine Berechtigung zum Duplizieren dieses Bereichs.' );
        }
        // The AJAX caller owns the shared options/post transaction and connection lock.
        $post = get_post( $post_id );
        if ( ! $post ) { throw new RuntimeException( 'Die WordPress-Seite wurde nicht gefunden.' ); }
        $blocks = parse_blocks( (string) $post->post_content );
        $allowed = array( 'core/group', 'core/cover', 'core/columns', 'core/media-text' );
        $page['section_actions'] = $actions;
        $stabilized = self::stabilize_section_blocks( $blocks, $page, $allowed );
        $actions = $page['section_actions'];
        $page['section_actions'] = array();
        $created = 0;
        foreach ( $actions as $action ) {
            $token = sanitize_key( (string) ( $action['token'] ?? '' ) );
            if ( 0 !== strpos( $token, 'kp-copy-' ) || strlen( $token ) > 64 ) { throw new RuntimeException( 'Ungültige Kennung für die Abschnittskopie.' ); }
            $already_exists = false;
            foreach ( $blocks as $block ) {
                if ( $token === sanitize_key( (string) ( $block['attrs']['anchor'] ?? '' ) ) ) { $already_exists = true; break; }
            }
            if ( $already_exists ) { continue; }
            $matches = array();
            foreach ( $blocks as $index => $block ) {
                if ( self::block_key( $block ) === ( $action['key'] ?? '' ) ) { $matches[] = $index; }
            }
            if ( 1 !== count( $matches ) ) {
                throw new RuntimeException( 'Der ausgewählte Bereich ist nicht mehr eindeutig. Bitte die Seite neu laden.' );
            }
            $index = $matches[0];
            if ( ! in_array( (string) ( $blocks[ $index ]['blockName'] ?? '' ), $allowed, true ) ) {
                throw new RuntimeException( 'Dieser Blocktyp kann aus Sicherheitsgründen nicht direkt dupliziert werden.' );
            }
            $copy = self::prepare_copied_block( $blocks[ $index ], $token );
            self::migrate_copy_child_keys( $blocks[ $index ], $copy, $page, $token );
            array_splice( $blocks, $index + 1, 0, array( $copy ) );
            $new_key = 'a-' . $token;
            if ( ! empty( $page['order'] ) && is_array( $page['order'] ) ) {
                $position = array_search( (string) $action['key'], $page['order'], true );
                if ( false !== $position && ! in_array( $new_key, $page['order'], true ) ) { array_splice( $page['order'], $position + 1, 0, array( $new_key ) ); }
            }
            $created++;
        }
        if ( ! empty( $page['order'] ) && is_array( $page['order'] ) ) { $page['order'] = array_values( array_unique( $page['order'] ) ); }
        if ( $created || $stabilized ) {
            $expected_post = array( 'ID' => $post_id, 'post_content' => serialize_blocks( $blocks ) );
            if ( ! wp_revisions_enabled( $post ) ) { throw new RuntimeException( 'Sicheres Speichern erfordert aktivierte WordPress-Revisionen.' ); }
            self::ensure_revision( $post_id, (string) $post->post_content );
            $result = wp_update_post( wp_slash( $expected_post ), true );
            if ( is_wp_error( $result ) ) { throw new RuntimeException( $result->get_error_message() ); }
            if ( (int) $result !== $post_id ) { throw new RuntimeException( 'Die WordPress-Seite konnte nicht gespeichert werden.' ); }
            self::ensure_revision( $post_id, $expected_post['post_content'] );
        }
        return $created;
        */
    }

    private static function ensure_revision( $post_id, $content ) {
        global $wpdb;
        $result = wp_save_post_revision( $post_id );
        if ( is_wp_error( $result ) ) { throw new RuntimeException( 'Die WordPress-Revision konnte nicht gespeichert werden.' ); }
        $revision = $wpdb->get_var( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_parent = %d AND post_type = 'revision' AND BINARY post_content = BINARY %s ORDER BY ID DESC LIMIT 1", $post_id, $content ) );
        if ( $wpdb->last_error || ! $revision ) { throw new RuntimeException( 'Die gespeicherte WordPress-Revision konnte nicht nachgewiesen werden.' ); }
    }

    private static function clear_save_cache( $post_id ) {
        foreach ( array( self::GLOBAL_OPTION, self::PAGES_OPTION, 'alloptions', 'notoptions' ) as $key ) { wp_cache_delete( $key, 'options' ); }
        if ( $post_id ) { clean_post_cache( $post_id ); }
    }

    private static function checked_option_read( $key ) {
        global $wpdb;
        $raw = $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s FOR UPDATE", $key ) );
        if ( $wpdb->last_error ) { throw new RuntimeException( 'Editoroptionen konnten nicht sicher gelesen werden. Es wurde nichts gespeichert.' ); }
        if ( null === $raw ) { return array(); }
        $value = maybe_unserialize( $raw );
        if ( ! is_array( $value ) ) { throw new RuntimeException( 'Vorhandene Editoroptionen sind beschädigt. Speichern wurde abgebrochen.' ); }
        return $value;
    }

    private static function checked_option_write( $key, $value ) {
        // update_option(false) also means unchanged: only a DB readback decides success.
        update_option( $key, $value, false );
        self::verify_option_value( $key, $value );
    }

    private static function verify_option_value( $key, $value ) {
        global $wpdb;
        $actual = $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", $key ) );
        if ( $wpdb->last_error || (string) maybe_serialize( $value ) !== $actual ) {
            throw new RuntimeException( 'Editoroptionen konnten nicht vollständig gespeichert werden. Bitte erneut versuchen.' );
        }
    }

    private static function text_patches() {
        $raw = isset( $_POST['kp_text_patches'] ) ? wp_unslash( $_POST['kp_text_patches'] ) : '';
        $items = $raw ? json_decode( $raw, true ) : array();
        if ( ! is_array( $items ) ) { return array(); }
        $out = array();
        foreach ( array_slice( $items, 0, 80 ) as $item ) {
            if ( ! is_array( $item ) ) { continue; }
            $scope = isset( $item['scope'] ) && 'global' === $item['scope'] ? 'global' : 'page';
            $collection = isset( $item['collection'] ) && 'dom' === $item['collection'] ? 'dom' : 'blocks';
            $key = isset( $item['key'] ) ? preg_replace( '/[^a-z0-9\\-]/', '', strtolower( (string) $item['key'] ) ) : '';
            if ( ! $key ) { continue; }
            $out[] = array(
                'scope'      => $scope,
                'collection' => $collection,
                'key'        => $key,
                'html'       => isset( $item['html'] ) ? wp_kses_post( $item['html'] ) : '',
            );
        }
        return $out;
    }

    private static function apply_text_patches( &$global, &$page, $patches ) {
        foreach ( $patches as $patch ) {
            $target =& $page;
            if ( 'global' === $patch['scope'] ) { $target =& $global; }
            $collection = $patch['collection'];
            $key = $patch['key'];
            if ( ! isset( $target[ $collection ] ) || ! is_array( $target[ $collection ] ) ) { $target[ $collection ] = array(); }
            if ( ! isset( $target[ $collection ][ $key ] ) || ! is_array( $target[ $collection ][ $key ] ) ) { $target[ $collection ][ $key ] = array(); }
            $target[ $collection ][ $key ]['content'] = array(
                'type'  => 'html',
                'value' => $patch['html'],
            );
            unset( $target );
        }
    }

    public static function ajax_save() {
            if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
            check_ajax_referer( self::NONCE_ACTION, 'nonce' );
            $page_key = isset( $_POST['page_key'] ) ? self::valid_page_key( sanitize_text_field( wp_unslash( $_POST['page_key'] ) ) ) : '';
            if ( ! $page_key ) { wp_send_json_error( array( 'message' => 'Seite konnte beim Speichern nicht eindeutig erkannt werden.' ), 400 ); }
            $post_id = preg_match( '/^post-([0-9]+)$/', $page_key, $post_match ) ? (int) ( $post_match[1] ?? 0 ) : 0;
            if ( $post_id ? ! current_user_can( 'edit_post', $post_id ) : ! current_user_can( 'edit_pages' ) ) {
                wp_send_json_error( array( 'message' => 'Keine Berechtigung zum Speichern dieser Seite.' ), 403 );
            }
            $raw = isset( $_POST['payload'] ) ? wp_unslash( $_POST['payload'] ) : '';
            $payload = json_decode( $raw, true );
            if ( ! is_array( $payload ) ) { wp_send_json_error( array( 'message' => 'Ungültige Daten.' ), 400 ); }

            // Merge text patches from Android/IME composition (sent by Reliability JS guard).
                    $patches = KP_Text_Patcher::parse_request();
                    if ( $patches ) {
                        if ( ! isset( $payload['global'] ) || ! is_array( $payload['global'] ) ) { $payload['global'] = array(); }
                        if ( ! isset( $payload['page'] ) || ! is_array( $payload['page'] ) ) { $payload['page'] = array(); }
                        KP_Text_Patcher::apply( $payload['global'], $payload['page'], $patches );
                    }

            $transaction_result = null;
            try {
                $transaction_result = KP_Save_Transaction::run(
                    $page_key,
                    static function ( $save_db, $post_id ) use ( $payload, $page_key ) {
                        self::clear_save_cache( $post_id );
                        $all = self::checked_option_read( self::PAGES_OPTION );
                        $stored_global = self::checked_option_read( self::GLOBAL_OPTION );
                        $stored_page = $all[ $page_key ] ?? array();
                        if ( ! is_array( $stored_page ) ) { throw new RuntimeException( 'Vorhandene Seiteneinstellungen sind beschädigt.' ); }
                        if ( ! empty( $payload['page']['duplicates'] ) || ! empty( $payload['global']['duplicates'] ) || ! empty( $stored_page['duplicates'] ) || ! empty( $stored_global['duplicates'] ) ) {
                            throw new RuntimeException( 'Vorhandene Metadatenkopien müssen vor dem Speichern geprüft und verlustfrei migriert werden.' );
                        }
                        $global = self::sanitize_scope_data( isset( $payload['global'] ) ? $payload['global'] : array() );
                        $page = self::sanitize_scope_data( isset( $payload['page'] ) ? $payload['page'] : array() );
                        if ( isset( $stored_page['section_key_map'] ) && is_array( $stored_page['section_key_map'] ) ) { $page['section_key_map'] = $stored_page['section_key_map']; }
                        $expected_post = null;
                        $duplicated = self::apply_section_actions( $page, $page_key, $expected_post );
                        self::checked_option_write( self::GLOBAL_OPTION, $global );
                        $all[ $page_key ] = $page;
                        self::checked_option_write( self::PAGES_OPTION, $all );
                        if ( $expected_post ) {
                            $actual = $save_db->get_var( $save_db->prepare( "SELECT post_content FROM {$save_db->posts} WHERE ID = %d", $post_id ) );
                            if ( $save_db->last_error || $actual !== $expected_post['post_content'] ) { throw new RuntimeException( 'Die gespeicherte WordPress-Seite stimmt nicht mit der Änderung überein.' ); }
                        }
                        return array( 'duplicated' => $duplicated, 'global' => $global, 'all' => $all, 'expected_post' => $expected_post );
                    },
                    static function ( $save_db, $post_id, $result ) {
                        self::verify_option_value( self::GLOBAL_OPTION, $result['global'] );
                        self::verify_option_value( self::PAGES_OPTION, $result['all'] );
                        if ( ! empty( $result['expected_post'] ) ) {
                            $actual = $save_db->get_var( $save_db->prepare( "SELECT post_content FROM {$save_db->posts} WHERE ID = %d", $post_id ) );
                            if ( $save_db->last_error || $actual !== $result['expected_post']['post_content'] ) { throw new RuntimeException( 'Die Speicherung konnte nicht bestätigt werden. Bitte neu laden und prüfen.' ); }
                        }
                    }
                );
            } catch ( Throwable $error ) {
                wp_send_json_error( array( 'message' => $error->getMessage() ), 409 );
            } finally {
                self::clear_save_cache( $post_id );
            }
            $duplicated = (int) ( $transaction_result['duplicated'] ?? 0 );
        $message = $duplicated ? sprintf( _n( 'Gespeichert und ein Bereich dupliziert.', 'Gespeichert und %d Bereiche dupliziert.', $duplicated ), $duplicated ) : 'Gespeichert.';
        wp_send_json_success( array( 'message' => $message, 'page_key' => $page_key, 'duplicated' => $duplicated ) );
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

    private static function termin_date_label( $date ) {
        if ( ! $date ) { return ''; }
        $ts = strtotime( $date . ' 12:00:00' );
        return $ts ? self::normalize( wp_date( 'D d. M', $ts ) ) : '';
    }

    private static function find_termin( $signature ) {
        $title = isset( $signature['title'] ) ? self::normalize( $signature['title'] ) : '';
        $city  = isset( $signature['city'] ) ? self::normalize( $signature['city'] ) : '';
        $time  = isset( $signature['time'] ) ? sanitize_text_field( $signature['time'] ) : '';
        $date_label = isset( $signature['date_label'] ) ? self::normalize( $signature['date_label'] ) : '';
        $posts = get_posts( array( 'post_type' => 'kp_termin', 'post_status' => array( 'publish', 'draft', 'future' ), 'posts_per_page' => -1 ) );
        $best_score = -1; $best = array();
        foreach ( $posts as $post ) {
            $rep_id = absint( get_post_meta( $post->ID, '_kp_repertoire_id', true ) );
            $shown_title = $rep_id ? get_the_title( $rep_id ) : $post->post_title;
            $score = 0;
            if ( $title && self::normalize( $shown_title ) === $title ) { $score += 7; }
            elseif ( $title && false !== strpos( self::normalize( $shown_title ), $title ) ) { $score += 3; }
            if ( $city && self::normalize( get_post_meta( $post->ID, '_kp_city', true ) ) === $city ) { $score += 5; }
            if ( $time && get_post_meta( $post->ID, '_kp_time', true ) === $time ) { $score += 4; }
            if ( $date_label && self::termin_date_label( get_post_meta( $post->ID, '_kp_date', true ) ) === $date_label ) { $score += 7; }
            if ( $score > $best_score ) { $best_score = $score; $best = array( (int) $post->ID ); }
            elseif ( $score === $best_score ) { $best[] = (int) $post->ID; }
        }
        return $best_score >= 9 && 1 === count( $best ) ? $best[0] : 0;
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

    private static function statuses() {
        return array(
            'standard' => 'Normal / Tickets über Veranstalter',
            'free' => 'Eintritt frei',
            'planned' => 'In Planung',
            'box_office' => 'Eintritt Tageskasse',
            'sold_out' => 'Ausverkauft',
            'closed' => 'Geschlossene Vorstellung',
            'cancelled' => 'Abgesagt',
        );
    }

    public static function ajax_record() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
        $type = isset( $_POST['type'] ) ? sanitize_key( wp_unslash( $_POST['type'] ) ) : '';
        $signature = isset( $_POST['signature'] ) ? json_decode( wp_unslash( $_POST['signature'] ), true ) : array();
        if ( ! is_array( $signature ) ) { $signature = array(); }
        if ( 'termin' === $type ) {
            $id = self::find_termin( $signature );
            if ( ! $id || ! current_user_can( 'edit_post', $id ) ) { wp_send_json_error( array( 'message' => 'Termin ist nicht eindeutig. Bitte über „Alle Termine“ öffnen.' ) ); }
            wp_send_json_success( array(
                'type' => 'termin', 'id' => $id, 'title' => get_the_title( $id ),
                'date' => get_post_meta( $id, '_kp_date', true ), 'time' => get_post_meta( $id, '_kp_time', true ),
                'end_time' => get_post_meta( $id, '_kp_end_time', true ), 'city' => get_post_meta( $id, '_kp_city', true ),
                'venue' => get_post_meta( $id, '_kp_venue', true ), 'address' => get_post_meta( $id, '_kp_address', true ),
                'status' => get_post_meta( $id, '_kp_status', true ) ?: 'standard', 'statuses' => self::statuses(),
                'note' => get_post_meta( $id, '_kp_note', true ), 'ticket_url' => get_post_meta( $id, '_kp_ticket_url', true ),
                'info_url' => get_post_meta( $id, '_kp_info_url', true ),
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
        $f    = isset( $_POST['fields'] ) ? json_decode( wp_unslash( $_POST['fields'] ), true ) : array();
        if ( ! $id || ! is_array( $f ) || ! current_user_can( 'edit_post', $id ) ) { wp_send_json_error( array( 'message' => 'Speichern nicht erlaubt.' ), 403 ); }

        if ( 'termin' === $type && 'kp_termin' === get_post_type( $id ) ) {
            $title = isset( $f['title'] ) ? sanitize_text_field( $f['title'] ) : get_the_title( $id );
            wp_update_post( array( 'ID' => $id, 'post_title' => $title ) );
            $text_map = array(
                '_kp_date' => 'date', '_kp_time' => 'time', '_kp_end_time' => 'end_time', '_kp_city' => 'city',
                '_kp_venue' => 'venue', '_kp_address' => 'address', '_kp_note' => 'note',
            );
            foreach ( $text_map as $meta => $field ) {
                $value = isset( $f[ $field ] ) ? ( 'note' === $field ? sanitize_textarea_field( $f[ $field ] ) : sanitize_text_field( $f[ $field ] ) ) : '';
                if ( '' === $value ) { delete_post_meta( $id, $meta ); } else { update_post_meta( $id, $meta, $value ); }
            }
            $status = isset( $f['status'] ) ? sanitize_key( $f['status'] ) : 'standard';
            if ( ! array_key_exists( $status, self::statuses() ) ) { $status = 'standard'; }
            update_post_meta( $id, '_kp_status', $status );
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
