<?php
/**
 * Staging-only safety repair for leaked E2E colour mutations.
 *
 * The destructive persistence test historically used #112233 / #223344 for
 * colour controls. If a failed/racing pipeline leaves one of those exact QA
 * values behind, restore only the affected colour path from the newest clean
 * 48-hour owner-history snapshot. No other design value is touched.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_staging_qa_poison_color( $value ) {
    if ( ! is_string( $value ) ) { return false; }
    $value = strtolower( trim( $value ) );
    return '#112233' === $value || '#223344' === $value;
}

function kp_staging_qa_collect_poison_paths( $value, $path = array(), &$out = array() ) {
    if ( is_array( $value ) ) {
        foreach ( $value as $key => $child ) {
            kp_staging_qa_collect_poison_paths( $child, array_merge( $path, array( $key ) ), $out );
        }
        return;
    }
    if ( kp_staging_qa_poison_color( $value ) ) { $out[] = $path; }
}

function kp_staging_qa_path_get( $value, $path, &$exists = null ) {
    $exists = true;
    foreach ( $path as $key ) {
        if ( ! is_array( $value ) || ! array_key_exists( $key, $value ) ) { $exists = false; return null; }
        $value = $value[ $key ];
    }
    return $value;
}

function kp_staging_qa_path_set( &$value, $path, $replacement ) {
    $ref =& $value;
    foreach ( $path as $key ) {
        if ( ! is_array( $ref ) ) { $ref = array(); }
        if ( ! array_key_exists( $key, $ref ) ) { $ref[ $key ] = array(); }
        $ref =& $ref[ $key ];
    }
    $ref = $replacement;
}

add_action( 'init', static function () {
    $host = strtolower( (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST ) );
    if ( 'neu.koblenzer-puppenspiele.de' !== $host ) { return; }

    $studio = get_option( 'kp_website_studio', array() );
    if ( ! is_array( $studio ) ) { return; }

    $paths = array();
    kp_staging_qa_collect_poison_paths( $studio, array(), $paths );
    if ( ! $paths ) { return; }

    $history = get_option( 'kp_owner_history_v1', array() );
    if ( ! is_array( $history ) || ! $history ) { return; }

    $changed = array();
    foreach ( $paths as $path ) {
        $replacement_found = false;
        $replacement = null;
        foreach ( array_reverse( $history ) as $item ) {
            $candidate = $item['state']['options']['kp_website_studio']['value'] ?? null;
            if ( ! is_array( $candidate ) ) { continue; }
            $exists = false;
            $value = kp_staging_qa_path_get( $candidate, $path, $exists );
            if ( ! $exists || kp_staging_qa_poison_color( $value ) ) { continue; }
            $replacement = $value;
            $replacement_found = true;
            break;
        }
        if ( ! $replacement_found ) { continue; }
        kp_staging_qa_path_set( $studio, $path, $replacement );
        $changed[] = implode( '.', array_map( 'strval', $path ) );
    }

    if ( $changed ) {
        update_option( 'kp_website_studio', $studio, false );
        update_option( 'kp_staging_qa_color_repair_last_v1', array(
            'ts'    => time(),
            'paths' => $changed,
        ), false );
        if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
    }
}, 1 );
