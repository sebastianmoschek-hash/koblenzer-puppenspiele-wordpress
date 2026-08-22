<?php
/**
 * Current Gemini 3.7 planning endpoint for the direct editor.
 * Runs before the legacy-compatible fallback registered in kp-ai-direct-editor.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_ai_interactions_output_text( $body ) {
    if ( ! is_array( $body ) ) { return ''; }
    foreach ( (array) ( $body['steps'] ?? array() ) as $step ) {
        if ( ! is_array( $step ) || 'model_output' !== ( $step['type'] ?? '' ) ) { continue; }
        foreach ( (array) ( $step['content'] ?? array() ) as $block ) {
            if ( is_array( $block ) && 'text' === ( $block['type'] ?? '' ) && isset( $block['text'] ) ) { return (string) $block['text']; }
        }
    }
    return '';
}

add_action( 'wp_ajax_kp_ai_plan', static function () {
    if ( ! function_exists( 'kp_ai_guard' ) || ! function_exists( 'kp_ai_key' ) ) { return; }
    kp_ai_guard();
    $key = kp_ai_key();
    if ( ! $key ) { wp_send_json_error( array( 'message' => 'Gemini ist noch nicht verbunden.', 'needs_key' => true ), 409 ); }
    $request = isset( $_POST['request'] ) ? sanitize_textarea_field( wp_unslash( $_POST['request'] ) ) : '';
    if ( ! $request ) { wp_send_json_error( array( 'message' => 'Bitte sag, was geändert werden soll.' ), 400 ); }
    $context_raw = isset( $_POST['context'] ) ? json_decode( wp_unslash( $_POST['context'] ), true ) : array();
    $context = is_array( $context_raw ) ? $context_raw : array();
    $context_json = wp_json_encode( $context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
    if ( strlen( $context_json ) > 45000 ) { $context_json = substr( $context_json, 0, 45000 ); }

    $system = 'Du bist die direkte Design-KI für die Website Koblenzer Puppenspiele. Gib ausschließlich den JSON-Plan im Schema zurück. Beziehe Wörter wie „dieser“, „diesen“, „größer“, „weiter links“ auf das ausgewählte Element. Ändere nur, was der Nutzer verlangt. Erlaubte Aktionen: set_text; set_link_label; set_link_url; set_style mit key font|padding|width|radius|color|background; set_design mit einem vorhandenen designKeys-Key; set_image_style mit key brightness|contrast|saturation|opacity|grayscale|sepia|blur|rotation|pos_x|pos_y|radius|fit; move mit key x|y und Pixelwert als value; edit_image für generative Bildbearbeitung, Objekt entfernen, Hintergrund ändern oder Freistellen; add_element mit key text|heading|button, text und optional url. Keine freie PHP-, JavaScript-, Plugin- oder Servercode-Aktion. Wenn für eine echte neue Softwarefunktion Code nötig wäre, antworte im reply, dass diese als geprüfte Entwicklungsänderung gebaut werden muss, und erzeuge dafür keine gefährliche Live-Code-Aktion.';
    $schema = array(
        'type' => 'object',
        'properties' => array(
            'reply' => array( 'type' => 'string' ),
            'actions' => array(
                'type' => 'array',
                'items' => array(
                    'type' => 'object',
                    'properties' => array(
                        'type' => array( 'type' => 'string', 'enum' => array( 'set_text','set_link_label','set_link_url','set_style','set_design','set_image_style','move','edit_image','add_element' ) ),
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
    $payload = array(
        'model' => 'gemini-3.7-flash',
        'input' => "Wunsch:\n" . $request . "\n\nEditor-Kontext:\n" . $context_json,
        'system_instruction' => $system,
        'store' => false,
        'generation_config' => array( 'thinking_level' => 'low' ),
        'response_format' => array( 'type' => 'text', 'mime_type' => 'application/json', 'schema' => $schema ),
    );
    try {
        $response = wp_remote_post( 'https://generativelanguage.googleapis.com/v1beta/interactions', array(
            'timeout' => 45,
            'headers' => array( 'Content-Type' => 'application/json', 'x-goog-api-key' => $key, 'Api-Revision' => '2026-05-20' ),
            'body' => wp_json_encode( $payload ),
        ) );
        $body = kp_ai_json_body( $response );
        $text = kp_ai_interactions_output_text( $body );
        $plan = json_decode( $text, true );
        if ( ! is_array( $plan ) || ! isset( $plan['actions'] ) || ! is_array( $plan['actions'] ) ) { throw new RuntimeException( 'Gemini hat keinen ausführbaren Änderungsplan geliefert.' ); }
        wp_send_json_success( array( 'plan' => $plan ) );
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
    }
}, 1 );
