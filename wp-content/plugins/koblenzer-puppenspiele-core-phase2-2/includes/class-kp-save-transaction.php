<?php
/**
 * Transaction boundary for the KP frontend editor save flow.
 *
 * Owns the dedicated no-replay connection, connection-owned lock,
 * transaction/savepoint lifecycle and post-row serialization lock.
 *
 * @package Koblenzer_Puppenspiele_Core
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class KP_Save_Transaction {

    /**
     * Execute an editor save inside a protected transaction.
     *
     * @param string        $page_key       Validated WordPress page key.
     * @param callable      $in_transaction Receives ($wpdb, $post_id).
     * @param callable|null $after_commit   Receives ($wpdb, $post_id, $result).
     * @return mixed Result returned by the in-transaction callback.
     * @throws Throwable On connection, lock, transaction or callback failure.
     */
    public static function run( $page_key, callable $in_transaction, ?callable $after_commit = null ) {
        global $wpdb;

        if ( 'wpdb' !== get_class( $wpdb ) ) {
            throw new RuntimeException(
                'Die Datenbank-Erweiterung unterstützt die sichere Speicherverbindung nicht.'
            );
        }

        require_once __DIR__ . '/class-kp-no-replay-wpdb.php';

        $original_db = $wpdb;
        $post_id = preg_match(
            '/^post-([0-9]+)$/',
            (string) $page_key,
            $post_match
        )
            ? (int) ( $post_match[1] ?? 0 )
            : 0;
        $lock = 'kp-fe-v2-' . substr(
            hash( 'sha256', DB_NAME . '|' . $wpdb->options ),
            0,
            40
        );
        $transaction = false;
        $lock_acquired = false;
        $save_db = null;

        try {
            $save_db = new KP_No_Replay_WPDB(
                DB_USER,
                DB_PASSWORD,
                DB_NAME,
                DB_HOST
            );
            $save_db->set_prefix( $original_db->base_prefix );
            $save_db->set_blog_id( $original_db->blogid );
            $save_db->suppress_errors( $original_db->suppress_errors );

            if ( ! $save_db->ready ) {
                throw new RuntimeException(
                    'Die sichere Speicherverbindung ist nicht verfügbar.'
                );
            }

            $wpdb = $save_db;

            if (
                '1' !== (string) $wpdb->get_var(
                    $wpdb->prepare( 'SELECT GET_LOCK(%s, 0)', $lock )
                )
            ) {
                throw new RuntimeException(
                    'Ein anderer Speichervorgang läuft oder die Speichersperre ist nicht verfügbar. Bitte kurz erneut versuchen.'
                );
            }
            $lock_acquired = true;

            $engines = $wpdb->get_col(
                $wpdb->prepare(
                    'SELECT ENGINE
                     FROM information_schema.TABLES
                     WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME IN (%s, %s, %s)',
                    $wpdb->posts,
                    $wpdb->postmeta,
                    $wpdb->options
                )
            );

            if (
                3 !== count( $engines )
                || array_filter(
                    $engines,
                    static function ( $engine ) {
                        return 'innodb' !== strtolower( (string) $engine );
                    }
                )
            ) {
                throw new RuntimeException(
                    'Sicheres Speichern erfordert transaktionale InnoDB-Tabellen für Seiten, Revisionen und Editoroptionen.'
                );
            }

            if ( false === $wpdb->query( 'START TRANSACTION' ) ) {
                throw new RuntimeException(
                    'Die Speichertransaktion konnte nicht gestartet werden.'
                );
            }
            $transaction = true;

            if ( false === $wpdb->query( 'SAVEPOINT kp_fe_save' ) ) {
                throw new RuntimeException(
                    'Die Speichertransaktion ist nicht verfügbar.'
                );
            }

            if ( $post_id ) {
                $wpdb->get_var(
                    $wpdb->prepare(
                        "SELECT ID
                         FROM {$wpdb->posts}
                         WHERE ID = %d
                         FOR UPDATE",
                        $post_id
                    )
                );

                if ( $wpdb->last_error ) {
                    throw new RuntimeException(
                        'Die WordPress-Seite konnte nicht gesperrt werden.'
                    );
                }
            }

            $result = $in_transaction( $wpdb, $post_id );

            if (
                '1' !== (string) $wpdb->get_var(
                    $wpdb->prepare(
                        'SELECT IS_USED_LOCK(%s) = CONNECTION_ID()',
                        $lock
                    )
                )
                || false === $wpdb->query(
                    'RELEASE SAVEPOINT kp_fe_save'
                )
            ) {
                throw new RuntimeException(
                    'Die Speicherverbindung wurde unterbrochen. Bitte die Seite neu laden und prüfen.'
                );
            }

            if ( false === $wpdb->query( 'COMMIT' ) ) {
                throw new RuntimeException(
                    'Die Speicherung konnte nicht bestätigt werden. Bitte neu laden und prüfen.'
                );
            }
            $transaction = false;

            if ( $after_commit ) {
                $after_commit( $wpdb, $post_id, $result );
            }

            return $result;
        } catch ( Throwable $error ) {
            if (
                $transaction
                && $save_db
                && ! $save_db->connection_lost
            ) {
                try {
                    $save_db->query( 'ROLLBACK' );
                } catch ( Throwable $cleanup_error ) {
                    // Never replay or reconnect during cleanup.
                }
            }

            throw $error;
        } finally {
            if (
                $save_db
                && $lock_acquired
                && ! $save_db->connection_lost
            ) {
                try {
                    $save_db->get_var(
                        $save_db->prepare(
                            'SELECT RELEASE_LOCK(%s)',
                            $lock
                        )
                    );
                } catch ( Throwable $cleanup_error ) {
                    // Closing the dedicated connection releases its lock.
                }
            }

            if ( $save_db ) {
                $save_db->close();
            }

            $wpdb = $original_db;
        }
    }
}
