<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Owner web-app layer.
 *
 * Keeps all normal day-to-day maintenance on the visible website:
 * design, navigation, new appointments, new repertoire items and new pages.
 * It also exposes a small installable PWA shell for phones/tablets.
 */
final class KP_Owner_Web_App {
    const NONCE_ACTION = 'kp_owner_web_app';
    const NAV_OPTION   = 'kp_owner_navigation_v1';

    public static function init() {
        add_action( 'template_redirect', array( __CLASS__, 'serve_web_app_endpoints' ), 0 );
        add_action( 'wp_head', array( __CLASS__, 'web_app_meta' ), 3 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ), 90 );

        add_action( 'wp_ajax_kp_owner_design_save', array( __CLASS__, 'ajax_design_save' ) );
        add_action( 'wp_ajax_kp_owner_nav_save', array( __CLASS__, 'ajax_nav_save' ) );
        add_action( 'wp_ajax_kp_owner_record_create', array( __CLASS__, 'ajax_record_create' ) );
        add_action( 'wp_ajax_kp_owner_page_create', array( __CLASS__, 'ajax_page_create' ) );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function edit_mode() {
        return self::can_edit()
            && isset( $_GET['kp_edit'] )
            && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    }

    private static function manifest_url() {
        return add_query_arg( 'kp_webapp_manifest', '1', home_url( '/' ) );
    }

    private static function service_worker_url() {
        return add_query_arg(
            array( 'kp_webapp_sw' => '1', 'v' => defined( 'KP_CORE_VERSION' ) ? KP_CORE_VERSION : '1' ),
            home_url( '/' )
        );
    }

    public static function web_app_meta() {
        if ( is_admin() ) { return; }
        $settings = KP_Website_Studio::settings();
        $theme = isset( $settings['accent_color'] ) ? $settings['accent_color'] : '#f07a22';
        $icon = KP_CORE_URL . 'assets/kp-app-icon.svg';
        echo '<link rel="manifest" href="' . esc_url( self::manifest_url() ) . '">';
        echo '<meta name="theme-color" content="' . esc_attr( $theme ) . '">';
        echo '<meta name="mobile-web-app-capable" content="yes">';
        echo '<meta name="apple-mobile-web-app-capable" content="yes">';
        echo '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">';
        echo '<meta name="apple-mobile-web-app-title" content="Puppenspiele">';
        echo '<link rel="icon" href="' . esc_url( $icon ) . '" type="image/svg+xml">';
    }

