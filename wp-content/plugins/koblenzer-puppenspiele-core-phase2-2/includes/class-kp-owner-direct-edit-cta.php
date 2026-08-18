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
          .kp-owner-hub.is-kp-simple .kp-owner-steps,.kp-owner-hub.is-kp-simple>h2,.kp-owner-hub.is-kp-simple>.kp-owner-hub-grid,.kp-owner-hub.is-kp-simple>.kp-owner-tip{display:none!important}
          .kp-owner-hub.is-kp-simple .kp-owner-hub-head>.button{display:none!important}
          .kp-owner-direct-edit-hero{display:flex;align-items:center;justify-content:space-between;gap:22px;margin:18px 0 18px;padding:26px;border-radius:18px;background:#17110e;color:#fff;box-shadow:0 10px 28px rgba(0,0,0,.10)}
          .kp-owner-direct-edit-hero h2{margin:0 0 7px!important;color:#fff;font-size:24px!important}.kp-owner-direct-edit-hero p{max-width:690px;margin:0;color:rgba(255,255,255,.72);font-size:14px;line-height:1.5}.kp-owner-direct-edit-hero .button{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 22px;border:0;border-radius:999px;background:#f07a22;color:#fff;font-size:15px;font-weight:800;white-space:nowrap;box-shadow:none}.kp-owner-direct-edit-hero .button:hover,.kp-owner-direct-edit-hero .button:focus{background:#d96819;color:#fff}.kp-owner-direct-edit-hero .dashicons{margin-right:7px}
          .kp-owner-admin-more{max-width:760px;margin:0 0 26px;padding:0;border:1px solid #dcdcde;border-radius:13px;background:#fff}.kp-owner-admin-more summary{padding:14px 16px;cursor:pointer;font-weight:700}.kp-owner-admin-links{display:flex;flex-wrap:wrap;gap:8px;padding:0 16px 16px}.kp-owner-admin-links a{color:#8a3e0b;text-decoration:none;font-weight:700}.kp-owner-admin-links a:hover{text-decoration:underline}
          @media(max-width:782px){.kp-owner-direct-edit-hero{align-items:stretch;flex-direction:column;padding:20px}.kp-owner-direct-edit-hero h2{font-size:21px!important}.kp-owner-direct-edit-hero .button{width:100%;box-sizing:border-box}.kp-owner-admin-links{flex-direction:column;gap:11px}}
        </style>
        <script id="kp-owner-direct-edit-cta-js">
        document.addEventListener('DOMContentLoaded',()=>{
          const hub=document.querySelector('.kp-owner-hub');
          const steps=document.querySelector('.kp-owner-steps');
          if(!hub||!steps||document.querySelector('.kp-owner-direct-edit-hero')) return;
          hub.classList.add('is-kp-simple');

          const box=document.createElement('div');
          box.className='kp-owner-direct-edit-hero';
          box.innerHTML='<div><h2>Website bearbeiten</h2><p>Die echte Website öffnen, über das Menü zu jeder Seite wechseln und dort Texte, Bilder, Bereiche, Termine und Repertoire direkt antippen und ändern.</p></div><a class="button" href=' + JSON.stringify(<?php echo wp_json_encode( $url ); ?>) + '><span class="dashicons dashicons-edit"></span>Website bearbeiten</a>';
          steps.parentNode.insertBefore(box,steps);

          const more=document.createElement('details');
          more.className='kp-owner-admin-more';
          more.innerHTML='<summary>Nur wenn etwas neu angelegt werden soll</summary><div class="kp-owner-admin-links"><a href="' + <?php echo wp_json_encode( admin_url( 'post-new.php?post_type=kp_termin' ) ); ?> + '">+ Neuer Termin</a><a href="' + <?php echo wp_json_encode( admin_url( 'post-new.php?post_type=page' ) ); ?> + '">+ Neue Seite</a><a href="' + <?php echo wp_json_encode( admin_url( 'media-new.php' ) ); ?> + '">+ Bild hochladen</a><a href="' + <?php echo wp_json_encode( admin_url( 'admin.php?page=kp-website-studio' ) ); ?> + '">Erweiterte Gestaltung</a></div>';
          box.insertAdjacentElement('afterend',more);
        });
        </script>
        <?php
    }
}
