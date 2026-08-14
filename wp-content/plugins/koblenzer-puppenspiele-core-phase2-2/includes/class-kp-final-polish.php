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
          .kp-site-nav .wp-block-navigation__responsive-container-open {
            width: 52px !important;
            min-width: 52px !important;
            height: 52px !important;
            min-height: 52px !important;
            padding: 0 !important;
            border-radius: 50% !important;
          }
          .kp-site-nav .wp-block-navigation__responsive-container-open::after { display: none !important; content: none !important; }
          .kp-site-nav .wp-block-navigation__responsive-container-open svg { width: 21px !important; height: 21px !important; }
          .kp-contact-form, .kp-finish-card, .kp-repertoire-card, .kp-termin-card, .kp-referenz-card { max-width: 100%; box-sizing: border-box; }
        }
        </style>
        <?php
    }
}
