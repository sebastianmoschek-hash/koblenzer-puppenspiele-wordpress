<?php
/**
 * Plugin Name: KP OpenRouter Bridge
 * Description: Zentrale OpenRouter-Anbindung für die Homepage-Hilfe. Betrieb der KI-Funktionen über OpenRouter (auch kostenlose :free-Modelle) ohne Gemini-Prepayment nötig. Gemini-Key bleibt als Fallback erhalten.
 * Version: 1.0.0
 * Author: Hermes Agent
 * Network: true
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

/*
 * This legacy integration is kept only for an explicit, server-side manual
 * opt-in. It is disabled in every normal development, staging and runtime
 * path, so no endpoint or outbound request is registered by default.
 */
if ( ! defined( 'KP_OPENROUTER_MANUAL_ENABLED' ) || true !== KP_OPENROUTER_MANUAL_ENABLED ) {
	return;
}

/**
 * Zentrale Konfiguration.
 * Optionale Konstanten in wp-config.php:
 *   KP_OPENROUTER_API_KEY   - API-Key (alternativ OPENROUTER_API_KEY env)
 *   KP_OPENROUTER_MODEL     - Modell, Standard: google/gemma-4-31b-it:free
 *   KP_OPENROUTER_ENABLED   - '0'/'false' schaltet Bridge komplett aus
 */
function kp_openrouter_config() {
	$key = '';
	if ( defined( 'KP_OPENROUTER_API_KEY' ) && KP_OPENROUTER_API_KEY ) { $key = trim( (string) KP_OPENROUTER_API_KEY ); }
	if ( '' === $key ) {
		$env = getenv( 'OPENROUTER_API_KEY' );
		if ( is_string( $env ) && $env ) { $key = trim( $env ); }
	}
	if ( '' === $key ) {
		$key = trim( (string) get_option( 'kp_openrouter_api_key', '' ) );
	}

	$enabled = true;
	if ( defined( 'KP_OPENROUTER_ENABLED' ) && in_array( strtolower( (string) KP_OPENROUTER_ENABLED ), array( '0', 'false', 'no', 'off' ), true ) ) {
		$enabled = false;
	}
	if ( '0' === (string) get_option( 'kp_openrouter_enabled', '1' ) ) { $enabled = false; }

	$model = defined( 'KP_OPENROUTER_MODEL' ) ? trim( (string) KP_OPENROUTER_MODEL ) : '';
	if ( '' === $model ) { $model = (string) get_option( 'kp_openrouter_model', '' ); }
	if ( '' === $model ) { $model = 'google/gemma-4-31b-it:free'; }

	return array(
		'enabled' => $enabled,
		'key'     => $key,
		'model'   => $model,
	);
}

function kp_openrouter_ready() {
	$config = kp_openrouter_config();
	return $config['enabled'] && '' !== $config['key'];
}

/**
 * Zentrale OpenRouter-Anfrage.
 * @param string $system  System-Prompt.
 * @param string $input   Nutzereingabe.
 * @param int    $timeout Timeout.
 * @param array  $options Optional: model, temperature, max_tokens.
 * @return string Antworttext.
 * @throws RuntimeException bei Fehlern.
 */
function kp_openrouter_ask( $system, $input, $timeout = 45, $options = array() ) {
	if ( ! kp_openrouter_ready() ) {
		throw new RuntimeException( 'OpenRouter ist nicht verbunden.' );
	}
	$config = kp_openrouter_config();
	$model  = isset( $options['model'] ) && is_string( $options['model'] ) && '' !== trim( $options['model'] )
		? trim( $options['model'] )
		: $config['model'];

	$messages = array();
	if ( is_string( $system ) && '' !== trim( $system ) ) {
		$messages[] = array( 'role' => 'system', 'content' => $system );
	}
	$messages[] = array( 'role' => 'user', 'content' => (string) $input );

	$payload = array(
		'model'       => $model,
		'messages'    => $messages,
		'stream'      => false,
		'temperature' => isset( $options['temperature'] ) ? (float) $options['temperature'] : 0.3,
	);
	if ( isset( $options['max_tokens'] ) && (int) $options['max_tokens'] > 0 ) {
		$payload['max_tokens'] = (int) $options['max_tokens'];
	}

	$response = wp_remote_post( 'https://openrouter.ai/api/v1/chat/completions', array(
		'timeout'     => max( 8, min( 90, (int) $timeout ) ),
		'httpversion' => '1.1',
		'headers'     => array(
			'Content-Type'  => 'application/json',
			'Authorization' => 'Bearer ' . $config['key'],
		),
		'body'        => wp_json_encode( $payload ),
	) );

	if ( is_wp_error( $response ) ) {
		throw new RuntimeException( 'OpenRouter-Fehler: ' . $response->get_error_message() );
	}
	$code = (int) wp_remote_retrieve_response_code( $response );
	$body = json_decode( (string) wp_remote_retrieve_body( $response ), true );

	if ( $code < 200 || $code >= 300 ) {
		$message = is_array( $body ) && isset( $body['error']['message'] )
			? (string) $body['error']['message']
			: ( is_array( $body ) && isset( $body['message'] ) ? (string) $body['message'] : 'OpenRouter hat die Anfrage abgelehnt.' );
		throw new RuntimeException( sanitize_text_field( $message ) );
	}

	$reply = '';
	if ( is_array( $body ) && isset( $body['choices'][0]['message']['content'] ) ) {
		$reply = trim( (string) $body['choices'][0]['message']['content'] );
	}
	if ( '' === $reply ) {
		throw new RuntimeException( 'OpenRouter hat keine Textantwort geliefert.' );
	}
	return $reply;
}

