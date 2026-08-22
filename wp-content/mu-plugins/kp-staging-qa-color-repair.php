<?php
/**
 * Staging-only safety repair for leaked destructive E2E mutations.
 *
 * Historic persistence tests temporarily changed every Website-Studio control,
 * including colours, header visibility, fonts, text, sizes and menu position.
 * If a failed/racing run leaked that state, restore the complete Studio +
 * responsive-size options from the newest clean 48-hour snapshot. Content,
 * editor code and all unrelated options remain untouched.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_staging_qa_poison_color( $value ) {
    if ( ! is_string( $value ) ) { return false; }
    $value = strtolower( trim( $value ) );
    return '#112233' === $value || '#223344' === $value;
}

function kp_staging_qa_has_marker( $value ) {
    if ( is_array( $value ) ) {
        foreach ( $value as $child ) {
            if ( kp_staging_qa_has_marker( $child ) ) { return true; }
        }
        return false;
    }
    if ( kp_staging_qa_poison_color( $value ) ) { return true; }
    if ( is_string( $value ) && preg_match( '/(?:\sQA|Q)$/u', trim( $value ) ) ) { return true; }
    return false;
}

function kp_staging_qa_snapshot_option( $item, $name, &$exists = null ) {
    $exists = false;
    if ( ! is_array( $item ) || ! isset( $item['state']['options'][ $name ] ) ) { return null; }
    $entry = $item['state']['options'][ $name ];
    if ( ! is_array( $entry ) || empty( $entry['exists'] ) ) { return null; }
    $exists = true;
    return $entry['value'] ?? null;
}

add_action( 'init', static function () {
    $host = strtolower( (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST ) );
    if ( 'neu.koblenzer-puppenspiele.de' !== $host ) { return; }
    if ( get_option( 'kp_staging_qa_full_repair_done_v1', false ) ) { return; }

    $studio = get_option( 'kp_website_studio', array() );
    $prior_partial = get_option( 'kp_staging_qa_color_repair_last_v1', false );
    $contaminated = is_array( $studio ) && kp_staging_qa_has_marker( $studio );

    // An older queued build may already have removed only the poison colours.
    // Its marker still proves that this Studio state came from the destructive QA run.
    if ( ! $contaminated && ! $prior_partial ) { return; }

    $history = get_option( 'kp_owner_history_v1', array() );
    if ( ! is_array( $history ) || ! $history ) { return; }

    $clean_studio = null;
    $clean_sizes  = null;
    foreach ( array_reverse( $history ) as $item ) {
        $studio_exists = false;
        $candidate_studio = kp_staging_qa_snapshot_option( $item, 'kp_website_studio', $studio_exists );
        if ( ! $studio_exists || ! is_array( $candidate_studio ) || kp_staging_qa_has_marker( $candidate_studio ) ) { continue; }

        $sizes_exists = false;
        $candidate_sizes = kp_staging_qa_snapshot_option( $item, 'kp_responsive_sizes', $sizes_exists );
        if ( $sizes_exists && ! is_array( $candidate_sizes ) ) { continue; }

        $clean_studio = $candidate_studio;
        $clean_sizes  = $sizes_exists ? $candidate_sizes : null;
        break;
    }

    if ( ! is_array( $clean_studio ) ) { return; }

    update_option( 'kp_website_studio', $clean_studio, false );
    if ( is_array( $clean_sizes ) ) {
        update_option( 'kp_responsive_sizes', $clean_sizes, false );
    }
    update_option( 'kp_staging_qa_full_repair_done_v1', array(
        'ts'              => time(),
        'header_visible'  => isset( $clean_studio['show_header_image'] ) ? (int) $clean_studio['show_header_image'] : null,
        'header_image_id' => isset( $clean_studio['header_image_id'] ) ? (int) $clean_studio['header_image_id'] : null,
    ), false );

    if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
}, 1 );
