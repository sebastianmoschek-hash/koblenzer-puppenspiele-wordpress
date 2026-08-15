<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Final visual layer for the mobile WordPress navigation.
 *
 * KP_Final_Polish owns the interaction/state handling. This class deliberately
 * runs later and only changes the visual geometry so the menu behaves like a
 * compact glass card whose height follows the actual navigation items.
 */
final class KP_Mobile_Menu_Glass {
    public static function init() {
        add_action( 'wp_head', array( __CLASS__, 'css' ), 120 );
    }

    public static function css() {
        ?>
        <style id="kp-mobile-menu-glass">
        @media (max-width: 781px) {
          /* Keep WordPress' modal layer for focus handling/outside-click closing,
             but make it visually disappear. Only the glass card is perceived. */
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open {
            background: rgba(8,7,6,.035) !important;
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
          }

          /* Compact glass card. Its height is content-driven; new or removed
             WordPress navigation items automatically grow/shrink the card. */
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            box-sizing: border-box !important;
            position: fixed !important;
            left: auto !important;
            right: max(78px, calc(env(safe-area-inset-right) + 68px)) !important;
            top: max(12px, calc(var(--kp-menu-button-top, 72px) - 8px)) !important;
            bottom: auto !important;
            width: min(74vw, 320px) !important;
            max-width: calc(100vw - 96px) !important;
            height: fit-content !important;
            min-height: 0 !important;
            max-height: calc(100dvh - var(--kp-menu-button-top, 72px) - 4px) !important;
            margin: 0 !important;
            padding: 10px 11px 12px !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            overscroll-behavior: contain;
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
            display: block !important;
            align-items: initial !important;
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
            top: max(58px, calc(var(--kp-menu-button-top, 72px) - 8px)) !important;
            max-height: calc(100dvh - 70px) !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-dialog,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-dialog {
            box-sizing: border-box !important;
            width: 100% !important;
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
            overflow: visible !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content {
            box-sizing: border-box !important;
            display: block !important;
            width: 100% !important;
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container {
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            justify-content: flex-start !important;
            gap: .13rem !important;
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
            transition: background-color .16s ease, border-color .16s ease, transform .16s ease, box-shadow .16s ease !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item:not(.kp-nav-booking) .wp-block-navigation-item__content:hover,
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item:not(.kp-nav-booking) .wp-block-navigation-item__content:focus-visible,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item:not(.kp-nav-booking) .wp-block-navigation-item__content:hover,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item:not(.kp-nav-booking) .wp-block-navigation-item__content:focus-visible {
            background: rgba(255,255,255,.075) !important;
            border-color: rgba(255,255,255,.10) !important;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.04) !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item.current-menu-item:not(.kp-nav-booking) .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item.current-menu-item:not(.kp-nav-booking) .wp-block-navigation-item__content {
            background: rgba(240,122,34,.105) !important;
            border-color: rgba(240,122,34,.14) !important;
            box-shadow: inset 3px 0 0 #f07a22 !important;
          }

          /* Booking remains the clear orange action, but with the same rounded
             premium-card language instead of a hard rectangular stripe. */
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item.kp-nav-booking .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item.kp-nav-booking .wp-block-navigation-item__content {
            margin: .14rem 0 !important;
            border-color: rgba(255,255,255,.16) !important;
            border-radius: 12px !important;
            background: linear-gradient(135deg, #f58326, #e66d16) !important;
            color: #fff !important;
            box-shadow: 0 8px 20px rgba(240,122,34,.22), inset 0 1px 0 rgba(255,255,255,.18) !important;
            text-shadow: 0 1px 4px rgba(75,29,0,.22) !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item.kp-nav-booking .wp-block-navigation-item__content:hover,
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item.kp-nav-booking .wp-block-navigation-item__content:focus-visible,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item.kp-nav-booking .wp-block-navigation-item__content:hover,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item.kp-nav-booking .wp-block-navigation-item__content:focus-visible {
            transform: translateY(-1px) !important;
            background: linear-gradient(135deg, #ff8c31, #eb7219) !important;
            box-shadow: 0 10px 24px rgba(240,122,34,.28), inset 0 1px 0 rgba(255,255,255,.2) !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close::-webkit-scrollbar,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close::-webkit-scrollbar {
            width: 5px;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close::-webkit-scrollbar-thumb,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close::-webkit-scrollbar-thumb {
            border-radius: 999px;
            background: rgba(240,122,34,.34);
          }
        }

        @media (max-width: 781px) and (max-height: 700px) {
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            top: max(8px, calc(var(--kp-menu-button-top, 64px) - 6px)) !important;
            bottom: auto !important;
            max-height: calc(100dvh - var(--kp-menu-button-top, 64px) - 2px) !important;
            padding: 8px 9px 9px !important;
            border-radius: 18px !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item__content {
            padding: .40rem .58rem !important;
            font-size: .94rem !important;
            line-height: 1.08 !important;
          }
        }

        @media (max-width: 781px) and (prefers-reduced-motion: reduce) {
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item__content {
            transition: none !important;
          }
        }
        </style>
        <?php
    }
}
