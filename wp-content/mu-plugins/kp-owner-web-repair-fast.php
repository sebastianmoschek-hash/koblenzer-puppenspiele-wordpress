<?php
/**
 * Fast protected repair path for the owner web app.
 *
 * The legacy emergency endpoint remains available as a fallback, but explicit
 * programming/repair requests are intercepted first and use the same fast,
 * IPv4-hardened Gemini transport as the browser chat. The result is still only
 * a proposal: GitHub branch, CI and merge confirmation remain separate gates.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_web_repair_fast_is_code_task( $request ) {
    return 1 === preg_match(
        '/\b(code|kotlin|php|javascript|typescript|css|gradle|android|app|apk|plugin|wordpress[- ]?plugin|fehler|bug|crash|absturz|compile|build|circleci|github|reparier|programmier|funktion bauen|endpoint|api|quellcode|code-fix|codefix)\b/iu',
        (string) $request
    );
}

function kp_web_repair_fast_interaction_text( $body ) {
    if ( function_exists( 'kp_owner_web_agent_interaction_text' ) ) {
        return trim( (string) kp_owner_web_agent_interaction_text( $body ) );
    }
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

function kp_web_repair_fast_json( $system, $input, $schema, $timeout = 24 ) {
    if ( ! function_exists( 'kp_ai_key' ) ) {
        throw new RuntimeException( 'Die Gemini-Basisintegration ist nicht geladen.' );
    }
    $key = kp_ai_key();
    if ( ! $key ) { throw new RuntimeException( 'Gemini ist noch nicht verbunden.' ); }

    $payload = array(
        'model'              => 'gemini-3.5-flash-lite',
        'input'              => (string) $input,
        'system_instruction' => (string) $system,
        'store'              => false,
        'generation_config'  => array( 'thinking_level' => 'low' ),
        'response_format'    => array(
            'type'      => 'text',
            'mime_type' => 'application/json',
            'schema'    => $schema,
        ),
    );

    $response = wp_remote_post( 'https://generativelanguage.googleapis.com/v1/interactions', array(
        'timeout'     => max( 8, min( 35, (int) $timeout ) ),
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
        $message = is_array( $body ) ? ( $body['error']['message'] ?? 'Gemini hat die Reparaturanfrage abgelehnt.' ) : 'Gemini hat die Reparaturanfrage abgelehnt.';
        throw new RuntimeException( sanitize_text_field( (string) $message ) );
    }

    $text = kp_web_repair_fast_interaction_text( $body );
    if ( '' === $text ) { throw new RuntimeException( 'Gemini hat keinen Reparaturplan geliefert.' ); }
    $json = json_decode( $text, true );
    if ( ! is_array( $json ) ) { throw new RuntimeException( 'Gemini hat keinen gültigen JSON-Reparaturplan geliefert.' ); }
    return $json;
}

/** Keep the catalog compact so selection stays a fast model call. */
function kp_web_repair_fast_catalog( $request ) {
    if ( ! function_exists( 'kp_local_ai_catalog' ) ) { return ''; }
    $catalog = trim( (string) kp_local_ai_catalog() );
    if ( '' === $catalog ) { return ''; }

    $request_lower = strtolower( remove_accents( (string) $request ) );
    $tokens = preg_split( '/[^a-z0-9_-]+/', $request_lower, -1, PREG_SPLIT_NO_EMPTY );
    $tokens = array_values( array_unique( array_filter( (array) $tokens, static fn( $v ) => strlen( $v ) >= 4 ) ) );
    $lines = preg_split( '/\r?\n/', $catalog );
    $ranked = array();

    foreach ( (array) $lines as $index => $line ) {
        $line = trim( (string) $line );
        if ( '' === $line ) { continue; }
        $path = strtolower( strtok( $line, "\t" ) ?: $line );
        $score = 0;
        foreach ( $tokens as $token ) {
            if ( false !== strpos( $path, $token ) ) { $score += 8; }
        }
        foreach ( array( 'owner-web-agent', 'homepage', 'ai-', 'editor', 'mobile', 'android', 'mainactivity', 'localai', 'bridge' ) as $hint ) {
            if ( false !== strpos( $path, $hint ) ) { $score += 2; }
        }
        if ( false !== strpos( $request_lower, 'android' ) || false !== strpos( $request_lower, 'app' ) ) {
            if ( 0 === strpos( $path, 'android/homepage-technician/' ) ) { $score += 12; }
        }
        if ( false !== strpos( $request_lower, 'homepage' ) || false !== strpos( $request_lower, 'web' ) ) {
            if ( false !== strpos( $path, 'owner-web-agent' ) || false !== strpos( $path, 'owner-web-app' ) ) { $score += 14; }
        }
        $ranked[] = array( 'score' => $score, 'index' => (int) $index, 'line' => $line );
    }

    usort( $ranked, static function ( $a, $b ) {
        if ( $a['score'] === $b['score'] ) { return $a['index'] <=> $b['index']; }
        return $b['score'] <=> $a['score'];
    } );

    return implode( "\n", array_map( static fn( $item ) => $item['line'], array_slice( $ranked, 0, 120 ) ) );
}

