<?php
/**
 * Keep navigation typing at exactly one global Word-style Undo step.
 *
 * The generic owner-control history intentionally remains on its last known
 * green path. Navigation has its own specialist before/after history, so a
 * trusted input event can otherwise create both a generic controls marker and
 * a navigation marker. Track the global count at the start of a navigation
 * typing gesture and remove only that just-created generic marker immediately
 * before the specialist marker is registered.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <script id="kp-navigation-undo-dedupe">
    (()=>{
      'use strict';
      let baseline=null,wrapped=null;
      const isNavInput=el=>el instanceof Element&&!!el.closest('[data-kp-navigation-draft]')&&el.matches('input,select,textarea');
      const remember=e=>{
        const history=window.KPWordHistory;
        if(!history?.counts||!isNavInput(e.target))return;
        baseline=Number(history.counts().undo||0);
      };
      document.addEventListener('pointerdown',remember,true);
      document.addEventListener('focusin',e=>{if(baseline===null)remember(e)},true);
      document.addEventListener('focusout',e=>{if(isNavInput(e.target))baseline=null},true);

      function install(){
        const history=window.KPWordHistory;
        if(!history?.push||history.push===wrapped)return;
        const original=history.push.bind(history);
        wrapped=function(kind){
          if(kind==='navigation'&&baseline!==null&&isNavInput(document.activeElement)){
            const now=Number(history.counts?.().undo||0);
            if(now>baseline)history.undo?.();
          }
          const ok=original(kind);
          if(kind==='navigation')baseline=Number(history.counts?.().undo||0);
          return ok;
        };
        history.push=wrapped;
      }
      install();setInterval(install,500);
    })();
    </script>
    <?php
}, 2126 );
