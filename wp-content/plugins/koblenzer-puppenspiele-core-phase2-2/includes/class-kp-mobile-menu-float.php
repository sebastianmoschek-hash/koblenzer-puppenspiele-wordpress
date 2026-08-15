<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Final mobile navigation geometry.
 *
 * The trigger starts directly below the header and becomes a floating control while
 * scrolling. The menu itself stays a compact content-driven glass card; it must not
 * stretch to the full viewport just because the trigger is floating.
 */
final class KP_Mobile_Menu_Float {
    public static function init() {
        add_action( 'wp_head', array( __CLASS__, 'css' ), 260 );
        add_action( 'wp_footer', array( __CLASS__, 'script' ), 260 );
    }

    public static function css() {
        ?>
        <style id="kp-mobile-menu-float">
        @media (max-width: 781px) {
          /* The bar scrolls normally; only the round trigger floats. */
          .kp-navigation-bar {
            position: relative !important;
            top: auto !important;
            bottom: auto !important;
            z-index: 9998 !important;
          }

          body.admin-bar .kp-navigation-bar {
            top: auto !important;
          }

          body.kp-menu-floating .kp-site-nav .wp-block-navigation__responsive-container-open {
            position: fixed !important;
            left: auto !important;
            right: max(14px, env(safe-area-inset-right)) !important;
            top: var(--kp-menu-float-top, 58dvh) !important;
            bottom: auto !important;
            margin: 0 !important;
            z-index: 10003 !important;
            pointer-events: auto !important;
          }

          /* Scrolling may soften opacity, but geometry must remain unchanged. */
          body.kp-menu-scrolling .kp-site-nav .wp-block-navigation__responsive-container-open,
          body.kp-menu-scrolling .kp-site-nav .wp-block-navigation__responsive-container-open:focus-visible,
          body.kp-menu-scrolling .kp-site-nav .wp-block-navigation__responsive-container-open:hover,
          body.kp-menu-scrolling .kp-site-nav .wp-block-navigation__responsive-container-open:active {
            transform: scale(1) !important;
          }

          body.kp-menu-floating.kp-menu-open .kp-site-nav .wp-block-navigation__responsive-container-open {
            right: var(--kp-menu-button-right, max(14px, env(safe-area-inset-right))) !important;
            top: var(--kp-menu-button-top, var(--kp-menu-float-top, 58dvh)) !important;
          }

          /* Compact menu card: it follows the links' real height and sits around the
             visual centre of the phone. The Studio's width, opacity, blur and colour
             controls remain untouched. A scrollbar is only a last-resort fallback if
             somebody later adds more links than can physically fit on the screen. */
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            top: calc(50dvh + var(--kp-studio-menu-offset-y, 0px)) !important;
            bottom: auto !important;
            height: fit-content !important;
            min-height: 0 !important;
            max-height: calc(100dvh - 24px) !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            display: block !important;
            align-items: initial !important;
            transform: translateY(-50%) !important;
            animation: none !important;
          }

          body.admin-bar .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          body.admin-bar .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            top: calc(50dvh + 23px + var(--kp-studio-menu-offset-y, 0px)) !important;
            bottom: auto !important;
            max-height: calc(100dvh - 70px) !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-dialog,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-dialog,
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content {
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            display: block !important;
            align-items: initial !important;
            overflow: visible !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container {
            width: 100% !important;
            justify-content: flex-start !important;
          }
        }

        /* Short phones keep the same compact card, but tighten the menu items enough
           to keep today's complete navigation visible without internal scrolling. */
        @media (max-width: 781px) and (max-height: 700px) {
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            padding: 8px 9px 9px !important;
            border-radius: 18px !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container {
            gap: .04rem !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item__content {
            padding: .40rem .58rem !important;
            font-size: .94rem !important;
            line-height: 1.08 !important;
          }
        }

        @media (max-width: 781px) and (max-height: 540px) {
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            padding: 6px 8px 7px !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item__content {
            padding: .26rem .52rem !important;
            font-size: .86rem !important;
            line-height: 1.03 !important;
          }
        }
        </style>
        <?php
    }

    public static function script() {
        ?>
        <script id="kp-mobile-menu-float-js">
        (() => {
          const media = window.matchMedia('(max-width: 781px)');
          if (!media.matches) return;

          const body = document.body;
          const root = document.documentElement;
          const bar = document.querySelector('.kp-navigation-bar');
          const nav = document.querySelector('.kp-site-nav');
          const button = nav?.querySelector('.wp-block-navigation__responsive-container-open');
          const menu = nav?.querySelector('.wp-block-navigation__responsive-container');
          if (!bar || !button) return;

          let anchorY = 0;
          let floatTop = 0;
          let scrollFrame = 0;
          let resizeTimer = 0;

          const menuIsOpen = () => Boolean(
            menu?.classList.contains('is-menu-open') ||
            menu?.classList.contains('has-modal-open')
          );

          const safeTop = () => body.classList.contains('admin-bar') ? 64 : 14;

          const applyFloatingState = () => {
            scrollFrame = 0;
            const threshold = Math.max(0, anchorY - floatTop);
            const shouldFloat = window.scrollY > threshold + 1;
            body.classList.toggle('kp-menu-floating', shouldFloat);
          };

          const measure = () => {
            if (menuIsOpen()) return;

            body.classList.remove('kp-menu-floating');
            window.requestAnimationFrame(() => {
              const rect = button.getBoundingClientRect();
              anchorY = rect.top + window.scrollY;

              const lowerLimit = Math.max(safeTop(), window.innerHeight * 0.58);
              const viewportBottomLimit = Math.max(safeTop(), window.innerHeight - rect.height - 18);
              const preferredLimit = Math.min(lowerLimit, viewportBottomLimit);

              floatTop = Math.max(safeTop(), Math.min(anchorY, preferredLimit));
              root.style.setProperty('--kp-menu-float-top', `${Math.round(floatTop)}px`);
              applyFloatingState();
            });
          };

          const onScroll = () => {
            if (scrollFrame) return;
            scrollFrame = window.requestAnimationFrame(applyFloatingState);
          };

          const onResize = () => {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(measure, 120);
          };

          window.addEventListener('scroll', onScroll, { passive: true });
          window.addEventListener('resize', onResize, { passive: true });
          window.addEventListener('orientationchange', onResize, { passive: true });

          measure();
          window.addEventListener('load', measure, { once: true });
          window.setTimeout(measure, 500);
        })();
        </script>
        <?php
    }
}
