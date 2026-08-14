<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class KP_Final_Polish {
    public static function init() {
        add_action( 'wp_head', array( __CLASS__, 'css' ), 100 );
        add_action( 'wp_footer', array( __CLASS__, 'script' ), 100 );
    }

    public static function css() {
        ?>
        <style id="kp-final-polish">
        @media (max-width: 520px) {
          .kp-site-nav {
            position: fixed !important;
            left: auto !important;
            right: max(14px, env(safe-area-inset-right)) !important;
            top: 58% !important;
            bottom: auto !important;
            width: auto !important;
            transform: translateY(-50%) !important;
            z-index: 9999 !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container-open,
          .kp-site-nav .wp-block-navigation__responsive-container-close {
            width: 52px !important;
            min-width: 52px !important;
            height: 52px !important;
            min-height: 52px !important;
            padding: 0 !important;
            border-radius: 50% !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 10px 28px rgba(0,0,0,.28) !important;
            opacity: .98;
            transition: opacity .18s ease, transform .18s ease, box-shadow .18s ease;
          }

          .kp-site-nav .wp-block-navigation__responsive-container-open::after {
            display: none !important;
            content: none !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container-open svg,
          .kp-site-nav .wp-block-navigation__responsive-container-close svg {
            width: 21px !important;
            height: 21px !important;
          }

          body.kp-menu-scrolling .kp-site-nav .wp-block-navigation__responsive-container-open {
            opacity: .72;
            transform: scale(.94);
            box-shadow: 0 7px 20px rgba(0,0,0,.2) !important;
          }

          body.kp-menu-scrolling .kp-site-nav .wp-block-navigation__responsive-container-open:focus-visible,
          .kp-site-nav .wp-block-navigation__responsive-container-open:hover,
          .kp-site-nav .wp-block-navigation__responsive-container-open:active {
            opacity: 1;
            transform: scale(1);
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-close {
            position: fixed !important;
            right: max(14px, env(safe-area-inset-right)) !important;
            top: 58% !important;
            transform: translateY(-50%) !important;
            z-index: 10001 !important;
          }

          .kp-contact-form,
          .kp-finish-card,
          .kp-repertoire-card,
          .kp-termin-card,
          .kp-referenz-card {
            max-width: 100%;
            box-sizing: border-box;
          }
        }

        @media (max-width: 520px) and (prefers-reduced-motion: reduce) {
          .kp-site-nav .wp-block-navigation__responsive-container-open,
          .kp-site-nav .wp-block-navigation__responsive-container-close {
            transition: none !important;
          }
        }
        </style>
        <?php
    }

    public static function script() {
        ?>
        <script id="kp-mobile-menu-polish">
        (() => {
          if (!window.matchMedia('(max-width: 520px)').matches) return;
          let timer = null;
          const body = document.body;
          const settle = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => body.classList.remove('kp-menu-scrolling'), 650);
          };
          window.addEventListener('scroll', () => {
            body.classList.add('kp-menu-scrolling');
            settle();
          }, { passive: true });
        })();
        </script>
        <?php
    }
}
