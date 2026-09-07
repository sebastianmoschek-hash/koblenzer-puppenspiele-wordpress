<?php
/** Dedicated transaction connection: wpdb must never replay after disconnect. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
class KP_No_Replay_WPDB extends wpdb {
    public $connection_lost = false;

    public function check_connection( $allow_bail = true ) {
        $this->connection_lost = true;
        throw new RuntimeException( 'Die Speicherverbindung wurde unterbrochen. Der Ausgang ist nicht bestätigt; bitte neu laden und prüfen.' );
    }
}
