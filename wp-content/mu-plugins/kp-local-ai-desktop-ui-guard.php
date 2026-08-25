<?php
/**
 * Keep the laptop-only Gemma helper out of touch/tablet layouts and below
 * owner editor sheets. The helper may be available to editors, but it must
 * never cover Save/Reset or suppress the normal mobile AI controls.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() ) { return; }
    ?>
    <style id="kp-local-ai-desktop-ui-guard">
      /* Owner sheets and their sticky Save/Reset row must always win the stack. */
      .kp-local-ai-launch{z-index:100104!important}
      .kp-local-ai-panel{z-index:100103!important}

      /* The loopback Gemma helper is deliberately laptop/desktop-only. */
      @media(max-width:1024px){
        .kp-local-ai-launch,.kp-local-ai-panel{display:none!important}
      }
    </style>
    <script id="kp-local-ai-desktop-viewport-guard">
    (()=>{
      'use strict';
      const desktop=window.matchMedia?.('(min-width:1025px)')?.matches===true;
      if(desktop)return;
      document.documentElement.classList.remove('kp-local-desktop-ai');
      document.querySelector('.kp-local-ai-panel')?.classList.remove('is-open');
      document.querySelector('.kp-local-ai-launch')?.setAttribute('aria-expanded','false');
    })();
    </script>
    <?php
}, 2330 );
