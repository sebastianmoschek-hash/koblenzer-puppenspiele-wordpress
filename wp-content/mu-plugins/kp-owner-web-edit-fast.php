<?php
/**
 * Fast visible-edit planner for the primary owner web app.
 *
 * The existing frontend editor remains authoritative for applying drafts,
 * Undo and Save. This endpoint only replaces the legacy slow Gemini planning
 * request with the proven fast interactions-v1 transport.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_owner_web_edit_fast_schema() {
    return array(
        'type' => 'object',
        'properties' => array(
            'reply' => array( 'type' => 'string' ),
            'actions' => array(
                'type' => 'array',
                'maxItems' => 8,
                'items' => array(
                    'type' => 'object',
                    'properties' => array(
                        'type' => array(
                            'type' => 'string',
                            'enum' => array( 'set_text','set_link_label','set_link_url','set_style','set_design','set_image_style','move','edit_image','add_element' ),
                        ),
                        'key' => array( 'type' => 'string' ),
                        'value' => array( 'type' => 'string' ),
                        'text' => array( 'type' => 'string' ),
                        'url' => array( 'type' => 'string' ),
                        'prompt' => array( 'type' => 'string' ),
                    ),
                    'required' => array( 'type' ),
                ),
            ),
        ),
        'required' => array( 'reply', 'actions' ),
    );
}

add_action( 'wp_ajax_kp_owner_web_edit_plan', static function () {
    if ( ! function_exists( 'kp_ai_repair_guard' ) || ! function_exists( 'kp_ai_key' ) ) {
        wp_send_json_error( array( 'message' => 'Der schnelle Bearbeitungsdienst ist noch nicht vollständig geladen.' ), 503 );
    }
    kp_ai_repair_guard();

    $key = kp_ai_key();
    if ( ! $key ) {
        wp_send_json_error( array( 'message' => 'Gemini ist noch nicht verbunden.' ), 409 );
    }

    $request = isset( $_POST['request'] ) ? trim( sanitize_textarea_field( wp_unslash( $_POST['request'] ) ) ) : '';
    $context = isset( $_POST['context'] ) ? sanitize_textarea_field( wp_unslash( $_POST['context'] ) ) : '';
    if ( strlen( $request ) < 2 ) {
        wp_send_json_error( array( 'message' => 'Bitte beschreibe die gewünschte Änderung.' ), 400 );
    }

    if ( function_exists( 'mb_substr' ) ) {
        $request = mb_substr( $request, 0, 2200 );
        $context = mb_substr( $context, 0, 11000 );
    } else {
        $request = substr( $request, 0, 2200 );
        $context = substr( $context, 0, 11000 );
    }

    $system = 'Du bist die direkte Design-KI der Koblenzer-Puppenspiele-Web-App. Liefere ausschließlich einen kleinen ausführbaren JSON-Plan für den vorhandenen Frontend-Editor. Wenn ein Element ausgewählt ist, beziehen sich relative Wünsche wie „größer“, „kleiner“, „dieser Text“ oder „weiter links“ auf dieses Element. Wenn kein Element ausgewählt ist, bestimme aus dem Editor-Kontext das eindeutig passende sichtbare Element; bei Mehrdeutigkeit lieber actions=[] und kurz nachfragen. Erlaubte Aktionen: set_text; set_link_label; set_link_url; set_style mit key font|padding|width|radius|color|background; set_design mit vorhandenem designKeys-Key; set_image_style mit key brightness|contrast|saturation|opacity|grayscale|sepia|blur|rotation|pos_x|pos_y|radius|fit; move mit key x|y; edit_image; add_element mit key text|heading|button. Keine PHP-, JavaScript-, Plugin-, Auth-, Sicherheits- oder Deployment-Aktion. Ändere nur den sichtbaren Entwurf; Speichern entscheidet der Nutzer separat.';
    $input = "WUNSCH:\n{$request}\n\nEDITOR-KONTEXT:\n{$context}";
    $payload = array(
        'model'              => 'gemini-3.5-flash-lite',
        'input'              => $input,
        'system_instruction' => $system,
        'store'              => false,
        'generation_config'  => array( 'thinking_level' => 'low' ),
        'response_format'    => array(
            'type'      => 'text',
            'mime_type' => 'application/json',
            'schema'    => kp_owner_web_edit_fast_schema(),
        ),
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
        if ( is_wp_error( $response ) ) { throw new RuntimeException( $response->get_error_message() ); }

        $code = (int) wp_remote_retrieve_response_code( $response );
        $body = json_decode( (string) wp_remote_retrieve_body( $response ), true );
        if ( $code < 200 || $code >= 300 ) {
            $message = is_array( $body ) ? ( $body['error']['message'] ?? 'Gemini hat die Bearbeitung abgelehnt.' ) : 'Gemini hat die Bearbeitung abgelehnt.';
            throw new RuntimeException( sanitize_text_field( (string) $message ) );
        }

        $text = function_exists( 'kp_owner_web_agent_interaction_text' )
            ? kp_owner_web_agent_interaction_text( $body )
            : ( function_exists( 'kp_ai_interactions_output_text' ) ? kp_ai_interactions_output_text( $body ) : '' );
        $plan = json_decode( trim( (string) $text ), true );
        if ( ! is_array( $plan ) || ! isset( $plan['actions'] ) || ! is_array( $plan['actions'] ) ) {
            throw new RuntimeException( 'Gemini hat keinen gültigen Änderungsplan geliefert.' );
        }

        wp_send_json_success( array(
            'plan'       => $plan,
            'elapsed_ms' => (int) round( ( microtime( true ) - $started ) * 1000 ),
            'transport'  => 'interactions-v1-fast-edit',
        ) );
    } catch ( Throwable $e ) {
        $message = $e->getMessage();
        if ( false !== stripos( $message, 'cURL error 28' ) || false !== stripos( $message, 'timed out' ) ) {
            $message = 'Der schnelle Bearbeitungsplan hat das Gemini-Zeitlimit erreicht. Der sichtbare Entwurf wurde nicht verändert.';
        }
        wp_send_json_error( array( 'message' => $message ), 504 );
    }
} );

/**
 * Browser-side compatibility shim.
 * The legacy direct-editor runtime already knows how to apply plans into its
 * draft/Undo/Save model. Redirect only its planning request to the fast endpoint.
 */
add_action( 'wp_footer', static function () {
    if ( is_admin() || ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <script id="kp-owner-web-fast-edit-route">
    (() => {
      'use strict';
      if (window.__kpOwnerFastEditRouteInstalled) return;
      window.__kpOwnerFastEditRouteInstalled = true;
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        try {
          const cfg = window.KPOwnerWebAgent;
          const body = init && init.body;
          if (cfg?.repairNonce && body instanceof FormData && body.get('action') === 'kp_ai_plan') {
            const routed = new FormData();
            for (const [key, value] of body.entries()) routed.append(key, value);
            routed.set('action', 'kp_owner_web_edit_plan');
            routed.set('nonce', cfg.repairNonce);
            return nativeFetch(input, { ...init, body: routed, cache: 'no-store' });
          }
        } catch (_) {}
        return nativeFetch(input, init);
      };
    })();
    </script>
    <?php
}, 999 );
