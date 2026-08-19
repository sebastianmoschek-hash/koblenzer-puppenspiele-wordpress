<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Fine-grained controls for structured repertoire cards in direct editor v2.
 * Images remain real featured images; button overrides remain attached to the
 * repertoire record instead of depending on fragile DOM positions.
 */
final class KP_Frontend_Card_Controls {
    public static function init() {
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 66 );
        add_action( 'wp_ajax_kp_frontend_card_image_save', array( __CLASS__, 'save_image' ) );
        add_action( 'wp_ajax_kp_frontend_card_button_save', array( __CLASS__, 'save_button' ) );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function edit_mode() {
        return self::can_edit() && isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    }

    private static function path_key( $url ) {
        $path = (string) wp_parse_url( $url, PHP_URL_PATH );
        return '/' . trim( $path, '/' ) . '/';
    }

    private static function button_overrides() {
        $out = array();
        $posts = get_posts( array(
            'post_type'      => 'kp_repertoire',
            'post_status'    => 'publish',
            'posts_per_page' => -1,
            'fields'         => 'ids',
        ) );
        foreach ( $posts as $id ) {
            $more_label = get_post_meta( $id, '_kp_fe_more_label', true );
            $more_url   = get_post_meta( $id, '_kp_fe_more_url', true );
            $book_label = get_post_meta( $id, '_kp_fe_book_label', true );
            $book_url   = get_post_meta( $id, '_kp_fe_book_url', true );
            if ( ! $more_label && ! $more_url && ! $book_label && ! $book_url ) { continue; }
            $out[ self::path_key( get_permalink( $id ) ) ] = array(
                'more_label' => $more_label,
                'more_url'   => $more_url,
                'book_label' => $book_label,
                'book_url'   => $book_url,
            );
        }
        return $out;
    }

    public static function enqueue() {
        if ( is_admin() ) { return; }
        wp_enqueue_script(
            'kp-frontend-card-controls',
            KP_CORE_URL . 'assets/frontend-card-controls.js',
            array( 'kp-frontend-editor-v2' ),
            KP_CORE_VERSION,
            true
        );
        if ( self::edit_mode() ) {
            wp_enqueue_style( 'kp-frontend-card-controls', KP_CORE_URL . 'assets/frontend-card-controls.css', array( 'kp-frontend-editor-v2' ), KP_CORE_VERSION );
        }
        wp_localize_script( 'kp-frontend-card-controls', 'KPFrontendCardControls', array(
            'editMode'  => self::edit_mode(),
            'ajaxUrl'   => admin_url( 'admin-ajax.php' ),
            'nonce'     => self::edit_mode() ? wp_create_nonce( KP_Frontend_Editor_V2::NONCE_ACTION ) : '',
            'overrides' => self::button_overrides(),
        ) );
    }

    private static function validate_record( $id ) {
        return $id && 'kp_repertoire' === get_post_type( $id ) && current_user_can( 'edit_post', $id );
    }

    public static function save_image() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( KP_Frontend_Editor_V2::NONCE_ACTION, 'nonce' );
        $id = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;
        $attachment_id = isset( $_POST['attachment_id'] ) ? absint( $_POST['attachment_id'] ) : 0;
        if ( ! self::validate_record( $id ) || ! $attachment_id || ! wp_attachment_is_image( $attachment_id ) ) {
            wp_send_json_error( array( 'message' => 'Bild konnte nicht gespeichert werden.' ), 400 );
        }
        set_post_thumbnail( $id, $attachment_id );
        $src = wp_get_attachment_image_url( $attachment_id, 'large' );
        wp_send_json_success( array( 'message' => 'Bild gespeichert.', 'src' => $src ?: '' ) );
    }

    public static function save_button() {
        if ( ! self::can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
        check_ajax_referer( KP_Frontend_Editor_V2::NONCE_ACTION, 'nonce' );
        $id   = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;
        $role = isset( $_POST['role'] ) ? sanitize_key( wp_unslash( $_POST['role'] ) ) : '';
        if ( ! self::validate_record( $id ) || ! in_array( $role, array( 'more', 'book' ), true ) ) {
            wp_send_json_error( array( 'message' => 'Button konnte nicht gespeichert werden.' ), 400 );
        }
        $label = isset( $_POST['label'] ) ? sanitize_text_field( wp_unslash( $_POST['label'] ) ) : '';
        $url   = isset( $_POST['url'] ) ? esc_url_raw( wp_unslash( $_POST['url'] ) ) : '';
        if ( '' === $label ) { wp_send_json_error( array( 'message' => 'Bitte eine Button-Beschriftung eintragen.' ), 400 ); }
        if ( '' === $url ) { wp_send_json_error( array( 'message' => 'Bitte ein gültiges Link-Ziel eintragen.' ), 400 ); }

        $default_label = 'more' === $role ? 'Mehr erfahren' : 'Buchen';
        $default_url   = 'more' === $role ? get_permalink( $id ) : home_url( '/jetzt-buchen/' );
        $label_key     = 'more' === $role ? '_kp_fe_more_label' : '_kp_fe_book_label';
        $url_key       = 'more' === $role ? '_kp_fe_more_url' : '_kp_fe_book_url';

        if ( $label === $default_label ) { delete_post_meta( $id, $label_key ); }
        else { update_post_meta( $id, $label_key, $label ); }
        if ( untrailingslashit( $url ) === untrailingslashit( $default_url ) ) { delete_post_meta( $id, $url_key ); }
        else { update_post_meta( $id, $url_key, $url ); }

        wp_send_json_success( array( 'message' => 'Button gespeichert.', 'label' => $label, 'url' => $url ) );
    }
}
