<?php
/**
 * Word-style owner undo / redo for the direct homepage editor.
 *
 * Keeps the existing 48-hour version archive intact, adds a linear redo stack,
 * and exposes compact Back/Forward controls in the bottom design action bar.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class KP_Owner_Undo_Redo {
    const HISTORY_OPTION = 'kp_owner_history_v1';
    const REDO_OPTION    = 'kp_owner_history_redo_v2';
    const RETENTION      = 172800; // 48 hours.
    const MAX_ITEMS      = 80;
    const NAV_LIMIT      = 50; // User asked for >=20; keep 50 available through the same arrows.

    public static function init() {
        add_action( 'wp_ajax_kp_owner_history_list', array( __CLASS__, 'ajax_list' ), 0 );
        add_action( 'wp_ajax_kp_owner_history_undo', array( __CLASS__, 'ajax_undo' ), 0 );
        add_action( 'wp_ajax_kp_owner_history_redo', array( __CLASS__, 'ajax_redo' ), 0 );

        $save_actions = array(
            'kp_owner_design_save',
            'kp_owner_sizes_save',
            'kp_owner_menu_x_save',
            'kp_owner_nav_save',
            'kp_fe_v2_save',
            'kp_touch_free_layout_save',
            'kp_touch_gesture_save',
            'kp_image_position_save',
            'kp_fe_v2_record_save',
            'kp_frontend_card_image_save',
            'kp_frontend_card_button_save',
        );
        foreach ( $save_actions as $action ) {
            add_action( 'wp_ajax_' . $action, array( __CLASS__, 'clear_redo_on_new_change' ), 2 );
        }

        add_action( 'wp_footer', array( __CLASS__, 'print_ui' ), 1000 );
    }

    private static function can_edit() {
        return is_user_logged_in() && current_user_can( 'edit_pages' );
    }

    private static function authorize() {
        if ( ! self::can_edit() ) {
            wp_send_json_error( array( 'message' => 'Keine Berechtigung.' ), 403 );
        }
        if ( class_exists( 'KP_Owner_Web_App' ) ) {
            check_ajax_referer( KP_Owner_Web_App::NONCE_ACTION, 'nonce' );
        } else {
            wp_send_json_error( array( 'message' => 'Editor ist noch nicht bereit.' ), 500 );
        }
    }

    private static function prune( $items ) {
        if ( ! is_array( $items ) ) { return array(); }
        $cutoff = time() - self::RETENTION;
        $items = array_values( array_filter( $items, static function ( $item ) use ( $cutoff ) {
            return is_array( $item ) && isset( $item['ts'] ) && (int) $item['ts'] >= $cutoff;
        } ) );
        if ( count( $items ) > self::MAX_ITEMS ) {
            $items = array_slice( $items, -self::MAX_ITEMS );
        }
        return $items;
    }

    private static function history() {
        return self::prune( get_option( self::HISTORY_OPTION, array() ) );
    }

    private static function redo() {
        $items = get_option( self::REDO_OPTION, array() );
        if ( ! is_array( $items ) ) { return array(); }
        return array_slice( array_values( $items ), -self::NAV_LIMIT );
    }

    public static function clear_redo_on_new_change() {
        if ( self::can_edit() ) {
            update_option( self::REDO_OPTION, array(), false );
        }
    }

    private static function option_names() {
        return array(
            'kp_website_studio',
            'kp_responsive_sizes',
            'kp_owner_navigation_v1',
            'kp_frontend_editor_global_v1',
            'kp_frontend_editor_pages_v1',
            'kp_touch_free_layout_global_v1',
            'kp_touch_free_layout_pages_v1',
            'kp_touch_gestures_global_v1',
            'kp_touch_gestures_pages_v1',
            'kp_image_position_global_v1',
            'kp_image_position_pages_v1',
        );
    }

    private static function entity_state( $id ) {
        $id = absint( $id );
        if ( ! $id || ! current_user_can( 'edit_post', $id ) ) { return null; }
        $post = get_post( $id );
        if ( ! $post ) { return null; }

        $meta = array();
        foreach ( get_post_meta( $id ) as $key => $values ) {
            if ( '_thumbnail_id' !== $key && 0 !== strpos( $key, '_kp_' ) ) { continue; }
            $meta[ $key ] = array_values( $values );
        }
        $terms = array();
        foreach ( get_object_taxonomies( $post->post_type ) as $taxonomy ) {
            $ids = wp_get_object_terms( $id, $taxonomy, array( 'fields' => 'ids' ) );
            if ( ! is_wp_error( $ids ) ) { $terms[ $taxonomy ] = array_map( 'intval', $ids ); }
        }

        return array(
            'id'           => (int) $id,
            'post_type'    => (string) $post->post_type,
            'post_status'  => (string) $post->post_status,
            'post_title'   => (string) $post->post_title,
            'post_name'    => (string) $post->post_name,
            'post_excerpt' => (string) $post->post_excerpt,
            'post_content' => (string) $post->post_content,
            'menu_order'   => (int) $post->menu_order,
            'meta'         => $meta,
            'terms'        => $terms,
        );
    }

    private static function state( $entity_id = 0 ) {
        $options = array();
        foreach ( self::option_names() as $name ) {
            $value = get_option( $name, '__kp_missing__' );
            $exists = '__kp_missing__' !== $value;
            $options[ $name ] = array( 'exists' => $exists, 'value' => $exists ? $value : null );
        }
        return array(
            'options' => $options,
            'entity'  => $entity_id ? self::entity_state( $entity_id ) : null,
        );
    }

    private static function restore_entity( $entity ) {
        if ( ! is_array( $entity ) || empty( $entity['id'] ) ) { return true; }
        $id = absint( $entity['id'] );
        if ( ! $id || ! current_user_can( 'edit_post', $id ) || ! get_post( $id ) ) { return false; }

        $updated = wp_update_post( array(
            'ID'           => $id,
            'post_status'  => sanitize_key( isset( $entity['post_status'] ) ? $entity['post_status'] : 'publish' ),
            'post_title'   => isset( $entity['post_title'] ) ? (string) $entity['post_title'] : '',
            'post_name'    => isset( $entity['post_name'] ) ? sanitize_title( $entity['post_name'] ) : '',
            'post_excerpt' => isset( $entity['post_excerpt'] ) ? (string) $entity['post_excerpt'] : '',
            'post_content' => isset( $entity['post_content'] ) ? (string) $entity['post_content'] : '',
            'menu_order'   => isset( $entity['menu_order'] ) ? (int) $entity['menu_order'] : 0,
        ), true );
        if ( is_wp_error( $updated ) ) { return false; }

        foreach ( get_post_meta( $id ) as $key => $values ) {
            if ( '_thumbnail_id' === $key || 0 === strpos( $key, '_kp_' ) ) { delete_post_meta( $id, $key ); }
        }
        if ( ! empty( $entity['meta'] ) && is_array( $entity['meta'] ) ) {
            foreach ( $entity['meta'] as $key => $values ) {
                if ( '_thumbnail_id' !== $key && 0 !== strpos( $key, '_kp_' ) ) { continue; }
                foreach ( (array) $values as $value ) { add_post_meta( $id, $key, maybe_unserialize( $value ) ); }
            }
        }
        if ( ! empty( $entity['terms'] ) && is_array( $entity['terms'] ) ) {
            foreach ( $entity['terms'] as $taxonomy => $ids ) {
                if ( taxonomy_exists( $taxonomy ) ) { wp_set_object_terms( $id, array_map( 'intval', (array) $ids ), $taxonomy, false ); }
            }
        }
        return true;
    }

    private static function restore_state( $state ) {
        if ( ! is_array( $state ) || empty( $state['options'] ) || ! is_array( $state['options'] ) ) { return false; }
        foreach ( self::option_names() as $name ) {
            if ( ! array_key_exists( $name, $state['options'] ) ) { continue; }
            $entry = $state['options'][ $name ];
            if ( ! is_array( $entry ) || empty( $entry['exists'] ) ) { delete_option( $name ); }
            else { update_option( $name, $entry['value'], false ); }
        }
        if ( isset( $state['entity'] ) && ! self::restore_entity( $state['entity'] ) ) { return false; }
        if ( function_exists( 'wp_cache_flush' ) ) { wp_cache_flush(); }
        return true;
    }

    private static function make_item( $label, $state ) {
        return array(
            'id'       => gmdate( 'YmdHis' ) . '-' . wp_generate_password( 8, false, false ),
            'ts'       => time(),
            'label'    => sanitize_text_field( (string) $label ),
            'user'     => get_current_user_id(),
            'group'    => '',
            'checksum' => hash( 'sha256', wp_json_encode( $state ) ),
            'state'    => $state,
        );
    }

    public static function ajax_list() {
        self::authorize();
        $items = self::history();
        $redo = self::redo();
        update_option( self::HISTORY_OPTION, $items, false );

        $public = array();
        foreach ( array_reverse( $items ) as $index => $item ) {
            $public[] = array(
                'id'    => isset( $item['id'] ) ? (string) $item['id'] : '',
                'ts'    => isset( $item['ts'] ) ? (int) $item['ts'] : 0,
                'label' => isset( $item['label'] ) ? (string) $item['label'] : 'Website geändert',
                'undo'  => $index < self::NAV_LIMIT,
            );
        }

        wp_send_json_success( array(
            'items'           => $public,
            'retention_hours' => 48,
            'undo_steps'      => min( self::NAV_LIMIT, count( $items ) ),
            'redo_steps'      => min( self::NAV_LIMIT, count( $redo ) ),
            'navigation_limit'=> self::NAV_LIMIT,
        ) );
    }

    public static function ajax_undo() {
        self::authorize();
        $items = self::history();
        if ( ! $items ) { wp_send_json_error( array( 'message' => 'Nichts mehr rückgängig.' ), 404 ); }

        $target = array_pop( $items );
        $entity_id = ! empty( $target['state']['entity']['id'] ) ? absint( $target['state']['entity']['id'] ) : 0;
        $redo = self::redo();
        $redo[] = self::make_item( isset( $target['label'] ) ? $target['label'] : 'Website geändert', self::state( $entity_id ) );
        $redo = array_slice( $redo, -self::NAV_LIMIT );

        if ( ! self::restore_state( isset( $target['state'] ) ? $target['state'] : array() ) ) {
            wp_send_json_error( array( 'message' => 'Der vorherige Stand konnte nicht vollständig wiederhergestellt werden.' ), 500 );
        }

        update_option( self::HISTORY_OPTION, self::prune( $items ), false );
        update_option( self::REDO_OPTION, $redo, false );
        wp_send_json_success( array(
            'message'    => 'Rückgängig ✓',
            'undo_steps' => min( self::NAV_LIMIT, count( $items ) ),
            'redo_steps' => min( self::NAV_LIMIT, count( $redo ) ),
        ) );
    }

    public static function ajax_redo() {
        self::authorize();
        $redo = self::redo();
        if ( ! $redo ) { wp_send_json_error( array( 'message' => 'Nichts mehr zum Wiederholen.' ), 404 ); }

        $target = array_pop( $redo );
        $entity_id = ! empty( $target['state']['entity']['id'] ) ? absint( $target['state']['entity']['id'] ) : 0;
        $items = self::history();
        $items[] = self::make_item( isset( $target['label'] ) ? $target['label'] : 'Website geändert', self::state( $entity_id ) );

        if ( ! self::restore_state( isset( $target['state'] ) ? $target['state'] : array() ) ) {
            wp_send_json_error( array( 'message' => 'Der nächste Stand konnte nicht vollständig wiederhergestellt werden.' ), 500 );
        }

        update_option( self::HISTORY_OPTION, self::prune( $items ), false );
        update_option( self::REDO_OPTION, $redo, false );
        wp_send_json_success( array(
            'message'    => 'Wiederholt ✓',
            'undo_steps' => min( self::NAV_LIMIT, count( $items ) ),
            'redo_steps' => min( self::NAV_LIMIT, count( $redo ) ),
        ) );
    }

    public static function print_ui() {
        if ( ! self::can_edit() ) { return; }
        ?>
        <style id="kp-owner-undo-redo-style">
          .kp-oa-history-nav{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;min-width:74px!important;white-space:nowrap!important}
          .kp-oa-history-nav>span:first-child{font-size:20px;line-height:1}
          .kp-oa-history-nav:disabled{opacity:.38!important;cursor:default!important;filter:saturate(.3)}
          @media(max-width:640px){.kp-oa-history-nav{min-width:48px!important;padding-left:9px!important;padding-right:9px!important}.kp-oa-history-nav>span:last-child{display:none}}
        </style>
        <script id="kp-owner-undo-redo-ui">
        (()=>{
          'use strict';
          const cfg=window.KPOwnerWebApp;
          if(!cfg?.canEdit)return;
          const q=(s,r=document)=>r.querySelector(s);
          async function api(action){
            const fd=new FormData();fd.append('action',action);fd.append('nonce',cfg.nonce||'');
            const res=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',body:fd});
            const json=await res.json().catch(()=>null);
            if(!res.ok||!json?.success)throw new Error(json?.data?.message||'Aktion fehlgeschlagen.');
            return json.data||{};
          }
          function toast(text,type='ok'){
            let el=q('.kp-oa-toast')||q('.kp-fe2-toast');
            if(!el){el=document.createElement('div');el.className='kp-oa-toast';document.body.appendChild(el);}
            const base=el.classList.contains('kp-fe2-toast')?'kp-fe2-toast':'kp-oa-toast';
            el.textContent=text;el.className=base+' is-visible is-'+type;
            clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('is-visible'),1800);
          }
          async function refresh(){
            const undo=q('[data-kp-word-undo]'),redo=q('[data-kp-word-redo]');
            if(!undo&&!redo)return;
            try{
              const d=await api('kp_owner_history_list');
              const u=Number(d.undo_steps)||0,r=Number(d.redo_steps)||0;
              if(undo){undo.disabled=!u;undo.title=`Rückgängig (${u} verfügbar)`;}
              if(redo){redo.disabled=!r;redo.title=`Wiederholen (${r} verfügbar)`;}
            }catch(_){ }
          }
          async function go(action){
            const undo=q('[data-kp-word-undo]'),redo=q('[data-kp-word-redo]');
            if(undo)undo.disabled=true;if(redo)redo.disabled=true;
            try{const d=await api(action);toast(d.message||'Erledigt ✓');setTimeout(()=>location.reload(),220);}
            catch(e){toast(e.message||'Aktion fehlgeschlagen.','error');refresh();}
          }
          function install(){
            const actions=q('.kp-oa-sticky-actions');
            if(actions&&!actions.dataset.kpWordHistory){
              actions.dataset.kpWordHistory='1';
              const undo=document.createElement('button');undo.type='button';undo.className='kp-oa-secondary kp-oa-history-nav';undo.dataset.kpWordUndo='1';undo.setAttribute('aria-label','Rückgängig');undo.innerHTML='<span aria-hidden="true">↶</span><span>Zurück</span>';
              const redo=document.createElement('button');redo.type='button';redo.className='kp-oa-secondary kp-oa-history-nav';redo.dataset.kpWordRedo='1';redo.setAttribute('aria-label','Wiederholen');redo.innerHTML='<span aria-hidden="true">↷</span><span>Vor</span>';
              undo.addEventListener('click',()=>go('kp_owner_history_undo'));redo.addEventListener('click',()=>go('kp_owner_history_redo'));
              const preview=[...actions.querySelectorAll('button,a')].find(el=>/vorschau/i.test(el.textContent||''));
              const save=q('.kp-oa-design-save',actions);
              if(preview&&preview.nextSibling){actions.insertBefore(undo,preview.nextSibling);actions.insertBefore(redo,undo.nextSibling);}
              else{actions.insertBefore(undo,save||null);actions.insertBefore(redo,save||null);}
              refresh();
            }
            q('.kp-oa-action-grid [data-kp-history-undo]')?.remove();
          }
          new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
          install();
        })();
        </script>
        <?php
    }
}

add_action( 'plugins_loaded', array( 'KP_Owner_Undo_Redo', 'init' ), 99 );
