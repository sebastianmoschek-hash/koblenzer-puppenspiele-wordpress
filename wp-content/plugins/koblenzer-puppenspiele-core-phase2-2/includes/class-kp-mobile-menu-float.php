<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Final mobile navigation geometry.
 *
 * The trigger starts in its natural place directly below the header. As soon as
 * scrolling would move it above that comfortable position, only the round trigger
 * becomes fixed and follows the viewport. This keeps the navigation reachable
 * without pinning it to the top edge and without coupling movement to the Studio's
 * opacity settings.
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
          /* The bar itself must scroll normally. The old sticky bar is what made the
             trigger look permanently pinned to the top after Studio changes. */
          .kp-navigation-bar {
            position: relative !important;
            top: auto !important;
            bottom: auto !important;
            z-index: 9998 !important;
          }

          body.admin-bar .kp-navigation-bar {
            top: auto !important;
          }

          /* Once the natural trigger reaches its floating point, only the trigger
             follows the viewport. Its vertical point is measured from the real
             below-header position and capped at a thumb-friendly 58% of the screen. */
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

          /* When the menu is opened from the floating state the same visible button
             becomes the X at exactly the same screen position. */
          body.kp-menu-floating.kp-menu-open .kp-site-nav .wp-block-navigation__responsive-container-open {
            right: var(--kp-menu-button-right, max(14px, env(safe-area-inset-right))) !important;
            top: var(--kp-menu-button-top, var(--kp-menu-float-top, 58dvh)) !important;
          }

          /* Give the glass menu the vertical room the user asked for. It remains a
             narrow floating panel over the page, but stretches upward/downward so
             the navigation itself does not need an internal scrollbar. */
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            top: max(12px, env(safe-area-inset-top)) !important;
            bottom: max(12px, env(safe-area-inset-bottom)) !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow-x: hidden !important;
            overflow-y: hidden !important;
            display: flex !important;
            align-items: stretch !important;
          }

          body.admin-bar .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          body.admin-bar .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            top: 58px !important;
            bottom: max(12px, env(safe-area-inset-bottom)) !important;
            max-height: none !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-dialog,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-dialog,
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content {
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            display: flex !important;
            align-items: center !important;
            overflow: hidden !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content .wp-block-navigation__container {
            width: 100% !important;
            justify-content: center !important;
          }
        }

        /* Extra-small phone heights still keep all links visible rather than adding
           a second scrolling surface inside the navigation card. */
        @media (max-width: 781px) and (max-height: 540px) {
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            top: max(6px, env(safe-area-inset-top)) !important;
            bottom: max(6px, env(safe-area-inset-bottom)) !important;
            padding: 7px 9px !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item__content {
            padding: .27rem .54rem !important;
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

            /* Measure the button in normal document flow, even when the page was
               reloaded while already scrolled down. */
            body.classList.remove('kp-menu-floating');
            window.requestAnimationFrame(() => {
              const rect = button.getBoundingClientRect();
              anchorY = rect.top + window.scrollY;

              const lowerLimit = Math.max(safeTop(), window.innerHeight * 0.58);
              const viewportBottomLimit = Math.max(safeTop(), window.innerHeight - rect.height - 18);
              const preferredLimit = Math.min(lowerLimit, viewportBottomLimit);

              /* If the natural below-header position is already comfortable, keep
                 exactly that height. If it sits very low, let it rise to 58vh first
                 and then float there. No jump occurs when the floating state begins. */
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

          /* Images/fonts can slightly change the header height after initial paint.
             Measure once immediately and once again after the page has settled. */
          measure();
          window.addEventListener('load', measure, { once: true });
          window.setTimeout(measure, 500);
        })();
        </script>
        <?php
    }
}
