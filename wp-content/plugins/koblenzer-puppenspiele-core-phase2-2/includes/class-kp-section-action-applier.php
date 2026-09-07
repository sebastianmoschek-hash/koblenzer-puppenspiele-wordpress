<?php
/**
 * Section action applier for the KP frontend editor.
 *
 * Owns validation, idempotency and persistence orchestration for native
 * Gutenberg section actions. Block transformation helpers remain behind the
 * public section-action facade of KP_Frontend_Editor_V2 for this extraction.
 *
 * @package Koblenzer_Puppenspiele_Core
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class KP_Section_Action_Applier {

    /**
     * Apply queued section actions to a saved WordPress post.
     *
     * @param array       $page          Sanitized page payload, by reference.
     * @param string      $page_key      WordPress page key (post-N).
     * @param array|null  $expected_post Filled with the serialized post update.
     * @return int Number of newly created copies.
     * @throws RuntimeException When validation or persistence fails.
     */
    public static function apply( &$page, $page_key, &$expected_post = null ) {
        if ( ! empty( $page['duplicates'] ) ) {
            throw new RuntimeException( 'Vorhandene Metadatenkopien müssen vor dem Speichern geprüft und verlustfrei migriert werden.' );
        }

        $actions = isset( $page['section_actions'] ) && is_array( $page['section_actions'] ) ? $page['section_actions'] : array();
        $page['section_actions'] = array();
        if ( ! preg_match( '/^post-([0-9]+)$/', (string) $page_key, $match ) ) {
            if ( ! $actions ) {
                return 0;
            }
            throw new RuntimeException( 'Bereiche können nur auf einer gespeicherten WordPress-Seite dupliziert werden.' );
        }

        $post_id = (int) $match[1];
        if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
            throw new RuntimeException( 'Keine Berechtigung zum Duplizieren dieses Bereichs.' );
        }

        // The AJAX caller owns the shared options/post transaction and lock.
        $post = get_post( $post_id );
        if ( ! $post ) {
            throw new RuntimeException( 'Die WordPress-Seite wurde nicht gefunden.' );
        }

        $blocks = parse_blocks( (string) $post->post_content );
        $allowed = array( 'core/group', 'core/cover', 'core/columns', 'core/media-text' );
        $page['section_actions'] = $actions;
        $stabilized = KP_Frontend_Editor_V2::section_action_stabilize_blocks( $blocks, $page, $allowed );
        $actions = $page['section_actions'];
        $page['section_actions'] = array();
        $created = 0;

        foreach ( $actions as $action ) {
            $token = sanitize_key( (string) ( $action['token'] ?? '' ) );
            if ( 0 !== strpos( $token, 'kp-copy-' ) || strlen( $token ) > 64 ) {
                throw new RuntimeException( 'Ungültige Kennung für die Abschnittskopie.' );
            }

            $already_exists = false;
            foreach ( $blocks as $block ) {
                if ( $token === sanitize_key( (string) ( $block['attrs']['anchor'] ?? '' ) ) ) {
                    $already_exists = true;
                    break;
                }
            }
            if ( $already_exists ) {
                continue;
            }

            $matches = array();
            foreach ( $blocks as $index => $block ) {
                if ( KP_Frontend_Editor_V2::section_action_block_key( $block ) === ( $action['key'] ?? '' ) ) {
                    $matches[] = $index;
                }
            }
            if ( 1 !== count( $matches ) ) {
                throw new RuntimeException( 'Der ausgewählte Bereich ist nicht mehr eindeutig. Bitte die Seite neu laden.' );
            }

            $index = $matches[0];
            if ( ! in_array( (string) ( $blocks[ $index ]['blockName'] ?? '' ), $allowed, true ) ) {
                throw new RuntimeException( 'Dieser Blocktyp kann aus Sicherheitsgründen nicht direkt dupliziert werden.' );
            }

            $copy = KP_Frontend_Editor_V2::section_action_prepare_copy( $blocks[ $index ], $token );
            KP_Frontend_Editor_V2::section_action_migrate_child_keys( $blocks[ $index ], $copy, $page, $token );
            array_splice( $blocks, $index + 1, 0, array( $copy ) );
            $new_key = 'a-' . $token;
            if ( ! empty( $page['order'] ) && is_array( $page['order'] ) ) {
                $position = array_search( (string) $action['key'], $page['order'], true );
                if ( false !== $position && ! in_array( $new_key, $page['order'], true ) ) {
                    array_splice( $page['order'], $position + 1, 0, array( $new_key ) );
                }
            }
            $created++;
        }

        if ( ! empty( $page['order'] ) && is_array( $page['order'] ) ) {
            $page['order'] = array_values( array_unique( $page['order'] ) );
        }
        if ( $created || $stabilized ) {
            $expected_post = array( 'ID' => $post_id, 'post_content' => serialize_blocks( $blocks ) );
            if ( ! wp_revisions_enabled( $post ) ) {
                throw new RuntimeException( 'Sicheres Speichern erfordert aktivierte WordPress-Revisionen.' );
            }
            KP_Frontend_Editor_V2::section_action_ensure_revision( $post_id, (string) $post->post_content );
            $result = wp_update_post( wp_slash( $expected_post ), true );
            if ( is_wp_error( $result ) ) {
                throw new RuntimeException( $result->get_error_message() );
            }
            if ( (int) $result !== $post_id ) {
                throw new RuntimeException( 'Die WordPress-Seite konnte nicht gespeichert werden.' );
            }
            KP_Frontend_Editor_V2::section_action_ensure_revision( $post_id, $expected_post['post_content'] );
        }
        return $created;
    }
}