function kp_web_repair_fast_allowed_path( $path ) {
    if ( ! function_exists( 'kp_mobile_emergency_allowed_path' ) || ! kp_mobile_emergency_allowed_path( $path ) ) { return false; }
    return ! in_array( ltrim( str_replace( '\\', '/', (string) $path ), '/' ), array(
        'wp-content/mu-plugins/kp-owner-web-repair-fast.php',
        'wp-content/mu-plugins/kp-owner-web-agent.php',
        'wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/owner-web-agent-fast-chat.js',
    ), true );
}

add_action( 'wp_ajax_kp_mobile_emergency_gemini', static function () {
    $request = isset( $_POST['request'] ) ? trim( sanitize_textarea_field( wp_unslash( $_POST['request'] ) ) ) : '';
    if ( ! kp_web_repair_fast_is_code_task( $request ) ) { return; }

    if ( ! function_exists( 'kp_mobile_emergency_guard' ) ) {
        wp_send_json_error( array( 'message' => 'Der geschützte Reparaturdienst ist noch nicht geladen.' ), 503 );
    }
    kp_mobile_emergency_guard();

    $browser = isset( $_POST['browser'] ) ? sanitize_textarea_field( wp_unslash( $_POST['browser'] ) ) : '';
    $history = isset( $_POST['history'] ) ? sanitize_textarea_field( wp_unslash( $_POST['history'] ) ) : '';
    if ( function_exists( 'mb_substr' ) ) {
        $request = mb_substr( $request, 0, 3500 );
        $browser = mb_substr( $browser, 0, 6500 );
        $history = mb_substr( $history, -3500 );
    } else {
        $request = substr( $request, 0, 3500 );
        $browser = substr( $browser, 0, 6500 );
        $history = substr( $history, -3500 );
    }

    try {
        $started = microtime( true );
        $catalog = kp_web_repair_fast_catalog( $request );
        if ( '' === $catalog ) { throw new RuntimeException( 'Der geschützte Codekatalog ist momentan nicht verfügbar.' ); }
        $debug = function_exists( 'kp_ai_repair_debug_tail' ) ? (string) kp_ai_repair_debug_tail() : '';
        $debug = function_exists( 'mb_substr' ) ? mb_substr( $debug, -5000 ) : substr( $debug, -5000 );

        $selection_system = 'Du bist der vorsichtige Code-Diagnostiker der Koblenzer-Puppenspiele-Web-App und Android Homepage-Hilfe. Der Nutzer hat bereits ausdrücklich einen Programmier-/Reparaturauftrag gegeben; eine weitere Chat-oder-Reparatur-Entscheidung ist nicht nötig. Wähle höchstens zwei vorhandene Dateien ausschließlich aus dem Katalog. Suche bei allgemeinen Prüfaufträgen nur nach einem kleinen, konkreten, risikoarmen Fehler oder einer klaren Inkonsistenz. Wenn kein belastbarer Fehler erkennbar ist, files=[] und erkläre das ehrlich. Niemals Secrets, Workflows, Signierung, Auth-, Nonce-, Capability- oder Sicherheitsgrenzen ändern.';
        $selection_input = "AUFGABE:\n{$request}\n\nLETZTE UNTERHALTUNG:\n{$history}\n\nSEITENKONTEXT:\n{$browser}\n\nDEBUG-TAIL:\n{$debug}\n\nKOMPAKTER ERLAUBTER DATEIKATALOG (Pfad\\tBytes):\n{$catalog}";
        $selection = kp_web_repair_fast_json( $selection_system, $selection_input, kp_ai_repair_selection_schema(), 22 );

        $contexts = array();
        $total_bytes = 0;
        foreach ( array_slice( (array) ( $selection['files'] ?? array() ), 0, 2 ) as $candidate ) {
            $path = ltrim( str_replace( '\\', '/', sanitize_text_field( (string) $candidate ) ), '/' );
            if ( ! kp_web_repair_fast_allowed_path( $path ) || isset( $contexts[ $path ] ) ) { continue; }
            $source = kp_local_ai_read_source( $path );
            $bytes = (int) ( $source['bytes'] ?? 0 );
            if ( $bytes <= 0 || $bytes > 55000 || $total_bytes + $bytes > 85000 ) { continue; }
            $contexts[ $path ] = array(
                'content' => (string) $source['content'],
                'hash'    => (string) $source['hash'],
            );
            $total_bytes += $bytes;
        }

        $selection_reply = sanitize_textarea_field( (string) ( $selection['reply'] ?? '' ) );
        $selection_diagnosis = sanitize_textarea_field( (string) ( $selection['diagnosis'] ?? '' ) );
        if ( ! $contexts ) {
            wp_send_json_success( array(
                'mode'       => 'chat',
                'reply'      => trim( $selection_reply . ( $selection_diagnosis ? "\n\n" . $selection_diagnosis : '' ) ),
                'cloud'      => true,
                'fast_repair'=> true,
                'elapsed_ms' => (int) round( ( microtime( true ) - $started ) * 1000 ),
            ) );
        }

        $code_context = '';
        foreach ( $contexts as $path => $record ) {
            $code_context .= "\n\n===== {$path} =====\n" . $record['content'];
        }

        $patch_system = 'Du bist Senior-Entwickler in einem geschützten Reparaturlabor. Prüfe den gelieferten Code wirklich und erzeuge nur dann einen minimalen Fix, wenn ein konkreter Fehler oder eine klar falsche Inkonsistenz belegt ist. Änderungen ausschließlich in den bereitgestellten Dateien. Für jede Änderung exakte search/replace-Operationen; search muss wortwörtlich genau einmal vorkommen. Keine Dateien löschen oder neu erfinden. Keine Credentials/Tokens/API-Keys oder eval/shell_exec/exec/system/passthru/proc_open/popen. Keine Auth-, Nonce-, Capability- oder Sicherheitsprüfung entfernen/abschwächen. Keine Live-Deployments oder Datenbankmigrationen. Wenn kein sicherer kleiner Fix möglich ist: changes=[].';
        $patch_input = "AUFGABE:\n{$request}\n\nERSTE DIAGNOSE:\n{$selection_diagnosis}\n\nSEITENKONTEXT:\n{$browser}\n\nDEBUG-TAIL:\n{$debug}\n\nCODE:{$code_context}";
        $plan = kp_web_repair_fast_json( $patch_system, $patch_input, kp_ai_repair_patch_schema(), 30 );

        $validated = array();
        foreach ( array_slice( (array) ( $plan['changes'] ?? array() ), 0, 2 ) as $change ) {
            if ( ! is_array( $change ) ) { continue; }
            $path = ltrim( str_replace( '\\', '/', sanitize_text_field( (string) ( $change['path'] ?? '' ) ) ), '/' );
            if ( ! isset( $contexts[ $path ] ) || ! kp_web_repair_fast_allowed_path( $path ) ) {
                throw new RuntimeException( 'Gemini wollte eine nicht analysierte oder geschützte Datei ändern. Der Fix wurde blockiert.' );
            }
            $operations = array();
            foreach ( array_slice( (array) ( $change['operations'] ?? array() ), 0, 6 ) as $operation ) {
                if ( ! is_array( $operation ) ) { continue; }
                $operations[] = array(
                    'search'  => (string) ( $operation['search'] ?? '' ),
                    'replace' => (string) ( $operation['replace'] ?? '' ),
                );
            }
            if ( ! $operations ) { continue; }
            $next = kp_ai_repair_apply_operations( $contexts[ $path ]['content'], $operations );
            if ( $next === $contexts[ $path ]['content'] ) { continue; }
            $validated[] = array(
                'path'       => $path,
                'reason'     => sanitize_text_field( (string) ( $change['reason'] ?? 'Schneller Web-Agent-Fix' ) ),
                'operations' => $operations,
                'base_hash'  => $contexts[ $path ]['hash'],
            );
        }

        $summary = sanitize_text_field( (string) ( $plan['summary'] ?? 'Technischer Reparaturvorschlag' ) );
        $diagnosis = sanitize_textarea_field( (string) ( $plan['diagnosis'] ?? $selection_diagnosis ) );
        if ( ! $validated ) {
            wp_send_json_success( array(
                'mode'        => 'chat',
                'reply'       => trim( $selection_reply . "\n\n" . ( $diagnosis ?: $summary ) ),
                'cloud'       => true,
                'fast_repair' => true,
                'elapsed_ms'  => (int) round( ( microtime( true ) - $started ) * 1000 ),
            ) );
        }

        $risk = (string) ( $plan['risk'] ?? 'medium' );
        if ( ! in_array( $risk, array( 'low', 'medium', 'high' ), true ) ) { $risk = 'medium'; }
        $proposal = array(
            'created'          => time(),
            'request'          => $request,
            'summary'          => $summary,
            'diagnosis'        => $diagnosis,
            'risk'             => $risk,
            'tests'            => array_values( array_map( 'sanitize_text_field', array_slice( (array) ( $plan['tests'] ?? array() ), 0, 6 ) ) ),
            'changes'          => $validated,
            'emergency_gemini' => true,
            'fast_web_repair'  => true,
        );
        $proposal_id = kp_ai_repair_store_proposal( $proposal );

        wp_send_json_success( array(
            'mode'        => 'repair',
            'reply'       => $selection_reply ?: 'Ich habe den Code geprüft und einen kleinen Reparaturvorschlag vorbereitet.',
            'safe'        => true,
            'cloud'       => true,
            'fast_repair' => true,
            'elapsed_ms'  => (int) round( ( microtime( true ) - $started ) * 1000 ),
            'proposal_id' => $proposal_id,
            'summary'     => $proposal['summary'],
            'diagnosis'   => $proposal['diagnosis'],
            'risk'        => $proposal['risk'],
            'tests'       => $proposal['tests'],
            'files'       => array_map( static fn( $item ) => array( 'path' => $item['path'], 'reason' => $item['reason'] ), $validated ),
        ) );
    } catch ( Throwable $e ) {
        $message = $e->getMessage();
        if ( false !== stripos( $message, 'cURL error 28' ) || false !== stripos( $message, 'timed out' ) ) {
            $message = 'Die schnelle Code-Analyse hat das Gemini-Zeitlimit erreicht. Es wurde kein Code geändert und kein Prüfbranch erstellt.';
        }
        wp_send_json_error( array( 'message' => $message ), 504 );
    }
}, 1 );
