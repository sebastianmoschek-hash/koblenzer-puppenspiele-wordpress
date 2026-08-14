<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class KP_Termine {
    private static $instance = null;

    public static function instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action( 'init', array( $this, 'register_post_type' ) );
        add_action( 'admin_menu', array( $this, 'register_admin_menu' ), 5 );
        add_action( 'add_meta_boxes', array( $this, 'register_meta_box' ) );
        add_action( 'save_post_kp_termin', array( $this, 'save_meta' ), 10, 2 );
        add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );
        add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_assets' ) );

        add_filter( 'enter_title_here', array( $this, 'title_placeholder' ), 10, 2 );
        add_filter( 'manage_kp_termin_posts_columns', array( $this, 'columns' ) );
        add_action( 'manage_kp_termin_posts_custom_column', array( $this, 'column_content' ), 10, 2 );
        add_filter( 'manage_edit-kp_termin_sortable_columns', array( $this, 'sortable_columns' ) );
        add_action( 'pre_get_posts', array( $this, 'admin_sorting' ) );
        add_filter( 'post_row_actions', array( $this, 'duplicate_row_action' ), 10, 2 );
        add_action( 'admin_action_kp_duplicate_termin', array( $this, 'duplicate_termin' ) );

        add_shortcode( 'kp_termine', array( $this, 'shortcode_all' ) );
        add_shortcode( 'kp_naechste_termine', array( $this, 'shortcode_next' ) );

        add_action( 'admin_post_kp_import_legacy_termine', array( $this, 'import_legacy_termine' ) );
        add_action( 'admin_notices', array( $this, 'import_notice' ) );
    }

    public function register_admin_menu() {
        add_menu_page(
            'Koblenzer Puppenspiele',
            'Puppenspiele',
            'edit_pages',
            'kp-puppenspiele',
            array( $this, 'dashboard_page' ),
            'dashicons-tickets-alt',
            3
        );
    }

    public function register_post_type() {
        $labels = array(
            'name'               => 'Termine',
            'singular_name'      => 'Termin',
            'menu_name'          => 'Termine',
            'add_new'            => 'Neuer Termin',
            'add_new_item'       => 'Neuen Termin anlegen',
            'edit_item'          => 'Termin bearbeiten',
            'new_item'           => 'Neuer Termin',
            'view_item'          => 'Termin ansehen',
            'search_items'       => 'Termine durchsuchen',
            'not_found'          => 'Keine Termine gefunden',
            'not_found_in_trash' => 'Keine Termine im Papierkorb',
            'all_items'          => 'Alle Termine',
        );

        register_post_type( 'kp_termin', array(
            'labels'             => $labels,
            'public'             => false,
            'show_ui'            => true,
            'show_in_menu'       => 'kp-puppenspiele',
            'show_in_rest'       => true,
            'supports'           => array( 'title' ),
            'has_archive'        => false,
            'rewrite'            => false,
            'publicly_queryable' => false,
            'menu_icon'          => 'dashicons-calendar-alt',
            'capability_type'    => 'post',
            'map_meta_cap'       => true,
        ) );
    }

    public function dashboard_page() {
        if ( ! current_user_can( 'edit_pages' ) ) {
            return;
        }

        $today = current_time( 'Y-m-d' );
        $upcoming = new WP_Query( array(
            'post_type'      => 'kp_termin',
            'post_status'    => 'publish',
            'posts_per_page' => 1,
            'fields'         => 'ids',
            'meta_query'     => array(
                array(
                    'key'     => '_kp_date',
                    'value'   => $today,
                    'compare' => '>=',
                    'type'    => 'DATE',
                ),
            ),
        ) );

        $all_count = wp_count_posts( 'kp_termin' );
        $published = isset( $all_count->publish ) ? (int) $all_count->publish : 0;
        $legacy_count = $this->legacy_data_count();
        ?>
        <div class="wrap kp-admin-wrap">
            <h1>Koblenzer Puppenspiele</h1>
            <p class="kp-admin-lead">Die häufigsten Aufgaben an einem Ort – ohne Technik-Menüs durchsuchen zu müssen.</p>

            <div class="kp-admin-grid">
                <a class="kp-admin-card kp-admin-card-primary" href="<?php echo esc_url( admin_url( 'post-new.php?post_type=kp_termin' ) ); ?>">
                    <span class="dashicons dashicons-plus-alt2"></span>
                    <strong>Termin hinzufügen</strong>
                    <small>Stück, Datum, Uhrzeit, Ort und Link eintragen</small>
                </a>
                <a class="kp-admin-card" href="<?php echo esc_url( admin_url( 'edit.php?post_type=kp_termin' ) ); ?>">
                    <span class="dashicons dashicons-calendar-alt"></span>
                    <strong>Alle Termine</strong>
                    <small><?php echo esc_html( $published ); ?> veröffentlichte Einträge verwalten</small>
                </a>
                <a class="kp-admin-card" href="<?php echo esc_url( admin_url( 'post-new.php?post_type=kp_repertoire' ) ); ?>">
                    <span class="dashicons dashicons-plus-alt2"></span>
                    <strong>Stück hinzufügen</strong>
                    <small>Repertoire mit Bild, Alter, Dauer und Technik pflegen</small>
                </a>
                <a class="kp-admin-card" href="<?php echo esc_url( admin_url( 'edit.php?post_type=kp_repertoire' ) ); ?>">
                    <span class="dashicons dashicons-format-gallery"></span>
                    <strong>Repertoire</strong>
                    <small>Alle Stücke verwalten</small>
                </a>
                <a class="kp-admin-card" href="<?php echo esc_url( admin_url( 'site-editor.php' ) ); ?>">
                    <span class="dashicons dashicons-admin-appearance"></span>
                    <strong>Website gestalten</strong>
                    <small>Seiten, Navigation, Header, Farben und Layout</small>
                </a>
                <a class="kp-admin-card" href="<?php echo esc_url( home_url( '/' ) ); ?>" target="_blank" rel="noopener">
                    <span class="dashicons dashicons-external"></span>
                    <strong>Website ansehen</strong>
                    <small>Öffnet die Startseite in einem neuen Tab</small>
                </a>
            </div>

            <div class="kp-admin-panel">
                <h2>Alten Spielplan übernehmen</h2>
                <p>Im Plugin liegen <?php echo esc_html( $legacy_count ); ?> aus der bisherigen <code>termine.html</code> strukturierte Vorstellungen (August 2026 bis November 2027). Der Import überspringt bereits importierte Einträge automatisch.</p>
                <form action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post">
                    <input type="hidden" name="action" value="kp_import_legacy_termine">
                    <?php wp_nonce_field( 'kp_import_legacy_termine' ); ?>
                    <?php submit_button( 'Alte Termine jetzt importieren', 'secondary', 'submit', false ); ?>
                </form>
                <p class="description">Nichts wird gelöscht. Danach können alle importierten Termine einzeln geändert, auf Entwurf gesetzt oder gelöscht werden.</p>
            </div>

            <div class="kp-admin-panel">
                <h2>Aktives Repertoire übernehmen</h2>
                <p>Aus der aktuellen Repertoire-Seite sind <strong>17 aktive Stücke</strong> vorbereitet. Historische Archivstücke werden nicht automatisch importiert.</p>
                <form action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post">
                    <input type="hidden" name="action" value="kp_import_legacy_repertoire">
                    <?php wp_nonce_field( 'kp_import_legacy_repertoire' ); ?>
                    <?php submit_button( '17 aktuelle Repertoire-Stücke jetzt importieren', 'secondary', 'submit', false ); ?>
                </form>
                <p class="description">Bereits importierte Stücke werden übersprungen. Passende vorhandene Termine werden anschließend automatisch mit dem jeweiligen Stück verknüpft.</p>
            </div>
        </div>
        <?php
    }

    public function enqueue_admin_assets( $hook ) {
        $screen = get_current_screen();
        if ( ( $screen && in_array( $screen->post_type, array( 'kp_termin', 'kp_repertoire' ), true ) ) || false !== strpos( (string) $hook, 'kp-puppenspiele' ) ) {
            wp_enqueue_style( 'kp-core-admin', KP_CORE_URL . 'assets/admin.css', array(), KP_CORE_VERSION );
        }
    }

    public function enqueue_frontend_assets() {
        wp_enqueue_style( 'kp-core-frontend', KP_CORE_URL . 'assets/frontend.css', array(), KP_CORE_VERSION );
    }

    public function register_meta_box() {
        add_meta_box(
            'kp-termin-details',
            'Vorstellungsdetails',
            array( $this, 'render_meta_box' ),
            'kp_termin',
            'normal',
            'high'
        );
    }

    public function render_meta_box( $post ) {
        wp_nonce_field( 'kp_save_termin', 'kp_termin_nonce' );

        $values = array(
            'date'       => get_post_meta( $post->ID, '_kp_date', true ),
            'time'       => get_post_meta( $post->ID, '_kp_time', true ),
            'end_time'   => get_post_meta( $post->ID, '_kp_end_time', true ),
            'city'       => get_post_meta( $post->ID, '_kp_city', true ),
            'venue'      => get_post_meta( $post->ID, '_kp_venue', true ),
            'address'    => get_post_meta( $post->ID, '_kp_address', true ),
            'status'     => get_post_meta( $post->ID, '_kp_status', true ) ?: 'standard',
            'ticket_url' => get_post_meta( $post->ID, '_kp_ticket_url', true ),
            'info_url'   => get_post_meta( $post->ID, '_kp_info_url', true ),
            'note'       => get_post_meta( $post->ID, '_kp_note', true ),
            'repertoire_id' => absint( get_post_meta( $post->ID, '_kp_repertoire_id', true ) ),
        );
        $repertoire = get_posts( array( 'post_type' => 'kp_repertoire', 'post_status' => 'publish', 'posts_per_page' => -1, 'orderby' => 'title', 'order' => 'ASC' ) );
        ?>
        <div class="kp-fields">
            <div class="kp-field kp-field-wide">
                <label for="kp_repertoire_id">Stück aus dem Repertoire <span>(empfohlen)</span></label>
                <select id="kp_repertoire_id" name="kp_repertoire_id">
                    <option value="0">– kein Repertoire-Stück / freien Titel verwenden –</option>
                    <?php foreach ( $repertoire as $rep ) : ?><option value="<?php echo esc_attr( $rep->ID ); ?>" <?php selected( $values['repertoire_id'], $rep->ID ); ?>><?php echo esc_html( $rep->post_title ); ?></option><?php endforeach; ?>
                </select>
                <p class="description">Wenn ein Stück ausgewählt ist, wird der Termin automatisch damit verknüpft und auf der Website zum Repertoire verlinkt.</p>
            </div>
            <div class="kp-field kp-field-third">
                <label for="kp_date">Datum *</label>
                <input type="date" id="kp_date" name="kp_date" value="<?php echo esc_attr( $values['date'] ); ?>" required>
            </div>
            <div class="kp-field kp-field-third">
                <label for="kp_time">Beginn</label>
                <input type="time" id="kp_time" name="kp_time" value="<?php echo esc_attr( $values['time'] ); ?>">
            </div>
            <div class="kp-field kp-field-third">
                <label for="kp_end_time">Ende <span>(optional)</span></label>
                <input type="time" id="kp_end_time" name="kp_end_time" value="<?php echo esc_attr( $values['end_time'] ); ?>">
            </div>

            <div class="kp-field kp-field-half">
                <label for="kp_city">Ort / Stadt *</label>
                <input type="text" id="kp_city" name="kp_city" value="<?php echo esc_attr( $values['city'] ); ?>" placeholder="z. B. Koblenz" required>
            </div>
            <div class="kp-field kp-field-half">
                <label for="kp_venue">Spielstätte / Veranstaltung</label>
                <input type="text" id="kp_venue" name="kp_venue" value="<?php echo esc_attr( $values['venue'] ); ?>" placeholder="z. B. Kulturfabrik">
            </div>

            <div class="kp-field kp-field-wide">
                <label for="kp_address">Adresse <span>(optional)</span></label>
                <input type="text" id="kp_address" name="kp_address" value="<?php echo esc_attr( $values['address'] ); ?>" placeholder="Straße, PLZ Ort">
            </div>

            <div class="kp-field kp-field-wide">
                <label for="kp_status">Status</label>
                <select id="kp_status" name="kp_status">
                    <?php foreach ( $this->statuses() as $key => $label ) : ?>
                        <option value="<?php echo esc_attr( $key ); ?>" <?php selected( $values['status'], $key ); ?>><?php echo esc_html( $label ); ?></option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="kp-field kp-field-half">
                <label for="kp_ticket_url">Ticket-Link <span>(optional)</span></label>
                <input type="url" id="kp_ticket_url" name="kp_ticket_url" value="<?php echo esc_attr( $values['ticket_url'] ); ?>" placeholder="https://…">
            </div>
            <div class="kp-field kp-field-half">
                <label for="kp_info_url">Info-Link <span>(optional)</span></label>
                <input type="url" id="kp_info_url" name="kp_info_url" value="<?php echo esc_attr( $values['info_url'] ); ?>" placeholder="https://…">
            </div>

            <div class="kp-field kp-field-wide">
                <label for="kp_note">Kurzer Hinweis <span>(optional)</span></label>
                <textarea id="kp_note" name="kp_note" rows="3" placeholder="z. B. Einlass ab 14:30 Uhr"><?php echo esc_textarea( $values['note'] ); ?></textarea>
            </div>
        </div>
        <p class="description"><strong>Tipp:</strong> Bei zwei Vorstellungen am selben Tag kannst du den ersten Termin speichern und danach in der Terminliste auf <em>Duplizieren</em> klicken. Dann musst du meistens nur noch die Uhrzeit ändern.</p>
        <?php
    }

    public function save_meta( $post_id, $post ) {
        if ( ! isset( $_POST['kp_termin_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['kp_termin_nonce'] ) ), 'kp_save_termin' ) ) {
            return;
        }
        if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
            return;
        }
        if ( ! current_user_can( 'edit_post', $post_id ) ) {
            return;
        }

        $repertoire_id = isset( $_POST['kp_repertoire_id'] ) ? absint( $_POST['kp_repertoire_id'] ) : 0;
        if ( $repertoire_id && 'kp_repertoire' === get_post_type( $repertoire_id ) ) {
            update_post_meta( $post_id, '_kp_repertoire_id', $repertoire_id );
            $rep_title = get_the_title( $repertoire_id );
            if ( $rep_title && $rep_title !== $post->post_title ) {
                remove_action( 'save_post_kp_termin', array( $this, 'save_meta' ), 10 );
                wp_update_post( array( 'ID' => $post_id, 'post_title' => $rep_title ) );
                add_action( 'save_post_kp_termin', array( $this, 'save_meta' ), 10, 2 );
            }
        } else {
            delete_post_meta( $post_id, '_kp_repertoire_id' );
        }

        $fields = array(
            '_kp_date'       => isset( $_POST['kp_date'] ) ? sanitize_text_field( wp_unslash( $_POST['kp_date'] ) ) : '',
            '_kp_time'       => isset( $_POST['kp_time'] ) ? sanitize_text_field( wp_unslash( $_POST['kp_time'] ) ) : '',
            '_kp_end_time'   => isset( $_POST['kp_end_time'] ) ? sanitize_text_field( wp_unslash( $_POST['kp_end_time'] ) ) : '',
            '_kp_city'       => isset( $_POST['kp_city'] ) ? sanitize_text_field( wp_unslash( $_POST['kp_city'] ) ) : '',
            '_kp_venue'      => isset( $_POST['kp_venue'] ) ? sanitize_text_field( wp_unslash( $_POST['kp_venue'] ) ) : '',
            '_kp_address'    => isset( $_POST['kp_address'] ) ? sanitize_text_field( wp_unslash( $_POST['kp_address'] ) ) : '',
            '_kp_status'     => isset( $_POST['kp_status'] ) ? sanitize_key( wp_unslash( $_POST['kp_status'] ) ) : 'standard',
            '_kp_ticket_url' => isset( $_POST['kp_ticket_url'] ) ? esc_url_raw( wp_unslash( $_POST['kp_ticket_url'] ) ) : '',
            '_kp_info_url'   => isset( $_POST['kp_info_url'] ) ? esc_url_raw( wp_unslash( $_POST['kp_info_url'] ) ) : '',
            '_kp_note'       => isset( $_POST['kp_note'] ) ? sanitize_textarea_field( wp_unslash( $_POST['kp_note'] ) ) : '',
        );

        if ( ! array_key_exists( $fields['_kp_status'], $this->statuses() ) ) {
            $fields['_kp_status'] = 'standard';
        }

        foreach ( $fields as $key => $value ) {
            if ( '' === $value ) {
                delete_post_meta( $post_id, $key );
            } else {
                update_post_meta( $post_id, $key, $value );
            }
        }

        if ( ! empty( $fields['_kp_date'] ) ) {
            $sort_time = ! empty( $fields['_kp_time'] ) ? $fields['_kp_time'] : '23:59';
            update_post_meta( $post_id, '_kp_sort', $fields['_kp_date'] . ' ' . $sort_time );
        } else {
            delete_post_meta( $post_id, '_kp_sort' );
        }
    }

    public function title_placeholder( $title, $post ) {
        if ( $post && 'kp_termin' === $post->post_type ) {
            return 'Stück / Vorstellung, z. B. „Nulli und Priesemut“';
        }
        return $title;
    }

    public function statuses() {
        return array(
            'standard'   => 'Normal / Tickets über Veranstalter',
            'free'       => 'Eintritt frei',
            'planned'    => 'In Planung',
            'box_office' => 'Eintritt Tageskasse',
            'sold_out'   => 'Ausverkauft',
            'closed'     => 'Geschlossene Vorstellung',
            'cancelled'  => 'Abgesagt',
        );
    }

    public function columns( $columns ) {
        return array(
            'cb'        => $columns['cb'],
            'title'     => 'Stück / Vorstellung',
            'kp_date'   => 'Datum',
            'kp_time'   => 'Uhrzeit',
            'kp_place'  => 'Ort',
            'kp_status' => 'Status',
            'date'      => 'WordPress',
        );
    }

    public function column_content( $column, $post_id ) {
        switch ( $column ) {
            case 'kp_date':
                $date = get_post_meta( $post_id, '_kp_date', true );
                echo $date ? esc_html( $this->format_date( $date, 'D, d.m.Y' ) ) : '–';
                break;
            case 'kp_time':
                $time = get_post_meta( $post_id, '_kp_time', true );
                echo $time ? esc_html( $time . ' Uhr' ) : 'Uhrzeit folgt';
                break;
            case 'kp_place':
                $city = get_post_meta( $post_id, '_kp_city', true );
                $venue = get_post_meta( $post_id, '_kp_venue', true );
                echo esc_html( trim( $city . ( $venue ? ' · ' . $venue : '' ) ) ?: '–' );
                break;
            case 'kp_status':
                $status = get_post_meta( $post_id, '_kp_status', true ) ?: 'standard';
                $labels = $this->statuses();
                echo esc_html( isset( $labels[ $status ] ) ? $labels[ $status ] : $status );
                break;
        }
    }

    public function sortable_columns( $columns ) {
        $columns['kp_date'] = 'kp_sort';
        return $columns;
    }

    public function admin_sorting( $query ) {
        if ( ! is_admin() || ! $query->is_main_query() ) {
            return;
        }
        if ( 'kp_termin' !== $query->get( 'post_type' ) ) {
            return;
        }
        if ( ! $query->get( 'orderby' ) ) {
            $query->set( 'meta_key', '_kp_sort' );
            $query->set( 'orderby', 'meta_value' );
            $query->set( 'order', 'ASC' );
        } elseif ( 'kp_sort' === $query->get( 'orderby' ) ) {
            $query->set( 'meta_key', '_kp_sort' );
            $query->set( 'orderby', 'meta_value' );
        }
    }

    public function duplicate_row_action( $actions, $post ) {
        if ( 'kp_termin' !== $post->post_type || ! current_user_can( 'edit_post', $post->ID ) ) {
            return $actions;
        }
        $url = wp_nonce_url(
            admin_url( 'admin.php?action=kp_duplicate_termin&post=' . $post->ID ),
            'kp_duplicate_termin_' . $post->ID
        );
        $actions['kp_duplicate'] = '<a href="' . esc_url( $url ) . '">Duplizieren</a>';
        return $actions;
    }

    public function duplicate_termin() {
        $post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0;
        if ( ! $post_id || ! wp_verify_nonce( isset( $_GET['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ) : '', 'kp_duplicate_termin_' . $post_id ) ) {
            wp_die( 'Ungültige Anfrage.' );
        }
        if ( ! current_user_can( 'edit_post', $post_id ) ) {
            wp_die( 'Keine Berechtigung.' );
        }

        $source = get_post( $post_id );
        if ( ! $source || 'kp_termin' !== $source->post_type ) {
            wp_die( 'Termin nicht gefunden.' );
        }

        $new_id = wp_insert_post( array(
            'post_type'   => 'kp_termin',
            'post_status' => 'draft',
            'post_title'  => $source->post_title,
        ) );

        if ( is_wp_error( $new_id ) ) {
            wp_die( esc_html( $new_id->get_error_message() ) );
        }

        $keys = array( '_kp_date', '_kp_time', '_kp_end_time', '_kp_city', '_kp_venue', '_kp_address', '_kp_status', '_kp_ticket_url', '_kp_info_url', '_kp_note', '_kp_sort', '_kp_repertoire_id' );
        foreach ( $keys as $key ) {
            $value = get_post_meta( $post_id, $key, true );
            if ( '' !== $value ) {
                update_post_meta( $new_id, $key, $value );
            }
        }

        wp_safe_redirect( admin_url( 'post.php?action=edit&post=' . $new_id ) );
        exit;
    }

    private function upcoming_query( $limit = -1 ) {
        return new WP_Query( array(
            'post_type'      => 'kp_termin',
            'post_status'    => 'publish',
            'posts_per_page' => (int) $limit,
            'meta_key'       => '_kp_sort',
            'orderby'        => 'meta_value',
            'order'          => 'ASC',
            'meta_query'     => array(
                array(
                    'key'     => '_kp_date',
                    'value'   => current_time( 'Y-m-d' ),
                    'compare' => '>=',
                    'type'    => 'DATE',
                ),
            ),
            'no_found_rows'  => true,
        ) );
    }

    public function shortcode_next( $atts ) {
        $atts = shortcode_atts( array( 'limit' => 5 ), $atts, 'kp_naechste_termine' );
        $limit = max( 1, min( 12, absint( $atts['limit'] ) ) );
        $query = $this->upcoming_query( $limit );

        ob_start();
        echo '<div class="kp-termine kp-termine-next">';
        echo '<h2 class="kp-termine-heading">Nächste Vorstellungen</h2>';
        $this->render_items( $query, false );
        echo '<div class="kp-termine-more"><a class="kp-termine-button kp-termine-button-outline" href="' . esc_url( home_url( '/termine/' ) ) . '">Alle Termine</a></div>';
        echo '</div>';
        wp_reset_postdata();
        return ob_get_clean();
    }

    public function shortcode_all() {
        $query = $this->upcoming_query( -1 );
        ob_start();
        echo '<div class="kp-termine kp-termine-all">';
        echo '<div class="kp-termine-notice">Tickets und Reservierungen laufen über die jeweiligen Veranstalter. Die Koblenzer Puppenspiele verkaufen oder reservieren selbst keine Karten. Änderungen im Spielplan bleiben vorbehalten.</div>';
        $this->render_items( $query, true );
        echo '</div>';
        wp_reset_postdata();
        return ob_get_clean();
    }

    private function render_items( $query, $group_months ) {
        if ( ! $query->have_posts() ) {
            echo '<p class="kp-termine-empty">Neue Termine folgen in Kürze.</p>';
            return;
        }

        $last_month = '';
        echo '<div class="kp-termine-list">';
        while ( $query->have_posts() ) {
            $query->the_post();
            $post_id = get_the_ID();
            $date = get_post_meta( $post_id, '_kp_date', true );
            $time = get_post_meta( $post_id, '_kp_time', true );
            $end_time = get_post_meta( $post_id, '_kp_end_time', true );
            $city = get_post_meta( $post_id, '_kp_city', true );
            $venue = get_post_meta( $post_id, '_kp_venue', true );
            $address = get_post_meta( $post_id, '_kp_address', true );
            $status = get_post_meta( $post_id, '_kp_status', true ) ?: 'standard';
            $ticket = get_post_meta( $post_id, '_kp_ticket_url', true );
            $info = get_post_meta( $post_id, '_kp_info_url', true );
            $note = get_post_meta( $post_id, '_kp_note', true );

            $month_key = $date ? substr( $date, 0, 7 ) : '';
            if ( $group_months && $month_key && $month_key !== $last_month ) {
                $last_month = $month_key;
                echo '<h2 class="kp-termine-month">' . esc_html( $this->format_date( $date, 'F Y' ) ) . '</h2>';
            }

            $status_labels = $this->statuses();
            $status_label = isset( $status_labels[ $status ] ) ? $status_labels[ $status ] : '';
            ?>
            <article class="kp-termin-card kp-status-<?php echo esc_attr( $status ); ?>">
                <div class="kp-termin-date">
                    <span class="kp-termin-weekday"><?php echo esc_html( $date ? $this->format_date( $date, 'D' ) : '' ); ?></span>
                    <strong><?php echo esc_html( $date ? $this->format_date( $date, 'd.' ) : '–' ); ?></strong>
                    <span><?php echo esc_html( $date ? $this->format_date( $date, 'M' ) : '' ); ?></span>
                </div>
                <div class="kp-termin-main">
                    <div class="kp-termin-time"><?php echo esc_html( $time ? $time . ' Uhr' : 'Uhrzeit folgt' ); ?><?php echo $end_time ? esc_html( ' – ' . $end_time . ' Uhr' ) : ''; ?></div>
                    <?php $rep_id = absint( get_post_meta( $post_id, '_kp_repertoire_id', true ) ); ?>
                    <h3><?php if ( $rep_id && 'kp_repertoire' === get_post_type( $rep_id ) ) : ?><a class="kp-termin-title-link" href="<?php echo esc_url( get_permalink( $rep_id ) ); ?>"><?php echo esc_html( get_the_title( $rep_id ) ); ?></a><?php else : ?><?php echo esc_html( get_the_title() ); ?><?php endif; ?></h3>
                    <?php if ( 'standard' !== $status && $status_label ) : ?>
                        <span class="kp-termin-status"><?php echo esc_html( $status_label ); ?></span>
                    <?php endif; ?>
                    <?php if ( $note ) : ?><p class="kp-termin-note"><?php echo esc_html( $note ); ?></p><?php endif; ?>
                </div>
                <div class="kp-termin-place">
                    <?php if ( $city ) : ?><strong><?php echo esc_html( $city ); ?></strong><?php endif; ?>
                    <?php if ( $venue ) : ?><span><?php echo esc_html( $venue ); ?></span><?php endif; ?>
                    <?php if ( $address ) : ?><span class="kp-termin-address"><?php echo esc_html( $address ); ?></span><?php endif; ?>
                </div>
                <?php if ( $ticket || $info ) : ?>
                    <div class="kp-termin-actions">
                        <?php if ( $ticket ) : ?><a class="kp-termine-button" href="<?php echo esc_url( $ticket ); ?>" target="_blank" rel="noopener">Tickets</a><?php endif; ?>
                        <?php if ( $info ) : ?><a class="kp-termine-button kp-termine-button-outline" href="<?php echo esc_url( $info ); ?>" target="_blank" rel="noopener">Infos<?php echo ! $ticket ? ' &amp; Tickets' : ''; ?></a><?php endif; ?>
                    </div>
                <?php endif; ?>
            </article>
            <?php
        }
        echo '</div>';
    }

    private function format_date( $date, $format ) {
        if ( ! $date ) {
            return '';
        }
        $timestamp = strtotime( $date . ' 12:00:00' );
        return wp_date( $format, $timestamp, wp_timezone() );
    }

    private function legacy_data_path() {
        return KP_CORE_DIR . 'data/legacy-termine-2026-2027.json';
    }

    private function legacy_data() {
        $path = $this->legacy_data_path();
        if ( ! file_exists( $path ) ) {
            return array();
        }
        $data = json_decode( file_get_contents( $path ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        return is_array( $data ) ? $data : array();
    }

    private function legacy_data_count() {
        return count( $this->legacy_data() );
    }

    public function import_legacy_termine() {
        if ( ! current_user_can( 'edit_pages' ) ) {
            wp_die( 'Keine Berechtigung.' );
        }
        check_admin_referer( 'kp_import_legacy_termine' );

        $items = $this->legacy_data();
        $created = 0;
        $skipped = 0;

        foreach ( $items as $item ) {
            $legacy_key = isset( $item['legacy_key'] ) ? sanitize_text_field( $item['legacy_key'] ) : '';
            if ( ! $legacy_key || empty( $item['date'] ) || empty( $item['title'] ) ) {
                ++$skipped;
                continue;
            }

            $existing = get_posts( array(
                'post_type'      => 'kp_termin',
                'post_status'    => 'any',
                'posts_per_page' => 1,
                'fields'         => 'ids',
                'meta_key'       => '_kp_legacy_key',
                'meta_value'     => $legacy_key,
            ) );
            if ( $existing ) {
                ++$skipped;
                continue;
            }

            $post_id = wp_insert_post( array(
                'post_type'   => 'kp_termin',
                'post_status' => 'publish',
                'post_title'  => sanitize_text_field( $item['title'] ),
            ) );
            if ( is_wp_error( $post_id ) ) {
                ++$skipped;
                continue;
            }

            $date = sanitize_text_field( $item['date'] );
            $time = isset( $item['time'] ) ? sanitize_text_field( $item['time'] ) : '';
            $status = isset( $item['status'] ) ? sanitize_key( $item['status'] ) : 'standard';
            if ( ! array_key_exists( $status, $this->statuses() ) ) {
                $status = 'standard';
            }

            update_post_meta( $post_id, '_kp_legacy_key', $legacy_key );
            update_post_meta( $post_id, '_kp_date', $date );
            if ( $time ) update_post_meta( $post_id, '_kp_time', $time );
            update_post_meta( $post_id, '_kp_city', isset( $item['city'] ) ? sanitize_text_field( $item['city'] ) : '' );
            update_post_meta( $post_id, '_kp_venue', isset( $item['venue'] ) ? sanitize_text_field( $item['venue'] ) : '' );
            update_post_meta( $post_id, '_kp_status', $status );
            if ( ! empty( $item['ticket_url'] ) ) update_post_meta( $post_id, '_kp_ticket_url', esc_url_raw( $item['ticket_url'] ) );
            if ( ! empty( $item['info_url'] ) ) update_post_meta( $post_id, '_kp_info_url', esc_url_raw( $item['info_url'] ) );
            update_post_meta( $post_id, '_kp_sort', $date . ' ' . ( $time ?: '23:59' ) );
            ++$created;
        }

        $url = add_query_arg( array(
            'page'       => 'kp-puppenspiele',
            'kp_created' => $created,
            'kp_skipped' => $skipped,
        ), admin_url( 'admin.php' ) );
        wp_safe_redirect( $url );
        exit;
    }

    public function import_notice() {
        if ( ! isset( $_GET['page'], $_GET['kp_created'] ) || 'kp-puppenspiele' !== sanitize_key( wp_unslash( $_GET['page'] ) ) ) {
            return;
        }
        $created = absint( $_GET['kp_created'] );
        $skipped = isset( $_GET['kp_skipped'] ) ? absint( $_GET['kp_skipped'] ) : 0;
        echo '<div class="notice notice-success is-dismissible"><p><strong>Terminimport abgeschlossen:</strong> ' . esc_html( $created ) . ' neu angelegt, ' . esc_html( $skipped ) . ' übersprungen.</p></div>';
    }
}
