<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Keeps public ticket information consistent.
 *
 * A real ticket URL always wins over the provisional "In Planung" status.
 * This class never invents or discovers ticket URLs; it only normalizes records
 * once a verified URL has been entered on the website.
 */
final class KP_Ticket_Display {
    public static function init() {
        add_action( 'updated_post_meta', array( __CLASS__, 'normalize_after_meta_change' ), 20, 4 );
        add_action( 'added_post_meta', array( __CLASS__, 'normalize_after_meta_change' ), 20, 4 );
        add_action( 'wp_footer', array( __CLASS__, 'frontend_guard' ), 120 );
    }

    public static function normalize_after_meta_change( $meta_id, $post_id, $meta_key, $meta_value ) {
        if ( '_kp_ticket_url' !== $meta_key || 'kp_termin' !== get_post_type( $post_id ) ) { return; }
        $ticket = esc_url_raw( (string) $meta_value );
        if ( ! $ticket ) { return; }
        $status = (string) get_post_meta( $post_id, '_kp_status', true );
        if ( 'planned' === $status ) {
            update_post_meta( $post_id, '_kp_status', 'standard' );
        }
    }

    public static function frontend_guard() {
        if ( is_admin() ) { return; }
        ?>
        <script id="kp-ticket-display-guard">
        (() => {
          const normalize = () => {
            document.querySelectorAll('.kp-termin-card').forEach(card => {
              const ticket = card.querySelector('.kp-termin-actions a.kp-termine-button:not(.kp-termine-button-outline)');
              if (!ticket || !ticket.getAttribute('href')) return;
              const status = card.querySelector('.kp-termin-status');
              if (status && /in\s+planung/i.test(status.textContent || '')) status.remove();
              ticket.textContent = 'Tickets verfügbar';
              ticket.setAttribute('aria-label', 'Tickets für diese Vorstellung verfügbar');
              card.classList.remove('kp-status-planned');
              card.classList.add('kp-has-ticket-link');
            });
          };
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', normalize, {once:true});
          else normalize();
        })();
        </script>
        <?php
    }
}
