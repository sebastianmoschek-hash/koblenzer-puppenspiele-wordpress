<?php
/**
 * Keep the floating AI pill clear of the owner tools on phone/tablet editors.
 *
 * The AI trigger has a deliberately high z-index. At the 820px tablet QA
 * viewport it otherwise sits almost exactly on top of the Werkzeuge button
 * before the owner sheet can even open. The existing mobile polish only moved
 * it through 782px, while the editor/tablet contract intentionally runs the
 * touch navigation through 900px.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <style id="kp-editor-overlay-spacing-tablet">
      @media (max-width:900px) {
        body.kp-fe2-editing .kp-ai-trigger {
          right:12px!important;
          bottom:max(148px,calc(env(safe-area-inset-bottom) + 138px))!important;
        }
      }
      body.kp-oa-open .kp-ai-trigger { display:none!important; }
    </style>
    <?php
}, 4100 );
