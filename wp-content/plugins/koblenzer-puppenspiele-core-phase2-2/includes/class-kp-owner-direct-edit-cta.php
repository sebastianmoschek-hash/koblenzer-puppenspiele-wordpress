<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class KP_Owner_Direct_Edit_CTA {
    public static function init() {
        add_action( 'admin_footer', array( __CLASS__, 'render' ), 5 );
    }

    public static function render() {
        if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
        $screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
        if ( ! $screen || false === strpos( (string) $screen->id, 'kp-schnell-bearbeiten' ) ) { return; }

        $url = add_query_arg( 'kp_edit', '1', home_url( '/' ) );
        ?>
        <style id="kp-owner-direct-edit-cta-css">
          .kp-owner-direct-edit-hero{display:flex;align-items:center;justify-content:space-between;gap:22px;margin:18px 0 24px;padding:24px 26px;border-radius:18px;background:#17110e;color:#fff;box-shadow:0 10px 28px rgba(0,0,0,.10)}
          .kp-owner-direct-edit-hero h2{margin:0 0 7px!important;color:#fff;font-size:24px!important}.kp-owner-direct-edit-hero p{margin:0;color:rgba(255,255,255,.72);font-size:14px;line-height:1.5}.kp-owner-direct-edit-hero .button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border:0;border-radius:999px;background:#f07a22;color:#fff;font-size:15px;font-weight:800;white-space:nowrap;box-shadow:none}.kp-owner-direct-edit-hero .button:hover,.kp-owner-direct-edit-hero .button:focus{background:#d96819;color:#fff}
          .kp-owner-direct-edit-hero .dashicons{margin-right:7px}
          @media(max-width:782px){.kp-owner-direct-edit-hero{align-items:stretch;flex-direction:column;padding:20px}.kp-owner-direct-edit-hero h2{font-size:21px!important}.kp-owner-direct-edit-hero .button{width:100%;box-sizing:border-box}}
        </style>
        <script id="kp-owner-direct-edit-cta-js">
        document.addEventListener('DOMContentLoaded',()=>{
          const hub=document.querySelector('.kp-owner-hub');
          const steps=document.querySelector('.kp-owner-steps');
          if(!hub||!steps||document.querySelector('.kp-owner-direct-edit-hero')) return;
          const box=document.createElement('div');
          box.className='kp-owner-direct-edit-hero';
          box.innerHTML='<div><h2>Website direkt bearbeiten</h2><p>Die echte Homepage öffnen, Text oder Bereich antippen, direkt ändern und speichern – ohne erst den passenden WordPress-Bildschirm zu suchen.</p></div><a class="button" href=' + JSON.stringify(<?php echo wp_json_encode( $url ); ?>) + '><span class="dashicons dashicons-welcome-view-site"></span>Direktbearbeitung starten</a>';
          steps.parentNode.insertBefore(box,steps);
          const old=document.querySelector('.kp-owner-direct-edit-card');
          if(old) old.remove();
        });
        </script>
        <?php
    }
}
