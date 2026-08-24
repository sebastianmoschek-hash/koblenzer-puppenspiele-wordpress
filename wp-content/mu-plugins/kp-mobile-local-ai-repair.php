<?php
/**
 * Local Android AI support for the protected repair lab.
 *
 * The phone-side open model may inspect a restricted code catalog and prepare a
 * search/replace proposal. The server still validates every path/operation and
 * hands the result to the existing branch -> CI -> explicit merge workflow.
 * No cloud language-model request is made by these endpoints.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_local_ai_repair_ready() {
    return function_exists( 'kp_ai_repair_guard' )
        && function_exists( 'kp_ai_repair_catalog' )
        && function_exists( 'kp_ai_repair_allowed_path' )
        && function_exists( 'kp_ai_repair_abs_path' )
        && function_exists( 'kp_ai_repair_apply_operations' )
        && function_exists( 'kp_ai_repair_store_proposal' );
}

function kp_local_ai_repair_guard() {
    if ( ! kp_local_ai_repair_ready() ) {
        wp_send_json_error( array( 'message' => 'Der geschützte Reparaturserver ist noch nicht bereit.' ), 503 );
    }
    kp_ai_repair_guard();
}

add_action( 'wp_ajax_kp_local_ai_repair_context', static function () {
    kp_local_ai_repair_guard();
    $browser = isset( $_POST['browser'] ) ? sanitize_textarea_field( wp_unslash( $_POST['browser'] ) ) : '';
    $request = isset( $_POST['request'] ) ? sanitize_textarea_field( wp_unslash( $_POST['request'] ) ) : '';
    wp_send_json_success( array(
        'request'   => $request,
        'browser'   => mb_substr( $browser, 0, 12000 ),
        'catalog'   => kp_ai_repair_catalog(),
        'debug_tail'=> function_exists( 'kp_ai_repair_debug_tail' ) ? mb_substr( kp_ai_repair_debug_tail(), -12000 ) : '',
        'max_files' => 3,
        'local_ai'  => true,
    ) );
} );

add_action( 'wp_ajax_kp_local_ai_repair_files', static function () {
    kp_local_ai_repair_guard();
    $raw = isset( $_POST['paths'] ) ? wp_unslash( $_POST['paths'] ) : '[]';
    $paths = json_decode( (string) $raw, true );
    if ( ! is_array( $paths ) ) { wp_send_json_error( array( 'message' => 'Ungültige Dateiliste.' ), 400 ); }

    $out = array();
    foreach ( array_slice( array_values( $paths ), 0, 3 ) as $candidate ) {
        $path = ltrim( str_replace( '\\', '/', sanitize_text_field( (string) $candidate ) ), '/' );
        if ( ! kp_ai_repair_allowed_path( $path ) ) { continue; }
        $absolute = kp_ai_repair_abs_path( $path );
        if ( ! $absolute || ! is_file( $absolute ) || ! is_readable( $absolute ) ) { continue; }
        $content = (string) file_get_contents( $absolute );
        $length = strlen( $content );
        $truncated = $length > 26000;
        if ( $truncated ) {
            $content = substr( $content, 0, 16000 )
                . "\n\n/* ... MITTELTEIL FÜR LOKALE KI GEKÜRZT ... */\n\n"
                . substr( $content, -10000 );
        }
        $out[] = array(
            'path'      => $path,
            'hash'      => hash( 'sha256', (string) file_get_contents( $absolute ) ),
            'content'   => $content,
            'truncated' => $truncated,
            'bytes'     => $length,
        );
    }
    if ( ! $out ) { wp_send_json_error( array( 'message' => 'Keine erlaubten Reparaturdateien ausgewählt.' ), 400 ); }
    wp_send_json_success( array( 'files' => $out, 'local_ai' => true ) );
} );

add_action( 'wp_ajax_kp_local_ai_repair_proposal', static function () {
    kp_local_ai_repair_guard();
    $raw = isset( $_POST['plan'] ) ? wp_unslash( $_POST['plan'] ) : '';
    if ( strlen( (string) $raw ) > 180000 ) { wp_send_json_error( array( 'message' => 'Lokaler Reparaturplan ist zu groß.' ), 413 ); }
    $plan = json_decode( (string) $raw, true );
    if ( ! is_array( $plan ) ) { wp_send_json_error( array( 'message' => 'Lokaler Reparaturplan ist kein gültiges JSON.' ), 400 ); }

    try {
        $validated = array();
        foreach ( array_slice( (array) ( $plan['changes'] ?? array() ), 0, 4 ) as $change ) {
            if ( ! is_array( $change ) ) { continue; }
            $path = ltrim( str_replace( '\\', '/', sanitize_text_field( (string) ( $change['path'] ?? '' ) ) ), '/' );
            if ( ! kp_ai_repair_allowed_path( $path ) ) { throw new RuntimeException( 'Nicht erlaubter Reparaturpfad: ' . $path ); }
            $absolute = kp_ai_repair_abs_path( $path );
            if ( ! $absolute || ! is_file( $absolute ) || ! is_readable( $absolute ) ) {
                throw new RuntimeException( 'Reparaturdatei ist nicht lesbar: ' . $path );
            }
            $base = (string) file_get_contents( $absolute );
            $operations = array_slice( (array) ( $change['operations'] ?? array() ), 0, 8 );
            if ( ! $operations ) { continue; }
            $normalized = array();
            foreach ( $operations as $operation ) {
                if ( ! is_array( $operation ) ) { continue; }
                $normalized[] = array(
                    'search'  => (string) ( $operation['search'] ?? '' ),
                    'replace' => (string) ( $operation['replace'] ?? '' ),
                );
            }
            if ( ! $normalized ) { continue; }
            $next = kp_ai_repair_apply_operations( $base, $normalized );
            if ( $next === $base ) { continue; }
            $validated[] = array(
                'path'       => $path,
                'reason'     => sanitize_text_field( (string) ( $change['reason'] ?? 'Lokale KI-Reparatur' ) ),
                'operations' => $normalized,
                'base_hash'  => hash( 'sha256', $base ),
            );
        }
        if ( ! $validated ) {
            wp_send_json_success( array( 'safe' => false, 'message' => 'Die lokale KI hat keine anwendbare Codeänderung vorgeschlagen.' ) );
        }
        $risk = (string) ( $plan['risk'] ?? 'medium' );
        if ( ! in_array( $risk, array( 'low', 'medium', 'high' ), true ) ) { $risk = 'medium'; }
        $proposal = array(
            'summary'   => sanitize_text_field( (string) ( $plan['summary'] ?? 'Lokale KI-Reparatur' ) ),
            'diagnosis' => sanitize_textarea_field( (string) ( $plan['diagnosis'] ?? '' ) ),
            'risk'      => $risk,
            'tests'     => array_values( array_map( 'sanitize_text_field', array_slice( (array) ( $plan['tests'] ?? array() ), 0, 6 ) ) ),
            'changes'   => $validated,
        );
        $proposal_id = kp_ai_repair_store_proposal( $proposal );
        wp_send_json_success( array(
            'safe'        => true,
            'local_ai'    => true,
            'proposal_id' => $proposal_id,
            'summary'     => $proposal['summary'],
            'diagnosis'   => $proposal['diagnosis'],
            'risk'        => $proposal['risk'],
            'tests'       => $proposal['tests'],
            'changes'     => array_map( static function ( $change ) {
                return array( 'path' => $change['path'], 'reason' => $change['reason'] );
            }, $validated ),
        ) );
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 400 );
    }
} );
