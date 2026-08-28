<?php
/**
 * Desktop-only takeover for the owner homepage assistant.
 *
 * The browser talks only to the loopback laptop agent. AI, vision and speech
 * recognition stay local; Android and the legacy cloud assistant are excluded.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( is_admin() || ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    $edit_mode = isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    if ( ! $edit_mode ) { return; }
    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
    if ( false !== strpos( $ua, 'KoblenzerPuppenspieleTechnician/' ) ) { return; }

    $asset_rel  = 'kp-local-ai-desktop-assets/takeover-v8.js';
    $asset_path = WPMU_PLUGIN_DIR . '/' . $asset_rel;
    $asset_url  = WPMU_PLUGIN_URL . '/' . $asset_rel;
    $version    = is_file( $asset_path ) ? (string) filemtime( $asset_path ) : '8';
    $config     = array(
        'agentUrl' => 'http://127.0.0.1:8765',
        'model'    => 'gemma3:4b',
        'version'  => 'desktop-ai-complete-v8',
    );
    ?>
    <style id="kp-local-ai-takeover-style">
      html.kp-local-ai-takeover .kp-ai-trigger,
      html.kp-local-ai-takeover .kp-ai-sheet,
      html.kp-local-ai-takeover .kp-ai-repair-sheet,
      html.kp-local-ai-takeover .kp-ai-repair-open,
      html.kp-local-ai-takeover .kp-mobile-live-trigger,
      html.kp-local-ai-takeover .kp-local-ai-launch,
      html.kp-local-ai-takeover .kp-local-ai-panel{display:none!important}
      .kp-lat-launch{position:fixed;right:18px;bottom:18px;z-index:2147483600;min-width:132px;border:0;border-radius:999px;padding:14px 22px;background:#f47b20;color:#fff;font:850 16px/1.15 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.34);cursor:pointer}
      .kp-lat-panel{position:fixed;right:14px;top:14px;bottom:76px;z-index:2147483599;width:min(600px,calc(100vw - 28px));display:none;grid-template-rows:auto auto minmax(150px,1fr) auto auto;border:1px solid rgba(255,255,255,.14);border-radius:22px;background:#17110e;color:#f8f2ed;box-shadow:0 26px 80px rgba(0,0,0,.55);overflow:hidden;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
      .kp-lat-panel.is-open{display:grid}.kp-lat-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 17px 13px;border-bottom:1px solid rgba(255,255,255,.12)}.kp-lat-head strong{display:block;font-size:20px}.kp-lat-sub{margin-top:3px;color:#cdbfb5;font-size:12px}.kp-lat-close{border:0;border-radius:12px;background:rgba(255,255,255,.08);color:#fff;font-size:24px;line-height:1;padding:8px 11px;cursor:pointer}
      .kp-lat-tools{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 16px 0}.kp-lat-tools button,.kp-lat-actions button{min-height:42px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#2b231f;color:#fff;font-weight:800;cursor:pointer}.kp-lat-connect{background:#f1e5da!important;color:#211914!important}.kp-lat-tools button.is-on,.kp-lat-actions button.is-on{background:#315d37!important}.kp-lat-tools button.is-warn{background:#6d5325!important}
      .kp-lat-log{margin:12px 16px 0;padding:13px;border-radius:14px;background:rgba(255,255,255,.06);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.kp-lat-preview{display:none;margin:10px 16px 0;border-radius:12px;overflow:hidden;background:#000;max-height:150px}.kp-lat-preview.is-on{display:block}.kp-lat-preview video{display:block;width:100%;max-height:150px;object-fit:cover}
      .kp-lat-compose{display:flex;gap:8px;padding:12px 16px 0}.kp-lat-input{min-width:0;flex:1;border:1px solid rgba(255,255,255,.18);border-radius:13px;padding:11px 12px;background:#0f0c0a;color:#fff;font:inherit}.kp-lat-send{border:0;border-radius:13px;padding:10px 16px;background:#f47b20;color:#fff;font-weight:850;cursor:pointer}.kp-lat-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:9px 16px 16px}.kp-lat-panel button:disabled,.kp-lat-panel input:disabled{opacity:.48;cursor:not-allowed}.kp-lat-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.kp-lat-badge{padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.09);font-size:11px}.kp-lat-badge.is-on{background:#315d37}.kp-lat-badge.is-warn{background:#6d5325}
      @media(max-width:900px){.kp-lat-launch,.kp-lat-panel{display:none!important}}@media(max-width:560px){.kp-lat-tools{grid-template-columns:1fr 1fr}.kp-lat-actions{grid-template-columns:1fr 1fr}}
    </style>
    <button type="button" class="kp-lat-launch" aria-expanded="false">✦ Lokale KI</button>
    <section class="kp-lat-panel" aria-label="Lokale Homepage-KI">
      <div class="kp-lat-head"><div><strong>Lokale Homepage-KI</strong><div class="kp-lat-sub">Gemma, Bildschirm und Sprache auf diesem Laptop</div><div class="kp-lat-badges"><span class="kp-lat-badge kp-lat-agent-badge">Agent aus</span><span class="kp-lat-badge kp-lat-screen-badge">Bild aus</span><span class="kp-lat-badge kp-lat-voice-badge">Stimme wird geprüft</span><span class="kp-lat-badge">Android gesperrt</span></div></div><button type="button" class="kp-lat-close" aria-label="Schließen">×</button></div>
      <div><div class="kp-lat-tools"><button type="button" class="kp-lat-connect">Laptop-Agent verbinden</button><button type="button" class="kp-lat-share">Bildschirm/Tab/Fenster</button><button type="button" class="kp-lat-observe">👁 Beobachten</button><button type="button" class="kp-lat-mic">🎙 Gespräch</button><button type="button" class="kp-lat-speak">🔊 Stimme an</button><button type="button" class="kp-lat-test-voice">Stimme testen</button></div><div class="kp-lat-preview"><video class="kp-lat-video" muted autoplay playsinline></video></div></div>
      <div class="kp-lat-log" aria-live="polite">KI: Ich verbinde mich mit Gemma auf diesem Laptop. Android und Cloud-KI bleiben ausgeschaltet.</div>
      <div class="kp-lat-compose"><input class="kp-lat-input" type="text" placeholder="Was soll ich erklären, ändern oder reparieren?" disabled><button type="button" class="kp-lat-send" disabled>Senden</button></div>
      <div class="kp-lat-actions"><button type="button" class="kp-lat-stop">Freigabe stoppen</button><button type="button" class="kp-lat-publish" disabled>Auf Staging</button><button type="button" class="kp-lat-revert" disabled>Code verwerfen</button><button type="button" class="kp-lat-reconnect">Neu verbinden</button></div>
    </section>
    <script>window.KPLocalDesktopAIConfig=<?php echo wp_json_encode( $config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;</script>
    <script id="kp-local-ai-desktop-takeover-runtime" src="<?php echo esc_url( add_query_arg( 'v', $version, $asset_url ) ); ?>"></script>
    <?php
}, 99999 );

add_action( 'template_redirect', static function () {
    if ( ! isset( $_GET['kp_desktop_ai_probe'] ) || ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    nocache_headers();
    header( 'Content-Type: application/json; charset=utf-8' );
    echo wp_json_encode( array(
        'loaded'       => true,
        'version'      => 'desktop-ai-complete-v8',
        'takeoverFile' => is_file( WPMU_PLUGIN_DIR . '/kp-local-ai-desktop-takeover.php' ),
        'assetFile'    => is_file( WPMU_PLUGIN_DIR . '/kp-local-ai-desktop-assets/takeover-v8.js' ),
    ) );
    exit;
}, 0 );
