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
        @media (max-width: 781px) {
          /* Keep the navigation wrapper untransformed so WordPress can position
             its responsive layer against the viewport. Only the trigger floats. */
          .kp-site-nav {
            position: static !important;
            left: auto !important;
            right: auto !important;
            top: auto !important;
            bottom: auto !important;
            width: 100% !important;
            min-height: 0 !important;
            transform: none !important;
            z-index: auto !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container-open {
            position: fixed !important;
            left: auto !important;
            right: max(14px, env(safe-area-inset-right)) !important;
            top: 58dvh !important;
            bottom: auto !important;
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
            transform: translateY(-50%) scale(1) !important;
            transition: opacity .18s ease, transform .18s ease, box-shadow .18s ease;
            z-index: 10002 !important;
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
            transform: translateY(-50%) scale(.94) !important;
            box-shadow: 0 7px 20px rgba(0,0,0,.2) !important;
          }

          body.kp-menu-scrolling .kp-site-nav .wp-block-navigation__responsive-container-open:focus-visible,
          .kp-site-nav .wp-block-navigation__responsive-container-open:hover,
          .kp-site-nav .wp-block-navigation__responsive-container-open:active {
            opacity: 1;
            transform: translateY(-50%) scale(1) !important;
          }

          /* The page remains visible: the WordPress responsive layer is now only
             a soft scrim; the actual navigation floats in a compact card. */
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            min-width: 100vw !important;
            height: 100dvh !important;
            min-height: 100dvh !important;
            display: block !important;
            padding: 0 !important;
            background: rgba(8,7,6,.34) !important;
            color: #fff !important;
            -webkit-backdrop-filter: blur(2px) !important;
            backdrop-filter: blur(2px) !important;
            transform: none !important;
            z-index: 10000 !important;
            animation: kp-menu-scrim-in .18s ease both;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            position: fixed !important;
            left: auto !important;
            right: max(78px, calc(env(safe-area-inset-right) + 68px)) !important;
            top: 58dvh !important;
            bottom: auto !important;
            width: min(72vw, 320px) !important;
            max-width: calc(100vw - 96px) !important;
            height: auto !important;
            max-height: min(78dvh, 680px) !important;
            margin: 0 !important;
            padding: 16px !important;
            overflow: auto !important;
            border: 1px solid rgba(255,255,255,.14) !important;
            border-radius: 22px !important;
            background: rgba(23,17,14,.96) !important;
            box-shadow: 0 18px 48px rgba(0,0,0,.45) !important;
            -webkit-backdrop-filter: blur(14px) !important;
            backdrop-filter: blur(14px) !important;
            transform: translateY(-50%) !important;
            animation: kp-menu-panel-in .22s cubic-bezier(.2,.75,.25,1) both;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-dialog,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-dialog {
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            display: block !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content {
            display: block !important;
            min-height: 0 !important;
            padding: 0 !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: .12rem !important;
            width: 100% !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item__content {
            padding: .62rem .75rem !important;
            font-size: clamp(1.08rem, 4.5vw, 1.35rem) !important;
            text-align: left !important;
          }

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
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-close {
            position: fixed !important;
            left: auto !important;
            right: max(14px, env(safe-area-inset-right)) !important;
            top: 58dvh !important;
            bottom: auto !important;
            transform: translateY(-50%) !important;
            z-index: 10003 !important;
          }

          @keyframes kp-menu-scrim-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes kp-menu-panel-in {
            from { opacity: 0; transform: translate(18px,-50%) scale(.97); }
            to { opacity: 1; transform: translate(0,-50%) scale(1); }
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

        @media (max-width: 781px) and (prefers-reduced-motion: reduce) {
          .kp-site-nav .wp-block-navigation__responsive-container-open,
          .kp-site-nav .wp-block-navigation__responsive-container-close,
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open,
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            transition: none !important;
            animation: none !important;
          }
        }
        </style>
        <?php
    }

    public static function script() {
        ?>
        <script id="kp-mobile-menu-polish">
        (() => {
          if (!window.matchMedia('(max-width: 781px)').matches) return;
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
