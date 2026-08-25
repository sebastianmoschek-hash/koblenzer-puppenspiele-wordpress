<?php
/**
 * Primary installable web-app agent for the Koblenzer Puppenspiele owner.
 *
 * The web app is now the main maintenance surface. It keeps two primary actions
 * (Bearbeiten / KI) on the visible website and talks directly to the protected
 * WordPress AI + repair endpoints. Android remains optional for local Gemma.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_owner_web_agent_can_use() {
    return is_user_logged_in() && current_user_can( 'edit_pages' );
}

/**
 * Shared-hosting hardening for Gemini calls. Some hosts prefer an unusable IPv6
 * route and then surface cURL 28 with zero response bytes. Keep the override
 * scoped to Google's Gemini API only and retain normal TLS verification.
 */
add_action( 'http_api_curl', static function ( $handle, $parsed_args, $url ) {
    if ( ! is_string( $url ) || false === strpos( $url, 'generativelanguage.googleapis.com/' ) ) { return; }
    if ( defined( 'CURLOPT_IPRESOLVE' ) && defined( 'CURL_IPRESOLVE_V4' ) ) {
        curl_setopt( $handle, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4 );
    }
    if ( defined( 'CURLOPT_CONNECTTIMEOUT' ) ) {
        curl_setopt( $handle, CURLOPT_CONNECTTIMEOUT, 8 );
    }
    if ( defined( 'CURLOPT_HTTP_VERSION' ) && defined( 'CURL_HTTP_VERSION_1_1' ) ) {
        curl_setopt( $handle, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1 );
    }
}, 10, 3 );

function kp_owner_web_agent_interaction_text( $body ) {
    if ( function_exists( 'kp_ai_interactions_output_text' ) ) {
        return trim( (string) kp_ai_interactions_output_text( $body ) );
    }
    if ( ! is_array( $body ) ) { return ''; }
    foreach ( (array) ( $body['steps'] ?? array() ) as $step ) {
        if ( ! is_array( $step ) ) { continue; }
        foreach ( (array) ( $step['content'] ?? array() ) as $block ) {
            if ( is_array( $block ) && 'text' === ( $block['type'] ?? '' ) && isset( $block['text'] ) ) {
                return trim( (string) $block['text'] );
            }
        }
    }
    return trim( (string) ( $body['output_text'] ?? '' ) );
}

/**
 * Fast conversational path for the web app. Normal questions should not enter
 * the heavier repair router/file-selection pipeline. Credentials stay on the
 * server and the request is still protected by the repair nonce/capability.
 */
