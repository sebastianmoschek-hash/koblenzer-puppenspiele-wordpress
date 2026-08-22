<?php
/**
 * One-purpose cleanup for obsolete owner undo/redo MU modules.
 *
 * Staging deliberately keeps host-specific MU plugins during deploys, so files
 * removed from the repository can otherwise linger on disk. Delete only the
 * four known superseded history modules, and do it at shutdown so WordPress can
 * finish the current request even if its MU-plugin file list was built earlier.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'shutdown', static function () {
    if ( ! defined( 'WPMU_PLUGIN_DIR' ) ) { return; }
    $obsolete = array(
        'kp-owner-history-toolbar-fix.php',
        'kp-owner-undo-redo.php',
        'z-kp-owner-undo-redo-bootstrap.php',
        'zz-kp-owner-undo-redo-bootstrap.php',
    );
    foreach ( $obsolete as $file ) {
        $path = trailingslashit( WPMU_PLUGIN_DIR ) . $file;
        if ( is_file( $path ) ) {
            @unlink( $path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
        }
    }
}, PHP_INT_MAX );
