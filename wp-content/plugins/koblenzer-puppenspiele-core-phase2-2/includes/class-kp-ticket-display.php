<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Keeps public ticket information consistent.
 *
 * A real ticket URL always wins over the provisional "In Planung" status.
 * Verified legacy links may be restored by narrowly scoped one-time migrations.
 */
final class KP_Ticket_Display {
    const REMAGEN_FIX_OPTION = 'kp_ticket_fix_remagen_20260821_v1';

    public static function init() {
        add_action( 'init', array( __CLASS__, 'restore_verified_remagen_link' ), 95 );
        add_action( 'updated_post_meta', array( __CLASS__, 'normalize_after_meta_change' ), 20, 4 );
        add_action( 'added_post_meta', array( __CLASS__, 'normalize_after_meta_change' ), 20, 4 );
        add_action( 'wp_footer', array( __CLASS__, 'frontend_guard' ), 120 );
    }

    /**
     * Restore the verified public organizer source for exactly one legacy event.
     *
     * Safety rules:
     * - match only the immutable legacy key for 21.08.2026, 15:30, Remagen;
     * - never overwrite an existing ticket URL;
     * - only change the provisional status "planned";
     * - never touch Google Calendar or any external service.
     */
    public static function restore_verified_remagen_link() {
        if ( get_option( self::REMAGEN_FIX_OPTION ) ) { return; }
        if ( ! post_type_exists( 'kp_termin' ) ) { return; }

        $ids = get_posts( array(
            'post_type'      => 'kp_termin',
            'post_status'    => 'any',
            'posts_per_page' => 1,
            'fields'         => 'ids',
            'meta_key'       => '_kp_legacy_key',
            'meta_value'     => 'legacy-f03d3ba77b888f86',
        ) );
        if ( ! $ids ) { return; }

        $post_id = (int) $ids[0];
        $date    = (string) get_post_meta( $post_id, '_kp_date', true );
        $time    = (string) get_post_meta( $post_id, '_kp_time', true );
        $city    = strtolower( trim( (string) get_post_meta( $post_id, '_kp_city', true ) ) );

        // Defense in depth: even with the legacy key, verify the identifying fields.
        if ( '2026-08-21' !== $date || '15:30' !== $time || 'remagen' !== $city ) { return; }

        $ticket = (string) get_post_meta( $post_id, '_kp_ticket_url', true );
        if ( '' === trim( $ticket ) ) {
            update_post_meta( $post_id, '_kp_ticket_url', 'https://buecherei-remagen.de/?p=4490' );
            update_post_meta( $post_id, '_kp_ticket_source', 'Evangelische Öffentliche Bücherei Remagen – Abschlussveranstaltung Vorlese-Sommer' );
        }

        if ( 'planned' === (string) get_post_meta( $post_id, '_kp_status', true ) ) {
            update_post_meta( $post_id, '_kp_status', 'standard' );
        }

        update_option( self::REMAGEN_FIX_OPTION, gmdate( 'c' ), false );
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
