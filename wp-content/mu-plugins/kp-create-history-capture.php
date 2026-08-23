<?php
/**
 * Captures successful owner create requests and registers them with the
 * reversible create-history runtime without changing the legacy create UI.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_ajax_kp_create_history_record', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) {
        wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 );
    }
    check_ajax_referer( 'kp_owner_web_app', 'nonce' );
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

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    $ajax = admin_url( 'admin-ajax.php' );
    $nonce = wp_create_nonce( 'kp_owner_web_app' );
    ?>
    <script id="kp-create-history-capture-runtime">
    (()=>{
      'use strict';
      const ajaxUrl=<?php echo wp_json_encode( $ajax ); ?>,nonce=<?php echo wp_json_encode( $nonce ); ?>;
      const inheritedFetch=window.fetch.bind(window);
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
      async function registerCreated(postId,kind,extra={}){
        const fd=new FormData();fd.append('action','kp_create_history_record');fd.append('nonce',nonce);fd.append('post_id',String(postId));fd.append('kind',kind);fd.append('extra',JSON.stringify(extra));
        const response=await inheritedFetch(ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
        const json=await response.json().catch(()=>null);
        if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Anlegen konnte nicht in Undo aufgenommen werden.');
        const id=String(json.data?.action_id||'');
        if(id)window.KPCreateHistoryRuntime?.remember?.(id);
        return json.data||{};
      }
      window.fetch=async(input,init={})=>{
        const action=actionFrom(init?.body);
        const isRecord=action==='kp_owner_record_create',isPage=action==='kp_owner_page_create';
        const response=await inheritedFetch(input,init);
        if((isRecord||isPage)&&response.ok){
          try{
            const json=await response.clone().json();
            if(json?.success&&json?.data?.id){
              if(isPage){
                let fields={};try{fields=JSON.parse(String(fieldFrom(init.body,'fields')||'{}'))||{}}catch(_){}
                await registerCreated(json.data.id,'page',{
                  add_nav:!!fields.add_nav,
                  label:String(json.data.label||fields.title||''),
                  url:String(json.data.url||'')
                });
              }else{
                const kind=String(fieldFrom(init.body,'type')||'');
                if(kind==='termin'||kind==='repertoire')await registerCreated(json.data.id,kind,{});
              }
            }
          }catch(error){
            console.error('[KP] Anlege-Schritt konnte nicht für Undo/Redo registriert werden.',error);
          }
        }
        return response;
      };
    })();
    </script>
    <?php
}, 2070 );
