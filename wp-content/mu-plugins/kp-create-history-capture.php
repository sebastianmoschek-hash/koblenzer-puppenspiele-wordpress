<?php
/**
 * Captures successful owner create requests and registers them with the
 * reversible create-history runtime without changing the legacy create UI.
 *
 * Safety rule: a creation is never allowed to remain published if its Undo
 * record cannot be created. Registration retries are idempotent, and an abort
 * removes any half-finished history record before deactivating the new object.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_create_history_can_edit() {
    return is_user_logged_in() && current_user_can( 'edit_pages' );
}

function kp_create_history_guard() {
    if ( ! kp_create_history_can_edit() ) {
        wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 );
    }
    check_ajax_referer( 'kp_owner_web_app', 'nonce' );
}

function kp_create_history_canonical_url( $url ) {
    $parts = wp_parse_url( (string) $url );
    if ( ! is_array( $parts ) ) { return trim( (string) $url ); }
    $path = isset( $parts['path'] ) ? '/' . ltrim( (string) $parts['path'], '/' ) : '/';
    $path = trailingslashit( $path );
    $query = isset( $parts['query'] ) && '' !== $parts['query'] ? '?' . $parts['query'] : '';
    return $path . $query;
}

function kp_create_history_request_key( $token ) {
    return 'kp_create_hist_req_' . get_current_user_id() . '_' . substr( hash( 'sha256', (string) $token ), 0, 32 );
}

function kp_create_history_remove_action( $action_id ) {
    $action_id = (string) $action_id;
    if ( '' === $action_id ) { return; }
    $items = get_user_meta( get_current_user_id(), 'kp_create_undo_redo_v1', true );
    if ( ! is_array( $items ) ) { return; }
    $filtered = array_values( array_filter( $items, static function ( $item ) use ( $action_id ) {
        return ! is_array( $item ) || ! isset( $item['id'] ) || ! hash_equals( (string) $item['id'], $action_id );
    } ) );
    if ( count( $filtered ) !== count( $items ) ) {
        update_user_meta( get_current_user_id(), 'kp_create_undo_redo_v1', $filtered );
    }
}

add_action( 'wp_ajax_kp_create_history_record', static function () {
    kp_create_history_guard();
    $post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
    $kind = isset( $_POST['kind'] ) ? sanitize_key( wp_unslash( $_POST['kind'] ) ) : '';
    $extra = isset( $_POST['extra'] ) ? json_decode( wp_unslash( $_POST['extra'] ), true ) : array();
    $request_token = isset( $_POST['request_token'] ) ? sanitize_text_field( wp_unslash( $_POST['request_token'] ) ) : '';
    if ( ! is_array( $extra ) ) { $extra = array(); }
    if ( ! $post_id || ! $request_token || ! in_array( $kind, array( 'page', 'termin', 'repertoire' ), true ) ) {
        wp_send_json_error( array( 'message' => 'Ungültiger Anlege-Schritt.' ), 400 );
    }

    $request_key = kp_create_history_request_key( $request_token );
    $existing = get_transient( $request_key );
    if ( is_array( $existing ) && ! empty( $existing['action_id'] ) ) {
        wp_send_json_success( $existing );
    }

    if ( ! function_exists( 'kp_owner_create_history_record' ) ) {
        wp_send_json_error( array( 'message' => 'Undo-Historie ist nicht geladen.' ), 500 );
    }
    $result = kp_owner_create_history_record( $post_id, $kind, $extra );
    if ( empty( $result['action_id'] ) ) {
        wp_send_json_error( array( 'message' => 'Anlege-Schritt konnte nicht in die Historie aufgenommen werden.' ), 500 );
    }
    set_transient( $request_key, $result, 15 * MINUTE_IN_SECONDS );
    wp_send_json_success( $result );
} );

add_action( 'wp_ajax_kp_create_history_abort', static function () {
    kp_create_history_guard();
    $post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
    $kind = isset( $_POST['kind'] ) ? sanitize_key( wp_unslash( $_POST['kind'] ) ) : '';
    $extra = isset( $_POST['extra'] ) ? json_decode( wp_unslash( $_POST['extra'] ), true ) : array();
    $request_token = isset( $_POST['request_token'] ) ? sanitize_text_field( wp_unslash( $_POST['request_token'] ) ) : '';
    if ( ! is_array( $extra ) ) { $extra = array(); }
    $types = array( 'page' => 'page', 'termin' => 'kp_termin', 'repertoire' => 'kp_repertoire' );
    if ( ! $post_id || ! $request_token || ! isset( $types[ $kind ] ) || $types[ $kind ] !== get_post_type( $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) {
        wp_send_json_error( array( 'message' => 'Die fehlgeschlagene Erstellung konnte nicht sicher zugeordnet werden.' ), 409 );
    }

    $request_key = kp_create_history_request_key( $request_token );
    $recorded = get_transient( $request_key );
    if ( is_array( $recorded ) && ! empty( $recorded['action_id'] ) ) {
        kp_create_history_remove_action( $recorded['action_id'] );
    }
    delete_transient( $request_key );

    $result = wp_update_post( array( 'ID' => $post_id, 'post_status' => 'draft' ), true );
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( array( 'message' => $result->get_error_message() ), 500 );
    }

    if ( 'page' === $kind && ! empty( $extra['add_nav'] ) && ! empty( $extra['url'] ) ) {
        $needle = kp_create_history_canonical_url( $extra['url'] );
        $items = get_option( 'kp_owner_navigation_v1', array() );
        if ( is_array( $items ) ) {
            $filtered = array_values( array_filter( $items, static function ( $item ) use ( $needle ) {
                $url = is_array( $item ) && isset( $item['url'] ) ? $item['url'] : '';
                return kp_create_history_canonical_url( $url ) !== $needle;
            } ) );
            if ( $filtered !== $items ) { update_option( 'kp_owner_navigation_v1', $filtered, false ); }
        }
    }

    if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
    wp_send_json_success( array( 'message' => 'Nicht abgesicherte Erstellung wurde zurückgenommen.' ) );
} );

add_action( 'wp_footer', static function () {
    if ( ! kp_create_history_can_edit() ) { return; }
    $ajax = admin_url( 'admin-ajax.php' );
    $nonce = wp_create_nonce( 'kp_owner_web_app' );
    ?>
    <script id="kp-create-history-capture-runtime">
    (()=>{
      'use strict';
      const ajaxUrl=<?php echo wp_json_encode( $ajax ); ?>,nonce=<?php echo wp_json_encode( $nonce ); ?>;
      const inheritedFetch=window.fetch.bind(window);
      const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const requestToken=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      function actionFrom(body){
        try{
          if(body instanceof FormData)return String(body.get('action')||'');
          if(body instanceof URLSearchParams)return String(body.get('action')||'');
          if(typeof body==='string')return String(new URLSearchParams(body).get('action')||'');
        }catch(_){}return '';
      }
      function fieldFrom(body,name){
        try{
          if(body instanceof FormData)return body.get(name);
          if(body instanceof URLSearchParams)return body.get(name);
          if(typeof body==='string')return new URLSearchParams(body).get(name);
        }catch(_){}return null;
      }
      async function historyRequest(action,postId,kind,extra,token){
        const fd=new FormData();fd.append('action',action);fd.append('nonce',nonce);fd.append('post_id',String(postId));fd.append('kind',kind);fd.append('extra',JSON.stringify(extra||{}));fd.append('request_token',token);
        const response=await inheritedFetch(ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
        const json=await response.json().catch(()=>null);
        if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Undo-Sicherung fehlgeschlagen.');
        return json.data||{};
      }
      async function registerCreated(postId,kind,extra,token){
        let lastError=null;
        for(let attempt=0;attempt<3;attempt++){
          try{
            const data=await historyRequest('kp_create_history_record',postId,kind,extra,token);
            const id=String(data?.action_id||'');
            if(!id)throw new Error('Undo-Schritt wurde ohne Kennung gespeichert.');
            if(!window.KPCreateHistoryRuntime?.remember?.(id))throw new Error('Undo-Schritt konnte im Browser nicht aktiviert werden.');
            return data;
          }catch(error){lastError=error;if(attempt<2)await delay(120*(attempt+1));}
        }
        throw lastError||new Error('Undo-Sicherung fehlgeschlagen.');
      }
      async function abortCreated(postId,kind,extra,token){
        let lastError=null;
        for(let attempt=0;attempt<3;attempt++){
          try{await historyRequest('kp_create_history_abort',postId,kind,extra,token);return true}
          catch(error){lastError=error;if(attempt<2)await delay(120*(attempt+1));}
        }
        console.error('[KP] Nicht abgesicherte Erstellung konnte nicht automatisch zurückgenommen werden.',lastError);
        return false;
      }
      window.fetch=async(input,init={})=>{
        const action=actionFrom(init?.body);
        const isRecord=action==='kp_owner_record_create',isPage=action==='kp_owner_page_create';
        const response=await inheritedFetch(input,init);
        if((isRecord||isPage)&&response.ok){
          const json=await response.clone().json().catch(()=>null);
          if(json?.success&&json?.data?.id){
            let kind='',extra={};
            if(isPage){
              let fields={};try{fields=JSON.parse(String(fieldFrom(init.body,'fields')||'{}'))||{}}catch(_){}
              kind='page';extra={add_nav:!!fields.add_nav,label:String(json.data.label||fields.title||''),url:String(json.data.url||'')};
            }else{
              kind=String(fieldFrom(init.body,'type')||'');
              if(kind!=='termin'&&kind!=='repertoire')return response;
            }
            const token=requestToken();
            try{await registerCreated(json.data.id,kind,extra,token)}
            catch(error){
              const rolledBack=await abortCreated(json.data.id,kind,extra,token);
              const suffix=rolledBack?' Die Erstellung wurde sicher zurückgenommen.':' Die Erstellung konnte nicht sicher für Undo registriert werden.';
              throw new Error((error?.message||'Undo-Sicherung fehlgeschlagen.')+suffix);
            }
          }
        }
        return response;
      };
    })();
    </script>
    <?php
}, 2070 );