    public static function serve_web_app_endpoints() {
        if ( isset( $_GET['kp_webapp_manifest'] ) ) {
            $settings = KP_Website_Studio::settings();
            $theme = isset( $settings['accent_color'] ) ? $settings['accent_color'] : '#f07a22';
            $bg = isset( $settings['background_color'] ) ? $settings['background_color'] : '#080706';
            $manifest = array(
                'id'               => home_url( '/' ),
                'name'             => 'Koblenzer Puppenspiele',
                'short_name'       => 'Puppenspiele',
                'description'      => 'Koblenzer Puppenspiele – Termine, Repertoire und Website-Pflege.',
                'lang'             => 'de-DE',
                'start_url'        => home_url( '/' ),
                'scope'            => home_url( '/' ),
                'display'          => 'standalone',
                'orientation'      => 'any',
                'background_color' => $bg,
                'theme_color'      => $theme,
                'icons'            => array(
                    array(
                        'src'     => KP_CORE_URL . 'assets/kp-app-icon.svg',
                        'sizes'   => 'any',
                        'type'    => 'image/svg+xml',
                        'purpose' => 'any maskable',
                    ),
                ),
                'shortcuts'        => array(
                    array( 'name' => 'Termine', 'url' => home_url( '/termine/' ) ),
                    array( 'name' => 'Repertoire', 'url' => home_url( '/repertoire/' ) ),
                ),
            );
            nocache_headers();
            header( 'Content-Type: application/manifest+json; charset=utf-8' );
            echo wp_json_encode( $manifest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
            exit;
        }

        if ( isset( $_GET['kp_webapp_sw'] ) ) {
            $version = defined( 'KP_CORE_VERSION' ) ? KP_CORE_VERSION : '1';
            $home_path = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );
            if ( ! $home_path ) { $home_path = '/'; }
            nocache_headers();
            header( 'Content-Type: application/javascript; charset=utf-8' );
            header( 'Service-Worker-Allowed: /' );
            ?>
const KP_CACHE = <?php echo wp_json_encode( 'kp-puppenspiele-' . $version ); ?>;
const KP_HOME = <?php echo wp_json_encode( $home_path ); ?>;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(KP_CACHE).then(cache => cache.add(KP_HOME)).catch(() => null));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kp-puppenspiele-') && key !== KP_CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/wp-admin/') || url.pathname.includes('/wp-login.php') || url.pathname.includes('/admin-ajax.php') || url.searchParams.has('kp_edit') || url.searchParams.has('kp_webapp_sw') || url.searchParams.has('kp_webapp_manifest')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(KP_HOME)));
    return;
  }
  if (['style','script','image','font'].includes(request.destination)) {
    event.respondWith(caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(KP_CACHE).then(cache => cache.put(request, clone)).catch(() => null);
        }
        return response;
      }).catch(() => cached);
    }));
  }
});
            <?php
            exit;
        }
    }

    public static function enqueue_assets() {
        if ( is_admin() ) { return; }

        wp_enqueue_script(
            'kp-owner-web-app',
            KP_CORE_URL . 'assets/owner-web-app.js',
            array( 'kp-frontend-editor-v2' ),
            KP_CORE_VERSION,
            true
        );
        if ( self::can_edit() ) {
            wp_enqueue_style( 'kp-owner-web-app', KP_CORE_URL . 'assets/owner-web-app.css', array(), KP_CORE_VERSION );
        }

        $settings = KP_Website_Studio::settings();
        $header_image_url = ! empty( $settings['header_image_id'] ) ? wp_get_attachment_image_url( (int) $settings['header_image_id'], 'full' ) : '';
        $payload = array(
            'canEdit'          => self::can_edit(),
            'canDesign'        => self::can_edit() && current_user_can( 'edit_theme_options' ),
            'editMode'         => self::edit_mode(),
            'ajaxUrl'          => admin_url( 'admin-ajax.php' ),
            'nonce'            => self::can_edit() ? wp_create_nonce( self::NONCE_ACTION ) : '',
            'homeUrl'          => home_url( '/' ),
            'editUrl'          => add_query_arg( 'kp_edit', '1', home_url( '/' ) ),
            'termineEditUrl'   => add_query_arg( 'kp_edit', '1', home_url( '/termine/' ) ),
            'repertoireEditUrl'=> add_query_arg( 'kp_edit', '1', home_url( '/repertoire/' ) ),
            'manifestUrl'      => self::manifest_url(),
            'serviceWorkerUrl' => self::service_worker_url(),
            'design'           => self::can_edit() ? $settings : array(),
            'designDefaults'   => self::can_edit() ? KP_Website_Studio::defaults() : array(),
            'headerImageUrl'   => self::can_edit() ? $header_image_url : '',
            'navigation'       => self::navigation_settings(),
            'repertoire'       => self::can_edit() ? self::repertoire_options() : array(),
            'categories'       => self::can_edit() ? self::repertoire_categories() : array(),
        );
        wp_add_inline_script( 'kp-owner-web-app', 'window.KPOwnerWebApp=' . wp_json_encode( $payload ) . ';', 'before' );
    }

    private static function design_schema() {
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

    private static function sanitize_design( $raw ) {
        $defaults = KP_Website_Studio::defaults();
        $clean = array();
        if ( ! is_array( $raw ) ) { $raw = array(); }
        foreach ( self::design_schema() as $key => $rule ) {
            $value = array_key_exists( $key, $raw ) ? $raw[ $key ] : $defaults[ $key ];
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
                    $number = max( (int) $rule['min'], min( (int) $rule['max'], $number ) );
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

    public static function ajax_design_save() {
        if ( ! self::can_edit() || ! current_user_can( 'edit_theme_options' ) ) {
            wp_send_json_error( array( 'message' => 'Keine Berechtigung für Designänderungen.' ), 403 );
        }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
        $raw = isset( $_POST['settings'] ) ? json_decode( wp_unslash( $_POST['settings'] ), true ) : array();
        $clean = self::sanitize_design( $raw );
        update_option( KP_Website_Studio::OPTION, $clean, false );
        $stored = get_option( KP_Website_Studio::OPTION, array() );
        if ( $stored !== $clean ) { wp_send_json_error( array( 'message' => 'Design konnte nicht dauerhaft bestätigt werden.' ), 500 ); }
        wp_send_json_success( array( 'message' => 'Design dauerhaft gespeichert ✓', 'settings' => $clean ) );
    }

    private static function sanitize_nav_url( $url ) {
        $url = trim( (string) $url );
        if ( '' === $url ) { return ''; }
        if ( 0 === strpos( $url, '/' ) && 0 !== strpos( $url, '//' ) ) { return '/' . ltrim( $url, '/' ); }
        if ( preg_match( '#^(https?://|mailto:|tel:)#i', $url ) ) { return esc_url_raw( $url ); }
        return '';
    }

    private static function sanitize_navigation( $items ) {
        $out = array();
        if ( ! is_array( $items ) ) { return $out; }
        foreach ( array_slice( $items, 0, 24 ) as $item ) {
            if ( ! is_array( $item ) ) { continue; }
            $label = isset( $item['label'] ) ? sanitize_text_field( $item['label'] ) : '';
            $url = isset( $item['url'] ) ? self::sanitize_nav_url( $item['url'] ) : '';
            if ( ! $label || ! $url ) { continue; }
            $out[] = array( 'label' => $label, 'url' => $url );
        }
        return $out;
    }

    private static function navigation_settings() {
        $saved = get_option( self::NAV_OPTION, array() );
        return self::sanitize_navigation( is_array( $saved ) ? $saved : array() );
    }

    public static function ajax_nav_save() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
        $raw = isset( $_POST['items'] ) ? json_decode( wp_unslash( $_POST['items'] ), true ) : array();
        $items = self::sanitize_navigation( $raw );
        if ( empty( $items ) ) { wp_send_json_error( array( 'message' => 'Das Menü darf nicht vollständig leer sein.' ), 400 ); }
        update_option( self::NAV_OPTION, $items, false );
        if ( get_option( self::NAV_OPTION, array() ) !== $items ) { wp_send_json_error( array( 'message' => 'Navigation konnte nicht dauerhaft bestätigt werden.' ), 500 ); }
        wp_send_json_success( array( 'message' => 'Navigation gespeichert ✓', 'items' => $items ) );
    }

    private static function repertoire_options() {
        $posts = get_posts( array(
            'post_type' => 'kp_repertoire', 'post_status' => 'publish', 'posts_per_page' => -1,
            'orderby' => 'title', 'order' => 'ASC',
        ) );
        $out = array();
        foreach ( $posts as $post ) { $out[] = array( 'id' => (int) $post->ID, 'title' => $post->post_title ); }
        return $out;
    }

    private static function repertoire_categories() {
        $terms = get_terms( array( 'taxonomy' => 'kp_repertoire_category', 'hide_empty' => false ) );
        if ( is_wp_error( $terms ) ) { return array(); }
        $out = array();
        foreach ( $terms as $term ) { $out[] = array( 'id' => (int) $term->term_id, 'name' => $term->name ); }
        return $out;
    }

    private static function valid_status( $status ) {
        $allowed = array( 'standard', 'free', 'planned', 'box_office', 'sold_out', 'closed', 'cancelled' );
        $status = sanitize_key( (string) $status );
        return in_array( $status, $allowed, true ) ? $status : 'standard';
    }

    private static function create_termin( $f ) {
        $rep_id = isset( $f['repertoire_id'] ) ? absint( $f['repertoire_id'] ) : 0;
        if ( $rep_id && 'kp_repertoire' !== get_post_type( $rep_id ) ) { $rep_id = 0; }
        $title = isset( $f['title'] ) ? sanitize_text_field( $f['title'] ) : '';
        if ( $rep_id && ! $title ) { $title = get_the_title( $rep_id ); }
        $date = isset( $f['date'] ) ? sanitize_text_field( $f['date'] ) : '';
        $city = isset( $f['city'] ) ? sanitize_text_field( $f['city'] ) : '';
        if ( ! $title || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) || ! $city ) {
            return new WP_Error( 'kp_invalid_termin', 'Bitte Stück/Titel, Datum und Ort ausfüllen.' );
        }
        $id = wp_insert_post( array( 'post_type' => 'kp_termin', 'post_status' => 'publish', 'post_title' => $title ), true );
        if ( is_wp_error( $id ) ) { return $id; }
        $text_fields = array(
            '_kp_date' => 'date', '_kp_time' => 'time', '_kp_end_time' => 'end_time', '_kp_city' => 'city',
            '_kp_venue' => 'venue', '_kp_address' => 'address', '_kp_note' => 'note',
        );
        foreach ( $text_fields as $meta => $field ) {
            $value = isset( $f[ $field ] ) ? sanitize_textarea_field( $f[ $field ] ) : '';
            if ( '' !== $value ) { update_post_meta( $id, $meta, $value ); }
        }
        update_post_meta( $id, '_kp_status', self::valid_status( isset( $f['status'] ) ? $f['status'] : 'standard' ) );
        foreach ( array( '_kp_ticket_url' => 'ticket_url', '_kp_info_url' => 'info_url' ) as $meta => $field ) {
            $value = isset( $f[ $field ] ) ? esc_url_raw( $f[ $field ] ) : '';
            if ( $value ) { update_post_meta( $id, $meta, $value ); }
        }
        if ( $rep_id ) { update_post_meta( $id, '_kp_repertoire_id', $rep_id ); }
        $time = get_post_meta( $id, '_kp_time', true );
        update_post_meta( $id, '_kp_sort', $date . ' ' . ( $time ?: '23:59' ) );
        return $id;
    }

    private static function create_repertoire( $f ) {
        $title = isset( $f['title'] ) ? sanitize_text_field( $f['title'] ) : '';
        if ( ! $title ) { return new WP_Error( 'kp_invalid_piece', 'Bitte einen Stücktitel eintragen.' ); }
        $excerpt = isset( $f['excerpt'] ) ? sanitize_textarea_field( $f['excerpt'] ) : '';
        $description = isset( $f['description'] ) ? sanitize_textarea_field( $f['description'] ) : $excerpt;
        $id = wp_insert_post( array(
            'post_type' => 'kp_repertoire', 'post_status' => 'publish', 'post_title' => $title,
            'post_excerpt' => $excerpt, 'post_content' => $description ? '<p>' . esc_html( $description ) . '</p>' : '',
        ), true );
        if ( is_wp_error( $id ) ) { return $id; }
        $map = array(
            '_kp_rep_age' => 'age', '_kp_rep_duration' => 'duration', '_kp_rep_players' => 'players',
            '_kp_rep_play_style' => 'play_style', '_kp_rep_technical' => 'technical', '_kp_rep_rights' => 'rights',
            '_kp_rep_premiere' => 'premiere',
        );
        foreach ( $map as $meta => $field ) {
            $value = isset( $f[ $field ] ) ? sanitize_textarea_field( $f[ $field ] ) : '';
            if ( '' !== $value ) { update_post_meta( $id, $meta, $value ); }
        }
        update_post_meta( $id, '_kp_rep_bookable', ! empty( $f['bookable'] ) ? '1' : '0' );
        $thumb = isset( $f['thumbnail_id'] ) ? absint( $f['thumbnail_id'] ) : 0;
        if ( $thumb && wp_attachment_is_image( $thumb ) ) { set_post_thumbnail( $id, $thumb ); }
        $category = isset( $f['category_id'] ) ? absint( $f['category_id'] ) : 0;
        if ( $category ) { wp_set_object_terms( $id, array( $category ), 'kp_repertoire_category', false ); }
        return $id;
    }

    public static function ajax_record_create() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
        $type = isset( $_POST['type'] ) ? sanitize_key( wp_unslash( $_POST['type'] ) ) : '';
        $fields = isset( $_POST['fields'] ) ? json_decode( wp_unslash( $_POST['fields'] ), true ) : array();
        if ( ! is_array( $fields ) ) { $fields = array(); }
        $id = 'termin' === $type ? self::create_termin( $fields ) : ( 'repertoire' === $type ? self::create_repertoire( $fields ) : new WP_Error( 'kp_type', 'Unbekannter Datentyp.' ) );
        if ( is_wp_error( $id ) ) { wp_send_json_error( array( 'message' => $id->get_error_message() ), 400 ); }
        wp_send_json_success( array(
            'message' => 'termin' === $type ? 'Termin angelegt ✓' : 'Stück angelegt ✓',
            'id' => (int) $id,
            'url' => 'termin' === $type ? add_query_arg( 'kp_edit', '1', home_url( '/termine/' ) ) : add_query_arg( 'kp_edit', '1', get_permalink( $id ) ),
        ) );
    }

    public static function ajax_page_create() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );
        $fields = isset( $_POST['fields'] ) ? json_decode( wp_unslash( $_POST['fields'] ), true ) : array();
        if ( ! is_array( $fields ) ) { $fields = array(); }
        $title = isset( $fields['title'] ) ? sanitize_text_field( $fields['title'] ) : '';
        if ( ! $title ) { wp_send_json_error( array( 'message' => 'Bitte einen Seitentitel eintragen.' ), 400 ); }
        $slug = isset( $fields['slug'] ) ? sanitize_title( $fields['slug'] ) : sanitize_title( $title );
        $intro = isset( $fields['intro'] ) ? sanitize_textarea_field( $fields['intro'] ) : '';
        $content = '<!-- wp:group {"className":"kp-finish","layout":{"type":"constrained"}} --><div class="wp-block-group kp-finish">'
            . '<!-- wp:heading {"level":1} --><h1 class="wp-block-heading">' . esc_html( $title ) . '</h1><!-- /wp:heading -->'
            . ( $intro ? '<!-- wp:paragraph --><p>' . esc_html( $intro ) . '</p><!-- /wp:paragraph -->' : '<!-- wp:paragraph --><p>Hier Text eingeben.</p><!-- /wp:paragraph -->' )
            . '<!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="/kontakt/">Kontakt</a></div><!-- /wp:button --></div><!-- /wp:buttons -->'
            . '</div><!-- /wp:group -->';
        $id = wp_insert_post( array(
            'post_type' => 'page', 'post_status' => 'publish', 'post_title' => $title,
            'post_name' => $slug, 'post_content' => $content,
        ), true );
        if ( is_wp_error( $id ) ) { wp_send_json_error( array( 'message' => $id->get_error_message() ), 400 ); }
        $url = get_permalink( $id );
        wp_send_json_success( array(
            'message' => 'Seite angelegt ✓', 'id' => (int) $id, 'label' => $title,
            'url' => $url, 'edit_url' => add_query_arg( 'kp_edit', '1', $url ),
        ) );
    }
}
