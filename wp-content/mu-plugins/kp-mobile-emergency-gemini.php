<?php
/**
 * Protected server-side Gemini fallback for the Android Homepage-Hilfe app.
 *
 * The normal assistant remains the free on-device Gemma model. This file is only
 * used after the owner explicitly taps "Notfall Gemini". Gemini may chat about
 * the current page or prepare a minimal website/Android patch. API and GitHub
 * credentials remain on the server; every code change still goes through an
 * isolated PR, CI and an explicit merge confirmation.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_mobile_emergency_ready() {
    return function_exists( 'kp_ai_repair_guard' )
        && function_exists( 'kp_ai_repair_gemini' )
        && function_exists( 'kp_ai_repair_store_proposal' )
        && function_exists( 'kp_ai_repair_get_proposal' )
        && function_exists( 'kp_ai_repair_apply_operations' )
        && function_exists( 'kp_ai_repair_gh' )
        && function_exists( 'kp_ai_repair_gh_path' )
        && function_exists( 'kp_local_ai_catalog' )
        && function_exists( 'kp_local_ai_any_allowed_path' )
        && function_exists( 'kp_local_ai_read_source' );
}

function kp_mobile_emergency_guard() {
    if ( ! kp_mobile_emergency_ready() ) {
        wp_send_json_error( array( 'message' => 'Der geschützte Notfall-Gemini-Dienst ist noch nicht bereit.' ), 503 );
    }
    kp_ai_repair_guard();
}

/** Emergency Gemini may not rewrite its own trust boundary or the local repair bridge. */
function kp_mobile_emergency_allowed_path( $path ) {
    $path = ltrim( str_replace( '\\', '/', (string) $path ), '/' );
    if ( ! kp_local_ai_any_allowed_path( $path ) ) { return false; }
    return ! in_array( $path, array(
        'wp-content/mu-plugins/kp-mobile-emergency-gemini.php',
        'wp-content/mu-plugins/kp-mobile-local-ai-repair.php',
        'wp-content/mu-plugins/kp-ai-repair-lab.php',
        'wp-content/mu-plugins/kp-ai-direct-editor.php',
        'wp-content/mu-plugins/kp-ai-plan-interactions.php',
    ), true );
}

function kp_mobile_emergency_router_schema() {
    return array(
        'type' => 'object',
        'properties' => array(
            'mode' => array( 'type' => 'string', 'enum' => array( 'chat', 'repair' ) ),
            'reply' => array( 'type' => 'string' ),
            'repair_request' => array( 'type' => 'string' ),
        ),
        'required' => array( 'mode', 'reply', 'repair_request' ),
    );
}

