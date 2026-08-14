<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class KP_Referenzen {
    const POST_TYPE = 'kp_referenz';
    const META_URL = '_kp_referenz_url';
    const META_NOTE = '_kp_referenz_note';
    const META_LEGACY_KEY = '_kp_referenz_legacy_key';

    public static function init() {
        add_action( 'init', [ __CLASS__, 'register_post_type' ] );
        add_action( 'add_meta_boxes', [ __CLASS__, 'add_meta_boxes' ] );
        add_action( 'save_post_' . self::POST_TYPE, [ __CLASS__, 'save_meta' ] );
        add_action( 'admin_menu', [ __CLASS__, 'admin_menu' ], 20 );
        add_action( 'admin_post_kp_import_referenzen', [ __CLASS__, 'handle_import' ] );
        add_shortcode( 'kp_referenzen', [ __CLASS__, 'shortcode' ] );
    }


    public static function ensure_references_page() {
        if ( ! function_exists( 'get_page_by_path' ) ) return;

        $existing = get_page_by_path( 'referenzen', OBJECT, 'page' );

        if ( $existing ) {
            // If the page exists but is empty, make sure the reference grid is rendered.
            if ( trim( (string) $existing->post_content ) === '' ) {
                wp_update_post( [
                    'ID' => $existing->ID,
                    'post_content' => '[kp_referenzen]',
                ] );
            }
            return (int) $existing->ID;
        }

        $page_id = wp_insert_post( [
            'post_type' => 'page',
            'post_status' => 'publish',
            'post_title' => 'Referenzen',
            'post_name' => 'referenzen',
            'post_content' => '[kp_referenzen]',
            'comment_status' => 'closed',
        ] );

        return is_wp_error( $page_id ) ? 0 : (int) $page_id;
    }

    public static function register_post_type() {
        register_post_type( self::POST_TYPE, [
            'labels' => [
                'name' => 'Referenzen',
                'singular_name' => 'Referenz',
                'add_new' => 'Referenz hinzufügen',
                'add_new_item' => 'Referenz hinzufügen',
                'edit_item' => 'Referenz bearbeiten',
                'new_item' => 'Neue Referenz',
                'view_item' => 'Referenz ansehen',
                'search_items' => 'Referenzen suchen',
                'not_found' => 'Keine Referenzen gefunden',
                'menu_name' => 'Referenzen',
            ],
            'public' => false,
            'show_ui' => true,
            'show_in_menu' => false,
            'supports' => [ 'title', 'thumbnail', 'page-attributes' ],
            'show_in_rest' => true,
        ] );
    }

    public static function add_meta_boxes() {
        add_meta_box(
            'kp_referenz_details',
            'Referenz-Details',
            [ __CLASS__, 'meta_box' ],
            self::POST_TYPE,
            'normal',
            'high'
        );
    }

    public static function meta_box( $post ) {
        wp_nonce_field( 'kp_referenz_save', 'kp_referenz_nonce' );
        $url = get_post_meta( $post->ID, self::META_URL, true );
        $note = get_post_meta( $post->ID, self::META_NOTE, true );
        ?>
        <p><label for="kp_referenz_url"><strong>Ziel-Link</strong></label></p>
        <input type="url" id="kp_referenz_url" name="kp_referenz_url" value="<?php echo esc_attr( $url ); ?>" class="widefat" placeholder="https://…">
        <p><label for="kp_referenz_note"><strong>Kurze Notiz (optional)</strong></label></p>
        <textarea id="kp_referenz_note" name="kp_referenz_note" class="widefat" rows="3" placeholder="z. B. Veranstalter, Spielort oder Partner"><?php echo esc_textarea( $note ); ?></textarea>
        <p><em>Das Bild rechts als Beitragsbild festlegen. Auf der Website wird die gesamte Kachel anklickbar.</em></p>
        <?php
    }

    public static function save_meta( $post_id ) {
        if ( ! isset( $_POST['kp_referenz_nonce'] ) || ! wp_verify_nonce( $_POST['kp_referenz_nonce'], 'kp_referenz_save' ) ) return;
        if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) return;
        if ( ! current_user_can( 'edit_post', $post_id ) ) return;

        update_post_meta( $post_id, self::META_URL, esc_url_raw( $_POST['kp_referenz_url'] ?? '' ) );
        update_post_meta( $post_id, self::META_NOTE, sanitize_textarea_field( $_POST['kp_referenz_note'] ?? '' ) );
    }

    public static function admin_menu() {
        add_submenu_page(
            'kp-puppenspiele',
            'Referenzen',
            'Referenzen',
            'edit_posts',
            'edit.php?post_type=' . self::POST_TYPE
        );
        add_submenu_page(
            'kp-puppenspiele',
            'Referenzen importieren',
            'Referenzen importieren',
            'manage_options',
            'kp-referenzen-import',
            [ __CLASS__, 'import_page' ]
        );
    }

    public static function import_page() {
        if ( ! current_user_can( 'manage_options' ) ) return;
        ?>
        <div class="wrap">
            <h1>Aktuelle Referenzen übernehmen</h1>
            <p>Aus der bisherigen Website sind <strong>25 aktuell verwendete Referenz-Kacheln</strong> vorbereitet. Alte Archiv-Referenzen werden nicht automatisch importiert.</p>
            <p>Beim Import werden die Bilder in die WordPress-Mediathek übernommen und die jeweiligen Ziel-Links gespeichert.</p>
            <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
                <input type="hidden" name="action" value="kp_import_referenzen">
                <?php wp_nonce_field( 'kp_import_referenzen' ); ?>
                <?php submit_button( '25 aktuelle Referenzen jetzt importieren', 'primary' ); ?>
            </form>
        </div>
        <?php
    }

    public static function handle_import() {
        if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Keine Berechtigung.' );
        check_admin_referer( 'kp_import_referenzen' );

        $file = KP_CORE_DIR . 'data/legacy-referenzen.json';
        $items = json_decode( file_get_contents( $file ), true );
        $created = 0;
        $skipped = 0;

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        foreach ( $items as $item ) {
            $legacy_key = md5( strtolower( trim( $item['title'] . '|' . $item['url'] ) ) );
            $existing = get_posts( [
                'post_type' => self::POST_TYPE,
                'post_status' => 'any',
                'meta_key' => self::META_LEGACY_KEY,
                'meta_value' => $legacy_key,
                'fields' => 'ids',
                'posts_per_page' => 1,
            ] );

            if ( $existing ) {
                $skipped++;
                continue;
            }

            $post_id = wp_insert_post( [
                'post_type' => self::POST_TYPE,
                'post_status' => 'publish',
                'post_title' => $item['title'],
            ] );
            if ( is_wp_error( $post_id ) ) continue;

            update_post_meta( $post_id, self::META_URL, esc_url_raw( $item['url'] ) );
            update_post_meta( $post_id, self::META_NOTE, sanitize_text_field( $item['note'] ?? '' ) );
            update_post_meta( $post_id, self::META_LEGACY_KEY, $legacy_key );

            $img = KP_CORE_DIR . 'assets/legacy-referenzen/' . basename( $item['bundled_image'] ?? '' );
            if ( ! empty( $item['bundled_image'] ) && file_exists( $img ) ) {
                $upload = wp_upload_bits( basename( $img ), null, file_get_contents( $img ) );
                if ( empty( $upload['error'] ) ) {
                    $filetype = wp_check_filetype( $upload['file'], null );
                    $attachment_id = wp_insert_attachment( [
                        'post_mime_type' => $filetype['type'],
                        'post_title' => sanitize_text_field( $item['title'] ),
                        'post_status' => 'inherit',
                    ], $upload['file'], $post_id );
                    if ( ! is_wp_error( $attachment_id ) ) {
                        $metadata = wp_generate_attachment_metadata( $attachment_id, $upload['file'] );
                        wp_update_attachment_metadata( $attachment_id, $metadata );
                        set_post_thumbnail( $post_id, $attachment_id );
                    }
                }
            }
            $created++;
        }

        wp_safe_redirect( add_query_arg( [
            'page' => 'kp-puppenspiele',
            'kp_ref_created' => $created,
            'kp_ref_skipped' => $skipped,
        ], admin_url( 'admin.php' ) ) );
        exit;
    }

    public static function shortcode( $atts ) {
        $q = new WP_Query( [
            'post_type' => self::POST_TYPE,
            'post_status' => 'publish',
            'posts_per_page' => -1,
            'orderby' => [ 'menu_order' => 'ASC', 'title' => 'ASC' ],
            'order' => 'ASC',
        ] );

        if ( ! $q->have_posts() ) {
            return '<p class="kp-referenzen-empty">Noch keine Referenzen angelegt.</p>';
        }

        ob_start();
        ?>
        <section class="kp-referenzen">
          <div class="kp-referenzen-grid">
            <?php while ( $q->have_posts() ) : $q->the_post();
                $id = get_the_ID();
                $url = get_post_meta( $id, self::META_URL, true );
                $note = get_post_meta( $id, self::META_NOTE, true );
                $img = get_the_post_thumbnail_url( $id, 'medium_large' );
                ?>
                <article class="kp-referenz-card">
                  <?php if ( $url ) : ?><a class="kp-referenz-link" href="<?php echo esc_url( $url ); ?>" target="_blank" rel="noopener noreferrer"><?php endif; ?>
                    <div class="kp-referenz-image">
                      <?php if ( $img ) : ?>
                        <img src="<?php echo esc_url( $img ); ?>" alt="<?php echo esc_attr( get_the_title() ); ?>" loading="lazy">
                      <?php endif; ?>
                    </div>
                    <div class="kp-referenz-copy">
                      <h3><?php the_title(); ?></h3>
                      <?php if ( $note ) : ?><p><?php echo esc_html( $note ); ?></p><?php endif; ?>
                      <?php if ( $url ) : ?><span class="kp-referenz-domain"><?php echo esc_html( wp_parse_url( $url, PHP_URL_HOST ) ); ?> ↗</span><?php endif; ?>
                    </div>
                  <?php if ( $url ) : ?></a><?php endif; ?>
                </article>
            <?php endwhile; wp_reset_postdata(); ?>
          </div>
        </section>
        <?php
        return ob_get_clean();
    }
}
