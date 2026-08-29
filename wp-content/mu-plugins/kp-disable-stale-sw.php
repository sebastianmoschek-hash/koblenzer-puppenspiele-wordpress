<?php
/**
 * Service Worker Unregister & Pass-Through Override
 *
 * Disables the caching service worker on Staging so WebView and Editors
 * load clean network responses without Response-clone crashes.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    ?>
    <script id="kp-sw-unregister">
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
            for (let registration of registrations) {
                registration.unregister();
            }
        }).catch(function(){});
    }
    </script>
    <?php
}, 1 );

if ( isset( $_GET['kp_webapp_sw'] ) ) {
    nocache_headers();
    header( 'Content-Type: application/javascript; charset=utf-8' );
    header( 'Service-Worker-Allowed: /' );
    ?>
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', () => {});
    <?php
    exit;
}
