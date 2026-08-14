<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class KP_Repertoire {
    private static $instance = null;
    public static function instance() {
        if ( null === self::$instance ) { self::$instance = new self(); }
        return self::$instance;
    }
    private function __construct() {
        add_action( 'init', array( $this, 'register_post_type' ) );
        add_action( 'add_meta_boxes', array( $this, 'register_meta_box' ) );
        add_action( 'save_post_kp_repertoire', array( $this, 'save_meta' ), 10, 2 );
        add_filter( 'manage_kp_repertoire_posts_columns', array( $this, 'columns' ) );
        add_action( 'manage_kp_repertoire_posts_custom_column', array( $this, 'column_content' ), 10, 2 );
        add_action( 'admin_post_kp_import_legacy_repertoire', array( $this, 'import_legacy_repertoire' ) );
        add_action( 'admin_notices', array( $this, 'import_notice' ) );
        add_shortcode( 'kp_repertoire', array( $this, 'shortcode_archive' ) );
        add_filter( 'the_content', array( $this, 'single_content' ) );
    }

    public function register_post_type() {
        register_post_type( 'kp_repertoire', array(
            'labels' => array(
                'name' => 'Repertoire', 'singular_name' => 'Stück', 'menu_name' => 'Repertoire',
                'add_new' => 'Neues Stück', 'add_new_item' => 'Neues Stück anlegen', 'edit_item' => 'Stück bearbeiten',
                'new_item' => 'Neues Stück', 'view_item' => 'Stück ansehen', 'search_items' => 'Repertoire durchsuchen',
                'not_found' => 'Keine Stücke gefunden', 'all_items' => 'Alle Stücke'
            ),
            'public' => true, 'show_ui' => true, 'show_in_menu' => 'kp-puppenspiele', 'show_in_rest' => true,
            'supports' => array( 'title', 'editor', 'excerpt', 'thumbnail', 'page-attributes' ),
            'has_archive' => false, 'rewrite' => array( 'slug' => 'repertoire', 'with_front' => false ),
            'menu_icon' => 'dashicons-format-gallery', 'menu_position' => 4,
        ) );
        register_taxonomy( 'kp_repertoire_category', 'kp_repertoire', array(
            'labels' => array( 'name' => 'Repertoire-Gruppen', 'singular_name' => 'Repertoire-Gruppe' ),
            'public' => false, 'show_ui' => true, 'show_in_rest' => true, 'hierarchical' => true,
            'show_admin_column' => true, 'rewrite' => false,
        ) );
    }

    public function register_meta_box() {
        add_meta_box( 'kp-repertoire-details', 'Stück-Details', array( $this, 'render_meta_box' ), 'kp_repertoire', 'normal', 'high' );
    }

    public function render_meta_box( $post ) {
        wp_nonce_field( 'kp_save_repertoire', 'kp_repertoire_nonce' );
        $fields = array(
            'age' => get_post_meta( $post->ID, '_kp_rep_age', true ),
            'duration' => get_post_meta( $post->ID, '_kp_rep_duration', true ),
            'players' => get_post_meta( $post->ID, '_kp_rep_players', true ),
            'play_style' => get_post_meta( $post->ID, '_kp_rep_play_style', true ),
            'technical' => get_post_meta( $post->ID, '_kp_rep_technical', true ),
            'rights' => get_post_meta( $post->ID, '_kp_rep_rights', true ),
            'premiere' => get_post_meta( $post->ID, '_kp_rep_premiere', true ),
            'bookable' => get_post_meta( $post->ID, '_kp_rep_bookable', true ),
        );
        if ( '' === $fields['bookable'] ) { $fields['bookable'] = '1'; }
        ?>
        <div class="kp-fields">
            <div class="kp-field kp-field-half"><label for="kp_rep_age">Alter / Zielgruppe</label><input type="text" id="kp_rep_age" name="kp_rep_age" value="<?php echo esc_attr( $fields['age'] ); ?>" placeholder="z. B. ab 4 Jahren"></div>
            <div class="kp-field kp-field-half"><label for="kp_rep_duration">Dauer</label><input type="text" id="kp_rep_duration" name="kp_rep_duration" value="<?php echo esc_attr( $fields['duration'] ); ?>" placeholder="z. B. ca. 50 Minuten"></div>
            <div class="kp-field kp-field-wide"><label for="kp_rep_players">Spieler*innen</label><input type="text" id="kp_rep_players" name="kp_rep_players" value="<?php echo esc_attr( $fields['players'] ); ?>"></div>
            <div class="kp-field kp-field-wide"><label for="kp_rep_play_style">Spielweise</label><input type="text" id="kp_rep_play_style" name="kp_rep_play_style" value="<?php echo esc_attr( $fields['play_style'] ); ?>"></div>
            <div class="kp-field kp-field-wide"><label for="kp_rep_technical">Technische Hinweise</label><textarea id="kp_rep_technical" name="kp_rep_technical" rows="5"><?php echo esc_textarea( $fields['technical'] ); ?></textarea></div>
            <div class="kp-field kp-field-half"><label for="kp_rep_rights">Rechte / Vorlage</label><input type="text" id="kp_rep_rights" name="kp_rep_rights" value="<?php echo esc_attr( $fields['rights'] ); ?>"></div>
            <div class="kp-field kp-field-half"><label for="kp_rep_premiere">Premiere</label><input type="text" id="kp_rep_premiere" name="kp_rep_premiere" value="<?php echo esc_attr( $fields['premiere'] ); ?>"></div>
            <div class="kp-field kp-field-wide"><label><input type="checkbox" name="kp_rep_bookable" value="1" <?php checked( $fields['bookable'], '1' ); ?>> Dieses Stück ist buchbar</label></div>
        </div>
        <p class="description">Titelbild = Bild für die Repertoire-Karte. Der normale WordPress-Texteditor darüber ist für die ausführliche Beschreibung gedacht.</p>
        <?php
    }

    public function save_meta( $post_id, $post ) {
        if ( ! isset( $_POST['kp_repertoire_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['kp_repertoire_nonce'] ) ), 'kp_save_repertoire' ) ) { return; }
        if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) { return; }
        if ( ! current_user_can( 'edit_post', $post_id ) ) { return; }
        $map = array(
            '_kp_rep_age' => array( 'kp_rep_age', 'text' ), '_kp_rep_duration' => array( 'kp_rep_duration', 'text' ),
            '_kp_rep_players' => array( 'kp_rep_players', 'text' ), '_kp_rep_play_style' => array( 'kp_rep_play_style', 'text' ),
            '_kp_rep_technical' => array( 'kp_rep_technical', 'textarea' ), '_kp_rep_rights' => array( 'kp_rep_rights', 'text' ),
            '_kp_rep_premiere' => array( 'kp_rep_premiere', 'text' ),
        );
        foreach ( $map as $meta => $spec ) {
            $value = isset( $_POST[ $spec[0] ] ) ? wp_unslash( $_POST[ $spec[0] ] ) : '';
            $value = 'textarea' === $spec[1] ? sanitize_textarea_field( $value ) : sanitize_text_field( $value );
            if ( '' === $value ) { delete_post_meta( $post_id, $meta ); } else { update_post_meta( $post_id, $meta, $value ); }
        }
        update_post_meta( $post_id, '_kp_rep_bookable', isset( $_POST['kp_rep_bookable'] ) ? '1' : '0' );
    }

    public function columns( $columns ) {
        return array( 'cb' => $columns['cb'], 'title' => 'Stück', 'taxonomy-kp_repertoire_category' => 'Gruppe', 'kp_rep_age' => 'Alter', 'kp_rep_duration' => 'Dauer', 'kp_rep_bookable' => 'Buchbar', 'date' => 'WordPress' );
    }
    public function column_content( $column, $post_id ) {
        if ( 'kp_rep_age' === $column ) { echo esc_html( get_post_meta( $post_id, '_kp_rep_age', true ) ?: '–' ); }
        if ( 'kp_rep_duration' === $column ) { echo esc_html( get_post_meta( $post_id, '_kp_rep_duration', true ) ?: '–' ); }
        if ( 'kp_rep_bookable' === $column ) { echo get_post_meta( $post_id, '_kp_rep_bookable', true ) === '0' ? 'Nein' : 'Ja'; }
    }

    public function legacy_data_count() { return count( $this->legacy_data() ); }
    private function legacy_data() {
        $path = KP_CORE_DIR . 'data/legacy-repertoire.json';
        if ( ! file_exists( $path ) ) { return array(); }
        $data = json_decode( file_get_contents( $path ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        return is_array( $data ) ? $data : array();
    }

    private function import_image( $filename, $title ) {
        if ( ! $filename ) { return 0; }
        $existing = get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'posts_per_page' => 1, 'fields' => 'ids', 'meta_key' => '_kp_legacy_asset', 'meta_value' => $filename ) );
        if ( $existing ) { return (int) $existing[0]; }
        $source = KP_CORE_DIR . 'assets/legacy-repertoire/' . $filename;
        if ( ! file_exists( $source ) ) { return 0; }
        $upload = wp_upload_bits( wp_basename( $filename ), null, file_get_contents( $source ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        if ( ! empty( $upload['error'] ) ) { return 0; }
        $filetype = wp_check_filetype( $upload['file'], null );
        $attachment_id = wp_insert_attachment( array( 'post_mime_type' => $filetype['type'], 'post_title' => $title, 'post_status' => 'inherit' ), $upload['file'] );
        if ( is_wp_error( $attachment_id ) ) { return 0; }
        require_once ABSPATH . 'wp-admin/includes/image.php';
        $meta = wp_generate_attachment_metadata( $attachment_id, $upload['file'] );
        wp_update_attachment_metadata( $attachment_id, $meta );
        update_post_meta( $attachment_id, '_kp_legacy_asset', $filename );
        update_post_meta( $attachment_id, '_wp_attachment_image_alt', sanitize_text_field( $title ) );
        return (int) $attachment_id;
    }

    public function import_legacy_repertoire() {
        if ( ! current_user_can( 'edit_pages' ) ) { wp_die( 'Keine Berechtigung.' ); }
        check_admin_referer( 'kp_import_legacy_repertoire' );
        $created = 0; $skipped = 0; $linked = 0;
        foreach ( $this->legacy_data() as $index => $item ) {
            $key = isset( $item['legacy_key'] ) ? sanitize_key( $item['legacy_key'] ) : '';
            if ( ! $key || empty( $item['title'] ) ) { ++$skipped; continue; }
            $existing = get_posts( array( 'post_type' => 'kp_repertoire', 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids', 'meta_key' => '_kp_rep_legacy_key', 'meta_value' => $key ) );
            if ( $existing ) { $post_id = (int) $existing[0]; ++$skipped; }
            else {
                $post_id = wp_insert_post( array(
                    'post_type' => 'kp_repertoire', 'post_status' => 'publish', 'post_title' => sanitize_text_field( $item['title'] ),
                    'post_name' => sanitize_title( $item['slug'] ), 'post_excerpt' => sanitize_textarea_field( $item['summary'] ),
                    'post_content' => '<p>' . esc_html( $item['summary'] ) . '</p>', 'menu_order' => (int) $index,
                ) );
                if ( is_wp_error( $post_id ) ) { ++$skipped; continue; }
                update_post_meta( $post_id, '_kp_rep_legacy_key', $key );
                ++$created;
            }
            $category = isset( $item['category'] ) ? sanitize_text_field( $item['category'] ) : '';
            if ( $category ) { wp_set_object_terms( $post_id, $category, 'kp_repertoire_category', false ); }
            $field_map = array(
                '_kp_rep_age' => 'age', '_kp_rep_duration' => 'duration', '_kp_rep_players' => 'players', '_kp_rep_play_style' => 'play_style',
                '_kp_rep_technical' => 'technical', '_kp_rep_rights' => 'rights', '_kp_rep_premiere' => 'premiere', '_kp_rep_old_url' => 'old_url'
            );
            foreach ( $field_map as $meta => $field ) { if ( ! empty( $item[ $field ] ) ) { update_post_meta( $post_id, $meta, sanitize_textarea_field( $item[ $field ] ) ); } }
            update_post_meta( $post_id, '_kp_rep_bookable', '1' );
            if ( ! empty( $item['aliases'] ) ) { update_post_meta( $post_id, '_kp_rep_aliases', array_map( 'sanitize_text_field', $item['aliases'] ) ); }
            $featured = $this->import_image( $item['card_image'], $item['title'] . ' – Titelbild' );
            if ( $featured ) { set_post_thumbnail( $post_id, $featured ); }
            $info_image = $this->import_image( $item['info_image'], $item['title'] . ' – historisches Infoblatt' );
            if ( $info_image ) { update_post_meta( $post_id, '_kp_rep_info_image_id', $info_image ); }
        }
        $linked = $this->link_existing_termine();
        flush_rewrite_rules();
        $url = add_query_arg( array( 'page' => 'kp-puppenspiele', 'kp_rep_created' => $created, 'kp_rep_skipped' => $skipped, 'kp_rep_linked' => $linked ), admin_url( 'admin.php' ) );
        wp_safe_redirect( $url ); exit;
    }

    private function normalize( $text ) {
        $text = remove_accents( wp_strip_all_tags( (string) $text ) );
        $text = strtolower( $text );
        $text = preg_replace( '/[^a-z0-9]+/u', ' ', $text );
        return trim( preg_replace( '/\\s+/', ' ', $text ) );
    }
    public function link_existing_termine() {
        $map = array();
        $reps = get_posts( array( 'post_type' => 'kp_repertoire', 'post_status' => 'publish', 'posts_per_page' => -1 ) );
        foreach ( $reps as $rep ) {
            $map[ $this->normalize( $rep->post_title ) ] = $rep->ID;
            $aliases = get_post_meta( $rep->ID, '_kp_rep_aliases', true );
            if ( is_array( $aliases ) ) { foreach ( $aliases as $alias ) { $map[ $this->normalize( $alias ) ] = $rep->ID; } }
        }
        $linked = 0;
        $terms = get_posts( array( 'post_type' => 'kp_termin', 'post_status' => 'any', 'posts_per_page' => -1 ) );
        foreach ( $terms as $term ) {
            if ( get_post_meta( $term->ID, '_kp_repertoire_id', true ) ) { continue; }
            $key = $this->normalize( $term->post_title );
            if ( isset( $map[ $key ] ) ) { update_post_meta( $term->ID, '_kp_repertoire_id', (int) $map[ $key ] ); ++$linked; }
        }
        return $linked;
    }

    public function import_notice() {
        if ( ! isset( $_GET['page'], $_GET['kp_rep_created'] ) || 'kp-puppenspiele' !== sanitize_key( wp_unslash( $_GET['page'] ) ) ) { return; }
        $created = absint( $_GET['kp_rep_created'] ); $skipped = isset( $_GET['kp_rep_skipped'] ) ? absint( $_GET['kp_rep_skipped'] ) : 0; $linked = isset( $_GET['kp_rep_linked'] ) ? absint( $_GET['kp_rep_linked'] ) : 0;
        echo '<div class="notice notice-success is-dismissible"><p><strong>Repertoire-Import abgeschlossen:</strong> ' . esc_html( $created ) . ' neu angelegt, ' . esc_html( $skipped ) . ' übersprungen, ' . esc_html( $linked ) . ' vorhandene Termine mit einem Stück verknüpft.</p></div>';
    }

    public function shortcode_archive() {
        $query = new WP_Query( array( 'post_type' => 'kp_repertoire', 'post_status' => 'publish', 'posts_per_page' => -1, 'orderby' => array( 'menu_order' => 'ASC', 'title' => 'ASC' ) ) );
        ob_start();
        echo '<div class="kp-repertoire">';
        if ( ! $query->have_posts() ) { echo '<p class="kp-termine-empty">Das Repertoire wird gerade vorbereitet.</p>'; }
        else {
            $groups = array();
            while ( $query->have_posts() ) { $query->the_post(); $terms = get_the_terms( get_the_ID(), 'kp_repertoire_category' ); $group = ( $terms && ! is_wp_error( $terms ) ) ? $terms[0]->name : 'Weitere Stücke'; $groups[ $group ][] = get_the_ID(); }
            foreach ( $groups as $group => $ids ) {
                echo '<section class="kp-repertoire-group"><h2>' . esc_html( $group ) . '</h2><div class="kp-repertoire-grid">';
                foreach ( $ids as $id ) { $this->render_card( $id ); }
                echo '</div></section>';
            }
        }
        echo '</div>'; wp_reset_postdata(); return ob_get_clean();
    }

    private function render_card( $post_id ) {
        $age = get_post_meta( $post_id, '_kp_rep_age', true ); $duration = get_post_meta( $post_id, '_kp_rep_duration', true ); $bookable = get_post_meta( $post_id, '_kp_rep_bookable', true ) !== '0'; $excerpt = get_the_excerpt( $post_id );
        ?>
        <article class="kp-repertoire-card">
            <a class="kp-repertoire-image" href="<?php echo esc_url( get_permalink( $post_id ) ); ?>"><?php echo get_the_post_thumbnail( $post_id, 'large', array( 'loading' => 'lazy' ) ); ?></a>
            <div class="kp-repertoire-card-body">
                <h3><a href="<?php echo esc_url( get_permalink( $post_id ) ); ?>"><?php echo esc_html( get_the_title( $post_id ) ); ?></a></h3>
                <div class="kp-repertoire-meta"><?php if ( $age ) : ?><span><?php echo esc_html( $age ); ?></span><?php endif; ?><?php if ( $duration ) : ?><span><?php echo esc_html( $duration ); ?></span><?php endif; ?></div>
                <?php if ( $excerpt ) : ?><p><?php echo esc_html( $excerpt ); ?></p><?php endif; ?>
                <div class="kp-repertoire-card-actions"><a class="kp-termine-button kp-termine-button-outline" href="<?php echo esc_url( get_permalink( $post_id ) ); ?>">Mehr erfahren</a><?php if ( $bookable ) : ?><a class="kp-termine-button" href="<?php echo esc_url( home_url( '/jetzt-buchen/' ) ); ?>">Buchen</a><?php endif; ?></div>
            </div>
        </article>
        <?php
    }

    public function single_content( $content ) {
        if ( ! is_singular( 'kp_repertoire' ) || ! in_the_loop() || ! is_main_query() ) { return $content; }
        $id = get_the_ID(); $age = get_post_meta( $id, '_kp_rep_age', true ); $duration = get_post_meta( $id, '_kp_rep_duration', true ); $players = get_post_meta( $id, '_kp_rep_players', true ); $style = get_post_meta( $id, '_kp_rep_play_style', true ); $technical = get_post_meta( $id, '_kp_rep_technical', true ); $rights = get_post_meta( $id, '_kp_rep_rights', true ); $premiere = get_post_meta( $id, '_kp_rep_premiere', true ); $info_id = absint( get_post_meta( $id, '_kp_rep_info_image_id', true ) ); $bookable = get_post_meta( $id, '_kp_rep_bookable', true ) !== '0';
        ob_start(); ?>
        <div class="kp-repertoire-single">
            <div class="kp-repertoire-facts">
                <?php if ( $age ) : ?><div><small>Zielgruppe</small><strong><?php echo esc_html( $age ); ?></strong></div><?php endif; ?>
                <?php if ( $duration ) : ?><div><small>Dauer</small><strong><?php echo esc_html( $duration ); ?></strong></div><?php endif; ?>
                <?php if ( $style ) : ?><div><small>Spielweise</small><strong><?php echo esc_html( $style ); ?></strong></div><?php endif; ?>
                <?php if ( $bookable ) : ?><div><small>Status</small><strong>Buchbar</strong></div><?php endif; ?>
            </div>
            <div class="kp-repertoire-description"><?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></div>
            <?php if ( $players || $technical || $rights || $premiere ) : ?><div class="kp-repertoire-details">
                <?php if ( $players ) : ?><section><h2>Mitwirkende</h2><p><?php echo esc_html( $players ); ?></p></section><?php endif; ?>
                <?php if ( $technical ) : ?><section><h2>Technische Hinweise</h2><p><?php echo nl2br( esc_html( $technical ) ); ?></p></section><?php endif; ?>
                <?php if ( $rights || $premiere ) : ?><section><h2>Weitere Angaben</h2><?php if ( $rights ) : ?><p><strong>Rechte / Vorlage:</strong> <?php echo esc_html( $rights ); ?></p><?php endif; ?><?php if ( $premiere ) : ?><p><strong>Premiere:</strong> <?php echo esc_html( $premiere ); ?></p><?php endif; ?></section><?php endif; ?>
            </div><?php endif; ?>
            <div class="kp-repertoire-cta"><a class="kp-termine-button" href="<?php echo esc_url( home_url( '/jetzt-buchen/' ) ); ?>">Dieses Stück anfragen</a><a class="kp-termine-button kp-termine-button-outline" href="<?php echo esc_url( home_url( '/repertoire/' ) ); ?>">Zum Repertoire</a></div>
            <?php if ( $info_id ) : ?><details class="kp-repertoire-legacy"><summary>Historisches Infoblatt der bisherigen Website anzeigen</summary><?php echo wp_get_attachment_image( $info_id, 'full', false, array( 'loading' => 'lazy' ) ); ?></details><?php endif; ?>
        </div>
        <?php return ob_get_clean();
    }
}
