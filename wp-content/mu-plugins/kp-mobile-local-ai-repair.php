<?php
/**
 * Local AI support for the protected repair lab.
 *
 * The device-side open model may inspect a restricted code catalog and prepare a
 * search/replace proposal. WordPress files are read from the authenticated site;
 * a deliberately tiny Android source scope can be read from the private GitHub
 * repository so the app can help improve itself. GitHub credentials never enter
 * Android. Every code change is still validated and only enters an isolated PR.
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

/**
 * Only these Android project areas are exposed to the local model. Workflows,
 * credentials, google-services.json, signing files and arbitrary repository
 * paths are intentionally outside this allowlist.
 */
function kp_local_ai_repo_allowed_path( $path ) {
    $path = ltrim( str_replace( '\\', '/', (string) $path ), '/' );
    if ( str_contains( $path, '..' ) || str_contains( $path, "\0" ) ) { return false; }
    if ( preg_match( '#^android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/[A-Za-z0-9_.-]+\.kt$#', $path ) ) {
        return true;
    }
    return in_array( $path, array(
        'android/homepage-technician/app/src/main/AndroidManifest.xml',
        'android/homepage-technician/app/build.gradle.kts',
        'android/homepage-technician/build.gradle.kts',
        'android/homepage-technician/settings.gradle.kts',
        'android/homepage-technician/gradle.properties',
        'qa/mobile-live-contract.sh',
    ), true );
}

function kp_local_ai_any_allowed_path( $path ) {
    return kp_ai_repair_allowed_path( $path ) || kp_local_ai_repo_allowed_path( $path );
}

function kp_local_ai_github_ready() {
    return function_exists( 'kp_ai_repair_gh' )
        && function_exists( 'kp_ai_repair_gh_path' )
        && function_exists( 'kp_ai_repair_token' )
        && (bool) kp_ai_repair_token();
}

function kp_local_ai_repo_catalog() {
    if ( ! kp_local_ai_github_ready() || ! defined( 'KP_AI_REPAIR_BASE' ) ) { return ''; }
    $cache_key = 'kp_local_ai_android_catalog_v2';
    $cached = get_transient( $cache_key );
    if ( is_string( $cached ) ) { return $cached; }
    try {
        $tree = kp_ai_repair_gh(
            'GET',
            '/git/trees/' . rawurlencode( KP_AI_REPAIR_BASE ) . '?recursive=1',
            null,
            array( 200 )
        );
        $lines = array();
        foreach ( (array) ( $tree['data']['tree'] ?? array() ) as $entry ) {
            if ( ! is_array( $entry ) || 'blob' !== ( $entry['type'] ?? '' ) ) { continue; }
            $path = (string) ( $entry['path'] ?? '' );
            if ( ! kp_local_ai_repo_allowed_path( $path ) ) { continue; }
            $lines[] = $path . "\t" . (int) ( $entry['size'] ?? 0 );
        }
        sort( $lines, SORT_STRING );
        $catalog = implode( "\n", $lines );
        set_transient( $cache_key, $catalog, 5 * MINUTE_IN_SECONDS );
        return $catalog;
    } catch ( Throwable $e ) {
        return '';
    }
}

function kp_local_ai_catalog() {
    $parts = array_filter( array( kp_ai_repair_catalog(), kp_local_ai_repo_catalog() ) );
    return implode( "\n", $parts );
}

