<?php
/**
 * Central AI proxy for the homepage editor.
 *
 * The frontend only talks to WordPress. This class dispatches the request based
 * on KP_AI_MODE:
 * - cloud: protected server-side chat-completions proxy
 * - local_ollama: loopback Ollama chat-completions proxy
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

if ( ! class_exists( 'KP_AI_Proxy' ) ) {
	final class KP_AI_Proxy {
		const MODE_OPTION        = 'kp_ai_mode_v1';
		const CLOUD_URL_OPTION   = 'kp_ai_cloud_url_v1';
		const CLOUD_KEY_OPTION   = 'kp_ai_cloud_key_v1';
		const CLOUD_MODEL_OPTION = 'kp_ai_cloud_model_v1';
		const LOCAL_MODEL_OPTION = 'kp_ai_local_model_v1';

		public static function init() {
			add_action( 'wp_ajax_kp_ai_proxy', array( __CLASS__, 'ajax_proxy' ) );
		}

		public static function mode() {
			$mode = defined( 'KP_AI_MODE' ) ? (string) KP_AI_MODE : (string) get_option( self::MODE_OPTION, 'cloud' );
			$mode = strtolower( trim( $mode ) );
			return in_array( $mode, array( 'cloud', 'local_ollama' ), true ) ? $mode : 'cloud';
		}

		private static function guard() {
			if ( function_exists( 'kp_ai_guard' ) ) {
				kp_ai_guard();
				return;
			}
			if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) {
				wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 );
			}
			check_ajax_referer( defined( 'KP_AI_NONCE' ) ? KP_AI_NONCE : 'kp_ai_direct_editor', 'nonce' );
		}

		private static function normalize_error( $message, $mode ) {
			$message = trim( wp_strip_all_tags( (string) $message ) );
			if ( 'local_ollama' === $mode ) {
				if ( '' === $message || preg_match( '/timed? out|timeout|connection refused|could not connect|cURL error 7|failed to connect|errno 111/i', $message ) ) {
					return 'Lokales Ollama ist nicht erreichbar oder reagiert zu langsam. Bitte Ollama starten oder KP_AI_MODE auf cloud stellen.';
				}
				return 'Lokales Ollama-Problem: ' . $message;
			}
			return $message ?: 'Die KI-Anfrage ist fehlgeschlagen.';
		}

		private static function cloud_config() {
			$url   = defined( 'KP_AI_CLOUD_CHAT_URL' ) ? trim( (string) KP_AI_CLOUD_CHAT_URL ) : '';
			$key   = defined( 'KP_AI_CLOUD_API_KEY' ) ? trim( (string) KP_AI_CLOUD_API_KEY ) : '';
			$model = defined( 'KP_AI_CLOUD_MODEL' ) ? trim( (string) KP_AI_CLOUD_MODEL ) : '';

			if ( '' === $url ) {
				$url = trim( (string) get_option( self::CLOUD_URL_OPTION, '' ) );
			}
			if ( '' === $key ) {
				$key = trim( (string) get_option( self::CLOUD_KEY_OPTION, '' ) );
			}
			if ( '' === $model ) {
				$model = trim( (string) get_option( self::CLOUD_MODEL_OPTION, '' ) );
			}

			if ( function_exists( 'kp_openrouter_config' ) ) {
				$config = kp_openrouter_config();
				if ( is_array( $config ) && ! empty( $config['key'] ) && '' === $key ) {
					$key = (string) $config['key'];
				}
				if ( is_array( $config ) && ! empty( $config['model'] ) && '' === $model ) {
					$model = (string) $config['model'];
				}
				if ( '' === $url && '' !== $key ) {
					$url = 'https://openrouter.ai/api/v1/chat/completions';
				}
			}

			if ( '' === $url ) {
				$url = 'https://api.openai.com/v1/chat/completions';
			}
			if ( '' === $model ) {
				$model = 'gpt-4o-mini';
			}

			return array(
				'url'   => $url,
				'key'   => $key,
				'model' => $model,
			);
		}

		private static function local_config() {
			$model = defined( 'KP_AI_LOCAL_MODEL' ) ? trim( (string) KP_AI_LOCAL_MODEL ) : trim( (string) get_option( self::LOCAL_MODEL_OPTION, '' ) );
			if ( '' === $model ) {
				$model = 'gemma3:4b';
			}
			return array(
				'url'   => 'http://127.0.0.1:11434/v1/chat/completions',
				'key'   => '',
				'model' => $model,
			);
		}

		private static function config() {
			return 'local_ollama' === self::mode() ? self::local_config() : self::cloud_config();
		}

		private static function safe_decode( $raw, $mode ) {
			$body = json_decode( (string) $raw, true );
			if ( JSON_ERROR_NONE !== json_last_error() || ! is_array( $body ) ) {
				throw new RuntimeException( self::normalize_error( 'Die KI-Antwort war kein gültiges JSON.', $mode ) );
			}
			return $body;
		}

		private static function remote_chat( array $messages, array $options = array() ) {
			$mode = self::mode();
			$config = self::config();
			if ( 'cloud' === $mode && '' === $config['key'] ) {
				throw new RuntimeException( 'Cloud-KI ist nicht konfiguriert. Bitte KP_AI_MODE auf local_ollama stellen oder einen Cloud-API-Key hinterlegen.' );
			}
			if ( '' === trim( (string) $config['url'] ) ) {
				throw new RuntimeException( self::normalize_error( 'Es fehlt eine Ziel-URL für die KI-Anfrage.', $mode ) );
			}
			$timeout = isset( $options['timeout'] ) ? max( 8, min( 90, (int) $options['timeout'] ) ) : ( 'local_ollama' === $mode ? 30 : 45 );
			$payload = array(
				'model'       => isset( $options['model'] ) && is_string( $options['model'] ) && '' !== trim( $options['model'] ) ? trim( $options['model'] ) : $config['model'],
				'messages'    => array_values( $messages ),
				'stream'      => false,
				'temperature' => isset( $options['temperature'] ) ? (float) $options['temperature'] : 0.2,
			);
			if ( ! empty( $options['max_tokens'] ) ) {
				$payload['max_tokens'] = (int) $options['max_tokens'];
			}
			if ( ! empty( $options['response_format'] ) && is_array( $options['response_format'] ) ) {
				$payload['response_format'] = $options['response_format'];
			}

			$headers = array( 'Content-Type' => 'application/json' );
			if ( 'cloud' === $mode && '' !== $config['key'] ) {
				$headers['Authorization'] = 'Bearer ' . $config['key'];
			}

			$response = wp_remote_post( $config['url'], array(
				'timeout'     => $timeout,
				'httpversion' => '1.1',
				'headers'     => $headers,
				'body'        => wp_json_encode( $payload ),
			) );

			if ( is_wp_error( $response ) ) {
				throw new RuntimeException( self::normalize_error( $response->get_error_message(), $mode ) );
			}

			$code = (int) wp_remote_retrieve_response_code( $response );
			$body = self::safe_decode( wp_remote_retrieve_body( $response ), $mode );
			if ( $code < 200 || $code >= 300 ) {
				$message = '';
				if ( is_array( $body ) ) {
					if ( isset( $body['error']['message'] ) ) {
						$message = (string) $body['error']['message'];
					} elseif ( isset( $body['message'] ) ) {
						$message = (string) $body['message'];
					}
				}
				throw new RuntimeException( self::normalize_error( $message ?: sprintf( 'HTTP %d', $code ), $mode ) );
			}
			if ( ! is_array( $body ) ) {
				throw new RuntimeException( self::normalize_error( 'Die KI hat keine gültige JSON-Antwort geliefert.', $mode ) );
			}
			return $body;
		}

		public static function chat_json( array $messages, array $options = array() ) {
			$body = self::remote_chat( $messages, $options );
			$text = '';
			if ( isset( $body['choices'][0]['message']['content'] ) ) {
				$text = trim( (string) $body['choices'][0]['message']['content'] );
			} elseif ( isset( $body['choices'][0]['text'] ) ) {
				$text = trim( (string) $body['choices'][0]['text'] );
			}
			if ( '' === $text ) {
				throw new RuntimeException( self::normalize_error( 'Die KI hat keinen Text zurückgegeben.', self::mode() ) );
			}
			$json = json_decode( $text, true );
			if ( ! is_array( $json ) ) {
				$trimmed = trim( preg_replace( '/^```(?:json)?\s*|\s*```$/i', '', $text ) );
				if ( '' !== $trimmed ) {
					$json = json_decode( $trimmed, true );
				}
			}
			if ( ! is_array( $json ) && preg_match( '/(\{.*\})/s', $text, $match ) ) {
				$json = json_decode( $match[1], true );
			}
			if ( ! is_array( $json ) ) {
				throw new RuntimeException( self::normalize_error( 'Die KI hat kein gültiges JSON geliefert.', self::mode() ) );
			}
			return $json;
		}

		private static function plan_system() {
			return 'Du bist die direkte Design-KI für die Website Koblenzer Puppenspiele. Antworte ausschließlich mit dem vorgegebenen JSON-Plan. Verwende nur Aktionen, die wirklich nötig sind. Wenn ein Element ausgewählt ist, beziehe relative Wünsche wie „größer“, „weiter links“, „diesen Text“ darauf. Erlaubte Aktionen: set_text; set_link_label; set_link_url; set_style mit key font|padding|width|radius|color|background; set_design mit einem vorhandenen designKeys-Key; set_image_style mit key brightness|contrast|saturation|opacity|grayscale|sepia|blur|rotation|pos_x|pos_y|radius|fit; move mit key x|y und numerischem Pixelwert als value; edit_image für generative Bildbearbeitung/Freistellen; add_element mit key text|heading|button, text und optional url. Für Freistellen/Hintergrund entfernen immer edit_image wählen. Keine PHP-, JavaScript- oder Plugin-Code-Aktion erzeugen.';
		}

		private static function plan_schema() {
			return array(
				'type'       => 'object',
				'properties' => array(
					'reply'   => array( 'type' => 'string' ),
					'actions' => array(
						'type'  => 'array',
						'items' => array(
							'type'       => 'object',
							'properties' => array(
								'type'    => array( 'type' => 'string', 'enum' => array( 'set_text', 'set_link_label', 'set_link_url', 'set_style', 'set_design', 'set_image_style', 'move', 'edit_image', 'add_element' ) ),
								'key'     => array( 'type' => 'string' ),
								'value'   => array( 'type' => 'string' ),
								'text'    => array( 'type' => 'string' ),
								'url'     => array( 'type' => 'string' ),
								'prompt'  => array( 'type' => 'string' ),
							),
							'required'   => array( 'type' ),
						),
					),
				),
				'required'   => array( 'reply', 'actions' ),
			);
		}

		public static function plan_request( $request, $context ) {
			$request = sanitize_textarea_field( (string) $request );
			if ( '' === $request ) {
				throw new RuntimeException( 'Bitte sag, was geändert werden soll.' );
			}
			$context = is_array( $context ) ? $context : array();
			$context_json = wp_json_encode( $context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
			if ( strlen( $context_json ) > 45000 ) {
				$context_json = substr( $context_json, 0, 45000 );
			}
			$messages = array(
				array( 'role' => 'system', 'content' => self::plan_system() ),
				array( 'role' => 'user', 'content' => "Wunsch:\n" . $request . "\n\nEditor-Kontext:\n" . $context_json ),
			);
			$plan = self::chat_json( $messages, array(
				'temperature' => 0.15,
				'timeout'     => 45,
			) );
			if ( ! is_array( $plan ) || empty( $plan['actions'] ) || ! is_array( $plan['actions'] ) ) {
				throw new RuntimeException( self::normalize_error( 'Die KI hat keinen ausführbaren Änderungsplan geliefert.', self::mode() ) );
			}
			return $plan;
		}

		public static function ajax_proxy() {
			self::guard();
			$task = sanitize_key( (string) ( $_POST['task'] ?? 'plan' ) );
			try {
				if ( 'plan' === $task || '' === $task ) {
					$request = isset( $_POST['request'] ) ? sanitize_textarea_field( wp_unslash( $_POST['request'] ) ) : '';
					$context_raw = isset( $_POST['context'] ) ? json_decode( wp_unslash( $_POST['context'] ), true ) : array();
					$plan = self::plan_request( $request, is_array( $context_raw ) ? $context_raw : array() );
					wp_send_json_success( array( 'plan' => $plan ) );
				}
				wp_send_json_error( array( 'message' => 'Unbekannte KI-Anfrage.' ), 400 );
			} catch ( Throwable $e ) {
				wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
			}
		}
	}
}
