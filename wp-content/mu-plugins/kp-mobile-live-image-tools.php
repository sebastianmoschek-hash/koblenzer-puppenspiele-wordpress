<?php
/**
 * Direct image editing for the Android Gemini Live agent.
 * Uses the existing server-side Gemini key, never the legacy text-planning UI.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_mobile_live_image_guard() {
    if ( ! is_user_logged_in() || ! current_user_can( 'kp_ai_repair_code' ) ) {
        wp_send_json_error( array( 'message' => 'Keine Berechtigung für die Live-Bildbearbeitung.' ), 403 );
    }
    if ( ! defined( 'KP_AI_REPAIR_NONCE' ) ) {
        wp_send_json_error( array( 'message' => 'Live-Reparaturbasis ist nicht geladen.' ), 503 );
    }
    check_ajax_referer( KP_AI_REPAIR_NONCE, 'nonce' );
    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
    if ( ! str_contains( $ua, 'KoblenzerPuppenspieleTechnician/' ) ) {
        wp_send_json_error( array( 'message' => 'Diese Bildfunktion ist nur für die Homepage-Hilfe-App verfügbar.' ), 403 );
    }
}

function kp_mobile_live_find_image_block( $node ) {
    if ( function_exists( 'kp_ai_find_image_block' ) ) { return kp_ai_find_image_block( $node ); }
    if ( ! is_array( $node ) ) { return null; }
    if ( isset( $node['type'], $node['data'] ) && 'image' === $node['type'] && is_string( $node['data'] ) ) {
        return array(
            'data'      => $node['data'],
            'mime_type' => sanitize_mime_type( (string) ( $node['mime_type'] ?? 'image/png' ) ) ?: 'image/png',
        );
    }
    foreach ( $node as $child ) {
        if ( is_array( $child ) ) {
            $found = kp_mobile_live_find_image_block( $child );
            if ( $found ) { return $found; }
        }
    }
    return null;
}

add_action( 'wp_ajax_kp_mobile_live_image_edit', static function () {
    kp_mobile_live_image_guard();
    if ( ! function_exists( 'kp_ai_key' ) ) {
        wp_send_json_error( array( 'message' => 'Gemini-Basisintegration ist nicht geladen.' ), 503 );
    }
    $key = kp_ai_key();
    if ( ! $key ) { wp_send_json_error( array( 'message' => 'Gemini ist serverseitig noch nicht verbunden.' ), 409 ); }

    $prompt = isset( $_POST['prompt'] ) ? sanitize_textarea_field( wp_unslash( $_POST['prompt'] ) ) : '';
    $image_url = isset( $_POST['image_url'] ) ? esc_url_raw( wp_unslash( $_POST['image_url'] ) ) : '';
    if ( ! $prompt || ! $image_url ) { wp_send_json_error( array( 'message' => 'Bild oder Bearbeitungswunsch fehlt.' ), 400 ); }

    $home_host = strtolower( (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST ) );
    $image_host = strtolower( (string) wp_parse_url( $image_url, PHP_URL_HOST ) );
    if ( ! $home_host || $image_host !== $home_host ) {
        wp_send_json_error( array( 'message' => 'Es können nur Bilder dieser Website bearbeitet werden.' ), 400 );
    }

    try {
        $source = wp_safe_remote_get( $image_url, array( 'timeout' => 25, 'redirection' => 3 ) );
        if ( is_wp_error( $source ) || 200 !== (int) wp_remote_retrieve_response_code( $source ) ) {
            throw new RuntimeException( 'Das ausgewählte Bild konnte nicht geladen werden.' );
        }
        $bytes = (string) wp_remote_retrieve_body( $source );
        if ( ! $bytes || strlen( $bytes ) > 12 * 1024 * 1024 ) {
            throw new RuntimeException( 'Das Bild ist für die direkte KI-Bearbeitung zu groß.' );
        }
        $mime = sanitize_mime_type( (string) wp_remote_retrieve_header( $source, 'content-type' ) );
        if ( ! str_starts_with( $mime, 'image/' ) ) { $mime = 'image/jpeg'; }

        $payload = array(
            'model' => 'gemini-3.1-flash-image',
            'input' => array(
                array(
                    'type' => 'text',
                    'text' => $prompt . ' Bewahre Motiv, Seitenverhältnis und wesentliche Bildqualität, sofern der Wunsch nichts anderes verlangt.',
                ),
                array( 'type' => 'image', 'mime_type' => $mime, 'data' => base64_encode( $bytes ) ),
            ),
            'response_format' => array( 'type' => 'image', 'mime_type' => 'image/png', 'image_size' => '1K' ),
        );
        $response = wp_remote_post( 'https://generativelanguage.googleapis.com/v1beta/interactions', array(
            'timeout' => 90,
            'headers' => array(
                'Content-Type'   => 'application/json',
                'x-goog-api-key' => $key,
            ),
            'body' => wp_json_encode( $payload ),
        ) );
        if ( is_wp_error( $response ) ) { throw new RuntimeException( $response->get_error_message() ); }
        $code = (int) wp_remote_retrieve_response_code( $response );
        $body = json_decode( (string) wp_remote_retrieve_body( $response ), true );
        if ( $code < 200 || $code >= 300 || ! is_array( $body ) ) {
            $message = is_array( $body ) ? (string) ( $body['error']['message'] ?? 'Gemini hat die Bildbearbeitung abgelehnt.' ) : 'Gemini hat keine gültige Bildantwort geliefert.';
            throw new RuntimeException( $message );
        }
        $image = kp_mobile_live_find_image_block( $body );
        if ( ! $image ) { throw new RuntimeException( 'Gemini hat kein bearbeitetes Bild zurückgegeben.' ); }
        $out = base64_decode( $image['data'], true );
        if ( ! $out ) { throw new RuntimeException( 'Das KI-Bild konnte nicht gelesen werden.' ); }

        $upload = wp_upload_bits( 'kp-live-ai-' . gmdate( 'Ymd-His' ) . '.png', null, $out );
        if ( ! empty( $upload['error'] ) ) { throw new RuntimeException( sanitize_text_field( $upload['error'] ) ); }
        $attachment_id = wp_insert_attachment(
            array(
                'post_mime_type' => 'image/png',
                'post_title'     => 'Gemini Live Bild ' . gmdate( 'Y-m-d H:i' ),
                'post_status'    => 'inherit',
            ),
            $upload['file']
        );
        if ( is_wp_error( $attachment_id ) ) { throw new RuntimeException( $attachment_id->get_error_message() ); }
        require_once ABSPATH . 'wp-admin/includes/image.php';
        wp_update_attachment_metadata( $attachment_id, wp_generate_attachment_metadata( $attachment_id, $upload['file'] ) );

        wp_send_json_success( array(
            'url'           => esc_url_raw( $upload['url'] ),
            'attachment_id' => (int) $attachment_id,
            'message'       => 'Bild bearbeitet · noch nicht gespeichert.',
        ) );
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => sanitize_text_field( $e->getMessage() ) ), 500 );
    }
} );

add_action( 'wp_ajax_kp_mobile_live_image_save', static function () {
    kp_mobile_live_image_guard();
    $page_key = isset( $_POST['page_key'] ) ? sanitize_text_field( wp_unslash( $_POST['page_key'] ) ) : '';
    if ( ! preg_match( '/^(post-[0-9]+|path-[a-f0-9]{16})$/', $page_key ) ) {
        wp_send_json_error( array( 'message' => 'Die aktuelle Seite konnte nicht eindeutig zugeordnet werden.' ), 400 );
    }
    $raw = isset( $_POST['images'] ) ? json_decode( wp_unslash( $_POST['images'] ), true ) : array();
    if ( ! is_array( $raw ) || ! $raw ) { wp_send_json_success( array( 'saved' => 0 ) ); }

    $home_host = strtolower( (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST ) );
    $valid = array();
    foreach ( array_slice( $raw, 0, 20 ) as $item ) {
        if ( ! is_array( $item ) ) { continue; }
        $scope = ( isset( $item['scope'] ) && 'global' === $item['scope'] ) ? 'global' : 'page';
        $image_key = sanitize_key( (string) ( $item['image_key'] ?? '' ) );
        $url = esc_url_raw( (string) ( $item['url'] ?? '' ) );
        $host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
        if ( ! $image_key || ! $url || $host !== $home_host ) { continue; }
        $valid[] = array(
            'scope'         => $scope,
            'image_key'     => $image_key,
            'url'           => $url,
            'attachment_id' => absint( $item['attachment_id'] ?? 0 ),
        );
    }
    if ( ! $valid ) { wp_send_json_error( array( 'message' => 'Keine gültige Bildänderung zum Speichern gefunden.' ), 400 ); }

    if ( class_exists( 'KP_Owner_History' ) ) { KP_Owner_History::checkpoint( 'Gemini-Live-Bildbearbeitung gespeichert' ); }
    $global_option = defined( 'KP_AI_IMAGE_GLOBAL' ) ? KP_AI_IMAGE_GLOBAL : 'kp_ai_image_replacements_global_v1';
    $pages_option  = defined( 'KP_AI_IMAGE_PAGES' ) ? KP_AI_IMAGE_PAGES : 'kp_ai_image_replacements_pages_v1';
    $global = get_option( $global_option, array() ); if ( ! is_array( $global ) ) { $global = array(); }
    $pages = get_option( $pages_option, array() ); if ( ! is_array( $pages ) ) { $pages = array(); }
    $page = isset( $pages[ $page_key ] ) && is_array( $pages[ $page_key ] ) ? $pages[ $page_key ] : array();

    foreach ( $valid as $item ) {
        $record = array( 'url' => $item['url'], 'attachment_id' => $item['attachment_id'] );
        if ( 'global' === $item['scope'] ) { $global[ $item['image_key'] ] = $record; }
        else { $page[ $item['image_key'] ] = $record; }
    }
    update_option( $global_option, $global, false );
    $pages[ $page_key ] = $page;
    update_option( $pages_option, $pages, false );

    wp_send_json_success( array( 'saved' => count( $valid ), 'message' => 'Gemini-Bildänderung gespeichert ✓' ) );
} );

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'kp_ai_repair_code' ) || ! defined( 'KP_AI_REPAIR_NONCE' ) ) { return; }
    $config = array(
        'ajaxUrl' => admin_url( 'admin-ajax.php' ),
        'nonce'   => wp_create_nonce( KP_AI_REPAIR_NONCE ),
        'pageKey' => function_exists( 'kp_ai_page_key' ) ? kp_ai_page_key() : '',
    );
    ?>
    <script id="kp-mobile-live-image-tools-runtime">
    (()=>{
      'use strict';
      if(!/KoblenzerPuppenspieleTechnician\//.test(navigator.userAgent))return;
      const cfg=<?php echo wp_json_encode( $config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;
      const pending=new Map(),history=[],redo=[];
      let registered=false;
      const q=s=>document.querySelector(s);
      async function post(action,fields={}){
        const fd=new FormData();fd.append('action',action);fd.append('nonce',cfg.nonce);
        Object.entries(fields).forEach(([k,v])=>fd.append(k,typeof v==='string'?v:JSON.stringify(v)));
        const response=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});
        const json=await response.json().catch(()=>null);
        if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Live-Bildaktion fehlgeschlagen.');
        return json.data||{};
      }
      function imageFor(liveId){const root=q(`[data-kp-live-id="${CSS.escape(String(liveId||''))}"]`);if(!root)return null;return root instanceof HTMLImageElement?root:root.querySelector('img')}
      function imageKey(img){return window.KPCanvaKeys?.imageKey?.(img)||img?.dataset?.kpCanvaImageKey||''}
      function apply(record){const img=imageFor(record.liveId);if(!img)return false;img.src=record.url;img.removeAttribute('srcset');img.removeAttribute('sizes');return true}
      function restore(entry,which){
        const record=which==='before'?entry.before:entry.after;
        if(!apply(record))return false;
        if(record.pending)pending.set(record.liveId,{...record.pending});else pending.delete(record.liveId);
        q('.kp-fe2-save')?.classList.toggle('is-dirty',pending.size>0);
        return true;
      }
      const runtime={
        undo(){const entry=history.pop();if(!entry)return false;redo.push(entry);return restore(entry,'before')},
        redo(){const entry=redo.pop();if(!entry)return false;history.push(entry);return restore(entry,'after')},
        clearRedo(){redo.length=0},
        isDirty:()=>pending.size>0,
        async flush(){
          if(!pending.size)return{saved:0};
          const images=[...pending.values()];
          const out=await post('kp_mobile_live_image_save',{page_key:cfg.pageKey,images});
          pending.clear();history.length=0;redo.length=0;
          return out;
        }
      };
      function register(){if(registered)return true;if(window.KPWordHistory?.register){window.KPWordHistory.register('live-image',()=>runtime);registered=true;return true}return false}
      register();const registerTimer=setInterval(()=>{if(register()){clearInterval(registerTimer)}},400);

      async function editImage(liveId,prompt){
        if(!cfg.pageKey)throw new Error('Die aktuelle Seite ist noch nicht für KI-Bilder vorbereitet.');
        await window.KPRepairMobile.selectElement(liveId);
        const img=imageFor(liveId);if(!img)throw new Error('Das ausgewählte Element ist kein Bild.');
        const key=imageKey(img);if(!key)throw new Error('Das Bild konnte nicht eindeutig zugeordnet werden.');
        const scope=img.closest('header,footer')?'global':'page';
        const oldPending=pending.get(liveId)?{...pending.get(liveId)}:null;
        const before={liveId,url:img.currentSrc||img.src,pending:oldPending};
        const data=await post('kp_mobile_live_image_edit',{prompt:String(prompt||''),image_url:img.currentSrc||img.src});
        const next={liveId,scope,image_key:key,url:String(data.url||''),attachment_id:Number(data.attachment_id)||0};
        if(!next.url)throw new Error('Gemini hat kein verwendbares Bild geliefert.');
        pending.set(liveId,next);apply(next);
        const after={liveId,url:next.url,pending:{...next}};
        history.push({before,after});if(history.length>40)history.shift();redo.length=0;
        window.KPWordHistory?.push?.('live-image');q('.kp-fe2-save')?.classList.add('is-dirty');
        return{success:true,unsaved:true,url:next.url,attachment_id:next.attachment_id,message:data.message||'Bild bearbeitet · noch nicht gespeichert.'};
      }
      function attach(){
        if(!window.KPRepairMobile?.ready)return false;
        if(window.KPRepairMobile.editImage)return true;
        const previousSave=window.KPRepairMobile.saveChanges?.bind(window.KPRepairMobile);
        window.KPRepairMobile.editImage=editImage;
        window.KPRepairMobile.saveChanges=async()=>{
          const imageResult=await runtime.flush();
          const base=previousSave?await previousSave():{success:true};
          return{...base,imageSaved:Number(imageResult?.saved)||0};
        };
        window.KPRepairMobile.imageEditReady=true;
        return true;
      }
      if(!attach()){const timer=setInterval(()=>{if(attach())clearInterval(timer)},250)}
    })();
    </script>
    <?php
}, 2190 );
