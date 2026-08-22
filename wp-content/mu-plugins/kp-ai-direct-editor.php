<?php
/**
 * Natural-language AI editing for the owner frontend editor.
 *
 * Gemini is optional and connected with an owner-provided API key. The key is
 * kept server-side. AI plans are applied to the existing draft runtimes so the
 * normal Preview / Undo / Save workflow remains authoritative.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

const KP_AI_KEY_OPTION = 'kp_gemini_api_key_v1';
const KP_AI_IMAGE_GLOBAL = 'kp_ai_image_replacements_global_v1';
const KP_AI_IMAGE_PAGES = 'kp_ai_image_replacements_pages_v1';
const KP_AI_ELEMENTS_PAGES = 'kp_ai_elements_pages_v1';
const KP_AI_NONCE = 'kp_ai_direct_editor';

function kp_ai_can_edit() { return is_user_logged_in() && current_user_can( 'edit_pages' ); }
function kp_ai_page_key() {
    $id = (int) get_queried_object_id();
    if ( $id > 0 ) { return 'post-' . $id; }
    $uri = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/';
    $path = (string) wp_parse_url( $uri, PHP_URL_PATH );
    return 'path-' . substr( hash( 'sha256', $path ?: '/' ), 0, 16 );
}
function kp_ai_key() {
    if ( defined( 'KP_GEMINI_API_KEY' ) && KP_GEMINI_API_KEY ) { return trim( (string) KP_GEMINI_API_KEY ); }
    $env = getenv( 'GEMINI_API_KEY' );
    if ( is_string( $env ) && $env ) { return trim( $env ); }
    return trim( (string) get_option( KP_AI_KEY_OPTION, '' ) );
}
function kp_ai_guard() {
    if ( ! kp_ai_can_edit() ) { wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 ); }
    check_ajax_referer( KP_AI_NONCE, 'nonce' );
}
function kp_ai_json_body( $response ) {
    if ( is_wp_error( $response ) ) { throw new RuntimeException( $response->get_error_message() ); }
    $code = (int) wp_remote_retrieve_response_code( $response );
    $body = json_decode( (string) wp_remote_retrieve_body( $response ), true );
    if ( $code < 200 || $code >= 300 ) {
        $message = $body['error']['message'] ?? 'Gemini hat die Anfrage abgelehnt.';
        throw new RuntimeException( sanitize_text_field( (string) $message ) );
    }
    if ( ! is_array( $body ) ) { throw new RuntimeException( 'Gemini hat keine gültige Antwort geliefert.' ); }
    return $body;
}
function kp_ai_clean_map( $raw ) {
    if ( ! is_array( $raw ) ) { return array(); }
    $out = array();
    foreach ( $raw as $key => $value ) {
        $key = sanitize_key( (string) $key );
        if ( ! $key || ! is_array( $value ) ) { continue; }
        $url = isset( $value['url'] ) ? esc_url_raw( (string) $value['url'] ) : '';
        if ( ! $url ) { continue; }
        $out[ $key ] = array( 'url' => $url, 'attachment_id' => absint( $value['attachment_id'] ?? 0 ) );
    }
    return $out;
}
function kp_ai_clean_elements( $raw ) {
    if ( ! is_array( $raw ) ) { return array(); }
    $out = array();
    foreach ( $raw as $item ) {
        if ( ! is_array( $item ) ) { continue; }
        $id = sanitize_key( (string) ( $item['id'] ?? '' ) );
        $kind = sanitize_key( (string) ( $item['kind'] ?? 'text' ) );
        if ( ! $id || ! in_array( $kind, array( 'text', 'heading', 'button' ), true ) ) { continue; }
        $out[] = array(
            'id'   => $id,
            'kind' => $kind,
            'text' => sanitize_text_field( (string) ( $item['text'] ?? '' ) ),
            'url'  => esc_url_raw( (string) ( $item['url'] ?? '' ) ),
        );
    }
    return array_slice( $out, 0, 40 );
}

add_action( 'wp_ajax_kp_ai_key_save', static function () {
    kp_ai_guard();
    if ( ! current_user_can( 'manage_options' ) ) { wp_send_json_error( array( 'message' => 'Nur Administratoren können Gemini verbinden.' ), 403 ); }
    $key = isset( $_POST['api_key'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['api_key'] ) ) ) : '';
    if ( strlen( $key ) < 20 ) { wp_send_json_error( array( 'message' => 'Der Gemini-API-Schlüssel sieht unvollständig aus.' ), 400 ); }
    update_option( KP_AI_KEY_OPTION, $key, false );
    wp_send_json_success( array( 'connected' => true, 'message' => 'Gemini verbunden ✓' ) );
} );

add_action( 'wp_ajax_kp_ai_plan', static function () {
    kp_ai_guard();
    $key = kp_ai_key();
    if ( ! $key ) { wp_send_json_error( array( 'message' => 'Gemini ist noch nicht verbunden.', 'needs_key' => true ), 409 ); }
    $request = isset( $_POST['request'] ) ? sanitize_textarea_field( wp_unslash( $_POST['request'] ) ) : '';
    $context_raw = isset( $_POST['context'] ) ? json_decode( wp_unslash( $_POST['context'] ), true ) : array();
    if ( ! $request ) { wp_send_json_error( array( 'message' => 'Bitte sag, was geändert werden soll.' ), 400 ); }
    $context = is_array( $context_raw ) ? $context_raw : array();
    $context_json = wp_json_encode( $context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );

    $system = 'Du bist die direkte Design-KI für die Website Koblenzer Puppenspiele. Antworte ausschließlich mit dem vorgegebenen JSON-Plan. Verwende nur Aktionen, die wirklich nötig sind. Wenn ein Element ausgewählt ist, beziehe relative Wünsche wie „größer“, „weiter links“, „diesen Text“ darauf. Erlaubte Aktionen: set_text; set_link_label; set_link_url; set_style mit key font|padding|width|radius|color|background; set_design mit einem vorhandenen designKeys-Key; set_image_style mit key brightness|contrast|saturation|opacity|grayscale|sepia|blur|rotation|pos_x|pos_y|radius|fit; move mit key x|y und numerischem Pixelwert als value; edit_image für generative Bildbearbeitung/Freistellen; add_element mit key text|heading|button, text und optional url. Für Freistellen/Hintergrund entfernen immer edit_image wählen. Keine PHP-, JavaScript- oder Plugin-Code-Aktion erzeugen.';
    $schema = array(
        'type' => 'object',
        'properties' => array(
            'reply' => array( 'type' => 'string' ),
            'actions' => array(
                'type' => 'array',
                'items' => array(
                    'type' => 'object',
                    'properties' => array(
                        'type' => array( 'type' => 'string', 'enum' => array( 'set_text','set_link_label','set_link_url','set_style','set_design','set_image_style','move','edit_image','add_element' ) ),
                        'key' => array( 'type' => 'string' ),
                        'value' => array( 'type' => 'string' ),
                        'text' => array( 'type' => 'string' ),
                        'url' => array( 'type' => 'string' ),
                        'prompt' => array( 'type' => 'string' ),
                    ),
                    'required' => array( 'type' ),
                ),
            ),
        ),
        'required' => array( 'reply', 'actions' ),
    );
    $payload = array(
        'systemInstruction' => array( 'parts' => array( array( 'text' => $system ) ) ),
        'contents' => array( array( 'role' => 'user', 'parts' => array( array( 'text' => "Wunsch:\n" . $request . "\n\nEditor-Kontext:\n" . $context_json ) ) ) ),
        'generationConfig' => array( 'temperature' => 0.15, 'responseMimeType' => 'application/json', 'responseSchema' => $schema ),
    );
    try {
        $response = wp_remote_post( 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent', array(
            'timeout' => 45,
            'headers' => array( 'Content-Type' => 'application/json', 'x-goog-api-key' => $key ),
            'body' => wp_json_encode( $payload ),
        ) );
        $body = kp_ai_json_body( $response );
        $text = $body['candidates'][0]['content']['parts'][0]['text'] ?? '';
        $plan = json_decode( (string) $text, true );
        if ( ! is_array( $plan ) || ! isset( $plan['actions'] ) || ! is_array( $plan['actions'] ) ) { throw new RuntimeException( 'Gemini hat keinen ausführbaren Änderungsplan geliefert.' ); }
        wp_send_json_success( array( 'plan' => $plan ) );
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
    }
} );

function kp_ai_find_image_block( $node ) {
    if ( ! is_array( $node ) ) { return null; }
    if ( isset( $node['type'], $node['data'] ) && 'image' === $node['type'] && is_string( $node['data'] ) ) {
        return array( 'data' => $node['data'], 'mime_type' => sanitize_mime_type( (string) ( $node['mime_type'] ?? 'image/png' ) ) ?: 'image/png' );
    }
    foreach ( $node as $child ) {
        if ( is_array( $child ) ) { $found = kp_ai_find_image_block( $child ); if ( $found ) { return $found; } }
    }
    return null;
}
add_action( 'wp_ajax_kp_ai_image_edit', static function () {
    kp_ai_guard();
    $key = kp_ai_key();
    if ( ! $key ) { wp_send_json_error( array( 'message' => 'Gemini ist noch nicht verbunden.', 'needs_key' => true ), 409 ); }
    $prompt = isset( $_POST['prompt'] ) ? sanitize_textarea_field( wp_unslash( $_POST['prompt'] ) ) : '';
    $image_url = isset( $_POST['image_url'] ) ? esc_url_raw( wp_unslash( $_POST['image_url'] ) ) : '';
    if ( ! $prompt || ! $image_url ) { wp_send_json_error( array( 'message' => 'Bild oder Bearbeitungswunsch fehlt.' ), 400 ); }
    $home_host = strtolower( (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST ) );
    $image_host = strtolower( (string) wp_parse_url( $image_url, PHP_URL_HOST ) );
    if ( ! $home_host || $image_host !== $home_host ) { wp_send_json_error( array( 'message' => 'Aus Sicherheitsgründen können hier nur Bilder dieser Website bearbeitet werden.' ), 400 ); }
    try {
        $source = wp_safe_remote_get( $image_url, array( 'timeout' => 25, 'redirection' => 3 ) );
        if ( is_wp_error( $source ) || 200 !== (int) wp_remote_retrieve_response_code( $source ) ) { throw new RuntimeException( 'Das ausgewählte Bild konnte nicht geladen werden.' ); }
        $bytes = (string) wp_remote_retrieve_body( $source );
        if ( ! $bytes || strlen( $bytes ) > 12 * 1024 * 1024 ) { throw new RuntimeException( 'Das Bild ist für die direkte KI-Bearbeitung zu groß.' ); }
        $mime = sanitize_mime_type( (string) wp_remote_retrieve_header( $source, 'content-type' ) );
        if ( ! str_starts_with( $mime, 'image/' ) ) { $mime = 'image/jpeg'; }
        $payload = array(
            'model' => 'gemini-3.1-flash-image',
            'input' => array(
                array( 'type' => 'text', 'text' => $prompt . ' Bewahre Motiv, Seitenverhältnis und wesentliche Bildqualität, sofern der Wunsch nichts anderes verlangt.' ),
                array( 'type' => 'image', 'mime_type' => $mime, 'data' => base64_encode( $bytes ) ),
            ),
            'response_format' => array( 'type' => 'image', 'mime_type' => 'image/png', 'image_size' => '1K' ),
        );
        $response = wp_remote_post( 'https://generativelanguage.googleapis.com/v1beta/interactions', array(
            'timeout' => 90,
            'headers' => array( 'Content-Type' => 'application/json', 'x-goog-api-key' => $key ),
            'body' => wp_json_encode( $payload ),
        ) );
        $body = kp_ai_json_body( $response );
        $image = kp_ai_find_image_block( $body );
        if ( ! $image ) { throw new RuntimeException( 'Gemini hat kein bearbeitetes Bild zurückgegeben.' ); }
        $out = base64_decode( $image['data'], true );
        if ( ! $out ) { throw new RuntimeException( 'Das KI-Bild konnte nicht gelesen werden.' ); }
        $upload = wp_upload_bits( 'kp-ai-' . gmdate( 'Ymd-His' ) . '.png', null, $out );
        if ( ! empty( $upload['error'] ) ) { throw new RuntimeException( sanitize_text_field( $upload['error'] ) ); }
        $attachment_id = wp_insert_attachment( array( 'post_mime_type' => 'image/png', 'post_title' => 'KI-Bild ' . gmdate( 'Y-m-d H:i' ), 'post_status' => 'inherit' ), $upload['file'] );
        if ( is_wp_error( $attachment_id ) ) { throw new RuntimeException( $attachment_id->get_error_message() ); }
        require_once ABSPATH . 'wp-admin/includes/image.php';
        wp_update_attachment_metadata( $attachment_id, wp_generate_attachment_metadata( $attachment_id, $upload['file'] ) );
        wp_send_json_success( array( 'url' => esc_url_raw( $upload['url'] ), 'attachment_id' => (int) $attachment_id ) );
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
    }
} );

add_action( 'wp_ajax_kp_ai_draft_save', static function () {
    kp_ai_guard();
    $page_key = isset( $_POST['page_key'] ) ? sanitize_text_field( wp_unslash( $_POST['page_key'] ) ) : '';
    if ( ! preg_match( '/^(post-[0-9]+|path-[a-f0-9]{16})$/', $page_key ) ) { wp_send_json_error( array( 'message' => 'Ungültige Seite.' ), 400 ); }
    if ( class_exists( 'KP_Owner_History' ) ) { KP_Owner_History::checkpoint( 'KI-Bearbeitung geändert' ); }
    $global = kp_ai_clean_map( json_decode( wp_unslash( $_POST['image_global'] ?? '{}' ), true ) );
    $page = kp_ai_clean_map( json_decode( wp_unslash( $_POST['image_page'] ?? '{}' ), true ) );
    $elements = kp_ai_clean_elements( json_decode( wp_unslash( $_POST['elements'] ?? '[]' ), true ) );
    update_option( KP_AI_IMAGE_GLOBAL, $global, false );
    $pages = get_option( KP_AI_IMAGE_PAGES, array() ); if ( ! is_array( $pages ) ) { $pages = array(); }
    if ( $page ) { $pages[ $page_key ] = $page; } else { unset( $pages[ $page_key ] ); }
    update_option( KP_AI_IMAGE_PAGES, $pages, false );
    $element_pages = get_option( KP_AI_ELEMENTS_PAGES, array() ); if ( ! is_array( $element_pages ) ) { $element_pages = array(); }
    if ( $elements ) { $element_pages[ $page_key ] = $elements; } else { unset( $element_pages[ $page_key ] ); }
    update_option( KP_AI_ELEMENTS_PAGES, $element_pages, false );
    wp_send_json_success( array( 'message' => 'KI-Änderungen gespeichert ✓', 'image_global' => (object) $global, 'image_page' => (object) $page, 'elements' => $elements ) );
} );

add_action( 'wp_footer', static function () {
    if ( is_admin() ) { return; }
    $page_key = kp_ai_page_key();
    $global = kp_ai_clean_map( get_option( KP_AI_IMAGE_GLOBAL, array() ) );
    $pages = get_option( KP_AI_IMAGE_PAGES, array() ); if ( ! is_array( $pages ) ) { $pages = array(); }
    $page = kp_ai_clean_map( $pages[ $page_key ] ?? array() );
    $element_pages = get_option( KP_AI_ELEMENTS_PAGES, array() ); if ( ! is_array( $element_pages ) ) { $element_pages = array(); }
    $elements = kp_ai_clean_elements( $element_pages[ $page_key ] ?? array() );
    $can_edit = kp_ai_can_edit();
    $edit_mode = $can_edit && isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    $config = array(
        'ajaxUrl' => admin_url( 'admin-ajax.php' ), 'nonce' => $can_edit ? wp_create_nonce( KP_AI_NONCE ) : '',
        'canEdit' => $can_edit, 'editMode' => $edit_mode, 'connected' => (bool) kp_ai_key(), 'pageKey' => $page_key,
        'imageGlobal' => (object) $global, 'imagePage' => (object) $page, 'elements' => $elements,
        'designKeys' => array( 'accent_color','accent_dark','background_color','nav_color','surface_color','text_color','muted_color','line_color','content_width','wide_width','card_radius','button_radius','body_font','heading_font','motion','show_topbar','topbar_left','topbar_right','show_header_image','header_image_id','header_max_width','header_side_gap','header_radius','header_vertical_gap','desktop_nav_opacity','desktop_nav_height','desktop_nav_radius','menu_color','menu_opacity','menu_blur','menu_width','menu_radius','menu_offset_y','menu_border_opacity','menu_scrim_opacity','menu_item_padding','menu_item_gap','menu_font_delta','menu_button_size' ),
    );
    ?>
    <style id="kp-ai-direct-style">
      .kp-ai-generated-element{position:relative;z-index:1;margin:18px auto;max-width:min(92vw,900px);padding:12px}.kp-ai-generated-element.is-heading{font-size:clamp(26px,5vw,48px);font-weight:800}.kp-ai-generated-element.is-button{display:block;width:max-content;background:#f07a22;color:#fff!important;text-decoration:none;border-radius:999px;padding:12px 20px;font-weight:800}
      .kp-ai-trigger{position:fixed;right:16px;bottom:92px;z-index:2147482500;border:0;border-radius:999px;background:#f07a22;color:#fff;padding:12px 17px;font-weight:850;box-shadow:0 10px 30px rgba(0,0,0,.3)}
      .kp-ai-sheet{position:fixed;z-index:2147482600;left:50%;bottom:12px;transform:translateX(-50%);width:min(720px,calc(100vw - 20px));max-height:min(78vh,720px);overflow:auto;background:#17110e;color:#f7f1eb;border:1px solid rgba(255,255,255,.16);border-radius:22px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.55)}.kp-ai-sheet[hidden]{display:none!important}.kp-ai-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.kp-ai-head strong{font-size:18px}.kp-ai-close{border:0;background:transparent;color:inherit;font-size:28px}.kp-ai-sheet textarea{width:100%;min-height:110px;box-sizing:border-box;margin:12px 0;border-radius:15px;padding:12px;background:#0d0b0a;color:#fff;border:1px solid rgba(255,255,255,.18);font:inherit}.kp-ai-actions{display:flex;gap:8px;flex-wrap:wrap}.kp-ai-actions button{min-height:44px;border-radius:13px;padding:9px 14px;font-weight:800;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:inherit}.kp-ai-actions .is-primary{background:#f07a22;border-color:#f07a22;color:#fff}.kp-ai-status{min-height:22px;margin-top:10px;font-size:13px;opacity:.84}.kp-ai-key{display:grid;gap:8px;margin-top:12px;padding:12px;border-radius:14px;background:rgba(255,255,255,.05)}.kp-ai-key input{min-height:44px;border-radius:11px;padding:8px 10px;background:#0d0b0a;color:#fff;border:1px solid rgba(255,255,255,.18)}body.kp-canva-preview .kp-ai-trigger{display:none!important}
    </style>
    <script id="kp-ai-direct-runtime">
    (()=>{
      'use strict';
      const cfg=<?php echo wp_json_encode( $config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;
      const clone=v=>JSON.parse(JSON.stringify(v||{})),q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
      let imageGlobal=clone(cfg.imageGlobal),imagePage=clone(cfg.imagePage),elements=clone(cfg.elements),savedGlobal=clone(imageGlobal),savedPage=clone(imagePage),savedElements=clone(elements),dirty=false,busy=false;
      const aiHistory=[],aiRedo=[];
      function imageStore(img){return img?.closest?.('header,footer')?imageGlobal:imagePage}
      function imageKey(img){return window.KPCanvaKeys?.imageKey?.(img)||img?.dataset?.kpCanvaImageKey||''}
      function applyImages(root=document){const imgs=[];if(root instanceof HTMLImageElement)imgs.push(root);root.querySelectorAll?.('img').forEach(i=>imgs.push(i));imgs.forEach(img=>{const key=imageKey(img);if(!key)return;const rec=(img.closest('header,footer')?imageGlobal:imagePage)[key];if(rec?.url){img.src=rec.url;img.removeAttribute('srcset');img.removeAttribute('sizes')}})}
      function renderElements(){qa('.kp-ai-generated-element').forEach(el=>el.remove());const main=q('main');if(!main)return;elements.forEach(item=>{let el;if(item.kind==='button'){el=document.createElement('a');el.href=item.url||'#';el.className='kp-ai-generated-element is-button';}else{el=document.createElement(item.kind==='heading'?'h2':'div');el.className='kp-ai-generated-element'+(item.kind==='heading'?' is-heading':'');}el.dataset.kpDomKey='ai-'+item.id;el.textContent=item.text||'';main.appendChild(el)});window.KPCanvaKeys?.assign?.(main)}
      function markDirty(){dirty=true;q('.kp-fe2-save')?.classList.add('is-dirty')}
      function aiState(){return{imageGlobal:clone(imageGlobal),imagePage:clone(imagePage),elements:clone(elements)}}
      function restoreAI(state){imageGlobal=clone(state.imageGlobal);imagePage=clone(state.imagePage);elements=clone(state.elements);applyImages();renderElements();markDirty()}
      function pushAI(before){const after=aiState();if(JSON.stringify(before)===JSON.stringify(after))return;aiHistory.push({before,after});if(aiHistory.length>50)aiHistory.shift();aiRedo.length=0;window.KPWordHistory?.push?.('ai')}
      const aiRuntime={
        undo(){const e=aiHistory.pop();if(!e)return false;aiRedo.push(e);restoreAI(e.before);return true},
        redo(){const e=aiRedo.pop();if(!e)return false;aiHistory.push(e);restoreAI(e.after);return true},
        clearRedo(){aiRedo.length=0},
        async flush(){if(!dirty)return{draft:false};const fd=new FormData();fd.append('action','kp_ai_draft_save');fd.append('nonce',cfg.nonce);fd.append('page_key',cfg.pageKey);fd.append('image_global',JSON.stringify(imageGlobal));fd.append('image_page',JSON.stringify(imagePage));fd.append('elements',JSON.stringify(elements));const r=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});const j=await r.json().catch(()=>null);if(!r.ok||!j?.success)throw new Error(j?.data?.message||'KI-Änderungen konnten nicht gespeichert werden.');savedGlobal=clone(imageGlobal);savedPage=clone(imagePage);savedElements=clone(elements);dirty=false;aiHistory.length=0;aiRedo.length=0;return j.data||{}},
        isDirty:()=>dirty,
        discard(){imageGlobal=clone(savedGlobal);imagePage=clone(savedPage);elements=clone(savedElements);dirty=false;aiHistory.length=0;aiRedo.length=0;applyImages();renderElements()}
      };
      window.KPAIEditorRuntime=aiRuntime;
      const registerHistory=()=>{if(window.KPWordHistory?.register){window.KPWordHistory.register('ai',()=>aiRuntime);return true}return false};registerHistory();setInterval(registerHistory,500);
      applyImages();renderElements();setTimeout(()=>applyImages(),400);new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n instanceof Element)applyImages(n)}))).observe(document.documentElement,{childList:true,subtree:true});
      if(!cfg.editMode||!cfg.canEdit)return;

      function api(action,fields={}){const fd=new FormData();fd.append('action',action);fd.append('nonce',cfg.nonce);Object.entries(fields).forEach(([k,v])=>fd.append(k,typeof v==='string'?v:JSON.stringify(v)));return fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd}).then(async r=>{const j=await r.json().catch(()=>null);if(!r.ok||!j?.success){const e=new Error(j?.data?.message||'KI-Anfrage fehlgeschlagen.');e.needsKey=!!j?.data?.needs_key;throw e}return j.data||{}})}
      function selected(){return q('.kp-fe2-selected')}
      function selectedImage(){const s=selected();return s instanceof HTMLImageElement?s:s?.querySelector?.('img')||null}
      function selectedTarget(){const s=selected();if(!s)return null;return s.matches('a,img,h1,h2,h3,h4,h5,h6,p,li,figcaption')?s:s.querySelector?.('a,img,h1,h2,h3,h4,h5,h6,p,li,figcaption')||s}
      function context(){const s=selected(),t=selectedTarget(),img=selectedImage(),cs=t?getComputedStyle(t):null;return{page:document.title,selected:!!s,tag:t?.tagName||'',text:img?'':(t?.textContent||'').trim().slice(0,1600),href:t?.tagName==='A'?t.getAttribute('href')||'':'',image:img?{src:img.currentSrc||img.src||'',alt:img.alt||''}:null,style:cs?{fontSize:cs.fontSize,color:cs.color,background:cs.backgroundColor,width:cs.width}:null,design:window.KPOwnerWebApp?.design||{},designKeys:cfg.designKeys,viewport:{width:innerWidth,height:innerHeight}}}
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      async function ensureExpanded(){const ins=q('.kp-fe2-inspector.is-open');if(!ins)return null;if(!q('[data-style],[data-style-color]',ins)){q('.kp-fe2-expand',ins)?.click();await wait(80)}return q('.kp-fe2-inspector.is-open')}
      async function setControl(input,value){if(!input)return false;if(input.type==='checkbox')input.checked=/^(1|true|ja|on)$/i.test(String(value));else input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));await wait(20);return true}
      async function applyAction(a){
        const type=String(a.type||''),value=a.value??a.text??'',s=selected(),t=selectedTarget();
        if(type==='set_text'&&t&&!selectedImage()){t.textContent=String(a.text||a.value||'');t.dispatchEvent(new Event('input',{bubbles:true}));return}
        if(type==='set_link_label'||type==='set_link_url'){const ins=q('.kp-fe2-inspector.is-open');const input=q(type==='set_link_label'?'.kp-fe2-link-label':'.kp-fe2-link-url',ins);if(!input)throw new Error('Bitte zuerst den gewünschten Button oder Link antippen.');await setControl(input,type==='set_link_label'?(a.text||value):(a.url||value));return}
        if(type==='set_style'){const ins=await ensureExpanded();if(!ins)throw new Error('Bitte zuerst das Element antippen, das gestaltet werden soll.');const key=String(a.key||'');const sel={font:'[data-style="font"]',padding:'[data-style="padding"]',width:'[data-style="width"]',radius:'[data-style="radius"]',color:'[data-style-color="color"]',background:'[data-style-color="background"]'}[key];if(!sel||!q(sel,ins))throw new Error('Diese Gestaltung ist für das ausgewählte Element nicht verfügbar.');await setControl(q(sel,ins),value);return}
        if(type==='set_design'){let input=q(`[data-design="${CSS.escape(String(a.key||''))}"]`);if(!input){q('.kp-oa-tools')?.click();await wait(70);q('[data-action="design"]')?.click();await wait(120);input=q(`[data-design="${CSS.escape(String(a.key||''))}"]`)}if(!input)throw new Error('Diese Design-Einstellung ist nicht verfügbar.');await setControl(input,value);return}
        if(type==='set_image_style'){const img=selectedImage();if(!img)throw new Error('Bitte zuerst ein Bild antippen.');let panel=q('.kp-canva-image-panel:not([hidden])');if(!panel){q('.kp-canva-image-edit')?.click();await wait(90);panel=q('.kp-canva-image-panel:not([hidden])')}const input=q(`[data-image-edit="${CSS.escape(String(a.key||''))}"]`,panel);if(!input)throw new Error('Diese Bildfunktion ist nicht verfügbar.');await setControl(input,value);return}
        if(type==='move'){if(!s)throw new Error('Bitte zuerst das Element antippen, das verschoben werden soll.');const dx=String(a.key)==='x'?Number(value)||0:0,dy=String(a.key)==='y'?Number(value)||0:0;const r=s.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;s.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:x,clientY:y,button:0}));window.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:x+dx,clientY:y+dy,button:0}));window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:x+dx,clientY:y+dy,button:0}));return}
        if(type==='edit_image'){const img=selectedImage();if(!img)throw new Error('Bitte zuerst das Bild antippen, das Gemini bearbeiten soll.');const before=aiState();setStatus('Gemini bearbeitet das Bild …');const data=await api('kp_ai_image_edit',{prompt:a.prompt||a.text||a.value||'Bearbeite dieses Bild wie gewünscht.',image_url:img.currentSrc||img.src});const key=imageKey(img);if(!key)throw new Error('Das Bild konnte nicht eindeutig zugeordnet werden.');imageStore(img)[key]={url:data.url,attachment_id:Number(data.attachment_id)||0};img.src=data.url;img.removeAttribute('srcset');img.removeAttribute('sizes');markDirty();pushAI(before);return}
        if(type==='add_element'){const before=aiState(),kind=['text','heading','button'].includes(String(a.key))?String(a.key):'text';elements.push({id:'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),kind,text:String(a.text||a.value||'Neues Element'),url:String(a.url||'')});renderElements();markDirty();pushAI(before);return}
      }
      async function applyPlan(plan){for(const action of plan.actions||[])await applyAction(action)}

      let trigger=q('.kp-ai-trigger'),sheet=q('.kp-ai-sheet');
      if(!trigger){trigger=document.createElement('button');trigger.type='button';trigger.className='kp-ai-trigger';trigger.textContent='✦ KI bearbeiten';document.body.appendChild(trigger)}
      if(!sheet){sheet=document.createElement('div');sheet.className='kp-ai-sheet';sheet.hidden=true;sheet.innerHTML=`<div class="kp-ai-head"><div><strong>✦ KI bearbeiten</strong><div style="font-size:12px;opacity:.72">Element antippen oder die ganze Seite beschreiben</div></div><button type="button" class="kp-ai-close" aria-label="Schließen">×</button></div><textarea class="kp-ai-request" placeholder="Zum Beispiel: Mach diesen Text kürzer und freundlicher · Verschiebe den Button 20 Pixel nach links · Stell die Figur im Bild frei …"></textarea><div class="kp-ai-actions"><button type="button" class="kp-ai-mic">🎙 Sprechen</button><button type="button" class="kp-ai-run is-primary">Sofort umsetzen</button></div><div class="kp-ai-status"></div><div class="kp-ai-key" ${cfg.connected?'hidden':''}><strong>Gemini einmalig verbinden</strong><small>Der Schlüssel bleibt serverseitig in WordPress.</small><input type="password" class="kp-ai-key-input" autocomplete="off" placeholder="Gemini API Key"><button type="button" class="kp-ai-key-save">Verbinden</button></div>`;document.body.appendChild(sheet)}
      const status=q('.kp-ai-status',sheet);function setStatus(text){status.textContent=text||''}
      trigger.onclick=()=>{sheet.hidden=false;q('.kp-ai-request',sheet)?.focus()};q('.kp-ai-close',sheet).onclick=()=>{sheet.hidden=true};
      q('.kp-ai-key-save',sheet)?.addEventListener('click',async()=>{const input=q('.kp-ai-key-input',sheet),button=q('.kp-ai-key-save',sheet);button.disabled=true;try{const d=await api('kp_ai_key_save',{api_key:input.value});cfg.connected=!!d.connected;q('.kp-ai-key',sheet).hidden=true;setStatus(d.message||'Gemini verbunden ✓')}catch(e){setStatus(e.message)}finally{button.disabled=false}});
      q('.kp-ai-run',sheet).onclick=async()=>{if(busy)return;const text=q('.kp-ai-request',sheet).value.trim();if(!text)return;busy=true;q('.kp-ai-run',sheet).disabled=true;setStatus('Gemini versteht deinen Wunsch …');try{const d=await api('kp_ai_plan',{request:text,context:context()});await applyPlan(d.plan||{});setStatus((d.plan?.reply||'Änderung umgesetzt.')+' · Noch nicht gespeichert.');q('.kp-ai-request',sheet).value=''}catch(e){setStatus(e.message||'KI-Änderung fehlgeschlagen.');if(e.needsKey)q('.kp-ai-key',sheet).hidden=false}finally{busy=false;q('.kp-ai-run',sheet).disabled=false}};
      const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;q('.kp-ai-mic',sheet).onclick=()=>{if(!Speech){setStatus('Spracherkennung ist in diesem Browser nicht verfügbar.');return}const rec=new Speech();rec.lang='de-DE';rec.interimResults=false;rec.onresult=e=>{q('.kp-ai-request',sheet).value=e.results?.[0]?.[0]?.transcript||'';setStatus('Sprache erkannt ✓')};rec.onerror=()=>setStatus('Sprache konnte nicht erkannt werden.');rec.start();setStatus('Ich höre zu …')};
    })();
    </script>
    <?php
}, 2100 );