/**
 * Strukturierte JSON-Antwort von OpenRouter. Prompt-basiert, validiert mit json_decode.
 * @return array Assoziatives Array.
 */
function kp_openrouter_ask_json( $system, $input, $timeout = 45, $options = array() ) {
	$options['temperature'] = isset( $options['temperature'] ) ? (float) $options['temperature'] : 0.1;
	$raw = kp_openrouter_ask(
		$system . "\n\nAntworte AUSSCHLIESSLICH mit gültigem JSON. Keine Erklärungen, kein Markdown, kein Text außerhalb des JSON.",
		$input,
		$timeout,
		$options
	);
	$json = json_decode( $raw, true );
	if ( ! is_array( $json ) ) {
		$json = json_decode( trim( preg_replace( '/^.*?(\{.*\}).*$/s', '$1', $raw ) ), true );
	}
	if ( ! is_array( $json ) ) {
		throw new RuntimeException( 'OpenRouter hat kein gültiges JSON geliefert.' );
	}
	return $json;
}

/** Text aus einem Gemini-interactions-Body extrahieren (Fallback-Helfer). */
function kp_openrouter_gemini_text( $body ) {
	if ( is_string( $body ) ) { $body = json_decode( $body, true ); }
	if ( ! is_array( $body ) ) { return ''; }
	$text = '';
	if ( isset( $body['output'][0]['content'][0]['text'] ) ) {
		$text = (string) $body['output'][0]['content'][0]['text'];
	} elseif ( isset( $body['candidates'][0]['content']['parts'][0]['text'] ) ) {
		$text = (string) $body['candidates'][0]['content']['parts'][0]['text'];
	}
	return trim( $text );
}

/* ---- AJAX: Konfiguration im geschützten Betreuer-Chat ---- */

add_action( 'wp_ajax_kp_openrouter_config_save', static function () {
	if ( ! is_user_logged_in() || ! current_user_can( 'manage_options' ) ) {
		wp_send_json_error( array( 'message' => 'Nur Administratoren können OpenRouter verbinden.' ), 403 );
	}
	$key   = isset( $_POST['api_key'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['api_key'] ) ) ) : '';
	$model = isset( $_POST['model'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['model'] ) ) ) : '';
	if ( '' !== $key ) {
		update_option( 'kp_openrouter_api_key', $key );
	}
	if ( '' !== $model ) {
		update_option( 'kp_openrouter_model', $model );
	}
	update_option( 'kp_openrouter_enabled', isset( $_POST['enabled'] ) && '1' === sanitize_text_field( wp_unslash( $_POST['enabled'] ) ) ? '1' : '0' );
	wp_send_json_success( array( 'connected' => (bool) kp_openrouter_ready(), 'model' => kp_openrouter_config()['model'] ) );
} );

add_action( 'wp_ajax_kp_openrouter_config_status', static function () {
	if ( ! is_user_logged_in() || ! current_user_can( 'manage_options' ) ) {
		wp_send_json_error( array( 'message' => 'Nicht autorisiert.' ), 403 );
	}
	$config = kp_openrouter_config();
	wp_send_json_success( array(
		'connected' => $config['enabled'] && '' !== $config['key'],
		'enabled'   => $config['enabled'],
		'hasKey'    => '' !== $config['key'],
		'model'     => $config['model'],
	) );
} );

add_action( 'wp_ajax_kp_openrouter_test', static function () {
	if ( ! is_user_logged_in() || ! current_user_can( 'manage_options' ) ) {
		wp_send_json_error( array( 'message' => 'Nicht autorisiert.' ), 403 );
	}
	try {
		$reply = kp_openrouter_ask( 'Du bist ein freundlicher Assistent. Antworte ganz kurz auf Deutsch.', 'Kurzer Verbindungstest. Antworte nur: OK', 25 );
		wp_send_json_success( array( 'reply' => $reply ) );
	} catch ( Throwable $e ) {
		wp_send_json_error( array( 'message' => $e->getMessage() ), 502 );
	}
} );
