<?php
/**
 * Temporary Gemini Live bootstrap v2 for the Android Homepage-Hilfe app.
 *
 * Uses Google's documented simplest ephemeral-token flow: one-use, short-lived,
 * no Live-connect constraints. The client then sends the complete Bidi setup itself.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_ajax_kp_mobile_live_bootstrap', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'kp_ai_repair_code' ) ) {
        wp_send_json_error( array( 'message' => 'Bitte zuerst als Homepage-Techniker oder Administrator anmelden.' ), 403 );
    }

    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
    if ( ! str_contains( $ua, 'KoblenzerPuppenspieleTechnician/' ) ) {
        wp_send_json_error( array( 'message' => 'Dieser Live-Bootstrap ist nur für die Homepage-Hilfe-App verfügbar.' ), 403 );
    }

    if ( ! defined( 'KP_AI_REPAIR_NONCE' ) || ! function_exists( 'kp_ai_key' ) ) {
        wp_send_json_error( array( 'message' => 'Die KI-Reparaturbasis ist noch nicht vollständig geladen.' ), 503 );
    }

    $gemini_key = kp_ai_key();
    if ( ! $gemini_key ) {
        wp_send_json_error( array( 'message' => 'Gemini ist serverseitig noch nicht verbunden.' ), 409 );
    }

    $model = 'gemini-3.1-flash-live-preview';
    $now   = time();
    $payload = array(
        'uses'                 => 1,
        'expireTime'           => gmdate( 'Y-m-d\\TH:i:s\\Z', $now + 30 * MINUTE_IN_SECONDS ),
        'newSessionExpireTime' => gmdate( 'Y-m-d\\TH:i:s\\Z', $now + 2 * MINUTE_IN_SECONDS ),
    );

    $response = wp_remote_post( 'https://generativelanguage.googleapis.com/v1beta/auth_tokens', array(
        'timeout' => 20,
        'headers' => array(
            'Content-Type'   => 'application/json',
            'x-goog-api-key' => $gemini_key,
        ),
        'body' => wp_json_encode( $payload ),
    ) );

    if ( is_wp_error( $response ) ) {
        wp_send_json_error( array( 'message' => 'Gemini-Live-Token konnte nicht angefordert werden: ' . $response->get_error_message() ), 502 );
    }

    $code = (int) wp_remote_retrieve_response_code( $response );
    $body = json_decode( (string) wp_remote_retrieve_body( $response ), true );
    if ( $code < 200 || $code >= 300 || ! is_array( $body ) || empty( $body['name'] ) ) {
        $message = is_array( $body ) ? (string) ( $body['error']['message'] ?? 'Gemini hat kein Live-Token geliefert.' ) : 'Gemini hat kein Live-Token geliefert.';
        if ( 429 === $code ) {
            $message = 'Gemini-Live-Kontingent oder Rate-Limit erreicht: ' . $message;
        }
        wp_send_json_error( array( 'message' => sanitize_text_field( $message ) ), $code >= 400 && $code <= 599 ? $code : 502 );
    }

    $owner_nonce = '';
    if ( class_exists( 'KP_Owner_Web_App' ) && defined( 'KP_Owner_Web_App::NONCE_ACTION' ) ) {
        $owner_nonce = wp_create_nonce( KP_Owner_Web_App::NONCE_ACTION );
    }

    $github_connected = function_exists( 'kp_ai_repair_token' ) && (bool) kp_ai_repair_token();
    wp_send_json_success( array(
        'liveToken'       => sanitize_text_field( (string) $body['name'] ),
        'model'           => $model,
        'liveProtocol'    => 'v1beta-u1',
        'repairNonce'     => wp_create_nonce( KP_AI_REPAIR_NONCE ),
        'ownerNonce'      => $owner_nonce,
        'githubConnected' => $github_connected,
        'canMerge'        => current_user_can( 'kp_ai_repair_merge' ),
        'expiresAt'       => gmdate( 'c', $now + 30 * MINUTE_IN_SECONDS ),
    ) );
}, 0 );