/** Return content/hash for an allowed existing file from site or GitHub main. */
function kp_local_ai_read_source( $path ) {
    $path = ltrim( str_replace( '\\', '/', (string) $path ), '/' );
    if ( kp_ai_repair_allowed_path( $path ) ) {
        $absolute = kp_ai_repair_abs_path( $path );
        if ( ! $absolute || ! is_file( $absolute ) || ! is_readable( $absolute ) ) {
            throw new RuntimeException( 'Reparaturdatei ist nicht lesbar: ' . $path );
        }
        $content = (string) file_get_contents( $absolute );
        return array( 'content' => $content, 'hash' => hash( 'sha256', $content ), 'bytes' => strlen( $content ) );
    }
    if ( ! kp_local_ai_repo_allowed_path( $path ) ) {
        throw new RuntimeException( 'Nicht erlaubter Reparaturpfad: ' . $path );
    }
    if ( ! kp_local_ai_github_ready() || ! defined( 'KP_AI_REPAIR_BASE' ) ) {
        throw new RuntimeException( 'GitHub-Reparaturzugang ist für die App-Programmierung noch nicht verfügbar.' );
    }
    $file = kp_ai_repair_gh(
        'GET',
        '/contents/' . kp_ai_repair_gh_path( $path ) . '?ref=' . rawurlencode( KP_AI_REPAIR_BASE ),
        null,
        array( 200 )
    );
    $content = base64_decode( (string) ( $file['data']['content'] ?? '' ), true );
    if ( false === $content ) { throw new RuntimeException( 'GitHub-Datei konnte nicht gelesen werden: ' . $path ); }
    return array( 'content' => $content, 'hash' => hash( 'sha256', $content ), 'bytes' => strlen( $content ) );
}

/**
 * Cloud-free bootstrap for the Android local-AI app. Unlike the legacy live
 * bootstrap this endpoint never requests a Gemini token and therefore cannot
 * consume or hit a Gemini API quota.
 */
add_action( 'wp_ajax_kp_mobile_local_bootstrap', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'kp_ai_repair_code' ) ) {
        wp_send_json_error( array( 'message' => 'Bitte zuerst als Homepage-Techniker oder Administrator anmelden.' ), 403 );
    }
    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
    if ( ! str_contains( $ua, 'KoblenzerPuppenspieleTechnician/' ) ) {
        wp_send_json_error( array( 'message' => 'Dieser lokale Bootstrap ist nur für die Homepage-Hilfe-App verfügbar.' ), 403 );
    }
    if ( ! defined( 'KP_AI_REPAIR_NONCE' ) ) {
        wp_send_json_error( array( 'message' => 'Die Reparaturbasis ist noch nicht geladen.' ), 503 );
    }
    $owner_nonce = '';
    if ( class_exists( 'KP_Owner_Web_App' ) && defined( 'KP_Owner_Web_App::NONCE_ACTION' ) ) {
        $owner_nonce = wp_create_nonce( KP_Owner_Web_App::NONCE_ACTION );
    }
    wp_send_json_success( array(
        'localAi'         => true,
        'cloudModel'      => false,
        'repairNonce'     => wp_create_nonce( KP_AI_REPAIR_NONCE ),
        'ownerNonce'      => $owner_nonce,
        'githubConnected' => function_exists( 'kp_ai_repair_token' ) && (bool) kp_ai_repair_token(),
        'canMerge'        => current_user_can( 'kp_ai_repair_merge' ),
        'canRepairAndroid'=> kp_local_ai_github_ready(),
    ) );
} );
add_action( 'wp_ajax_nopriv_kp_mobile_local_bootstrap', static function () {
    wp_send_json_error( array( 'message' => 'Bitte zuerst bei WordPress anmelden.' ), 401 );
} );

add_action( 'wp_ajax_kp_local_ai_repair_context', static function () {
    kp_local_ai_repair_guard();
    $browser = isset( $_POST['browser'] ) ? sanitize_textarea_field( wp_unslash( $_POST['browser'] ) ) : '';
    $request = isset( $_POST['request'] ) ? sanitize_textarea_field( wp_unslash( $_POST['request'] ) ) : '';
    wp_send_json_success( array(
        'request'            => $request,
        'browser'            => mb_substr( $browser, 0, 12000 ),
        'catalog'            => kp_local_ai_catalog(),
        'debug_tail'         => function_exists( 'kp_ai_repair_debug_tail' ) ? mb_substr( kp_ai_repair_debug_tail(), -12000 ) : '',
        'max_files'          => 3,
        'local_ai'           => true,
        'android_self_repair'=> kp_local_ai_github_ready(),
    ) );
} );