add_action( 'wp_ajax_kp_mobile_emergency_gemini', static function () {
    kp_mobile_emergency_guard();
    $request = isset( $_POST['request'] ) ? sanitize_textarea_field( wp_unslash( $_POST['request'] ) ) : '';
    $browser = isset( $_POST['browser'] ) ? sanitize_textarea_field( wp_unslash( $_POST['browser'] ) ) : '';
    $history = isset( $_POST['history'] ) ? sanitize_textarea_field( wp_unslash( $_POST['history'] ) ) : '';
    $request = trim( mb_substr( $request, 0, 5000 ) );
    $browser = mb_substr( $browser, 0, 12000 );
    $history = mb_substr( $history, -6000 );
    if ( strlen( $request ) < 2 ) {
        wp_send_json_error( array( 'message' => 'Bitte schreibe zuerst eine Aufgabe für Notfall Gemini.' ), 400 );
    }

    try {
        $router_system = 'Du bist Notfall Gemini innerhalb der geschützten Homepage-Hilfe der Koblenzer Puppenspiele. Antworte auf Deutsch und bleibe konkret. mode=chat für Fragen, Erklärungen, Planung und normale Zusammenarbeit. mode=repair nur wenn der Nutzer ausdrücklich einen technischen Fehler beheben, Code ändern oder eine neue technische Funktion in Website oder Android-App programmieren lassen möchte. In repair_request formuliere dann eine kurze eigenständige technische Aufgabe. Behaupte nie, Code sei bereits geändert. Sicherheits-, Auth-, Nonce- oder Berechtigungsprüfungen dürfen niemals abgeschwächt werden.';
        $router_input = "AKTUELLER WUNSCH:\n{$request}\n\nLETZTE NOTFALL-UNTERHALTUNG:\n{$history}\n\nAKTUELLER SEITENKONTEXT:\n{$browser}";
        $route = kp_ai_repair_gemini( $router_system, $router_input, kp_mobile_emergency_router_schema(), 55 );
        $reply = sanitize_textarea_field( (string) ( $route['reply'] ?? '' ) );
        $mode = (string) ( $route['mode'] ?? 'chat' );
        if ( 'repair' !== $mode ) {
            wp_send_json_success( array(
                'mode'  => 'chat',
                'reply' => $reply ?: 'Ich bin als Notfall-Gemini verbunden. Was soll ich prüfen?',
                'cloud' => true,
            ) );
        }

        $repair_request = trim( sanitize_textarea_field( (string) ( $route['repair_request'] ?? '' ) ) );
        if ( '' === $repair_request ) { $repair_request = $request; }
        $catalog = kp_local_ai_catalog();
        if ( '' === trim( $catalog ) ) {
            throw new RuntimeException( 'Für die Notfall-Programmierung ist derzeit kein geschützter Codekatalog verfügbar.' );
        }
        $debug = function_exists( 'kp_ai_repair_debug_tail' ) ? mb_substr( kp_ai_repair_debug_tail(), -12000 ) : '';
        $selection_system = 'Du bist der vorsichtige Code-Diagnostiker für die Website UND die Android Homepage-Hilfe der Koblenzer Puppenspiele. Wähle höchstens drei vorhandene Dateien ausschließlich aus dem gelieferten Katalog. Bevorzuge die kleinste plausible Menge. Keine Secrets, Workflows, Signierschlüssel oder Sicherheitsgrenzen erfinden oder ändern. Wenn Code nicht sicher nötig oder die Ursache unklar ist, wähle keine Datei und erkläre das in reply/diagnosis.';
        $selection_input = "TECHNISCHE AUFGABE:\n{$repair_request}\n\nBISHERIGE ANTWORT:\n{$reply}\n\nSEITENKONTEXT:\n{$browser}\n\nDEBUG-LOG:\n{$debug}\n\nERLAUBTER DATEIKATALOG (Pfad\\tBytes):\n{$catalog}";
        $selection = kp_ai_repair_gemini( $selection_system, $selection_input, kp_ai_repair_selection_schema(), 60 );

        $contexts = array();
        $total_bytes = 0;
        foreach ( array_slice( (array) ( $selection['files'] ?? array() ), 0, 3 ) as $candidate ) {
            $path = ltrim( str_replace( '\\', '/', sanitize_text_field( (string) $candidate ) ), '/' );
            if ( ! kp_mobile_emergency_allowed_path( $path ) || isset( $contexts[ $path ] ) ) { continue; }
            $source = kp_local_ai_read_source( $path );
            $bytes = (int) ( $source['bytes'] ?? 0 );
            if ( $bytes <= 0 || $bytes > 70000 || $total_bytes + $bytes > 160000 ) { continue; }
            $contexts[ $path ] = array(
                'content' => (string) $source['content'],
                'hash'    => (string) $source['hash'],
            );
            $total_bytes += $bytes;
        }
        if ( ! $contexts ) {
            $diagnosis = sanitize_textarea_field( (string) ( $selection['diagnosis'] ?? '' ) );
            wp_send_json_success( array(
                'mode'  => 'chat',
                'reply' => trim( $reply . ( $diagnosis ? "\n\n" . $diagnosis : '' ) ),
                'cloud' => true,
            ) );
        }

        $code_context = '';
        foreach ( $contexts as $path => $record ) {
            $code_context .= "\n\n===== {$path} =====\n" . $record['content'];
        }
        $patch_system = 'Du bist Senior-Entwickler im geschützten Notfall-Reparaturlabor. Erzeuge einen minimalen Fix ausschließlich in den bereitgestellten vorhandenen Dateien. Für jede Änderung nur exakte search/replace-Operationen; search muss wortwörtlich genau einmal im gelieferten Inhalt vorkommen. Keine Dateien löschen oder neu erfinden. Keine Credentials, Tokens, API-Keys, eval/shell_exec/exec/system/passthru/proc_open/popen hinzufügen. Keine Nonce-, Capability-, Authentifizierungs- oder sonstige Sicherheitsprüfung entfernen oder abschwächen. Keine Live-Deployments oder Datenbankmigrationen. Wenn ein sicherer Fix nicht möglich ist, changes=[] liefern.';
        $patch_input = "AUFGABE:\n{$repair_request}\n\nERSTE DIAGNOSE:\n" . (string) ( $selection['diagnosis'] ?? '' ) . "\n\nBROWSER:\n{$browser}\n\nDEBUG:\n{$debug}\n\nCODE:{$code_context}";
        $plan = kp_ai_repair_gemini( $patch_system, $patch_input, kp_ai_repair_patch_schema(), 75 );

        $validated = array();
        foreach ( array_slice( (array) ( $plan['changes'] ?? array() ), 0, 3 ) as $change ) {
            if ( ! is_array( $change ) ) { continue; }
            $path = ltrim( str_replace( '\\', '/', sanitize_text_field( (string) ( $change['path'] ?? '' ) ) ), '/' );
            if ( ! isset( $contexts[ $path ] ) || ! kp_mobile_emergency_allowed_path( $path ) ) {
                throw new RuntimeException( 'Notfall Gemini wollte eine nicht analysierte oder geschützte Datei ändern. Der Fix wurde blockiert.' );
            }
            $operations = array();
            foreach ( array_slice( (array) ( $change['operations'] ?? array() ), 0, 8 ) as $operation ) {
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
                'reason'     => sanitize_text_field( (string) ( $change['reason'] ?? 'Notfall-Gemini-Reparatur' ) ),
                'operations' => $operations,
                'base_hash'  => $contexts[ $path ]['hash'],
            );
        }

        $summary = sanitize_text_field( (string) ( $plan['summary'] ?? 'Notfall-Gemini-Reparatur' ) );
        $diagnosis = sanitize_textarea_field( (string) ( $plan['diagnosis'] ?? $selection['diagnosis'] ?? '' ) );
        if ( ! $validated ) {
            wp_send_json_success( array(
                'mode'  => 'chat',
                'reply' => trim( $reply . "\n\n" . ( $summary ?: $diagnosis ) ),
                'cloud' => true,
            ) );
        }
        $risk = (string) ( $plan['risk'] ?? 'medium' );
        if ( ! in_array( $risk, array( 'low', 'medium', 'high' ), true ) ) { $risk = 'medium'; }
        $proposal = array(
            'created'          => time(),
            'request'          => $repair_request,
            'summary'          => $summary,
            'diagnosis'        => $diagnosis,
            'risk'             => $risk,
            'tests'            => array_values( array_map( 'sanitize_text_field', array_slice( (array) ( $plan['tests'] ?? array() ), 0, 6 ) ) ),
            'changes'          => $validated,
            'emergency_gemini' => true,
        );
        $proposal_id = kp_ai_repair_store_proposal( $proposal );
        wp_send_json_success( array(
            'mode'        => 'repair',
            'reply'       => $reply ?: 'Ich habe einen kleinen technischen Reparaturvorschlag vorbereitet.',
            'safe'        => true,
            'cloud'       => true,
            'proposal_id' => $proposal_id,
            'summary'     => $proposal['summary'],
            'diagnosis'   => $proposal['diagnosis'],
            'risk'        => $proposal['risk'],
            'tests'       => $proposal['tests'],
            'files'       => array_map( static fn( $item ) => array( 'path' => $item['path'], 'reason' => $item['reason'] ), $validated ),
        ) );
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
    }
} );

