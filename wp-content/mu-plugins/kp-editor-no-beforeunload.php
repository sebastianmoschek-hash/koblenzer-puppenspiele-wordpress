<?php
/**
 * Owner editor UX rule: never show a browser-level "reload/leave page?" prompt.
 * Save, Undo/Redo and the explicit X/Beenden controls own that decision.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_head', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    if ( ! isset( $_GET['kp_edit'] ) || '1' !== sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) ) ) { return; }
    ?>
    <script id="kp-editor-no-beforeunload">
    (() => {
      'use strict';
      const nativeAdd = window.addEventListener;
      window.addEventListener = function(type, listener, options) {
        if (String(type || '').toLowerCase() === 'beforeunload') return;
        return nativeAdd.call(window, type, listener, options);
      };
      try {
        window.onbeforeunload = null;
        Object.defineProperty(window, 'onbeforeunload', {
          configurable: true,
          enumerable: true,
          get: () => null,
          set: () => true
        });
      } catch (_) {
        window.onbeforeunload = null;
      }
    })();
    </script>
    <?php
}, -9999 );
