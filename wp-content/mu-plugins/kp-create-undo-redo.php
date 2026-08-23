<?php
/**
 * Reversible create actions for the owner front-end editor.
 *
 * Creating a page, appointment or repertoire item navigates away from the
 * current DOM, so a browser-only history cannot undo it reliably. This bridge
 * keeps the created post itself intact, toggles it between its original status
 * and draft, and removes/restores the automatically added navigation item.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class KP_Create_Undo_Redo {
    const META = 'kp_create_undo_redo_v1';
    const MAX_ITEMS = 50;
    const RETENTION = 172800; // 48 hours; browser session decides which markers are shown.

    public static function init() {
        add_action( 'wp_ajax_kp_create_history_undo', array( __CLASS__, 'ajax_undo' ) );
        add_action( 'wp_ajax_kp_create_history_redo', array( __CLASS__, 'ajax_redo' ) );
        add_action( 'wp_footer', array( __CLASS__, 'runtime' ), 2060 );
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
            return is_array( $item ) && ! empty( $item['id'] ) && ! empty( $item['post_id'] )
                && isset( $item['ts'] ) && (int) $item['ts'] >= $cutoff;
        } ) );
        if ( count( $items ) > self::MAX_ITEMS ) {
            $items = array_slice( $items, -self::MAX_ITEMS );
        }
        return $items;
    }

    private static function save_entries( $items ) {
        if ( count( $items ) > self::MAX_ITEMS ) { $items = array_slice( $items, -self::MAX_ITEMS ); }
        update_user_meta( get_current_user_id(), self::META, array_values( $items ) );
    }

    private static function canonical_url( $url ) {
        $url = trim( (string) $url );
        if ( '' === $url ) { return ''; }
        $parts = wp_parse_url( $url );
        if ( ! is_array( $parts ) ) { return $url; }
        $path = isset( $parts['path'] ) ? '/' . ltrim( (string) $parts['path'], '/' ) : '/';
        $path = trailingslashit( $path );
        $query = isset( $parts['query'] ) && '' !== $parts['query'] ? '?' . $parts['query'] : '';
        return $path . $query;
    }

    private static function nav_items() {
        $items = get_option( 'kp_owner_navigation_v1', array() );
        return is_array( $items ) ? array_values( $items ) : array();
    }

    private static function add_nav_item( $label, $url ) {
        $label = sanitize_text_field( (string) $label );
        $url = esc_url_raw( (string) $url );
        if ( ! $label || ! $url ) { return null; }
        $items = self::nav_items();
        $canonical = self::canonical_url( $url );
        foreach ( $items as $index => $item ) {
            if ( self::canonical_url( isset( $item['url'] ) ? $item['url'] : '' ) === $canonical ) {
                return array(
                    'added' => false,
                    'index' => (int) $index,
                    'item' => array( 'label' => (string) ( $item['label'] ?? $label ), 'url' => (string) ( $item['url'] ?? $url ) ),
                );
            }
        }
        $entry = array( 'label' => $label, 'url' => $url );
        $index = count( $items );
        $items[] = $entry;
        update_option( 'kp_owner_navigation_v1', $items, false );
        return array( 'added' => true, 'index' => $index, 'item' => $entry );
    }

    private static function remove_recorded_nav( $nav ) {
        if ( ! is_array( $nav ) || empty( $nav['added'] ) || empty( $nav['item']['url'] ) ) { return; }
        $needle = self::canonical_url( $nav['item']['url'] );
        $items = self::nav_items();
        $filtered = array_values( array_filter( $items, static function ( $item ) use ( $needle ) {
            return self::canonical_url( isset( $item['url'] ) ? $item['url'] : '' ) !== $needle;
        } ) );
        if ( $filtered !== $items ) { update_option( 'kp_owner_navigation_v1', $filtered, false ); }
    }

    private static function restore_recorded_nav( $nav ) {
        if ( ! is_array( $nav ) || empty( $nav['added'] ) || empty( $nav['item']['url'] ) ) { return; }
        $items = self::nav_items();
        $needle = self::canonical_url( $nav['item']['url'] );
        foreach ( $items as $item ) {
            if ( self::canonical_url( isset( $item['url'] ) ? $item['url'] : '' ) === $needle ) { return; }
        }
        $index = max( 0, min( count( $items ), isset( $nav['index'] ) ? (int) $nav['index'] : count( $items ) ) );
        $item = array(
            'label' => sanitize_text_field( (string) ( $nav['item']['label'] ?? '' ) ),
            'url' => esc_url_raw( (string) $nav['item']['url'] ),
        );
        array_splice( $items, $index, 0, array( $item ) );
        update_option( 'kp_owner_navigation_v1', $items, false );
    }

    public static function record( $post_id, $kind, $extra = array() ) {
        if ( ! self::can_edit() ) { return array(); }
        $post_id = absint( $post_id );
        $post = get_post( $post_id );
        if ( ! $post || ! current_user_can( 'edit_post', $post_id ) ) { return array(); }

        $nav = null;
        if ( ! empty( $extra['add_nav'] ) ) {
            $nav = self::add_nav_item(
                isset( $extra['label'] ) ? $extra['label'] : $post->post_title,
                isset( $extra['url'] ) ? $extra['url'] : get_permalink( $post_id )
            );
        }

        $items = self::entries();
        $action_id = gmdate( 'YmdHis' ) . '-' . wp_generate_password( 10, false, false );
        $items[] = array(
            'id' => $action_id,
            'ts' => time(),
            'post_id' => $post_id,
            'kind' => sanitize_key( (string) $kind ),
            'title' => sanitize_text_field( (string) $post->post_title ),
            'active_status' => sanitize_key( (string) $post->post_status ) ?: 'publish',
            'state' => 'active',
            'nav' => $nav,
        );
        self::save_entries( $items );
        return array(
            'action_id' => $action_id,
            'nav_added' => is_array( $nav ) && ! empty( $nav['added'] ),
        );
    }

    private static function find_entry( $id, &$items ) {
        foreach ( $items as $index => $item ) {
            if ( isset( $item['id'] ) && hash_equals( (string) $item['id'], (string) $id ) ) {
                return $index;
            }
        }
        return -1;
    }

    private static function label_for( $item ) {
        $kind = isset( $item['kind'] ) ? (string) $item['kind'] : '';
        if ( 'page' === $kind ) { return 'Seite'; }
        if ( 'termin' === $kind ) { return 'Termin'; }
        if ( 'repertoire' === $kind ) { return 'Stück'; }
        return 'Element';
    }

    public static function ajax_undo() {
        self::authorize();
        $id = isset( $_POST['action_id'] ) ? sanitize_text_field( wp_unslash( $_POST['action_id'] ) ) : '';
        $items = self::entries();
        $index = self::find_entry( $id, $items );
        if ( $index < 0 ) { wp_send_json_error( array( 'message' => 'Dieser Anlege-Schritt ist nicht mehr verfügbar.' ), 404 ); }
        $item = $items[ $index ];
        if ( 'active' !== ( $item['state'] ?? '' ) ) { wp_send_json_error( array( 'message' => 'Dieser Schritt ist bereits rückgängig.' ), 409 ); }
        $post_id = absint( $item['post_id'] ?? 0 );
        $post = get_post( $post_id );
        if ( ! $post || ! current_user_can( 'edit_post', $post_id ) ) { wp_send_json_error( array( 'message' => 'Das angelegte Element ist nicht mehr verfügbar.' ), 404 ); }

        $result = wp_update_post( array( 'ID' => $post_id, 'post_status' => 'draft' ), true );
        if ( is_wp_error( $result ) ) { wp_send_json_error( array( 'message' => $result->get_error_message() ), 500 ); }
        self::remove_recorded_nav( $item['nav'] ?? null );
        $items[ $index ]['state'] = 'undone';
        self::save_entries( $items );
        if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
        wp_send_json_success( array(
            'message' => self::label_for( $item ) . ' „' . ( $item['title'] ?? '' ) . '“ rückgängig ✓',
            'action_id' => $id,
            'post_id' => $post_id,
        ) );
    }

    public static function ajax_redo() {
        self::authorize();
        $id = isset( $_POST['action_id'] ) ? sanitize_text_field( wp_unslash( $_POST['action_id'] ) ) : '';
        $items = self::entries();
        $index = self::find_entry( $id, $items );
        if ( $index < 0 ) { wp_send_json_error( array( 'message' => 'Dieser Anlege-Schritt ist nicht mehr verfügbar.' ), 404 ); }
        $item = $items[ $index ];
        if ( 'undone' !== ( $item['state'] ?? '' ) ) { wp_send_json_error( array( 'message' => 'Dieser Schritt ist bereits aktiv.' ), 409 ); }
        $post_id = absint( $item['post_id'] ?? 0 );
        $post = get_post( $post_id );
        if ( ! $post || ! current_user_can( 'edit_post', $post_id ) ) { wp_send_json_error( array( 'message' => 'Das angelegte Element ist nicht mehr verfügbar.' ), 404 ); }

        $status = sanitize_key( (string) ( $item['active_status'] ?? 'publish' ) );
        if ( ! $status || 'trash' === $status || 'auto-draft' === $status ) { $status = 'publish'; }
        $result = wp_update_post( array( 'ID' => $post_id, 'post_status' => $status ), true );
        if ( is_wp_error( $result ) ) { wp_send_json_error( array( 'message' => $result->get_error_message() ), 500 ); }
        self::restore_recorded_nav( $item['nav'] ?? null );
        $items[ $index ]['state'] = 'active';
        self::save_entries( $items );
        if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
        wp_send_json_success( array(
            'message' => self::label_for( $item ) . ' „' . ( $item['title'] ?? '' ) . '“ wiederhergestellt ✓',
            'action_id' => $id,
            'post_id' => $post_id,
        ) );
    }

    public static function runtime() {
        if ( ! self::can_edit() ) { return; }
        $ajax = admin_url( 'admin-ajax.php' );
        $nonce = wp_create_nonce( 'kp_owner_web_app' );
        ?>
        <script id="kp-create-undo-redo-runtime">
        (()=>{
          'use strict';
          const ajaxUrl=<?php echo wp_json_encode( $ajax ); ?>,nonce=<?php echo wp_json_encode( $nonce ); ?>,MAX=50;
          const U='kp-create-undo-v1',R='kp-create-redo-v1';
          const clean=value=>Array.isArray(value)?value.filter(x=>typeof x==='string'&&x).slice(-MAX):[];
          const read=key=>{try{return clean(JSON.parse(sessionStorage.getItem(key)||'[]'))}catch(_){return[]}};
          let undoIds=read(U),redoIds=read(R),busy=false,seeded=false;
          const save=()=>{try{sessionStorage.setItem(U,JSON.stringify(undoIds));sessionStorage.setItem(R,JSON.stringify(redoIds))}catch(_){}};
          function toast(message,type='ok'){
            let el=document.querySelector('.kp-oa-toast,.kp-fe2-toast');
            if(!el){el=document.createElement('div');el.className='kp-oa-toast';document.body.appendChild(el)}
            el.textContent=message;el.classList.add('is-visible','is-'+type);setTimeout(()=>el.classList.remove('is-visible'),2200);
          }
          async function api(action,id){
            const fd=new FormData();fd.append('action',action);fd.append('nonce',nonce);fd.append('action_id',id);
            const response=await fetch(ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
            const json=await response.json().catch(()=>null);
            if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Aktion fehlgeschlagen.');
            return json.data||{};
          }
          async function undo(){
            if(busy||!undoIds.length)return false;busy=true;const id=undoIds[undoIds.length-1];
            try{const data=await api('kp_create_history_undo',id);undoIds.pop();redoIds.push(id);if(redoIds.length>MAX)redoIds.shift();save();toast(data.message||'Anlegen rückgängig ✓');return true}
            catch(error){toast(error?.message||'Rückgängig fehlgeschlagen.','error');return false}
            finally{busy=false}
          }
          async function redo(){
            if(busy||!redoIds.length)return false;busy=true;const id=redoIds[redoIds.length-1];
            try{const data=await api('kp_create_history_redo',id);redoIds.pop();undoIds.push(id);if(undoIds.length>MAX)undoIds.shift();save();toast(data.message||'Wiederhergestellt ✓');return true}
            catch(error){toast(error?.message||'Wiederholen fehlgeschlagen.','error');return false}
            finally{busy=false}
          }
          function clearRedo(){redoIds=[];save()}
          function remember(id){
            id=String(id||'');if(!id)return false;
            undoIds=undoIds.filter(x=>x!==id);undoIds.push(id);if(undoIds.length>MAX)undoIds.shift();redoIds=[];save();
            window.KPWordHistory?.push?.('creation');return true;
          }
          const runtime={undo,redo,clearRedo,remember,counts:()=>({undo:undoIds.length,redo:redoIds.length})};
          window.KPCreateHistoryRuntime=runtime;
          function install(){
            if(!window.KPWordHistory?.register)return false;
            window.KPWordHistory.register('creation',()=>runtime);
            if(!seeded&&window.KPWordHistory.seedSpecialist){seeded=true;window.KPWordHistory.seedSpecialist('creation',undoIds.length,redoIds.length)}
            return true;
          }
          install();setInterval(install,350);
        })();
        </script>
        <?php
    }
}

function kp_owner_create_history_record( $post_id, $kind, $extra = array() ) {
    return KP_Create_Undo_Redo::record( $post_id, $kind, $extra );
}

KP_Create_Undo_Redo::init();
