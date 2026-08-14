<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class KP_Final_Polish {
    public static function init() {
        add_action( 'wp_head', array( __CLASS__, 'css' ), 100 );
    }

    public static function css() {
        ?>
        <style id="kp-final-polish">
        @media (max-width: 520px) {
          body { padding-bottom: 76px; }
          .kp-site-nav {
            left: max(12px, env(safe-area-inset-left)) !important;
            right: auto !important;
          }
          .kp-site-nav .wp-block-navigation__responsive-container-open {
            width: 44px !important;
            min-width: 44px !important;
            height: 44px !important;
            min-height: 44px !important;
            padding: 0 !important;
            border-radius: 50% !important;
          }
          .kp-site-nav .wp-block-navigation__responsive-container-open::after { display: none !important; content: none !important; }
          .kp-site-nav .wp-block-navigation__responsive-container-open svg { width: 19px !important; height: 19px !important; }
          .kp-contact-form, .kp-finish-card, .kp-repertoire-card, .kp-termin-card, .kp-referenz-card { max-width: 100%; box-sizing: border-box; }
        }
        </style>
        <?php
    }
}
