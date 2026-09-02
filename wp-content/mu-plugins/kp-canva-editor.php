<?php
/**
 * Canvas-style visual editing layer for the owner frontend editor.
 *
 * In edit mode this replaces the two separate legacy drag runtimes with one
 * shared undo/redo-aware runtime while keeping their existing WordPress option
 * formats and AJAX endpoints. Public pages keep using the established runtime,
 * so previously saved positions remain fully compatible.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

const KP_CANVA_IMAGE_GLOBAL = 'kp_canva_image_edits_global_v1';
const KP_CANVA_IMAGE_PAGES  = 'kp_canva_image_edits_pages_v1';
const KP_CANVA_IMAGE_NONCE  = 'kp_canva_image_edits';

function kp_canva_can_edit() {
    return is_user_logged_in() && current_user_can( 'edit_pages' );
}

function kp_canva_edit_mode() {
    return kp_canva_can_edit()
        && isset( $_GET['kp_edit'] )
        && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
}

function kp_canva_page_key() {
    $id = (int) get_queried_object_id();
    if ( $id > 0 ) { return 'post-' . $id; }
    $uri  = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/';
    $path = (string) wp_parse_url( $uri, PHP_URL_PATH );
    return 'path-' . substr( hash( 'sha256', $path ?: '/' ), 0, 16 );
}

function kp_canva_current_page_scope( $option_name, $page_key ) {
    $pages = get_option( $option_name, array() );
    if ( ! is_array( $pages ) ) { return array(); }
    return isset( $pages[ $page_key ] ) && is_array( $pages[ $page_key ] ) ? $pages[ $page_key ] : array();
}

function kp_canva_clean_image_scope( $raw ) {
    if ( ! is_array( $raw ) ) { return array(); }
    $out = array();
    foreach ( $raw as $key => $value ) {
        $key = sanitize_key( (string) $key );
        if ( ! $key || ! is_array( $value ) ) { continue; }
        $fit = isset( $value['fit'] ) ? sanitize_key( (string) $value['fit'] ) : 'cover';
        if ( ! in_array( $fit, array( 'auto', 'cover', 'contain', 'fill' ), true ) ) { $fit = 'cover'; }
        // -1 / auto are intentional inheritance sentinels. They mean that this
        // tool never touched the property's pre-existing theme/editor styling.
        $pos_x  = isset( $value['pos_x'] ) ? max( -1, min( 100, (float) $value['pos_x'] ) ) : 50;
        $pos_y  = isset( $value['pos_y'] ) ? max( -1, min( 100, (float) $value['pos_y'] ) ) : 50;
        $radius = isset( $value['radius'] ) ? max( -1, min( 80, (float) $value['radius'] ) ) : 0;
        $out[ $key ] = array(
            'brightness' => max( 50, min( 160, (float) ( $value['brightness'] ?? 100 ) ) ),
            'contrast'   => max( 50, min( 180, (float) ( $value['contrast'] ?? 100 ) ) ),
            'saturation' => max( 0, min( 220, (float) ( $value['saturation'] ?? 100 ) ) ),
            'grayscale'  => max( 0, min( 100, (float) ( $value['grayscale'] ?? 0 ) ) ),
            'sepia'      => max( 0, min( 100, (float) ( $value['sepia'] ?? 0 ) ) ),
            'blur'       => max( 0, min( 12, (float) ( $value['blur'] ?? 0 ) ) ),
            'opacity'    => max( 20, min( 100, (float) ( $value['opacity'] ?? 100 ) ) ),
            'rotation'   => max( -180, min( 180, (float) ( $value['rotation'] ?? 0 ) ) ),
            'pos_x'      => $pos_x,
            'pos_y'      => $pos_y,
            'fit'        => $fit,
            'radius'     => $radius,
        );
    }
    return $out;
}

add_action( 'wp_enqueue_scripts', static function () {
    if ( is_admin() ) { return; }

    $page_key = kp_canva_page_key();
    $mu_url   = content_url( '/mu-plugins/' );
    $mu_dir   = WPMU_PLUGIN_DIR . '/';
    $core_url = content_url( '/plugins/koblenzer-puppenspiele-core-phase2-2/assets/' );

    wp_enqueue_script(
        'kp-canva-keys',
        $mu_url . 'kp-canva-keys.js',
        array(),
        // FTP deployments can preserve the old mtime; keep a semantic cache
        // suffix so browsers cannot retain the pre-fix observer stack.
        ( file_exists( $mu_dir . 'kp-canva-keys.js' ) ? (string) filemtime( $mu_dir . 'kp-canva-keys.js' ) : '1' ) . '-fix2',
        true
    );

    // On public pages the established gesture runtime remains active. Make the
    // key bridge a dependency so it can recognise the extra Canva-style targets.
    global $wp_scripts;
    if ( isset( $wp_scripts->registered['kp-touch-gestures'] ) ) {
        $deps = (array) $wp_scripts->registered['kp-touch-gestures']->deps;
        array_unshift( $deps, 'kp-canva-keys' );
        $wp_scripts->registered['kp-touch-gestures']->deps = array_values( array_unique( $deps ) );
    }

    $edit_mode = kp_canva_edit_mode();
    if ( $edit_mode ) {
        // Replace only the edit-mode interaction layer. CSS and the public data
        // format stay unchanged, and the proven safety/Save bridge is re-used.
        // Persistence depends on the legacy bridge, which in turn depends on
        // both legacy gesture runtimes. Leaving that top-level handle queued
        // silently pulled the complete observer stack back in after these
        // lower-level handles had been dequeued.
        foreach ( array( 'kp-touch-persistence', 'kp-touch-editor-bridge', 'kp-touch-gesture-safety', 'kp-touch-free-layout', 'kp-touch-gestures' ) as $handle ) {
            wp_dequeue_script( $handle );
        }
    }

    $gesture_global = get_option( 'kp_touch_gestures_global_v1', array() );
    $free_global    = get_option( 'kp_touch_free_layout_global_v1', array() );
    $image_global   = get_option( KP_CANVA_IMAGE_GLOBAL, array() );
    if ( ! is_array( $gesture_global ) ) { $gesture_global = array(); }
    if ( ! is_array( $free_global ) ) { $free_global = array(); }
    if ( ! is_array( $image_global ) ) { $image_global = array(); }

    $deps = array( 'kp-canva-keys' );
    if ( $edit_mode && wp_script_is( 'kp-frontend-editor-v2', 'registered' ) ) { $deps[] = 'kp-frontend-editor-v2'; }
    if ( $edit_mode && wp_script_is( 'kp-owner-save-coordinator', 'registered' ) ) { $deps[] = 'kp-owner-save-coordinator'; }

    wp_enqueue_style(
        'kp-canva-editor',
        $mu_url . 'kp-canva-editor.css',
        array(),
        file_exists( $mu_dir . 'kp-canva-editor.css' ) ? (string) filemtime( $mu_dir . 'kp-canva-editor.css' ) : '1'
    );
    wp_enqueue_script(
        'kp-canva-editor',
        $mu_url . 'kp-canva-editor.js',
        array_values( array_unique( $deps ) ),
        ( file_exists( $mu_dir . 'kp-canva-editor.js' ) ? (string) filemtime( $mu_dir . 'kp-canva-editor.js' ) : '1' ) . '-fix2',
        true
    );
    wp_localize_script( 'kp-canva-editor', 'KPCanvaEditor', array(
        'ajaxUrl'       => admin_url( 'admin-ajax.php' ),
        'canEdit'       => kp_canva_can_edit(),
        'editMode'      => $edit_mode,
        'pageKey'       => $page_key,
        'holdMs'        => 430,
        'gestureNonce'  => kp_canva_can_edit() ? wp_create_nonce( 'kp_touch_gestures' ) : '',
        'freeNonce'     => kp_canva_can_edit() ? wp_create_nonce( 'kp_touch_free_layout' ) : '',
        'imageNonce'    => kp_canva_can_edit() ? wp_create_nonce( KP_CANVA_IMAGE_NONCE ) : '',
        'gestureGlobal' => (object) $gesture_global,
        'gesturePage'   => (object) kp_canva_current_page_scope( 'kp_touch_gestures_pages_v1', $page_key ),
        'freeGlobal'    => (object) $free_global,
        'freePage'      => (object) kp_canva_current_page_scope( 'kp_touch_free_layout_pages_v1', $page_key ),
        'imageGlobal'   => (object) kp_canva_clean_image_scope( $image_global ),
        'imagePage'     => (object) kp_canva_clean_image_scope( kp_canva_current_page_scope( KP_CANVA_IMAGE_PAGES, $page_key ) ),
    ) );
    wp_enqueue_script(
        'kp-canva-image-inherit',
        $mu_url . 'kp-canva-image-inherit.js',
        array( 'kp-canva-editor' ),
        file_exists( $mu_dir . 'kp-canva-image-inherit.js' ) ? (string) filemtime( $mu_dir . 'kp-canva-image-inherit.js' ) : '1',
        true
    );

    if ( $edit_mode ) {
        wp_enqueue_script(
            'kp-canva-touch-safety',
            $core_url . 'touch-gesture-safety.js',
            array( 'kp-canva-image-inherit' ),
            defined( 'KP_CORE_VERSION' ) ? KP_CORE_VERSION : '1',
            true
        );
        $bridge_deps = array( 'kp-canva-image-inherit' );
        if ( wp_script_is( 'kp-owner-save-coordinator', 'registered' ) ) { $bridge_deps[] = 'kp-owner-save-coordinator'; }
        wp_enqueue_script(
            'kp-canva-touch-bridge',
            $core_url . 'touch-editor-bridge.js',
            array_values( array_unique( $bridge_deps ) ),
            defined( 'KP_CORE_VERSION' ) ? KP_CORE_VERSION : '1',
            true
        );
    }
}, 1000 );

add_action( 'wp_ajax_kp_canva_image_save', static function () {
    if ( ! kp_canva_can_edit() ) {
        wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 );
    }
    check_ajax_referer( KP_CANVA_IMAGE_NONCE, 'nonce' );

    $page_key = isset( $_POST['page_key'] ) ? sanitize_text_field( wp_unslash( $_POST['page_key'] ) ) : '';
    if ( ! preg_match( '/^(post-[0-9]+|path-[a-f0-9]{16})$/', $page_key ) ) {
        wp_send_json_error( array( 'message' => 'Ungültige Seite.' ), 400 );
    }

    if ( class_exists( 'KP_Owner_History' ) ) {
        KP_Owner_History::checkpoint( 'Bildgestaltung geändert' );
    }

    $global_raw = isset( $_POST['global'] ) ? json_decode( wp_unslash( $_POST['global'] ), true ) : array();
    $page_raw   = isset( $_POST['page'] ) ? json_decode( wp_unslash( $_POST['page'] ), true ) : array();
    $global = kp_canva_clean_image_scope( $global_raw );
    $page   = kp_canva_clean_image_scope( $page_raw );

    update_option( KP_CANVA_IMAGE_GLOBAL, $global, false );
    $pages = get_option( KP_CANVA_IMAGE_PAGES, array() );
    if ( ! is_array( $pages ) ) { $pages = array(); }
    if ( $page ) { $pages[ $page_key ] = $page; }
    else { unset( $pages[ $page_key ] ); }
    update_option( KP_CANVA_IMAGE_PAGES, $pages, false );

    $saved_global = kp_canva_clean_image_scope( get_option( KP_CANVA_IMAGE_GLOBAL, array() ) );
    $saved_pages  = get_option( KP_CANVA_IMAGE_PAGES, array() );
    if ( ! is_array( $saved_pages ) ) { $saved_pages = array(); }
    $saved_page = isset( $saved_pages[ $page_key ] ) && is_array( $saved_pages[ $page_key ] )
        ? kp_canva_clean_image_scope( $saved_pages[ $page_key ] )
        : array();

    if ( $saved_global !== $global || $saved_page !== $page ) {
        wp_send_json_error( array( 'message' => 'Die Bildbearbeitung wurde von WordPress nicht dauerhaft übernommen.' ), 500 );
    }

    wp_send_json_success( array(
        'message' => 'Bildbearbeitung gespeichert ✓',
        'global'  => (object) $saved_global,
        'page'    => (object) $saved_page,
    ) );
} );
