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
          /* Mobile navigation lives directly below the header image. The bar stays
             in the document flow first and then sticks near the top while scrolling. */
          .kp-navigation-bar {
            position: sticky !important;
            top: max(8px, env(safe-area-inset-top)) !important;
            z-index: 9998 !important;
            height: 68px !important;
            min-height: 68px !important;
            padding: 8px 0 !important;
            margin: 0 !important;
            border: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            pointer-events: none;
          }

          body.admin-bar .kp-navigation-bar {
            top: calc(46px + max(8px, env(safe-area-inset-top))) !important;
          }

          .kp-site-nav {
            position: relative !important;
            left: auto !important;
            right: auto !important;
            top: auto !important;
            bottom: auto !important;
            width: 100% !important;
            min-height: 52px !important;
            margin: 0 auto !important;
            display: flex !important;
            align-items: center !important;
            justify-content: flex-end !important;
            transform: none !important;
            z-index: auto !important;
            pointer-events: none;
          }

          .kp-site-nav .wp-block-navigation__responsive-container-open {
            position: relative !important;
            left: auto !important;
            right: auto !important;
            top: auto !important;
            bottom: auto !important;
            width: 52px !important;
            min-width: 52px !important;
            height: 52px !important;
            min-height: 52px !important;
            margin: 0 max(14px, env(safe-area-inset-right)) 0 auto !important;
            padding: 0 !important;
            border-radius: 50% !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 10px 28px rgba(0,0,0,.28) !important;
            opacity: .98;
            transform: scale(1) !important;
            transition: opacity .18s ease, transform .18s ease, box-shadow .18s ease;
            z-index: 10002 !important;
            pointer-events: auto;
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
            transform: scale(.94) !important;
            box-shadow: 0 7px 20px rgba(0,0,0,.2) !important;
          }

          body.kp-menu-scrolling .kp-site-nav .wp-block-navigation__responsive-container-open:focus-visible,
          .kp-site-nav .wp-block-navigation__responsive-container-open:hover,
          .kp-site-nav .wp-block-navigation__responsive-container-open:active {
            opacity: 1;
            transform: scale(1) !important;
          }

          /* The current page remains visible behind a soft scrim. The floating card
             uses almost all available viewport height, while the eight links stay in
             one non-scrolling stack. */
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
            background: rgba(8,7,6,.30) !important;
            color: #fff !important;
            -webkit-backdrop-filter: blur(2px) !important;
            backdrop-filter: blur(2px) !important;
            transform: none !important;
            z-index: 10000 !important;
            animation: kp-menu-scrim-in .18s ease both;
            pointer-events: auto;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            position: fixed !important;
            left: auto !important;
            right: max(78px, calc(env(safe-area-inset-right) + 68px)) !important;
            top: max(12px, env(safe-area-inset-top)) !important;
            bottom: max(12px, env(safe-area-inset-bottom)) !important;
            width: min(72vw, 330px) !important;
            max-width: calc(100vw - 96px) !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 14px 16px !important;
            overflow: hidden !important;
            border: 1px solid rgba(255,255,255,.14) !important;
            border-radius: 22px !important;
            background: rgba(23,17,14,.96) !important;
            box-shadow: 0 18px 48px rgba(0,0,0,.45) !important;
            -webkit-backdrop-filter: blur(14px) !important;
            backdrop-filter: blur(14px) !important;
            transform: none !important;
            animation: kp-menu-panel-in .22s cubic-bezier(.2,.75,.25,1) both;
            display: flex !important;
            align-items: stretch !important;
          }

          body.admin-bar .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          body.admin-bar .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            top: 58px !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-dialog,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-dialog {
            width: 100% !important;
            min-height: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            display: flex !important;
            align-items: center !important;
            overflow: hidden !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content {
            display: flex !important;
            align-items: center !important;
            width: 100% !important;
            min-height: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            justify-content: center !important;
            gap: .14rem !important;
            width: 100% !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item__content {
            padding: .56rem .7rem !important;
            font-size: clamp(1rem, 4.2vw, 1.28rem) !important;
            line-height: 1.15 !important;
            text-align: left !important;
          }

          /* The native close button would create a second control inside the panel.
             Hide it visually and use the original orange trigger as the close target,
             preserving exactly the same screen position for open and close. */
          .kp-site-nav .wp-block-navigation__responsive-container-close {
            position: fixed !important;
            width: 1px !important;
            min-width: 1px !important;
            height: 1px !important;
            min-height: 1px !important;
            padding: 0 !important;
            margin: 0 !important;
            opacity: 0 !important;
            pointer-events: none !important;
            overflow: hidden !important;
          }

          body.kp-menu-open .kp-site-nav .wp-block-navigation__responsive-container-open {
            position: fixed !important;
            left: auto !important;
            right: var(--kp-menu-button-right, max(14px, env(safe-area-inset-right))) !important;
            top: var(--kp-menu-button-top, 72px) !important;
            bottom: auto !important;
            margin: 0 !important;
            transform: none !important;
            z-index: 10003 !important;
          }

          body.kp-menu-open .kp-site-nav .wp-block-navigation__responsive-container-open svg {
            display: none !important;
          }

          body.kp-menu-open .kp-site-nav .wp-block-navigation__responsive-container-open::before,
          body.kp-menu-open .kp-site-nav .wp-block-navigation__responsive-container-open::after {
            content: "" !important;
            display: block !important;
            position: absolute !important;
            left: 50% !important;
            top: 50% !important;
            width: 20px !important;
            height: 2px !important;
            border-radius: 2px !important;
            background: currentColor !important;
          }

          body.kp-menu-open .kp-site-nav .wp-block-navigation__responsive-container-open::before {
            transform: translate(-50%,-50%) rotate(45deg) !important;
          }

          body.kp-menu-open .kp-site-nav .wp-block-navigation__responsive-container-open::after {
            transform: translate(-50%,-50%) rotate(-45deg) !important;
          }

          @keyframes kp-menu-scrim-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes kp-menu-panel-in {
            from { opacity: 0; transform: translateX(18px) scale(.98); }
            to { opacity: 1; transform: translateX(0) scale(1); }
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

        @media (max-width: 781px) and (max-height: 700px) {
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            top: max(8px, env(safe-area-inset-top)) !important;
            bottom: max(8px, env(safe-area-inset-bottom)) !important;
            padding: 9px 12px !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container {
            gap: 0 !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item__content {
            padding: .34rem .58rem !important;
            font-size: .94rem !important;
            line-height: 1.08 !important;
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
          const root = document.documentElement;
          const nav = document.querySelector('.kp-site-nav');
          const openButton = nav?.querySelector('.wp-block-navigation__responsive-container-open');
          const menuContainer = nav?.querySelector('.wp-block-navigation__responsive-container');

          const menuIsOpen = () => Boolean(
            menuContainer?.classList.contains('is-menu-open') ||
            menuContainer?.classList.contains('has-modal-open')
          );

          const syncOpenState = () => body.classList.toggle('kp-menu-open', menuIsOpen());

          const rememberButtonPosition = () => {
            if (!openButton) return;
            const rect = openButton.getBoundingClientRect();
            const right = Math.max(0, window.innerWidth - rect.right);
            root.style.setProperty('--kp-menu-button-top', `${Math.round(rect.top)}px`);
            root.style.setProperty('--kp-menu-button-right', `${Math.round(right)}px`);
          };

          const closeMenu = () => {
            const closeButton = menuContainer?.querySelector('.wp-block-navigation__responsive-container-close');
            if (!closeButton) return false;
            closeButton.click();
            return true;
          };

          if (menuContainer) {
            new MutationObserver(syncOpenState).observe(menuContainer, { attributes: true, attributeFilter: ['class'] });
            syncOpenState();
          }

          /* WordPress' native trigger only opens the responsive navigation. Turn the
             same visible orange button into a proper open/close toggle on mobile. */
          openButton?.addEventListener('click', (event) => {
            if (menuIsOpen()) {
              event.preventDefault();
              event.stopImmediatePropagation();
              closeMenu();
              window.setTimeout(syncOpenState, 0);
              return;
            }
            rememberButtonPosition();
            window.setTimeout(syncOpenState, 0);
          }, { capture: true });

          /* Tapping the dimmed area outside the card closes the menu as expected. */
          menuContainer?.addEventListener('click', (event) => {
            if (!menuIsOpen() || event.target !== menuContainer) return;
            closeMenu();
          });

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
