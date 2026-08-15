<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Final visual layer for the mobile WordPress navigation.
 *
 * KP_Final_Polish owns the interaction/state handling. This layer keeps the
 * navigation visually compact in width, but deliberately uses nearly all of the
 * available viewport height so every destination remains visible without an
 * internal scroll area.
 */
final class KP_Mobile_Menu_Glass {
    public static function init() {
        add_action( 'wp_head', array( __CLASS__, 'css' ), 120 );
    }

    public static function css() {
        ?>
        <style id="kp-mobile-menu-glass">
        @media (max-width: 781px) {
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open {
            background: rgba(8,7,6,.30) !important;
            -webkit-backdrop-filter: blur(2px) !important;
            backdrop-filter: blur(2px) !important;
          }

          /* Narrow floating glass card, almost full viewport height. */
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            box-sizing: border-box !important;
            position: fixed !important;
            left: auto !important;
            right: max(78px, calc(env(safe-area-inset-right) + 68px)) !important;
            top: max(12px, env(safe-area-inset-top)) !important;
            bottom: max(12px, env(safe-area-inset-bottom)) !important;
            width: min(74vw, 320px) !important;
            max-width: calc(100vw - 96px) !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 12px 11px !important;
            overflow: hidden !important;
            overscroll-behavior: none !important;
            border: 1px solid rgba(240,122,34,.28) !important;
            border-radius: 21px !important;
            background:
              linear-gradient(155deg,
                rgba(52,34,25,.84) 0%,
                rgba(25,17,13,.78) 52%,
                rgba(14,10,8,.84) 100%) !important;
            box-shadow:
              0 20px 54px rgba(0,0,0,.42),
              0 5px 16px rgba(0,0,0,.18),
              inset 0 1px 0 rgba(255,255,255,.11) !important;
            -webkit-backdrop-filter: blur(22px) saturate(1.18) !important;
            backdrop-filter: blur(22px) saturate(1.18) !important;
            display: flex !important;
            align-items: stretch !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close::after,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close::after {
            content: "" !important;
            position: absolute !important;
            top: 0 !important;
            left: 20px !important;
            right: 20px !important;
            height: 1px !important;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,.26), transparent) !important;
            pointer-events: none !important;
          }

          body.admin-bar .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          body.admin-bar .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            top: 58px !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-dialog,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-dialog,
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content {
            box-sizing: border-box !important;
            width: 100% !important;
            min-height: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
            overflow: hidden !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container {
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            justify-content: center !important;
            gap: .12rem !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item {
            box-sizing: border-box !important;
            width: 100% !important;
            margin: 0 !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item__content {
            box-sizing: border-box !important;
            display: block !important;
            width: 100% !important;
            padding: .56rem .7rem !important;
            border: 1px solid transparent !important;
            border-radius: 11px !important;
            background: transparent !important;
            color: rgba(255,255,255,.96) !important;
            font-size: clamp(1rem, 4.15vw, 1.22rem) !important;
            font-weight: 650 !important;
            line-height: 1.12 !important;
            text-align: left !important;
            text-decoration: none !important;
            text-shadow: 0 1px 8px rgba(0,0,0,.28);
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item.current-menu-item:not(.kp-nav-booking) .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item.current-menu-item:not(.kp-nav-booking) .wp-block-navigation-item__content {
            background: rgba(240,122,34,.105) !important;
            border-color: rgba(240,122,34,.14) !important;
            box-shadow: inset 3px 0 0 #f07a22 !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item.kp-nav-booking .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item.kp-nav-booking .wp-block-navigation-item__content {
            margin: .14rem 0 !important;
            border-color: rgba(255,255,255,.16) !important;
            border-radius: 12px !important;
            background: linear-gradient(135deg, #f58326, #e66d16) !important;
            color: #fff !important;
            box-shadow: 0 8px 20px rgba(240,122,34,.22), inset 0 1px 0 rgba(255,255,255,.18) !important;
          }
        }

        /* Short displays stay non-scrolling: tighten the eight destinations instead. */
        @media (max-width: 781px) and (max-height: 700px) {
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            top: max(8px, env(safe-area-inset-top)) !important;
            bottom: max(8px, env(safe-area-inset-bottom)) !important;
            padding: 8px 9px !important;
            border-radius: 18px !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container {
            gap: 0 !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item__content {
            padding: .36rem .56rem !important;
            font-size: .92rem !important;
            line-height: 1.06 !important;
          }
        }
        </style>
        <?php
    }
}
