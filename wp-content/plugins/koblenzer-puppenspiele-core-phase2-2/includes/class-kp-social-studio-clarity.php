<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Small owner-facing clarity layer for the Website Studio social section.
 * It deliberately does not implement or claim a live Meta connection.
 */
final class KP_Social_Studio_Clarity {
    public static function init() {
        add_action( 'admin_footer', array( __CLASS__, 'polish_studio_social_ui' ), 220 );
    }

    public static function polish_studio_social_ui() {
        if ( ! is_admin() || ! current_user_can( 'edit_theme_options' ) ) { return; }
        $screen = get_current_screen();
        if ( ! $screen || false === strpos( (string) $screen->id, 'kp-website-studio' ) ) { return; }
        ?>
        <script id="kp-social-studio-clarity">
        (() => {
          const apply = () => {
            const tab = document.querySelector('.kp-studio-tabs button[data-tab="social"]');
            if (tab) tab.textContent = 'Social & Instagram';
            const card = document.getElementById('kp-social-settings-card');
            if (!card) return;
            const heading = card.querySelector('h2');
            if (heading) heading.textContent = 'Social & Instagram';
            if (!card.querySelector('.kp-meta-connection-note')) {
              const note = document.createElement('div');
              note.className = 'kp-meta-connection-note';
              note.innerHTML = '<strong>Meta-/Instagram-Kontoverbindung:</strong> vorbereitet, aber derzeit nicht verbunden. Aktuell werden nur öffentliche Profil-Links gespeichert; eine echte Meta-Verbindung wird erst später separat eingerichtet.';
              const intro = card.querySelector('.kp-studio-muted');
              if (intro) intro.insertAdjacentElement('afterend', note);
              else card.insertBefore(note, card.firstChild?.nextSibling || null);
            }
          };
          apply();
          new MutationObserver(apply).observe(document.documentElement, {childList:true, subtree:true});
        })();
        </script>
        <style id="kp-social-studio-clarity-css">
        .kp-meta-connection-note{margin:12px 0 16px;padding:12px 14px;border:1px solid #dcdcde;border-left:4px solid #f07a22;border-radius:10px;background:#fff;color:#2c3338;line-height:1.45}
        </style>
        <?php
    }
}