add_action( 'wp_ajax_kp_owner_web_agent_chat', static function () {
    if ( ! function_exists( 'kp_ai_repair_guard' ) || ! function_exists( 'kp_ai_key' ) ) {
        wp_send_json_error( array( 'message' => 'Der geschützte KI-Dienst ist noch nicht vollständig geladen.' ), 503 );
    }
    kp_ai_repair_guard();
    $key = kp_ai_key();
    if ( ! $key ) {
        wp_send_json_error( array( 'message' => 'Gemini ist noch nicht verbunden.' ), 409 );
    }

    $request = isset( $_POST['request'] ) ? trim( sanitize_textarea_field( wp_unslash( $_POST['request'] ) ) ) : '';
    $history = isset( $_POST['history'] ) ? sanitize_textarea_field( wp_unslash( $_POST['history'] ) ) : '';
    $browser = isset( $_POST['browser'] ) ? sanitize_textarea_field( wp_unslash( $_POST['browser'] ) ) : '';
    if ( strlen( $request ) < 2 ) {
        wp_send_json_error( array( 'message' => 'Bitte schreibe zuerst eine Frage.' ), 400 );
    }
    if ( function_exists( 'mb_substr' ) ) {
        $request = mb_substr( $request, 0, 2200 );
        $history = mb_substr( $history, -4500 );
        $browser = mb_substr( $browser, 0, 7000 );
    } else {
        $request = substr( $request, 0, 2200 );
        $history = substr( $history, -4500 );
        $browser = substr( $browser, 0, 7000 );
    }

    $system = 'Du bist die KI in der Web-App der Koblenzer Puppenspiele. Antworte auf Deutsch, freundlich und konkret. Du bekommst den sichtbaren Seitenkontext, darfst aber nicht behaupten, etwas außerhalb dieses Kontexts gesehen zu haben. Bei normalen Fragen nur antworten und nichts verändern. Für technische Programmier- oder Reparaturaufträge soll die Web-App den getrennten geschützten Prüfbranch/CI-Weg verwenden.';
    $input = "FRAGE:\n{$request}\n\nLETZTE UNTERHALTUNG:\n{$history}\n\nSICHTBARER SEITENKONTEXT:\n{$browser}";
    $payload = array(
        'model'              => 'gemini-3.5-flash-lite',
        'input'              => $input,
        'system_instruction' => $system,
        'store'              => false,
        'generation_config'  => array( 'thinking_level' => 'low' ),
    );

    try {
        $started = microtime( true );
        $response = wp_remote_post( 'https://generativelanguage.googleapis.com/v1/interactions', array(
            'timeout'     => 20,
            'httpversion' => '1.1',
            'headers'     => array(
                'Content-Type'   => 'application/json',
                'x-goog-api-key' => $key,
            ),
            'body'        => wp_json_encode( $payload ),
        ) );
        if ( is_wp_error( $response ) ) {
            throw new RuntimeException( $response->get_error_message() );
        }
        $code = (int) wp_remote_retrieve_response_code( $response );
        $body = json_decode( (string) wp_remote_retrieve_body( $response ), true );
        if ( $code < 200 || $code >= 300 ) {
            $message = is_array( $body ) ? ( $body['error']['message'] ?? 'Gemini hat die Anfrage abgelehnt.' ) : 'Gemini hat die Anfrage abgelehnt.';
            throw new RuntimeException( sanitize_text_field( (string) $message ) );
        }
        $reply = kp_owner_web_agent_interaction_text( $body );
        if ( '' === $reply ) { throw new RuntimeException( 'Gemini hat keine Textantwort geliefert.' ); }
        wp_send_json_success( array(
            'reply'      => $reply,
            'model'      => 'gemini-3.5-flash-lite',
            'elapsed_ms' => (int) round( ( microtime( true ) - $started ) * 1000 ),
            'transport'  => 'interactions-v1-ipv4',
        ) );
    } catch ( Throwable $e ) {
        $message = $e->getMessage();
        if ( false !== stripos( $message, 'cURL error 28' ) || false !== stripos( $message, 'timed out' ) ) {
            $message = 'Der Hosting-Server erreicht Gemini weiterhin nicht rechtzeitig. Die Web-App selbst funktioniert; die Google-Verbindung des Servers läuft in ein Netzwerk-Timeout.';
        }
        wp_send_json_error( array( 'message' => $message ), 504 );
    }
} );

add_filter( 'body_class', static function ( $classes ) {
    if ( kp_owner_web_agent_can_use() ) {
        $classes[] = 'kp-owner-web-agent-enabled';
    }
    return $classes;
} );

add_action( 'wp_enqueue_scripts', static function () {
    if ( is_admin() || ! kp_owner_web_agent_can_use() || ! defined( 'KP_CORE_URL' ) ) { return; }

    $version = ( defined( 'KP_CORE_VERSION' ) ? KP_CORE_VERSION : '1' ) . '-web-agent-20260825-2';

    wp_enqueue_style(
        'kp-owner-web-agent',
        KP_CORE_URL . 'assets/owner-web-agent.css',
        array( 'kp-owner-web-app' ),
        $version
    );
    wp_enqueue_script(
        'kp-owner-web-agent',
        KP_CORE_URL . 'assets/owner-web-agent.js',
        array( 'kp-owner-web-app' ),
        $version,
        true
    );
    wp_enqueue_script(
        'kp-owner-web-agent-fast-chat',
        KP_CORE_URL . 'assets/owner-web-agent-fast-chat.js',
        array( 'kp-owner-web-agent' ),
        $version,
        true
    );

    $edit_mode = isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    $config = array(
        'ajaxUrl'       => admin_url( 'admin-ajax.php' ),
        'canEdit'       => true,
        'editMode'      => $edit_mode,
        'openAi'        => isset( $_GET['kp_ai'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_ai'] ) ),
        'homeUrl'       => home_url( '/' ),
        'aiNonce'       => defined( 'KP_AI_NONCE' ) ? wp_create_nonce( KP_AI_NONCE ) : '',
        'repairNonce'   => defined( 'KP_AI_REPAIR_NONCE' ) ? wp_create_nonce( KP_AI_REPAIR_NONCE ) : '',
        'aiConnected'   => function_exists( 'kp_ai_key' ) && (bool) kp_ai_key(),
        'repairReady'   => function_exists( 'kp_mobile_emergency_ready' ) && kp_mobile_emergency_ready(),
        'canMerge'      => current_user_can( 'kp_ai_repair_merge' ),
        'maxCiPolls'    => 24,
        'ciPollMs'      => 5000,
    );
    wp_add_inline_script(
        'kp-owner-web-agent',
        'window.KPOwnerWebAgent=' . wp_json_encode( $config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . ';',
        'before'
    );
}, 240 );
