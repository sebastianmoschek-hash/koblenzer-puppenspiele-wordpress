<?php
/**
 * Gemini-powered safe repair lab for the Koblenzer Puppenspiele owner editor.
 *
 * Flow: diagnose -> minimal patch proposal -> isolated GitHub repair branch/PR
 * -> CI status gate -> optional squash merge. Gemini never edits live files.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

const KP_AI_REPAIR_NONCE = 'kp_ai_repair_lab';
const KP_AI_REPAIR_TOKEN_OPTION = 'kp_ai_repair_github_token_v1';
const KP_AI_REPAIR_REPO = 'sebastianmoschek-hash/koblenzer-puppenspiele-wordpress';
const KP_AI_REPAIR_BASE = 'main';
const KP_AI_REPAIR_PROPOSAL_TTL = 3600;

function kp_ai_repair_install_caps() {
    $admin = get_role( 'administrator' );
    if ( $admin ) {
        $admin->add_cap( 'kp_ai_repair_code' );
        $admin->add_cap( 'kp_ai_repair_merge' );
    }
    $role = get_role( 'kp_homepage_technician' );
    if ( ! $role ) {
        $role = add_role( 'kp_homepage_technician', 'Homepage-Techniker', array(
            'read'               => true,
            'edit_pages'         => true,
            'upload_files'       => true,
            'kp_ai_repair_code'  => true,
            'kp_ai_repair_merge' => true,
        ) );
    } elseif ( $role ) {
        foreach ( array( 'read', 'edit_pages', 'upload_files', 'kp_ai_repair_code', 'kp_ai_repair_merge' ) as $cap ) {
            $role->add_cap( $cap );
        }
    }
}
add_action( 'init', 'kp_ai_repair_install_caps', 5 );

function kp_ai_repair_can_use() {
    return is_user_logged_in() && current_user_can( 'kp_ai_repair_code' );
}
function kp_ai_repair_can_merge() {
    return is_user_logged_in() && current_user_can( 'kp_ai_repair_merge' );
}
function kp_ai_repair_guard( $merge = false ) {
    $allowed = $merge ? kp_ai_repair_can_merge() : kp_ai_repair_can_use();
    if ( ! $allowed ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung für den KI-Reparaturmodus.' ), 403 ); }
    check_ajax_referer( KP_AI_REPAIR_NONCE, 'nonce' );
}

function kp_ai_repair_token() {
    if ( defined( 'KP_AI_REPAIR_GITHUB_TOKEN' ) && KP_AI_REPAIR_GITHUB_TOKEN ) {
        return trim( (string) KP_AI_REPAIR_GITHUB_TOKEN );
    }
    $env = getenv( 'KP_AI_REPAIR_GITHUB_TOKEN' );
    if ( is_string( $env ) && $env ) { return trim( $env ); }
    return trim( (string) get_option( KP_AI_REPAIR_TOKEN_OPTION, '' ) );
}

function kp_ai_repair_roots() {
    return array(
        trailingslashit( WP_CONTENT_DIR ) . 'mu-plugins' => 'wp-content/mu-plugins',
        trailingslashit( WP_CONTENT_DIR ) . 'plugins/koblenzer-puppenspiele-core-phase2-2' => 'wp-content/plugins/koblenzer-puppenspiele-core-phase2-2',
        trailingslashit( WP_CONTENT_DIR ) . 'themes/koblenzer-puppenspiele-block-theme-phase1-7' => 'wp-content/themes/koblenzer-puppenspiele-block-theme-phase1-7',
    );
}
function kp_ai_repair_allowed_path( $path ) {
    $path = ltrim( str_replace( '\\', '/', (string) $path ), '/' );
    if ( ! preg_match( '/\.(php|js|mjs|css|json)$/i', $path ) ) { return false; }
    if ( str_contains( $path, '..' ) || str_contains( $path, "\0" ) ) { return false; }
    $blocked = array(
        'wp-content/mu-plugins/kp-ai-repair-lab.php',
        'wp-content/mu-plugins/kp-ai-direct-editor.php',
        'wp-content/mu-plugins/kp-ai-plan-interactions.php',
    );
    if ( in_array( $path, $blocked, true ) ) { return false; }
    foreach ( kp_ai_repair_roots() as $repo_prefix ) {
        if ( $path === $repo_prefix || str_starts_with( $path, $repo_prefix . '/' ) ) { return true; }
    }
    return false;
}
function kp_ai_repair_abs_path( $repo_path ) {
    $repo_path = ltrim( str_replace( '\\', '/', (string) $repo_path ), '/' );
    if ( ! kp_ai_repair_allowed_path( $repo_path ) ) { return ''; }
    foreach ( kp_ai_repair_roots() as $absolute => $prefix ) {
        if ( $repo_path === $prefix || str_starts_with( $repo_path, $prefix . '/' ) ) {
            $suffix = ltrim( substr( $repo_path, strlen( $prefix ) ), '/' );
            return trailingslashit( $absolute ) . $suffix;
        }
    }
    return '';
}
function kp_ai_repair_catalog() {
    $out = array();
    $skip_dirs = array( 'vendor', 'node_modules', 'uploads', 'cache', '.git' );
    foreach ( kp_ai_repair_roots() as $absolute => $prefix ) {
        if ( ! is_dir( $absolute ) ) { continue; }
        try {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveCallbackFilterIterator(
                    new RecursiveDirectoryIterator( $absolute, FilesystemIterator::SKIP_DOTS ),
                    static function ( $current ) use ( $skip_dirs ) {
                        if ( $current->isDir() && in_array( $current->getFilename(), $skip_dirs, true ) ) { return false; }
                        return true;
                    }
                )
            );
            foreach ( $iterator as $file ) {
                if ( ! $file->isFile() ) { continue; }
                $ext = strtolower( (string) pathinfo( $file->getFilename(), PATHINFO_EXTENSION ) );
                if ( ! in_array( $ext, array( 'php', 'js', 'mjs', 'css', 'json' ), true ) ) { continue; }
                $relative = ltrim( str_replace( '\\', '/', substr( $file->getPathname(), strlen( $absolute ) ) ), '/' );
                $repo_path = $prefix . '/' . $relative;
                if ( ! kp_ai_repair_allowed_path( $repo_path ) ) { continue; }
                $out[] = $repo_path . "\t" . (int) $file->getSize();
                if ( count( $out ) >= 450 ) { break 2; }
            }
        } catch ( Throwable $e ) {
            continue;
        }
    }
    sort( $out, SORT_STRING );
    return implode( "\n", $out );
}
function kp_ai_repair_debug_tail() {
    $path = trailingslashit( WP_CONTENT_DIR ) . 'debug.log';
    if ( ! is_readable( $path ) || ! is_file( $path ) ) { return 'Kein lesbares WordPress-debug.log vorhanden.'; }
    $size = (int) filesize( $path );
    $take = min( 16000, max( 0, $size ) );
    if ( 0 === $take ) { return 'WordPress-debug.log ist leer.'; }
    $fh = fopen( $path, 'rb' );
    if ( ! $fh ) { return 'WordPress-debug.log konnte nicht geöffnet werden.'; }
    if ( $size > $take ) { fseek( $fh, -$take, SEEK_END ); }
    $text = (string) fread( $fh, $take );
    fclose( $fh );
    return preg_replace( '/(?:AIza|gh[pousr]_|github_pat_)[A-Za-z0-9_\-]+/', '[REDACTED]', $text );
}

function kp_ai_repair_interaction_text( $body ) {
    if ( function_exists( 'kp_ai_interactions_output_text' ) ) { return (string) kp_ai_interactions_output_text( $body ); }
    if ( ! is_array( $body ) ) { return ''; }
    foreach ( (array) ( $body['steps'] ?? array() ) as $step ) {
        if ( ! is_array( $step ) ) { continue; }
        foreach ( (array) ( $step['content'] ?? array() ) as $block ) {
            if ( is_array( $block ) && 'text' === ( $block['type'] ?? '' ) && isset( $block['text'] ) ) { return (string) $block['text']; }
        }
    }
    return '';
}
function kp_ai_repair_gemini( $system, $input, $schema, $timeout = 55 ) {
    if ( ! function_exists( 'kp_ai_key' ) ) { throw new RuntimeException( 'Die Gemini-Basisintegration ist nicht geladen.' ); }
    $key = kp_ai_key();
    if ( ! $key ) { throw new RuntimeException( 'Gemini ist noch nicht verbunden.' ); }
    $payload = array(
        'model'              => 'gemini-3.7-flash',
        'input'              => $input,
        'system_instruction' => $system,
        'store'              => false,
        'generation_config'  => array( 'thinking_level' => 'medium' ),
        'response_format'    => array( 'type' => 'text', 'mime_type' => 'application/json', 'schema' => $schema ),
    );
    $response = wp_remote_post( 'https://generativelanguage.googleapis.com/v1beta/interactions', array(
        'timeout' => $timeout,
        'headers' => array( 'Content-Type' => 'application/json', 'x-goog-api-key' => $key, 'Api-Revision' => '2026-05-20' ),
        'body'    => wp_json_encode( $payload ),
    ) );
    if ( function_exists( 'kp_ai_json_body' ) ) {
        $body = kp_ai_json_body( $response );
    } else {
        if ( is_wp_error( $response ) ) { throw new RuntimeException( $response->get_error_message() ); }
        $body = json_decode( (string) wp_remote_retrieve_body( $response ), true );
        if ( ! is_array( $body ) ) { throw new RuntimeException( 'Gemini hat keine gültige Antwort geliefert.' ); }
    }
    $json = json_decode( kp_ai_repair_interaction_text( $body ), true );
    if ( ! is_array( $json ) ) { throw new RuntimeException( 'Gemini hat keinen gültigen Reparaturplan geliefert.' ); }
    return $json;
}

function kp_ai_repair_selection_schema() {
    return array(
        'type' => 'object',
        'properties' => array(
            'reply' => array( 'type' => 'string' ),
            'diagnosis' => array( 'type' => 'string' ),
            'confidence' => array( 'type' => 'string', 'enum' => array( 'low', 'medium', 'high' ) ),
            'files' => array( 'type' => 'array', 'maxItems' => 4, 'items' => array( 'type' => 'string' ) ),
        ),
        'required' => array( 'reply', 'diagnosis', 'confidence', 'files' ),
    );
}
function kp_ai_repair_patch_schema() {
    return array(
        'type' => 'object',
        'properties' => array(
            'summary' => array( 'type' => 'string' ),
            'diagnosis' => array( 'type' => 'string' ),
            'risk' => array( 'type' => 'string', 'enum' => array( 'low', 'medium', 'high' ) ),
            'tests' => array( 'type' => 'array', 'maxItems' => 6, 'items' => array( 'type' => 'string' ) ),
            'changes' => array(
                'type' => 'array', 'maxItems' => 4,
                'items' => array(
                    'type' => 'object',
                    'properties' => array(
                        'path' => array( 'type' => 'string' ),
                        'reason' => array( 'type' => 'string' ),
                        'operations' => array(
                            'type' => 'array', 'maxItems' => 8,
                            'items' => array(
                                'type' => 'object',
                                'properties' => array(
                                    'search' => array( 'type' => 'string' ),
                                    'replace' => array( 'type' => 'string' ),
                                ),
                                'required' => array( 'search', 'replace' ),
                            ),
                        ),
                        'new_file_content' => array( 'type' => 'string' ),
                    ),
                    'required' => array( 'path', 'reason', 'operations', 'new_file_content' ),
                ),
            ),
        ),
        'required' => array( 'summary', 'diagnosis', 'risk', 'tests', 'changes' ),
    );
}

function kp_ai_repair_safe_added_text( $text ) {
    $lower = strtolower( (string) $text );
    foreach ( array( 'eval(', 'shell_exec(', 'passthru(', 'proc_open(', 'popen(', 'system(', 'assert(' ) as $needle ) {
        if ( str_contains( $lower, $needle ) ) { return false; }
    }
    if ( preg_match( '/(?:AIza|gh[pousr]_|github_pat_)[A-Za-z0-9_\-]{12,}/', $text ) ) { return false; }
    return true;
}
function kp_ai_repair_apply_operations( $content, $operations ) {
    $next = (string) $content;
    foreach ( (array) $operations as $op ) {
        $search = (string) ( $op['search'] ?? '' );
        $replace = (string) ( $op['replace'] ?? '' );
        if ( '' === $search || strlen( $search ) > 16000 || strlen( $replace ) > 24000 ) {
            throw new RuntimeException( 'Ein vorgeschlagener Such-/Ersetzungsblock ist ungültig oder zu groß.' );
        }
        if ( 1 !== substr_count( $next, $search ) ) {
            throw new RuntimeException( 'Ein vorgeschlagener Codeblock ist nicht eindeutig. Der Fix wurde aus Sicherheitsgründen nicht vorbereitet.' );
        }
        foreach ( array( 'check_ajax_referer', 'current_user_can', 'wp_verify_nonce' ) as $guard ) {
            if ( str_contains( $search, $guard ) && ! str_contains( $replace, $guard ) ) {
                throw new RuntimeException( 'Gemini wollte eine Sicherheitsprüfung entfernen. Dieser Fix wurde blockiert.' );
            }
        }
        if ( ! kp_ai_repair_safe_added_text( $replace ) ) {
            throw new RuntimeException( 'Der vorgeschlagene Code enthält eine nicht erlaubte Ausführungsfunktion oder ein Secret.' );
        }
        $pos = strpos( $next, $search );
        $next = substr_replace( $next, $replace, $pos, strlen( $search ) );
    }
    return $next;
}

function kp_ai_repair_proposal_key( $id ) {
    return 'kp_ai_rep_' . get_current_user_id() . '_' . preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) $id );
}
function kp_ai_repair_store_proposal( $proposal ) {
    $id = wp_generate_password( 22, false, false );
    set_transient( kp_ai_repair_proposal_key( $id ), $proposal, KP_AI_REPAIR_PROPOSAL_TTL );
    return $id;
}
function kp_ai_repair_get_proposal( $id ) {
    $proposal = get_transient( kp_ai_repair_proposal_key( $id ) );
    return is_array( $proposal ) ? $proposal : null;
}

add_action( 'wp_ajax_kp_ai_repair_analyze', static function () {
    kp_ai_repair_guard();
    $request = isset( $_POST['request'] ) ? sanitize_textarea_field( wp_unslash( $_POST['request'] ) ) : '';
    $browser = isset( $_POST['browser'] ) ? sanitize_textarea_field( wp_unslash( $_POST['browser'] ) ) : '';
    if ( strlen( $request ) < 5 ) { wp_send_json_error( array( 'message' => 'Bitte beschreibe den Fehler etwas genauer.' ), 400 ); }
    try {
        $catalog = kp_ai_repair_catalog();
        $logs = kp_ai_repair_debug_tail();
        $system1 = 'Du bist der vorsichtige Software-Diagnostiker der Website Koblenzer Puppenspiele. Du darfst noch keinen Code erzeugen. Wähle höchstens vier vorhandene, wahrscheinlich relevante Dateien aus dem gelieferten Katalog. Bevorzuge kleine, eng passende Dateien. Niemals Authentifizierung, Nonces, Berechtigungen oder Secrets schwächen. Wenn die Ursache aus den Daten nicht sicher ableitbar ist, confidence=low verwenden.';
        $input1 = "FEHLERWUNSCH:\n{$request}\n\nBROWSERKONTEXT:\n{$browser}\n\nWORDPRESS DEBUG-LOG (Ende):\n{$logs}\n\nDATEIKATALOG (Pfad\\tBytes):\n{$catalog}";
        $selection = kp_ai_repair_gemini( $system1, $input1, kp_ai_repair_selection_schema(), 55 );
        $selected = array();
        $contexts = array();
        foreach ( array_slice( (array) ( $selection['files'] ?? array() ), 0, 4 ) as $path ) {
            $path = ltrim( str_replace( '\\', '/', sanitize_text_field( (string) $path ) ), '/' );
            if ( ! kp_ai_repair_allowed_path( $path ) ) { continue; }
            $abs = kp_ai_repair_abs_path( $path );
            if ( ! $abs || ! is_readable( $abs ) || ! is_file( $abs ) ) { continue; }
            $size = (int) filesize( $abs );
            if ( $size <= 0 || $size > 70000 ) { continue; }
            $content = (string) file_get_contents( $abs );
            $selected[] = $path;
            $contexts[ $path ] = array( 'content' => $content, 'hash' => hash( 'sha256', $content ) );
        }
        if ( ! $selected ) { throw new RuntimeException( 'Gemini konnte noch keine kleine, eindeutig relevante Codedatei bestimmen. Bitte den Fehler genauer beschreiben.' ); }
        $code_context = '';
        foreach ( $contexts as $path => $record ) {
            $code_context .= "\n\n===== {$path} =====\n" . $record['content'];
        }
        $system2 = 'Du bist ein Senior-WordPress-Entwickler in einem streng abgesicherten Reparaturlabor. Erzeuge einen minimalen Fix nur in den bereitgestellten vorhandenen Dateien. Für bestehende Dateien darfst du ausschließlich exakte search/replace-Operationen liefern; search muss wortwörtlich genau einmal im gelieferten Inhalt vorkommen. Keine Datei löschen. Keine Credentials, Tokens oder API-Keys erzeugen. Keine eval/shell_exec/exec/system/passthru/proc_open/popen-Funktionen hinzufügen. Keine Nonce-, Capability- oder Auth-Prüfung entfernen oder abschwächen. Keine Live-Deployments, Datenbankmigrationen oder externen Downloads. Wenn eine sichere Reparatur nicht möglich ist, liefere changes=[] und erkläre warum. Änderungen müssen klein und testbar sein.';
        $input2 = "NUTZERFEHLER:\n{$request}\n\nERSTE DIAGNOSE:\n" . (string) ( $selection['diagnosis'] ?? '' ) . "\n\nBROWSERKONTEXT:\n{$browser}\n\nDEBUG-LOG:\n{$logs}\n\nCODE:" . $code_context;
        $plan = kp_ai_repair_gemini( $system2, $input2, kp_ai_repair_patch_schema(), 70 );
        $validated = array();
        foreach ( array_slice( (array) ( $plan['changes'] ?? array() ), 0, 4 ) as $change ) {
            $path = ltrim( str_replace( '\\', '/', sanitize_text_field( (string) ( $change['path'] ?? '' ) ) ), '/' );
            if ( ! in_array( $path, $selected, true ) || ! isset( $contexts[ $path ] ) ) {
                throw new RuntimeException( 'Gemini wollte eine nicht analysierte Datei ändern. Der Fix wurde blockiert.' );
            }
            $operations = array_slice( (array) ( $change['operations'] ?? array() ), 0, 8 );
            if ( ! $operations ) { continue; }
            $next = kp_ai_repair_apply_operations( $contexts[ $path ]['content'], $operations );
            if ( $next === $contexts[ $path ]['content'] ) { continue; }
            $validated[] = array(
                'path'       => $path,
                'reason'     => sanitize_text_field( (string) ( $change['reason'] ?? '' ) ),
                'operations' => $operations,
                'base_hash'  => $contexts[ $path ]['hash'],
            );
        }
        if ( ! $validated ) {
            wp_send_json_success( array(
                'safe' => false,
                'message' => (string) ( $plan['summary'] ?? 'Gemini konnte keinen sicheren automatischen Fix ableiten.' ),
                'diagnosis' => (string) ( $plan['diagnosis'] ?? $selection['diagnosis'] ?? '' ),
            ) );
        }
        $proposal = array(
            'created'   => time(),
            'request'   => $request,
            'summary'   => sanitize_text_field( (string) ( $plan['summary'] ?? 'KI-Reparatur' ) ),
            'diagnosis' => sanitize_textarea_field( (string) ( $plan['diagnosis'] ?? $selection['diagnosis'] ?? '' ) ),
            'risk'      => in_array( ( $plan['risk'] ?? '' ), array( 'low', 'medium', 'high' ), true ) ? $plan['risk'] : 'medium',
            'tests'     => array_values( array_map( 'sanitize_text_field', array_slice( (array) ( $plan['tests'] ?? array() ), 0, 6 ) ) ),
            'changes'   => $validated,
        );
        $proposal_id = kp_ai_repair_store_proposal( $proposal );
        wp_send_json_success( array(
            'safe' => true,
            'proposal_id' => $proposal_id,
            'summary' => $proposal['summary'],
            'diagnosis' => $proposal['diagnosis'],
            'risk' => $proposal['risk'],
            'tests' => $proposal['tests'],
            'files' => array_map( static fn( $item ) => array( 'path' => $item['path'], 'reason' => $item['reason'] ), $validated ),
            'github_connected' => (bool) kp_ai_repair_token(),
        ) );
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
    }
} );

function kp_ai_repair_gh_headers() {
    $token = kp_ai_repair_token();
    if ( ! $token ) { throw new RuntimeException( 'GitHub-Reparaturzugang ist noch nicht verbunden.' ); }
    return array(
        'Accept' => 'application/vnd.github+json',
        'Authorization' => 'Bearer ' . $token,
        'X-GitHub-Api-Version' => '2022-11-28',
        'User-Agent' => 'Koblenzer-Puppenspiele-AI-Repair',
    );
}
function kp_ai_repair_gh_path( $path ) {
    return implode( '/', array_map( 'rawurlencode', explode( '/', (string) $path ) ) );
}
function kp_ai_repair_gh( $method, $endpoint, $body = null, $allowed = array( 200, 201 ) ) {
    $url = 'https://api.github.com/repos/' . KP_AI_REPAIR_REPO . $endpoint;
    $args = array( 'method' => $method, 'timeout' => 35, 'headers' => kp_ai_repair_gh_headers() );
    if ( null !== $body ) {
        $args['headers']['Content-Type'] = 'application/json';
        $args['body'] = wp_json_encode( $body );
    }
    $response = wp_remote_request( $url, $args );
    if ( is_wp_error( $response ) ) { throw new RuntimeException( $response->get_error_message() ); }
    $code = (int) wp_remote_retrieve_response_code( $response );
    $data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
    if ( ! in_array( $code, $allowed, true ) ) {
        $message = is_array( $data ) ? (string) ( $data['message'] ?? 'GitHub-Anfrage fehlgeschlagen.' ) : 'GitHub-Anfrage fehlgeschlagen.';
        throw new RuntimeException( 'GitHub: ' . sanitize_text_field( $message ) . ' (HTTP ' . $code . ')' );
    }
    return array( 'code' => $code, 'data' => is_array( $data ) ? $data : array() );
}

add_action( 'wp_ajax_kp_ai_repair_token_save', static function () {
    kp_ai_repair_guard();
    if ( ! current_user_can( 'manage_options' ) ) { wp_send_json_error( array( 'message' => 'Nur Administratoren dürfen den GitHub-Reparaturzugang hinterlegen.' ), 403 ); }
    $token = isset( $_POST['token'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['token'] ) ) ) : '';
    if ( strlen( $token ) < 20 ) { wp_send_json_error( array( 'message' => 'Der GitHub-Token sieht unvollständig aus.' ), 400 ); }
    update_option( KP_AI_REPAIR_TOKEN_OPTION, $token, false );
    try {
        kp_ai_repair_gh( 'GET', '', null, array( 200 ) );
        wp_send_json_success( array( 'connected' => true, 'message' => 'GitHub-Reparaturzugang verbunden ✓' ) );
    } catch ( Throwable $e ) {
        delete_option( KP_AI_REPAIR_TOKEN_OPTION );
        wp_send_json_error( array( 'message' => $e->getMessage() ), 400 );
    }
} );

add_action( 'wp_ajax_kp_ai_repair_create_pr', static function () {
    kp_ai_repair_guard();
    $proposal_id = isset( $_POST['proposal_id'] ) ? sanitize_text_field( wp_unslash( $_POST['proposal_id'] ) ) : '';
    $proposal = kp_ai_repair_get_proposal( $proposal_id );
    if ( ! $proposal ) { wp_send_json_error( array( 'message' => 'Der Reparaturvorschlag ist abgelaufen. Bitte neu analysieren.' ), 410 ); }
    $branch = 'ai-repair/' . gmdate( 'Ymd-His' ) . '-' . strtolower( wp_generate_password( 6, false, false ) );
    try {
        $base = kp_ai_repair_gh( 'GET', '/git/ref/heads/' . rawurlencode( KP_AI_REPAIR_BASE ), null, array( 200 ) );
        $base_sha = (string) ( $base['data']['object']['sha'] ?? '' );
        if ( ! preg_match( '/^[a-f0-9]{40}$/', $base_sha ) ) { throw new RuntimeException( 'GitHub-Hauptstand konnte nicht bestimmt werden.' ); }
        kp_ai_repair_gh( 'POST', '/git/refs', array( 'ref' => 'refs/heads/' . $branch, 'sha' => $base_sha ), array( 201 ) );
        try {
            foreach ( $proposal['changes'] as $change ) {
                $path = (string) $change['path'];
                if ( ! kp_ai_repair_allowed_path( $path ) ) { throw new RuntimeException( 'Nicht erlaubter Reparaturpfad.' ); }
                $file = kp_ai_repair_gh( 'GET', '/contents/' . kp_ai_repair_gh_path( $path ) . '?ref=' . rawurlencode( $branch ), null, array( 200 ) );
                $content = base64_decode( (string) ( $file['data']['content'] ?? '' ), true );
                $sha = (string) ( $file['data']['sha'] ?? '' );
                if ( false === $content || ! $sha ) { throw new RuntimeException( 'GitHub-Datei konnte nicht gelesen werden: ' . $path ); }
                if ( ! hash_equals( (string) $change['base_hash'], hash( 'sha256', $content ) ) ) {
                    throw new RuntimeException( 'Die Datei ' . $path . ' hat sich seit der KI-Analyse geändert. Bitte neu analysieren.' );
                }
                $next = kp_ai_repair_apply_operations( $content, $change['operations'] );
                kp_ai_repair_gh( 'PUT', '/contents/' . kp_ai_repair_gh_path( $path ), array(
                    'message' => 'fix(ai): ' . substr( (string) $proposal['summary'], 0, 65 ),
                    'content' => base64_encode( $next ),
                    'sha' => $sha,
                    'branch' => $branch,
                ), array( 200, 201 ) );
            }
            $body = "Automatisch vorbereiteter Gemini-Reparaturvorschlag.\n\n**Diagnose**\n" . $proposal['diagnosis'] . "\n\n**Risiko**\n" . $proposal['risk'] . "\n\n**Vorgesehene Tests**\n- " . implode( "\n- ", $proposal['tests'] ?: array( 'bestehende CI-/Staging-Prüfungen' ) ) . "\n\nDer Reparaturmodus schreibt niemals direkt auf Live-Dateien.";
            $pr = kp_ai_repair_gh( 'POST', '/pulls', array(
                'title' => '[KI-Reparatur] ' . substr( (string) $proposal['summary'], 0, 90 ),
                'head' => $branch,
                'base' => KP_AI_REPAIR_BASE,
                'body' => $body,
                'draft' => false,
            ), array( 201 ) );
            delete_transient( kp_ai_repair_proposal_key( $proposal_id ) );
            wp_send_json_success( array(
                'pr' => (int) ( $pr['data']['number'] ?? 0 ),
                'url' => esc_url_raw( (string) ( $pr['data']['html_url'] ?? '' ) ),
                'branch' => $branch,
                'message' => 'Prüfbranch erstellt. CI läuft jetzt automatisch.',
            ) );
        } catch ( Throwable $inner ) {
            try { kp_ai_repair_gh( 'DELETE', '/git/refs/heads/' . str_replace( '/', '%2F', $branch ), null, array( 204 ) ); } catch ( Throwable $ignored ) {}
            throw $inner;
        }
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
    }
} );

function kp_ai_repair_health_for_sha( $sha ) {
    if ( ! preg_match( '/^[a-f0-9]{40}$/', (string) $sha ) ) { throw new RuntimeException( 'Ungültige Commit-ID.' ); }
    $combined = kp_ai_repair_gh( 'GET', '/commits/' . $sha . '/status', null, array( 200 ) );
    $checks = kp_ai_repair_gh( 'GET', '/commits/' . $sha . '/check-runs?per_page=100', null, array( 200 ) );
    $items = array();
    $has_failure = false;
    $has_pending = false;
    $count = 0;
    foreach ( (array) ( $combined['data']['statuses'] ?? array() ) as $status ) {
        $state = (string) ( $status['state'] ?? 'pending' );
        $items[] = array( 'name' => sanitize_text_field( (string) ( $status['context'] ?? 'Status' ) ), 'state' => $state );
        $count++;
        if ( in_array( $state, array( 'failure', 'error' ), true ) ) { $has_failure = true; }
        elseif ( 'success' !== $state ) { $has_pending = true; }
    }
    foreach ( (array) ( $checks['data']['check_runs'] ?? array() ) as $check ) {
        $status = (string) ( $check['status'] ?? 'queued' );
        $conclusion = (string) ( $check['conclusion'] ?? '' );
        $state = 'pending';
        if ( 'completed' === $status ) {
            $state = in_array( $conclusion, array( 'success', 'neutral', 'skipped' ), true ) ? 'success' : 'failure';
        }
        $items[] = array( 'name' => sanitize_text_field( (string) ( $check['name'] ?? 'Check' ) ), 'state' => $state );
        $count++;
        if ( 'failure' === $state ) { $has_failure = true; }
        elseif ( 'success' !== $state ) { $has_pending = true; }
    }
    $health = 'pending';
    if ( $has_failure ) { $health = 'failure'; }
    elseif ( $count > 0 && ! $has_pending ) { $health = 'success'; }
    return array( 'health' => $health, 'checks' => $items );
}

add_action( 'wp_ajax_kp_ai_repair_status', static function () {
    kp_ai_repair_guard();
    $pr_number = isset( $_POST['pr'] ) ? absint( $_POST['pr'] ) : 0;
    $sha = isset( $_POST['sha'] ) ? sanitize_text_field( wp_unslash( $_POST['sha'] ) ) : '';
    try {
        $pr_data = null;
        if ( $pr_number ) {
            $pr = kp_ai_repair_gh( 'GET', '/pulls/' . $pr_number, null, array( 200 ) );
            $pr_data = $pr['data'];
            if ( KP_AI_REPAIR_BASE !== ( $pr_data['base']['ref'] ?? '' ) || ! str_starts_with( (string) ( $pr_data['head']['ref'] ?? '' ), 'ai-repair/' ) ) {
                throw new RuntimeException( 'Dieser Pull Request gehört nicht zum KI-Reparaturlabor.' );
            }
            $sha = (string) ( $pr_data['head']['sha'] ?? '' );
        }
        $health = kp_ai_repair_health_for_sha( $sha );
        wp_send_json_success( array(
            'health' => $health['health'],
            'checks' => $health['checks'],
            'sha' => $sha,
            'pr_state' => $pr_data ? (string) ( $pr_data['state'] ?? '' ) : '',
            'mergeable' => $pr_data ? (bool) ( $pr_data['mergeable'] ?? false ) : false,
        ) );
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
    }
} );

add_action( 'wp_ajax_kp_ai_repair_merge', static function () {
    kp_ai_repair_guard( true );
    $pr_number = isset( $_POST['pr'] ) ? absint( $_POST['pr'] ) : 0;
    if ( ! $pr_number ) { wp_send_json_error( array( 'message' => 'Pull Request fehlt.' ), 400 ); }
    try {
        $pr = kp_ai_repair_gh( 'GET', '/pulls/' . $pr_number, null, array( 200 ) );
        $data = $pr['data'];
        $head_ref = (string) ( $data['head']['ref'] ?? '' );
        $head_sha = (string) ( $data['head']['sha'] ?? '' );
        if ( KP_AI_REPAIR_BASE !== ( $data['base']['ref'] ?? '' ) || ! str_starts_with( $head_ref, 'ai-repair/' ) || 'open' !== ( $data['state'] ?? '' ) ) {
            throw new RuntimeException( 'Dieser Reparatur-PR kann nicht übernommen werden.' );
        }
        $health = kp_ai_repair_health_for_sha( $head_sha );
        if ( 'success' !== $health['health'] ) {
            throw new RuntimeException( 'Der Fix wird erst übernommen, wenn alle verfügbaren CI-Prüfungen grün sind.' );
        }
        $merge = kp_ai_repair_gh( 'PUT', '/pulls/' . $pr_number . '/merge', array(
            'merge_method' => 'squash',
            'commit_title' => '[KI-Reparatur] geprüfter Homepage-Fix',
        ), array( 200 ) );
        if ( empty( $merge['data']['merged'] ) ) { throw new RuntimeException( sanitize_text_field( (string) ( $merge['data']['message'] ?? 'GitHub hat den Merge abgelehnt.' ) ) ); }
        $merge_sha = (string) ( $merge['data']['sha'] ?? '' );
        try { kp_ai_repair_gh( 'DELETE', '/git/refs/heads/' . str_replace( '/', '%2F', $head_ref ), null, array( 204 ) ); } catch ( Throwable $ignored ) {}
        wp_send_json_success( array(
            'merged' => true,
            'sha' => $merge_sha,
            'message' => 'Geprüfter Fix übernommen. Die Staging-Prüfung des Hauptstands läuft jetzt.',
        ) );
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
    }
} );

add_action( 'wp_footer', static function () {
    if ( ! kp_ai_repair_can_use() ) { return; }
    $edit_mode = isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    if ( ! $edit_mode ) { return; }
    $cfg = array(
        'ajaxUrl' => admin_url( 'admin-ajax.php' ),
        'nonce' => wp_create_nonce( KP_AI_REPAIR_NONCE ),
        'githubConnected' => (bool) kp_ai_repair_token(),
        'canConfigure' => current_user_can( 'manage_options' ),
        'canMerge' => kp_ai_repair_can_merge(),
    );
    ?>
    <style id="kp-ai-repair-style">
      .kp-ai-repair-sheet{position:fixed;z-index:2147482800;left:50%;bottom:12px;transform:translateX(-50%);width:min(760px,calc(100vw - 20px));max-height:min(84vh,780px);overflow:auto;background:#111820;color:#f5f7fa;border:1px solid rgba(255,255,255,.18);border-radius:22px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.58)}.kp-ai-repair-sheet[hidden]{display:none!important}.kp-ai-repair-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.kp-ai-repair-close{border:0;background:transparent;color:inherit;font-size:28px}.kp-ai-repair-sheet textarea{width:100%;min-height:118px;box-sizing:border-box;margin:12px 0;border-radius:14px;padding:12px;background:#091018;color:#fff;border:1px solid rgba(255,255,255,.18);font:inherit}.kp-ai-repair-actions{display:flex;gap:8px;flex-wrap:wrap}.kp-ai-repair-actions button{min-height:44px;border-radius:12px;padding:9px 13px;font-weight:800;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:inherit}.kp-ai-repair-actions .is-primary{background:#1778d4;border-color:#1778d4}.kp-ai-repair-actions .is-success{background:#187c45;border-color:#187c45}.kp-ai-repair-result{margin-top:12px;padding:12px;border-radius:14px;background:rgba(255,255,255,.05);white-space:pre-wrap}.kp-ai-repair-status{min-height:24px;margin-top:10px;font-size:13px;opacity:.88}.kp-ai-repair-token{display:grid;gap:8px;margin-top:12px;padding:12px;border-radius:14px;background:rgba(255,255,255,.05)}.kp-ai-repair-token input{min-height:42px;border-radius:10px;padding:8px;background:#091018;color:#fff;border:1px solid rgba(255,255,255,.18)}.kp-ai-repair-check{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.08)}
    </style>
    <script id="kp-ai-repair-runtime">
    (()=>{
      'use strict';
      const cfg=<?php echo wp_json_encode( $cfg, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;
      const q=(s,r=document)=>r.querySelector(s);let proposal='',pr=0,mergeSha='',poll=0;const browserErrors=[];
      window.addEventListener('error',e=>{browserErrors.push(String(e.message||'JavaScript-Fehler')+' @ '+String(e.filename||'')+':'+String(e.lineno||''));if(browserErrors.length>20)browserErrors.shift()});
      window.addEventListener('unhandledrejection',e=>{browserErrors.push('Promise: '+String(e.reason?.message||e.reason||''));if(browserErrors.length>20)browserErrors.shift()});
      function api(action,fields={}){const fd=new FormData();fd.append('action',action);fd.append('nonce',cfg.nonce);Object.entries(fields).forEach(([k,v])=>fd.append(k,String(v)));return fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd}).then(async r=>{const j=await r.json().catch(()=>null);if(!r.ok||!j?.success)throw new Error(j?.data?.message||'Reparatur-Anfrage fehlgeschlagen.');return j.data||{}})}
      function browserContext(){return JSON.stringify({url:location.href,title:document.title,viewport:{w:innerWidth,h:innerHeight},errors:browserErrors.slice(-20)},null,2)}
      let sheet=q('.kp-ai-repair-sheet');if(!sheet){sheet=document.createElement('div');sheet.className='kp-ai-repair-sheet';sheet.hidden=true;sheet.innerHTML=`<div class="kp-ai-repair-head"><div><strong>🛠 Gemini Homepage-Techniker</strong><div style="font-size:12px;opacity:.72">Analysiert Code, erstellt Prüfbranch und wartet auf CI – niemals direkt live.</div></div><button type="button" class="kp-ai-repair-close" aria-label="Schließen">×</button></div><textarea class="kp-ai-repair-request" placeholder="Zum Beispiel: Beim Speichern dreht der Button endlos und die Änderung wird nicht übernommen. Bitte finde den Fehler und repariere ihn."></textarea><div class="kp-ai-repair-actions"><button type="button" class="kp-ai-repair-analyze is-primary">Fehler analysieren</button><button type="button" class="kp-ai-repair-pr" disabled>Prüf-Fix erstellen</button><button type="button" class="kp-ai-repair-merge is-success" hidden>Geprüften Fix übernehmen</button></div><div class="kp-ai-repair-status"></div><div class="kp-ai-repair-result" hidden></div><div class="kp-ai-repair-token" ${cfg.githubConnected||!cfg.canConfigure?'hidden':''}><strong>Einmalig GitHub-Reparaturzugang verbinden</strong><small>Fine-grained Token für dieses Repository: Contents + Pull requests lesen/schreiben. Der Token bleibt serverseitig.</small><input type="password" class="kp-ai-repair-token-input" autocomplete="off" placeholder="GitHub Fine-grained Token"><button type="button" class="kp-ai-repair-token-save">Verbinden</button></div>`;document.body.appendChild(sheet)}
      const status=q('.kp-ai-repair-status',sheet),result=q('.kp-ai-repair-result',sheet),mergeBtn=q('.kp-ai-repair-merge',sheet),prBtn=q('.kp-ai-repair-pr',sheet);const setStatus=t=>status.textContent=t||'';
      function renderChecks(d){result.hidden=false;const checks=(d.checks||[]).map(c=>`<div class="kp-ai-repair-check"><span>${escapeHtml(c.name)}</span><strong>${c.state==='success'?'✅':c.state==='failure'?'❌':'⏳'} ${escapeHtml(c.state)}</strong></div>`).join('');result.innerHTML=`<strong>Prüfstatus: ${escapeHtml(d.health||'pending')}</strong>${checks||'<div>Noch keine CI-Prüfung gemeldet.</div>'}`;mergeBtn.hidden=!(d.health==='success'&&cfg.canMerge&&pr>0)}
      function escapeHtml(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML}
      function startPoll(){clearInterval(poll);poll=setInterval(async()=>{try{const d=await api('kp_ai_repair_status',pr?{pr}:{sha:mergeSha});renderChecks(d);if(mergeSha&&d.health==='success'){setStatus('✅ Hauptstand und Staging-/CI-Prüfungen sind grün.');clearInterval(poll)}}catch(e){setStatus(e.message)}},15000)}
      q('.kp-ai-repair-close',sheet).onclick=()=>{sheet.hidden=true};
      const openButton=()=>{let host=q('.kp-ai-sheet .kp-ai-actions');if(!host)return false;if(q('.kp-ai-repair-open',host))return true;const b=document.createElement('button');b.type='button';b.className='kp-ai-repair-open';b.textContent='🛠 Technik reparieren';b.onclick=()=>{sheet.hidden=false;q('.kp-ai-repair-request',sheet)?.focus()};host.appendChild(b);return true};openButton();const mount=setInterval(()=>{if(openButton())clearInterval(mount)},500);
      q('.kp-ai-repair-token-save',sheet)?.addEventListener('click',async()=>{const input=q('.kp-ai-repair-token-input',sheet);try{setStatus('GitHub wird geprüft …');const d=await api('kp_ai_repair_token_save',{token:input.value});cfg.githubConnected=!!d.connected;q('.kp-ai-repair-token',sheet).hidden=true;setStatus(d.message)}catch(e){setStatus(e.message)}});
      q('.kp-ai-repair-analyze',sheet).onclick=async()=>{const text=q('.kp-ai-repair-request',sheet).value.trim();if(!text)return;proposal='';pr=0;mergeSha='';prBtn.disabled=true;mergeBtn.hidden=true;result.hidden=true;setStatus('Gemini analysiert Logs und relevante Codedateien …');try{const d=await api('kp_ai_repair_analyze',{request:text,browser:browserContext()});if(!d.safe){result.hidden=false;result.textContent=(d.message||'Kein sicherer Auto-Fix möglich.')+'\n\n'+(d.diagnosis||'');setStatus('Keine automatische Änderung vorgenommen.');return}proposal=d.proposal_id;const files=(d.files||[]).map(f=>'• '+f.path+' — '+f.reason).join('\n');result.hidden=false;result.textContent=`${d.summary}\n\nDiagnose:\n${d.diagnosis}\n\nRisiko: ${d.risk}\n\nDateien:\n${files}\n\nTests:\n${(d.tests||[]).map(x=>'• '+x).join('\n')}`;prBtn.disabled=!proposal;setStatus(d.github_connected?'Sicherer Patch vorbereitet. Jetzt Prüf-Fix erstellen.':'Patch vorbereitet. Für den Prüfbranch muss GitHub einmalig verbunden werden.')}catch(e){setStatus(e.message)}};
      prBtn.onclick=async()=>{if(!proposal)return;prBtn.disabled=true;setStatus('GitHub-Prüfbranch und Pull Request werden erstellt …');try{const d=await api('kp_ai_repair_create_pr',{proposal_id:proposal});pr=d.pr;setStatus(d.message+' PR #'+pr);result.hidden=false;result.textContent=`Pull Request #${pr}\n${d.url||''}\n\nDie automatische Prüfung läuft.`;startPoll();const s=await api('kp_ai_repair_status',{pr});renderChecks(s)}catch(e){setStatus(e.message);prBtn.disabled=false}};
      mergeBtn.onclick=async()=>{if(!pr||!confirm('Den vollständig grün geprüften KI-Fix jetzt in den Hauptstand übernehmen?'))return;mergeBtn.disabled=true;setStatus('Geprüfter Fix wird übernommen …');try{const d=await api('kp_ai_repair_merge',{pr});mergeSha=d.sha;pr=0;mergeBtn.hidden=true;setStatus(d.message);startPoll()}catch(e){setStatus(e.message);mergeBtn.disabled=false}};
    })();
    </script>
    <?php
}, 2110 );
