<?php
/**
 * Cloud-free image bridge for the Android Homepage-Hilfe.
 *
 * Image inference (for example background removal) happens on the Android device.
 * This plugin only accepts the resulting PNG from an authenticated technician app,
 * uploads it to the WordPress media library and keeps the replacement as a draft
 * until the user explicitly saves. No image is sent to Gemini/OpenAI here.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_mobile_local_image_guard() {
    if ( ! is_user_logged_in() || ! current_user_can( 'kp_ai_repair_code' ) ) {
        wp_send_json_error( array( 'message' => 'Keine Berechtigung für lokale Bildbearbeitung.' ), 403 );
    }
    if ( ! defined( 'KP_AI_REPAIR_NONCE' ) ) {
        wp_send_json_error( array( 'message' => 'Lokale Reparaturbasis ist nicht geladen.' ), 503 );
    }
    check_ajax_referer( KP_AI_REPAIR_NONCE, 'nonce' );
    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
    if ( ! str_contains( $ua, 'KoblenzerPuppenspieleTechnician/' ) ) {
        wp_send_json_error( array( 'message' => 'Diese lokale Bildfunktion ist nur für die Homepage-Hilfe-App verfügbar.' ), 403 );
    }
}

add_action( 'wp_ajax_kp_mobile_local_image_upload', static function () {
    kp_mobile_local_image_guard();
    $encoded = isset( $_POST['png_base64'] ) ? trim( (string) wp_unslash( $_POST['png_base64'] ) ) : '';
    if ( ! $encoded || strlen( $encoded ) > 24 * 1024 * 1024 ) {
        wp_send_json_error( array( 'message' => 'Das lokal bearbeitete Bild fehlt oder ist zu groß.' ), 413 );
    }
    $bytes = base64_decode( $encoded, true );
    if ( false === $bytes || strlen( $bytes ) < 64 || strlen( $bytes ) > 14 * 1024 * 1024 ) {
        wp_send_json_error( array( 'message' => 'Das lokale PNG ist ungültig.' ), 400 );
    }
    if ( 0 !== strncmp( $bytes, "\x89PNG\r\n\x1a\n", 8 ) ) {
        wp_send_json_error( array( 'message' => 'Lokale Bildbearbeitung akzeptiert ausschließlich PNG.' ), 400 );
    }
    $size = @getimagesizefromstring( $bytes ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
    if ( ! is_array( $size ) || ( $size['mime'] ?? '' ) !== 'image/png' ) {
        wp_send_json_error( array( 'message' => 'Das lokale PNG konnte nicht validiert werden.' ), 400 );
    }
    $width = (int) ( $size[0] ?? 0 );
    $height = (int) ( $size[1] ?? 0 );
    if ( $width < 2 || $height < 2 || $width > 8000 || $height > 8000 || $width * $height > 26000000 ) {
        wp_send_json_error( array( 'message' => 'Die Bildabmessungen liegen außerhalb des sicheren Bereichs.' ), 400 );
    }

    $upload = wp_upload_bits( 'kp-local-ai-' . gmdate( 'Ymd-His' ) . '-' . wp_generate_password( 5, false, false ) . '.png', null, $bytes );
    if ( ! empty( $upload['error'] ) ) {
        wp_send_json_error( array( 'message' => sanitize_text_field( (string) $upload['error'] ) ), 500 );
    }
    $attachment_id = wp_insert_attachment(
        array(
            'post_mime_type' => 'image/png',
            'post_title'     => 'Lokale KI Bildbearbeitung ' . gmdate( 'Y-m-d H:i' ),
            'post_status'    => 'inherit',
        ),
        $upload['file']
    );
    if ( is_wp_error( $attachment_id ) ) {
        @unlink( $upload['file'] ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged,WordPress.WP.AlternativeFunctions.unlink_unlink
        wp_send_json_error( array( 'message' => $attachment_id->get_error_message() ), 500 );
    }
    require_once ABSPATH . 'wp-admin/includes/image.php';
    wp_update_attachment_metadata( $attachment_id, wp_generate_attachment_metadata( $attachment_id, $upload['file'] ) );

    wp_send_json_success( array(
        'url'           => esc_url_raw( $upload['url'] ),
        'attachment_id' => (int) $attachment_id,
        'width'         => $width,
        'height'        => $height,
        'local_ai'      => true,
        'message'       => 'Lokal bearbeitetes Bild bereit · noch nicht gespeichert.',
    ) );
} );

add_action( 'wp_ajax_kp_mobile_local_image_save', static function () {
    kp_mobile_local_image_guard();
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
    if ( ! $valid ) { wp_send_json_error( array( 'message' => 'Keine gültige lokale Bildänderung zum Speichern gefunden.' ), 400 ); }

    if ( class_exists( 'KP_Owner_History' ) ) { KP_Owner_History::checkpoint( 'Lokale KI-Bildbearbeitung gespeichert' ); }
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

    wp_send_json_success( array(
        'saved'    => count( $valid ),
        'local_ai' => true,
        'message'  => 'Lokale Bildänderung gespeichert ✓',
    ) );
} );

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'kp_ai_repair_code' ) || ! defined( 'KP_AI_REPAIR_NONCE' ) ) { return; }
    $config = array(
        'ajaxUrl' => admin_url( 'admin-ajax.php' ),
        'nonce'   => wp_create_nonce( KP_AI_REPAIR_NONCE ),
        'pageKey' => function_exists( 'kp_ai_page_key' ) ? kp_ai_page_key() : '',
    );
    ?>
    <script id="kp-mobile-local-image-tools-runtime">
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
        if(!response.ok||!json?.success)throw new Error(json?.data?.message||'Lokale Bildaktion fehlgeschlagen.');
        return json.data||{};
      }
      function imageFor(liveId){const root=q(`[data-kp-live-id="${CSS.escape(String(liveId||''))}"]`);if(!root)return null;return root instanceof HTMLImageElement?root:root.querySelector('img')}
      function imageKey(img){return window.KPCanvaKeys?.imageKey?.(img)||img?.dataset?.kpCanvaImageKey||''}
      function apply(record){const img=imageFor(record.liveId);if(!img)return false;img.src=record.url;img.removeAttribute('srcset');img.removeAttribute('sizes');return true}
      function restore(entry,which){const record=which==='before'?entry.before:entry.after;if(!apply(record))return false;if(record.pending)pending.set(record.liveId,{...record.pending});else pending.delete(record.liveId);q('.kp-fe2-save')?.classList.toggle('is-dirty',pending.size>0);return true}
      const runtime={
        undo(){const entry=history.pop();if(!entry)return false;redo.push(entry);return restore(entry,'before')},
        redo(){const entry=redo.pop();if(!entry)return false;history.push(entry);return restore(entry,'after')},
        clearRedo(){redo.length=0},
        isDirty:()=>pending.size>0,
        async flush(){if(!pending.size)return{saved:0};const images=[...pending.values()];const out=await post('kp_mobile_local_image_save',{page_key:cfg.pageKey,images});pending.clear();history.length=0;redo.length=0;return out}
      };
      function register(){if(registered)return true;if(window.KPWordHistory?.register){window.KPWordHistory.register('local-image',()=>runtime);registered=true;return true}return false}
      register();const registerTimer=setInterval(()=>{if(register())clearInterval(registerTimer)},400);

      async function replaceLocalImage(liveId,url,attachmentId){
        if(!cfg.pageKey)throw new Error('Die aktuelle Seite ist noch nicht für lokale Bilder vorbereitet.');
        const api=window.KPRepairMobile;
        if(typeof api?.selectElement==='function')await api.selectElement(liveId);
        const img=imageFor(liveId);if(!img)throw new Error('Das ausgewählte Element ist kein Bild.');
        const key=imageKey(img);if(!key)throw new Error('Das Bild konnte nicht eindeutig zugeordnet werden.');
        const parsed=new URL(String(url||''),location.href);if(parsed.origin!==location.origin)throw new Error('Nur Bilder dieser Website dürfen eingesetzt werden.');
        const scope=img.closest('header,footer')?'global':'page';
        const oldPending=pending.get(liveId)?{...pending.get(liveId)}:null;
        const before={liveId,url:img.currentSrc||img.src,pending:oldPending};
        const next={liveId,scope,image_key:key,url:parsed.href,attachment_id:Number(attachmentId)||0};
        pending.set(liveId,next);apply(next);
        const after={liveId,url:next.url,pending:{...next}};
        history.push({before,after});if(history.length>40)history.shift();redo.length=0;
        window.KPWordHistory?.push?.('local-image');q('.kp-fe2-save')?.classList.add('is-dirty');
        return{success:true,unsaved:true,url:next.url,attachment_id:next.attachment_id,local_ai:true,message:'Lokale Bildänderung eingesetzt · noch nicht gespeichert.'};
      }
      function attach(){
        const api=window.KPRepairMobile;if(!api?.ready)return false;if(api.localImageReplaceReady)return true;
        const previousSave=typeof api.saveChanges==='function'?api.saveChanges.bind(api):null;
        const previousElements=typeof api.editableElements==='function'?api.editableElements.bind(api):null;
        api.replaceLocalImage=replaceLocalImage;
        if(previousElements){api.editableElements=()=>{const out=previousElements()||{};for(const item of out.content||[]){if(item?.kind==='image'){item.properties=Array.isArray(item.properties)?item.properties:[];if(!item.properties.includes('remove_background_local'))item.properties.push('remove_background_local')}}out.localImageTools={backgroundRemoval:true,cloud:false};return out}}
        api.saveChanges=async()=>{const localResult=await runtime.flush();const base=previousSave?await previousSave():{success:true};return{...base,localImageSaved:Number(localResult?.saved)||0}};
        api.localImageReplaceReady=true;return true;
      }
      if(!attach()){const timer=setInterval(()=>{if(attach())clearInterval(timer)},250)}
    })();
    </script>
    <?php
}, 2195 );