/** Create an isolated PR for a server-side emergency-Gemini proposal. */
add_action( 'wp_ajax_kp_mobile_emergency_gemini_create_pr', static function () {
    kp_mobile_emergency_guard();
    $proposal_id = isset( $_POST['proposal_id'] ) ? sanitize_text_field( wp_unslash( $_POST['proposal_id'] ) ) : '';
    $proposal = kp_ai_repair_get_proposal( $proposal_id );
    if ( ! is_array( $proposal ) || empty( $proposal['emergency_gemini'] ) ) {
        wp_send_json_error( array( 'message' => 'Der Notfall-Gemini-Vorschlag ist abgelaufen. Bitte neu analysieren.' ), 410 );
    }
    if ( ! defined( 'KP_AI_REPAIR_BASE' ) ) {
        wp_send_json_error( array( 'message' => 'GitHub-Prüfbranch ist noch nicht verfügbar.' ), 503 );
    }
    $branch = 'ai-repair/local-gemini-' . gmdate( 'Ymd-His' ) . '-' . strtolower( wp_generate_password( 6, false, false ) );
    try {
        $base = kp_ai_repair_gh( 'GET', '/git/ref/heads/' . rawurlencode( KP_AI_REPAIR_BASE ), null, array( 200 ) );
        $base_sha = (string) ( $base['data']['object']['sha'] ?? '' );
        if ( ! preg_match( '/^[a-f0-9]{40}$/', $base_sha ) ) { throw new RuntimeException( 'GitHub-Hauptstand konnte nicht bestimmt werden.' ); }
        kp_ai_repair_gh( 'POST', '/git/refs', array( 'ref' => 'refs/heads/' . $branch, 'sha' => $base_sha ), array( 201 ) );
        try {
            foreach ( (array) ( $proposal['changes'] ?? array() ) as $change ) {
                $path = (string) ( $change['path'] ?? '' );
                if ( ! kp_mobile_emergency_allowed_path( $path ) ) { throw new RuntimeException( 'Nicht erlaubter Notfall-Reparaturpfad.' ); }
                $file = kp_ai_repair_gh( 'GET', '/contents/' . kp_ai_repair_gh_path( $path ) . '?ref=' . rawurlencode( $branch ), null, array( 200 ) );
                $content = base64_decode( (string) ( $file['data']['content'] ?? '' ), true );
                $sha = (string) ( $file['data']['sha'] ?? '' );
                if ( false === $content || ! $sha ) { throw new RuntimeException( 'GitHub-Datei konnte nicht gelesen werden: ' . $path ); }
                if ( ! hash_equals( (string) $change['base_hash'], hash( 'sha256', $content ) ) ) {
                    throw new RuntimeException( 'Die Datei ' . $path . ' hat sich seit der Gemini-Analyse geändert. Bitte neu analysieren.' );
                }
                $next = kp_ai_repair_apply_operations( $content, $change['operations'] );
                kp_ai_repair_gh( 'PUT', '/contents/' . kp_ai_repair_gh_path( $path ), array(
                    'message' => 'fix(emergency-gemini): ' . substr( (string) $proposal['summary'], 0, 55 ),
                    'content' => base64_encode( $next ),
                    'sha'     => $sha,
                    'branch'  => $branch,
                ), array( 200, 201 ) );
            }
            $tests = ! empty( $proposal['tests'] ) ? $proposal['tests'] : array( 'bestehende CI-/Staging-Prüfungen' );
            $body = "Serverseitig von Notfall Gemini vorbereiteter Reparaturvorschlag.\n\n**Diagnose**\n"
                . (string) $proposal['diagnosis']
                . "\n\n**Risiko**\n" . (string) $proposal['risk']
                . "\n\n**Vorgesehene Tests**\n- " . implode( "\n- ", $tests )
                . "\n\nAPI- und GitHub-Zugang bleiben auf dem Server. Gemini schreibt niemals direkt auf Live-Dateien.";
            $pr = kp_ai_repair_gh( 'POST', '/pulls', array(
                'title' => '[Notfall Gemini] ' . substr( (string) $proposal['summary'], 0, 82 ),
                'head'  => $branch,
                'base'  => KP_AI_REPAIR_BASE,
                'body'  => $body,
                'draft' => false,
            ), array( 201 ) );
            delete_transient( kp_ai_repair_proposal_key( $proposal_id ) );
            wp_send_json_success( array(
                'pr'     => (int) ( $pr['data']['number'] ?? 0 ),
                'url'    => esc_url_raw( (string) ( $pr['data']['html_url'] ?? '' ) ),
                'branch' => $branch,
                'source' => 'emergency_gemini',
                'message'=> 'Notfall-Gemini-Prüfbranch erstellt. CI läuft jetzt automatisch.',
            ) );
        } catch ( Throwable $inner ) {
            try { kp_ai_repair_gh( 'DELETE', '/git/refs/heads/' . str_replace( '/', '%2F', $branch ), null, array( 204 ) ); } catch ( Throwable $ignored ) {}
            throw $inner;
        }
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
    }
} );
