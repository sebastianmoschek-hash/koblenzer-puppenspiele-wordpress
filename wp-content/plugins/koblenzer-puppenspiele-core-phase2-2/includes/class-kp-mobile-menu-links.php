<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Interaction safety layer for the mobile navigation.
 *
 * The visual mobile menu uses a full-screen WordPress modal shell plus a floating
 * glass panel. This late layer makes the actual navigation links the topmost
 * interactive targets and guarantees that a normal tap follows the selected URL.
 */
final class KP_Mobile_Menu_Links {
    public static function init() {
        add_action( 'wp_head', array( __CLASS__, 'css' ), 140 );
        add_action( 'wp_footer', array( __CLASS__, 'script' ), 140 );
    }

    public static function css() {
        ?>
        <style id="kp-mobile-menu-links">
        @media (max-width: 781px) {
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close {
            z-index: 10001 !important;
            pointer-events: auto !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-dialog,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-dialog,
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content,
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__container,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__container,
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item,
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation-item__content {
            pointer-events: auto !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-container-content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-container-content {
            position: relative !important;
            z-index: 2 !important;
          }

          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open a.wp-block-navigation-item__content,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open a.wp-block-navigation-item__content {
            position: relative !important;
            z-index: 3 !important;
            cursor: pointer !important;
            touch-action: manipulation !important;
            -webkit-tap-highlight-color: rgba(240,122,34,.16);
          }
        }
        </style>
        <?php
    }

    public static function script() {
        ?>
        <script id="kp-mobile-menu-links-script">
        (() => {
          if (!window.matchMedia('(max-width: 781px)').matches) return;

          const nav = document.querySelector('.kp-site-nav');
          if (!nav) return;

          const links = nav.querySelectorAll('a.wp-block-navigation-item__content[href]');
          links.forEach((link) => {
            link.addEventListener('click', (event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              if (link.hasAttribute('download') || link.target === '_blank') return;

              const href = link.href;
              if (!href || href.startsWith('javascript:')) return;

              /* Capture the tap before the responsive-navigation overlay can treat
                 it as an overlay interaction. Following the URL explicitly also
                 makes the behavior reliable on touch browsers. */
              event.preventDefault();
              event.stopPropagation();
              window.location.assign(href);
            }, { capture: true });
          });
        })();
        </script>
        <?php
    }
}
