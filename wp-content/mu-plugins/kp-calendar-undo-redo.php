<?php
/**
 * Reversible Google-calendar owner actions.
 *
 * Calendar connection, manual sync, imported-draft edits and publishing used
 * to mutate WordPress outside the global editor history. This bridge snapshots
 * the affected WordPress state before each mutation, commits the after-state
 * only after a successful response and rolls back automatically if history
 * cannot be committed. Google itself remains strictly read-only.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class KP_Calendar_Undo_Redo {
    const META = 'kp_calendar_undo_redo_v1';
    const MAX_ITEMS = 50;
    const RETENTION = 172800;
    const PENDING_TTL = 900;

    private static $actions = array(
        'kp_calendar_owner_save_feed',
        'kp_calendar_owner_sync',
        'kp_calendar_owner_update_draft',
        'kp_calendar_owner_publish',
    );

    public static function init() {
        add_action( 'wp_ajax_kp_calendar_history_begin', array( __CLASS__, 'ajax_begin' ) );
        add_action( 'wp_ajax_kp_calendar_history_commit', array( __CLASS__, 'ajax_commit' ) );
        add_action( 'wp_ajax_kp_calendar_history_rollback', array( __CLASS__, 'ajax_rollback' ) );
        add_action( 'wp_ajax_kp_calendar_history_undo', array( __CLASS__, 'ajax_undo' ) );
        add_action( 'wp_ajax_kp_calendar_history_redo', array( __CLASS__, 'ajax_redo' ) );
        add_action( 'wp_footer', array( __CLASS__, 'runtime' ), 2080 );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function authorize() {
        if ( ! self::can_edit() ) {
            wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 );
        }
        check_ajax_referer( 'kp_owner_web_app', 'nonce' );
    }

    private static function entries() {
        $items = get_user_meta( get_current_user_id(), self::META, true );
        if ( ! is_array( $items ) ) { $items = array(); }
        $cutoff = time() - self::RETENTION;
        $items = array_values( array_filter( $items, static function ( $item ) use ( $cutoff ) {
            return is_array( $item ) && ! empty( $item['id'] ) && isset( $item['ts'] ) && (int) $item['ts'] >= $cutoff;
        } ) );
        if ( count( $items ) > self::MAX_ITEMS ) { $items = array_slice( $items, -self::MAX_ITEMS ); }
        return $items;
    }

    private static function save_entries( $items ) {
        if ( count( $items ) > self::MAX_ITEMS ) { $items = array_slice( $items, -self::MAX_ITEMS ); }
        update_user_meta( get_current_user_id(), self::META, array_values( $items ) );
    }

    private static function pending_key( $token ) {
        return 'kp_cal_hist_' . get_current_user_id() . '_' . preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) $token );
    }

    private static function option_snapshot( $key ) {
        $sentinel = '__kp_calendar_history_missing__';
        $value = get_option( $key, $sentinel );
        return array(
            'exists' => $sentinel !== $value,
            'value'  => $sentinel !== $value ? $value : null,
        );
    }

    private static function restore_option( $key, $snapshot ) {
        if ( ! is_array( $snapshot ) || empty( $snapshot['exists'] ) ) {
            delete_option( $key );
            return;
        }
        update_option( $key, $snapshot['value'], false );
    }

    private static function kp_meta_snapshot( $post_id ) {
        $all = get_post_meta( $post_id );
        $out = array();
        foreach ( $all as $key => $values ) {
            if ( 0 !== strpos( (string) $key, '_kp_' ) ) { continue; }
            $out[ $key ] = is_array( $values ) ? array_values( $values ) : array( $values );
        }
        return $out;
    }

    private static function post_snapshot( $post_id ) {
        $post_id = absint( $post_id );
        $post = get_post( $post_id );
        if ( ! $post || 'kp_termin' !== $post->post_type ) { return null; }
        return array(
            'id'           => $post_id,
            'post_title'   => (string) $post->post_title,
            'post_status'  => (string) $post->post_status,
            'post_content' => (string) $post->post_content,
            'post_excerpt' => (string) $post->post_excerpt,
            'post_name'    => (string) $post->post_name,
            'meta'         => self::kp_meta_snapshot( $post_id ),
        );
    }

    private static function google_ids() {
        $ids = get_posts( array(
            'post_type'      => 'kp_termin',
            'post_status'    => array( 'publish', 'draft', 'pending', 'private', 'future', 'trash' ),
            'posts_per_page' => -1,
            'fields'         => 'ids',
            'meta_query'     => array( array( 'key' => '_kp_google_occurrence_key', 'compare' => 'EXISTS' ) ),
            'orderby'        => 'ID',
            'order'          => 'ASC',
        ) );
        return array_values( array_map( 'absint', is_array( $ids ) ? $ids : array() ) );
    }

    private static function sync_snapshot() {
        $posts = array();
        foreach ( self::google_ids() as $id ) {
            $snapshot = self::post_snapshot( $id );
            if ( $snapshot ) { $posts[ (string) $id ] = $snapshot; }
        }
        return array(
            'posts'     => $posts,
            'last_sync' => self::option_snapshot( 'kp_auftritte_last_sync' ),
        );
    }

    private static function feed_option_key() {
        return class_exists( 'KP_Google_Calendar_Import' ) ? KP_Google_Calendar_Import::FEED_OPTION : 'kp_auftritte_ical_readonly_url';
    }

    private static function snapshot_for( $action, $post_id = 0 ) {
        if ( 'kp_calendar_owner_save_feed' === $action ) {
            return array( 'kind' => 'feed', 'feed' => self::option_snapshot( self::feed_option_key() ) );
        }
        if ( 'kp_calendar_owner_sync' === $action ) {
            return array( 'kind' => 'sync', 'sync' => self::sync_snapshot() );
        }
        if ( in_array( $action, array( 'kp_calendar_owner_update_draft', 'kp_calendar_owner_publish' ), true ) ) {
            $post = self::post_snapshot( $post_id );
            if ( ! $post ) { return new WP_Error( 'kp_calendar_history_post', 'Der Kalendertermin konnte für Rückgängig nicht gesichert werden.' ); }
            return array( 'kind' => 'post', 'post' => $post );
        }
        return new WP_Error( 'kp_calendar_history_action', 'Unbekannte Kalenderaktion.' );
    }

    private static function restore_post( $snapshot ) {
        if ( ! is_array( $snapshot ) || empty( $snapshot['id'] ) ) { return false; }
        $id = absint( $snapshot['id'] );
        $post = get_post( $id );
        if ( ! $post || 'kp_termin' !== $post->post_type ) { return false; }

        $target_status = sanitize_key( (string) ( $snapshot['post_status'] ?? 'draft' ) );
        if ( 'trash' === $target_status ) {
            if ( 'trash' !== get_post_status( $id ) ) { wp_trash_post( $id ); }
        } else {
            if ( 'trash' === get_post_status( $id ) ) { wp_untrash_post( $id ); }
            $result = wp_update_post( array(
                'ID'           => $id,
                'post_title'   => (string) ( $snapshot['post_title'] ?? '' ),
                'post_status'  => $target_status ?: 'draft',
                'post_content' => (string) ( $snapshot['post_content'] ?? '' ),
                'post_excerpt' => (string) ( $snapshot['post_excerpt'] ?? '' ),
                'post_name'    => (string) ( $snapshot['post_name'] ?? '' ),
            ), true );
            if ( is_wp_error( $result ) ) { return false; }
        }

        $current = get_post_meta( $id );
        foreach ( array_keys( $current ) as $key ) {
            if ( 0 === strpos( (string) $key, '_kp_' ) ) { delete_post_meta( $id, $key ); }
        }
        $meta = isset( $snapshot['meta'] ) && is_array( $snapshot['meta'] ) ? $snapshot['meta'] : array();
        foreach ( $meta as $key => $values ) {
            if ( 0 !== strpos( (string) $key, '_kp_' ) ) { continue; }
            foreach ( is_array( $values ) ? $values : array( $values ) as $value ) {
                add_post_meta( $id, $key, maybe_unserialize( $value ) );
            }
        }
        clean_post_cache( $id );
        return true;
    }

    private static function restore_sync( $snapshot ) {
        if ( ! is_array( $snapshot ) ) { return false; }
        $target_posts = isset( $snapshot['posts'] ) && is_array( $snapshot['posts'] ) ? $snapshot['posts'] : array();
        $target_ids = array_map( 'absint', array_keys( $target_posts ) );
        foreach ( self::google_ids() as $current_id ) {
            if ( ! in_array( $current_id, $target_ids, true ) && 'trash' !== get_post_status( $current_id ) ) {
                wp_trash_post( $current_id );
            }
        }
        foreach ( $target_posts as $post_snapshot ) {
            if ( ! self::restore_post( $post_snapshot ) ) { return false; }
        }
        self::restore_option( 'kp_auftritte_last_sync', $snapshot['last_sync'] ?? array() );
        return true;
    }

    private static function restore_snapshot( $snapshot ) {
        if ( ! is_array( $snapshot ) || empty( $snapshot['kind'] ) ) { return false; }
        if ( 'feed' === $snapshot['kind'] ) {
            self::restore_option( self::feed_option_key(), $snapshot['feed'] ?? array() );
            return true;
        }
        if ( 'post' === $snapshot['kind'] ) { return self::restore_post( $snapshot['post'] ?? array() ); }
        if ( 'sync' === $snapshot['kind'] ) { return self::restore_sync( $snapshot['sync'] ?? array() ); }
        return false;
    }

    private static function action_label( $action ) {
        if ( 'kp_calendar_owner_save_feed' === $action ) { return 'Kalenderverbindung'; }
        if ( 'kp_calendar_owner_sync' === $action ) { return 'Kalendersynchronisierung'; }
        if ( 'kp_calendar_owner_update_draft' === $action ) { return 'Kalenderentwurf'; }
        if ( 'kp_calendar_owner_publish' === $action ) { return 'Termin-Veröffentlichung'; }
        return 'Kalenderaktion';
    }

    public static function ajax_begin() {
        self::authorize();
        $action = isset( $_POST['target_action'] ) ? sanitize_key( wp_unslash( $_POST['target_action'] ) ) : '';
        $post_id = isset( $_POST['target_id'] ) ? absint( $_POST['target_id'] ) : 0;
        if ( ! in_array( $action, self::$actions, true ) ) {
            wp_send_json_error( array( 'message' => 'Diese Kalenderaktion ist nicht für Rückgängig freigegeben.' ), 400 );
        }
        $before = self::snapshot_for( $action, $post_id );
        if ( is_wp_error( $before ) ) { wp_send_json_error( array( 'message' => $before->get_error_message() ), 409 ); }
        $token = wp_generate_password( 24, false, false );
        set_transient( self::pending_key( $token ), array(
            'user_id' => get_current_user_id(),
            'action'  => $action,
            'post_id' => $post_id,
            'before'  => $before,
            'ts'      => time(),
        ), self::PENDING_TTL );
        wp_send_json_success( array( 'token' => $token ) );
    }

    private static function pending( $token ) {
        $token = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) $token );
        if ( ! $token ) { return array( null, '' ); }
        $key = self::pending_key( $token );
        $pending = get_transient( $key );
        if ( ! is_array( $pending ) || (int) ( $pending['user_id'] ?? 0 ) !== get_current_user_id() ) { return array( null, $key ); }
        return array( $pending, $key );
    }

    public static function ajax_commit() {
        self::authorize();
        $token = isset( $_POST['token'] ) ? sanitize_text_field( wp_unslash( $_POST['token'] ) ) : '';
        list( $pending, $key ) = self::pending( $token );
        if ( ! $pending ) { wp_send_json_error( array( 'message' => 'Der Kalender-Sicherheitsstand ist abgelaufen.' ), 404 ); }
        $after = self::snapshot_for( $pending['action'], (int) $pending['post_id'] );
        if ( is_wp_error( $after ) ) { wp_send_json_error( array( 'message' => $after->get_error_message() ), 409 ); }
        $items = self::entries();
        $id = gmdate( 'YmdHis' ) . '-' . wp_generate_password( 10, false, false );
        $items[] = array(
            'id'     => $id,
            'ts'     => time(),
            'action' => $pending['action'],
            'before' => $pending['before'],
            'after'  => $after,
            'state'  => 'active',
        );
        self::save_entries( $items );
        delete_transient( $key );
        wp_send_json_success( array( 'action_id' => $id, 'label' => self::action_label( $pending['action'] ) ) );
    }

    public static function ajax_rollback() {
        self::authorize();
        $token = isset( $_POST['token'] ) ? sanitize_text_field( wp_unslash( $_POST['token'] ) ) : '';
        list( $pending, $key ) = self::pending( $token );
        if ( ! $pending ) { wp_send_json_success( array( 'rolled_back' => false ) ); }
        $ok = self::restore_snapshot( $pending['before'] );
        delete_transient( $key );
        if ( ! $ok ) { wp_send_json_error( array( 'message' => 'Die fehlgeschlagene Kalenderaktion konnte nicht automatisch zurückgerollt werden.' ), 500 ); }
        if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
        wp_send_json_success( array( 'rolled_back' => true ) );
    }

    private static function find_entry( $id, &$items ) {
        foreach ( $items as $index => $item ) {
            if ( isset( $item['id'] ) && hash_equals( (string) $item['id'], (string) $id ) ) { return $index; }
        }
        return -1;
    }

    private static function change_state( $direction ) {
        self::authorize();
        $id = isset( $_POST['action_id'] ) ? sanitize_text_field( wp_unslash( $_POST['action_id'] ) ) : '';
        $items = self::entries();
        $index = self::find_entry( $id, $items );
        if ( $index < 0 ) { wp_send_json_error( array( 'message' => 'Dieser Kalenderschritt ist nicht mehr verfügbar.' ), 404 ); }
        $item = $items[ $index ];
        $undo = 'undo' === $direction;
        $required = $undo ? 'active' : 'undone';
        if ( $required !== ( $item['state'] ?? '' ) ) {
            wp_send_json_error( array( 'message' => $undo ? 'Dieser Kalenderschritt ist bereits rückgängig.' : 'Dieser Kalenderschritt ist bereits wiederhergestellt.' ), 409 );
        }
        $snapshot = $undo ? ( $item['before'] ?? array() ) : ( $item['after'] ?? array() );
        if ( ! self::restore_snapshot( $snapshot ) ) {
            wp_send_json_error( array( 'message' => 'Der Kalenderstand konnte nicht wiederhergestellt werden.' ), 500 );
        }
        $items[ $index ]['state'] = $undo ? 'undone' : 'active';
        self::save_entries( $items );
        if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
        $label = self::action_label( $item['action'] ?? '' );
        wp_send_json_success( array(
            'action_id' => $id,
            'message'   => $undo ? $label . ' rückgängig ✓' : $label . ' wiederhergestellt ✓',
        ) );
    }

    public static function ajax_undo() { self::change_state( 'undo' ); }
    public static function ajax_redo() { self::change_state( 'redo' ); }

    public static function runtime() {
        if ( ! self::can_edit() ) { return; }
        $ajax = admin_url( 'admin-ajax.php' );
        $nonce = wp_create_nonce( 'kp_owner_web_app' );
        ?>
        <script id="kp-calendar-undo-redo-runtime">
        (()=>{
          'use strict';
          const ajaxUrl=<?php echo wp_json_encode( $ajax ); ?>,nonce=<?php echo wp_json_encode( $nonce ); ?>,MAX=50;
          const MUTATIONS=new Set(['kp_calendar_owner_save_feed','kp_calendar_owner_sync','kp_calendar_owner_update_draft','kp_calendar_owner_publish']);
          const U='kp-calendar-undo-v1',R='kp-calendar-redo-v1';
          const inheritedFetch=window.fetch.bind(window);
          const clean=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'&&x).slice(-MAX):[];
          const read=k=>{try{return clean(JSON.parse(sessionStorage.getItem(k)||'[]'))}catch(_){return[]}};
          let undoIds=read(U),redoIds=read(R),busy=false,seeded=false;
          const save=()=>{try{sessionStorage.setItem(U,JSON.stringify(undoIds));sessionStorage.setItem(R,JSON.stringify(redoIds))}catch(_){}};
          const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
          function bodyAction(body){try{if(body instanceof FormData)return String(body.get('action')||'');if(body instanceof URLSearchParams)return String(body.get('action')||'');if(typeof body==='string')return String(new URLSearchParams(body).get('action')||'')}catch(_){}return ''}
          function bodyField(body,name){try{if(body instanceof FormData)return body.get(name);if(body instanceof URLSearchParams)return body.get(name);if(typeof body==='string')return new URLSearchParams(body).get(name)}catch(_){}return null}
          async function control(action,fields={}){
            const fd=new FormData();fd.append('action',action);fd.append('nonce',nonce);Object.entries(fields).forEach(([k,v])=>fd.append(k,String(v??'')));
            const response=await inheritedFetch(ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
            const json=await response.json().catch(()=>null);if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Kalender-Historie fehlgeschlagen.');return json.data||{};
          }
          async function begin(targetAction,targetId){return control('kp_calendar_history_begin',{target_action:targetAction,target_id:targetId||0})}
          async function rollback(token){try{return await control('kp_calendar_history_rollback',{token})}catch(_){return null}}
          function toast(message,type='ok'){let el=document.querySelector('.kp-oa-toast,.kp-fe2-toast');if(!el){el=document.createElement('div');el.className='kp-oa-toast';document.body.appendChild(el)}el.textContent=message;el.classList.add('is-visible','is-'+type);setTimeout(()=>el.classList.remove('is-visible'),2200)}
          async function refreshOpenCalendar(){
            const open=document.body.classList.contains('kp-oa-open')&&document.querySelector('.kp-oa-sheet.kp-cal-sheet');if(!open)return;
            open.querySelector('.kp-oa-close')?.click();await delay(30);document.querySelector('.kp-oa-tools')?.click();
            for(let i=0;i<12;i++){await delay(40);const button=document.querySelector('[data-action="calendar"]');if(button){button.click();return}}
          }
          function remember(id){id=String(id||'');if(!id)return false;undoIds=undoIds.filter(x=>x!==id);undoIds.push(id);if(undoIds.length>MAX)undoIds.shift();redoIds=[];save();window.KPWordHistory?.push?.('calendar');return true}
          async function undo(){if(busy||!undoIds.length)return false;busy=true;const id=undoIds[undoIds.length-1];try{const data=await control('kp_calendar_history_undo',{action_id:id});undoIds.pop();redoIds.push(id);if(redoIds.length>MAX)redoIds.shift();save();await refreshOpenCalendar();toast(data.message||'Kalenderaktion rückgängig ✓');return true}catch(error){toast(error?.message||'Kalender-Rückgängig fehlgeschlagen.','error');return false}finally{busy=false}}
          async function redo(){if(busy||!redoIds.length)return false;busy=true;const id=redoIds[redoIds.length-1];try{const data=await control('kp_calendar_history_redo',{action_id:id});redoIds.pop();undoIds.push(id);if(undoIds.length>MAX)undoIds.shift();save();await refreshOpenCalendar();toast(data.message||'Kalenderaktion wiederhergestellt ✓');return true}catch(error){toast(error?.message||'Kalender-Wiederholen fehlgeschlagen.','error');return false}finally{busy=false}}
          function clearRedo(){redoIds=[];save()}
          const runtime={undo,redo,clearRedo,remember,counts:()=>({undo:undoIds.length,redo:redoIds.length})};window.KPCalendarHistoryRuntime=runtime;
          function install(){if(!window.KPWordHistory?.register)return false;window.KPWordHistory.register('calendar',()=>runtime);if(!seeded&&window.KPWordHistory.seedSpecialist){seeded=true;window.KPWordHistory.seedSpecialist('calendar',undoIds.length,redoIds.length)}return true}
          install();setInterval(install,400);

          window.fetch=async(input,init={})=>{
            const action=bodyAction(init?.body);if(!MUTATIONS.has(action))return inheritedFetch(input,init);
            const targetId=Number(bodyField(init?.body,'id')||0);let safety;
            try{safety=await begin(action,targetId)}catch(error){toast(error?.message||'Kalenderaktion wurde aus Sicherheitsgründen nicht ausgeführt.','error');throw error}
            const token=String(safety?.token||'');
            let response;
            try{response=await inheritedFetch(input,init)}catch(error){await rollback(token);throw error}
            const json=await response.clone().json().catch(()=>null);
            if(!response.ok||!json?.success){await rollback(token);return response}
            try{const committed=await control('kp_calendar_history_commit',{token});remember(committed.action_id);return response}
            catch(error){await rollback(token);toast('Kalenderaktion wurde zurückgesetzt, weil Rückgängig nicht sicher angelegt werden konnte.','error');throw error}
          };
        })();
        </script>
        <?php
    }
}

KP_Calendar_Undo_Redo::init();
