<?php
/**
 * Captures successful owner create requests and registers them with the
 * reversible create-history runtime without changing the legacy create UI.
 *
 * Safety rule: a creation is never allowed to remain published if its Undo
 * record cannot be created. In that case the new object is moved back to draft
 * and an automatically added navigation entry is removed again.
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

add_action( 'wp_ajax_kp_create_history_record', static function () {
    kp_create_history_guard();
    $post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
    $kind = isset( $_POST['kind'] ) ? sanitize_key( wp_unslash( $_POST['kind'] ) ) : '';
    $extra = isset( $_POST['extra'] ) ? json_decode( wp_unslash( $_POST['extra'] ), true ) : array();
    if ( ! is_array( $extra ) ) { $extra = array(); }
    if ( ! $post_id || ! in_array( $kind, array( 'page', 'termin', 'repertoire' ), true ) ) {
        wp_send_json_error( array( 'message' => 'Ungültiger Anlege-Schritt.' ), 400 );
    }
    if ( ! function_exists( 'kp_owner_create_history_record' ) ) {
        wp_send_json_error( array( 'message' => 'Undo-Historie ist nicht geladen.' ), 500 );
    }
    $result = kp_owner_create_history_record( $post_id, $kind, $extra );
    if ( empty( $result['action_id'] ) ) {
        wp_send_json_error( array( 'message' => 'Anlege-Schritt konnte nicht in die Historie aufgenommen werden.' ), 500 );
    }
    wp_send_json_success( $result );
} );

add_action( 'wp_ajax_kp_create_history_abort', static function () {
    kp_create_history_guard();
    $post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
    $kind = isset( $_POST['kind'] ) ? sanitize_key( wp_unslash( $_POST['kind'] ) ) : '';
    $extra = isset( $_POST['extra'] ) ? json_decode( wp_unslash( $_POST['extra'] ), true ) : array();
    if ( ! is_array( $extra ) ) { $extra = array(); }
    $types = array( 'page' => 'page', 'termin' => 'kp_termin', 'repertoire' => 'kp_repertoire' );
    if ( ! $post_id || ! isset( $types[ $kind ] ) || $types[ $kind ] !== get_post_type( $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) {
        wp_send_json_error( array( 'message' => 'Die fehlgeschlagene Erstellung konnte nicht sicher zugeordnet werden.' ), 409 );
    }

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
      async function historyRequest(action,postId,kind,extra={}){
        const fd=new FormData();fd.append('action',action);fd.append('nonce',nonce);fd.append('post_id',String(postId));fd.append('kind',kind);fd.append('extra',JSON.stringify(extra));
        const response=await inheritedFetch(ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
        const json=await response.json().catch(()=>null);
        if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Undo-Sicherung fehlgeschlagen.');
        return json.data||{};
      }
      async function registerCreated(postId,kind,extra={}){
        let lastError=null;
        for(let attempt=0;attempt<3;attempt++){
          try{
            const data=await historyRequest('kp_create_history_record',postId,kind,extra);
            const id=String(data?.action_id||'');
            if(!id)throw new Error('Undo-Schritt wurde ohne Kennung gespeichert.');
            if(!window.KPCreateHistoryRuntime?.remember?.(id))throw new Error('Undo-Schritt konnte im Browser nicht aktiviert werden.');
            return data;
          }catch(error){lastError=error;if(attempt<2)await delay(120*(attempt+1));}
        }
        throw lastError||new Error('Undo-Sicherung fehlgeschlagen.');
      }
      async function abortCreated(postId,kind,extra={}){
        let lastError=null;
        for(let attempt=0;attempt<3;attempt++){
          try{await historyRequest('kp_create_history_abort',postId,kind,extra);return true}
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
            try{await registerCreated(json.data.id,kind,extra)}
            catch(error){
              const rolledBack=await abortCreated(json.data.id,kind,extra);
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