add_action( 'wp_ajax_kp_local_ai_repair_files', static function () {
    kp_local_ai_repair_guard();
    $raw = isset( $_POST['paths'] ) ? wp_unslash( $_POST['paths'] ) : '[]';
    $paths = json_decode( (string) $raw, true );
    if ( ! is_array( $paths ) ) { wp_send_json_error( array( 'message' => 'Ungültige Dateiliste.' ), 400 ); }

    $out = array();
    try {
        foreach ( array_slice( array_values( $paths ), 0, 3 ) as $candidate ) {
            $path = ltrim( str_replace( '\\', '/', sanitize_text_field( (string) $candidate ) ), '/' );
            if ( ! kp_local_ai_any_allowed_path( $path ) ) { continue; }
            $source = kp_local_ai_read_source( $path );
            $base = (string) $source['content'];
            $length = (int) $source['bytes'];
            $content = $base;
            $truncated = $length > 26000;
            if ( $truncated ) {
                $content = substr( $base, 0, 16000 )
                    . "\n\n/* ... MITTELTEIL FÜR LOKALE KI GEKÜRZT ... */\n\n"
                    . substr( $base, -10000 );
            }
            $out[] = array(
                'path'      => $path,
                'hash'      => (string) $source['hash'],
                'content'   => $content,
                'truncated' => $truncated,
                'bytes'     => $length,
                'source'    => kp_local_ai_repo_allowed_path( $path ) ? 'github' : 'website',
            );
        }
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 400 );
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
            if ( ! kp_local_ai_any_allowed_path( $path ) ) { throw new RuntimeException( 'Nicht erlaubter Reparaturpfad: ' . $path ); }
            $source = kp_local_ai_read_source( $path );
            $base = (string) $source['content'];
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
                'base_hash'  => (string) $source['hash'],
            );
        }
        if ( ! $validated ) {
            wp_send_json_success( array( 'safe' => false, 'message' => 'Die lokale KI hat keine anwendbare Codeänderung vorgeschlagen.' ) );
        }
        $risk = (string) ( $plan['risk'] ?? 'medium' );
        if ( ! in_array( $risk, array( 'low', 'medium', 'high' ), true ) ) { $risk = 'medium'; }
        $proposal = array(
            'created'   => time(),
            'request'   => sanitize_textarea_field( (string) ( $plan['request'] ?? '' ) ),
            'summary'   => sanitize_text_field( (string) ( $plan['summary'] ?? 'Lokale KI-Reparatur' ) ),
            'diagnosis' => sanitize_textarea_field( (string) ( $plan['diagnosis'] ?? '' ) ),
            'risk'      => $risk,
            'tests'     => array_values( array_map( 'sanitize_text_field', array_slice( (array) ( $plan['tests'] ?? array() ), 0, 6 ) ) ),
            'changes'   => $validated,
            'local_ai'  => true,
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

/**
 * Dedicated PR creator for local-AI proposals. It mirrors the protected repair
 * lab but accepts the additional Android allowlist above. The model never gets
 * the GitHub token and cannot push to main or deploy live code.
 */
add_action( 'wp_ajax_kp_local_ai_repair_create_pr', static function () {
    kp_local_ai_repair_guard();
    if ( ! function_exists( 'kp_ai_repair_get_proposal' ) || ! kp_local_ai_github_ready() || ! defined( 'KP_AI_REPAIR_BASE' ) ) {
        wp_send_json_error( array( 'message' => 'GitHub-Prüfbranch ist noch nicht verfügbar.' ), 503 );
    }
    $proposal_id = isset( $_POST['proposal_id'] ) ? sanitize_text_field( wp_unslash( $_POST['proposal_id'] ) ) : '';
    $proposal = kp_ai_repair_get_proposal( $proposal_id );
    if ( ! $proposal || empty( $proposal['local_ai'] ) ) {
        wp_send_json_error( array( 'message' => 'Der lokale Reparaturvorschlag ist abgelaufen. Bitte neu analysieren.' ), 410 );
    }
    $branch = 'ai-repair/local-' . gmdate( 'Ymd-His' ) . '-' . strtolower( wp_generate_password( 6, false, false ) );
    try {
        $base = kp_ai_repair_gh( 'GET', '/git/ref/heads/' . rawurlencode( KP_AI_REPAIR_BASE ), null, array( 200 ) );
        $base_sha = (string) ( $base['data']['object']['sha'] ?? '' );
        if ( ! preg_match( '/^[a-f0-9]{40}$/', $base_sha ) ) { throw new RuntimeException( 'GitHub-Hauptstand konnte nicht bestimmt werden.' ); }
        kp_ai_repair_gh( 'POST', '/git/refs', array( 'ref' => 'refs/heads/' . $branch, 'sha' => $base_sha ), array( 201 ) );
        try {
            foreach ( (array) $proposal['changes'] as $change ) {
                $path = (string) ( $change['path'] ?? '' );
                if ( ! kp_local_ai_any_allowed_path( $path ) ) { throw new RuntimeException( 'Nicht erlaubter Reparaturpfad.' ); }
                $file = kp_ai_repair_gh( 'GET', '/contents/' . kp_ai_repair_gh_path( $path ) . '?ref=' . rawurlencode( $branch ), null, array( 200 ) );
                $content = base64_decode( (string) ( $file['data']['content'] ?? '' ), true );
                $sha = (string) ( $file['data']['sha'] ?? '' );
                if ( false === $content || ! $sha ) { throw new RuntimeException( 'GitHub-Datei konnte nicht gelesen werden: ' . $path ); }
                if ( ! hash_equals( (string) $change['base_hash'], hash( 'sha256', $content ) ) ) {
                    throw new RuntimeException( 'Die Datei ' . $path . ' hat sich seit der lokalen Analyse geändert. Bitte neu analysieren.' );
                }
                $next = kp_ai_repair_apply_operations( $content, $change['operations'] );
                kp_ai_repair_gh( 'PUT', '/contents/' . kp_ai_repair_gh_path( $path ), array(
                    'message' => 'fix(local-ai): ' . substr( (string) $proposal['summary'], 0, 60 ),
                    'content' => base64_encode( $next ),
                    'sha'     => $sha,
                    'branch'  => $branch,
                ), array( 200, 201 ) );
            }
            $tests = ! empty( $proposal['tests'] ) ? $proposal['tests'] : array( 'bestehende CI-/Staging-Prüfungen' );
            $body = "Lokal auf dem Android-Gerät vorbereiteter Reparaturvorschlag.\n\n**Diagnose**\n"
                . (string) $proposal['diagnosis']
                . "\n\n**Risiko**\n" . (string) $proposal['risk']
                . "\n\n**Vorgesehene Tests**\n- " . implode( "\n- ", $tests )
                . "\n\nDas lokale Modell hat keinen GitHub-Token erhalten und schreibt niemals direkt auf Live-Dateien.";
            $pr = kp_ai_repair_gh( 'POST', '/pulls', array(
                'title' => '[Lokale KI] ' . substr( (string) $proposal['summary'], 0, 90 ),
                'head'  => $branch,
                'base'  => KP_AI_REPAIR_BASE,
                'body'  => $body,
                'draft' => false,
            ), array( 201 ) );
            delete_transient( kp_ai_repair_proposal_key( $proposal_id ) );
            wp_send_json_success( array(
                'pr'      => (int) ( $pr['data']['number'] ?? 0 ),
                'url'     => esc_url_raw( (string) ( $pr['data']['html_url'] ?? '' ) ),
                'branch'  => $branch,
                'local_ai'=> true,
                'message' => 'Lokaler Prüfbranch erstellt. CI läuft jetzt automatisch.',
            ) );
        } catch ( Throwable $inner ) {
            try { kp_ai_repair_gh( 'DELETE', '/git/refs/heads/' . str_replace( '/', '%2F', $branch ), null, array( 204 ) ); } catch ( Throwable $ignored ) {}
            throw $inner;
        }
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
    }
} );

/** Return only bounded, redacted CI diagnostics for a local-AI repair PR. */
add_action( 'wp_ajax_kp_local_ai_repair_ci_diagnostics', static function () {
    kp_local_ai_repair_guard();
    $pr_number = isset( $_POST['pr'] ) ? absint( $_POST['pr'] ) : 0;
    if ( ! $pr_number ) { wp_send_json_error( array( 'message' => 'Reparatur-PR fehlt.' ), 400 ); }
    try {
        $pr = kp_ai_repair_gh( 'GET', '/pulls/' . $pr_number, null, array( 200 ) );
        $data = (array) $pr['data'];
        $head_ref = (string) ( $data['head']['ref'] ?? '' );
        $sha = (string) ( $data['head']['sha'] ?? '' );
        if ( ! defined( 'KP_AI_REPAIR_BASE' ) || KP_AI_REPAIR_BASE !== ( $data['base']['ref'] ?? '' ) || ! str_starts_with( $head_ref, 'ai-repair/local-' ) ) {
            throw new RuntimeException( 'Dieser Pull Request gehört nicht zur lokalen App-Reparatur.' );
        }
        if ( ! preg_match( '/^[a-f0-9]{40}$/', $sha ) ) { throw new RuntimeException( 'Commit der Reparatur konnte nicht bestimmt werden.' ); }

        $health = function_exists( 'kp_ai_repair_health_for_sha' )
            ? kp_ai_repair_health_for_sha( $sha )
            : array( 'health' => 'pending', 'checks' => array() );
        $comments = kp_ai_repair_gh( 'GET', '/commits/' . $sha . '/comments?per_page=100', null, array( 200 ) );
        $diagnostics = '';
        foreach ( array_reverse( (array) ( $comments['data'] ?? array() ) ) as $comment ) {
            $body = is_array( $comment ) ? (string) ( $comment['body'] ?? '' ) : '';
            if ( str_contains( $body, '<!-- kp-local-ai-ci-diagnostics -->' ) ) {
                $diagnostics = str_replace( '<!-- kp-local-ai-ci-diagnostics -->', '', $body );
                break;
            }
        }
        if ( '' === trim( $diagnostics ) ) {
            $lines = array();
            foreach ( (array) ( $health['checks'] ?? array() ) as $check ) {
                if ( ! is_array( $check ) ) { continue; }
                $lines[] = sanitize_text_field( (string) ( $check['name'] ?? 'CI' ) ) . ': ' . sanitize_text_field( (string) ( $check['state'] ?? 'unknown' ) );
            }
            $diagnostics = $lines ? implode( "\n", $lines ) : 'CI-Diagnose ist noch nicht verfügbar.';
        }
        $diagnostics = preg_replace( '/(?:AIza|gh[pousr]_|github_pat_)[A-Za-z0-9_\-]{12,}/', '[REDACTED]', (string) $diagnostics );
        $diagnostics = preg_replace( '/Authorization\s*:\s*Bearer\s+\S+/i', 'Authorization: Bearer ***', (string) $diagnostics );
        wp_send_json_success( array(
            'health'      => (string) ( $health['health'] ?? 'pending' ),
            'sha'         => $sha,
            'diagnostics' => mb_substr( wp_strip_all_tags( $diagnostics ), 0, 14000 ),
            'local_ai'    => true,
        ) );
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
    }
} );
