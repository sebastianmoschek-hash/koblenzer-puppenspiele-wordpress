<?php
/**
 * Bootstrap for the owner undo/redo MU module.
 * Kept separate so the feature is always activated even if older website
 * versions restore WordPress options. MU-plugin code itself is never part of
 * the website version archive.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

if ( class_exists( 'KP_Owner_Undo_Redo' ) ) {
    KP_Owner_Undo_Redo::init();
}
