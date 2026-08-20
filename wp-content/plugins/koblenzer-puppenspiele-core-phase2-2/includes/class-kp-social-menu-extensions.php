<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Owner-facing menu-position and Social Media extensions.
 * Social is intentionally platform-neutral so further channels can be added
 * without rebuilding the editor structure.
 */
final class KP_Social_Menu_Extensions {
    const OPTION = 'kp_website_studio';

    public static function init() {
        add_action( 'init', array( __CLASS__, 'seed_instagram_profile_once' ), 35 );
        add_filter( 'pre_update_option_' . self::OPTION, array( __CLASS__, 'preserve_extra_settings' ), 20, 2 );
        add_action( 'admin_footer', array( __CLASS__, 'studio_controls' ), 80 );
        add_action( 'wp_head', array( __CLASS__, 'frontend_css' ), 330 );
        add_action( 'wp_footer', array( __CLASS__, 'frontend_markup_and_script' ), 330 );
    }

    public static function seed_instagram_profile_once() {
        if ( get_option( 'kp_instagram_profile_seeded_v1', false ) ) { return; }
        $saved = get_option( self::OPTION, array() );
        if ( ! is_array( $saved ) ) { $saved = array(); }
        if ( empty( $saved['instagram_url'] ) ) {
            $saved['instagram_url'] = 'https://www.instagram.com/koblenzer_puppenspiele/';
            update_option( self::OPTION, $saved, false );
        }
        update_option( 'kp_instagram_profile_seeded_v1', '1', false );
    }

    public static function defaults() {
        return array(
            'menu_offset_x'          => 0,
            'instagram_url'          => '',
            'facebook_url'           => '',
            'youtube_url'            => '',
            'tiktok_url'             => '',
            'instagram_label'        => 'Instagram',
            'instagram_show_footer'  => 1,
            'instagram_show_menu'    => 1,
            'instagram_show_topbar'  => 0,
            'instagram_show_home'    => 0,
        );
    }

    public static function settings() {
        $saved = get_option( self::OPTION, array() );
        if ( ! is_array( $saved ) ) { $saved = array(); }
        return wp_parse_args( $saved, self::defaults() );
    }

    private static function clean_social_url( $platform, $raw ) {
        $url = esc_url_raw( trim( (string) $raw ) );
        if ( ! $url ) { return ''; }
        $host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
        $allowed = array(
            'instagram' => array( 'instagram.com', 'www.instagram.com' ),
            'facebook'  => array( 'facebook.com', 'www.facebook.com', 'm.facebook.com' ),
            'youtube'   => array( 'youtube.com', 'www.youtube.com', 'youtu.be' ),
            'tiktok'    => array( 'tiktok.com', 'www.tiktok.com' ),
        );
        return isset( $allowed[ $platform ] ) && in_array( $host, $allowed[ $platform ], true ) ? $url : '';
    }

    public static function preserve_extra_settings( $new_value, $old_value ) {
        if ( ! is_array( $new_value ) ) { $new_value = array(); }
        $old = is_array( $old_value ) ? $old_value : array();
        $defaults = self::defaults();

        if ( isset( $_POST['action'] ) && 'kp_save_website_studio' === sanitize_key( wp_unslash( $_POST['action'] ) ) ) {
            $raw = isset( $_POST['kp_studio_extra'] ) && is_array( $_POST['kp_studio_extra'] ) ? wp_unslash( $_POST['kp_studio_extra'] ) : array();
            $new_value['menu_offset_x'] = max( -140, min( 140, isset( $raw['menu_offset_x'] ) ? (int) $raw['menu_offset_x'] : 0 ) );
            foreach ( array( 'instagram', 'facebook', 'youtube', 'tiktok' ) as $platform ) {
                $key = $platform . '_url';
                $new_value[ $key ] = self::clean_social_url( $platform, isset( $raw[ $key ] ) ? $raw[ $key ] : ( $old[ $key ] ?? '' ) );
            }
            $label = isset( $raw['instagram_label'] ) ? sanitize_text_field( $raw['instagram_label'] ) : $defaults['instagram_label'];
            $new_value['instagram_label'] = $label ? mb_substr( $label, 0, 40 ) : $defaults['instagram_label'];
            foreach ( array( 'instagram_show_footer', 'instagram_show_menu', 'instagram_show_topbar', 'instagram_show_home' ) as $key ) {
                $new_value[ $key ] = empty( $raw[ $key ] ) ? 0 : 1;
            }
            return $new_value;
        }

        foreach ( array_keys( $defaults ) as $key ) {
            if ( ! array_key_exists( $key, $new_value ) && array_key_exists( $key, $old ) ) {
                $new_value[ $key ] = $old[ $key ];
            }
        }
        return $new_value;
    }

    public static function studio_controls() {
        if ( ! is_admin() || ! current_user_can( 'edit_theme_options' ) ) { return; }
        $screen = get_current_screen();
        if ( ! $screen || false === strpos( (string) $screen->id, 'kp-website-studio' ) ) { return; }
        $s = self::settings();
        ?>
        <script id="kp-social-menu-studio-controls">
        (() => {
          const form=document.getElementById('kp-studio-form');if(!form||document.getElementById('kp-social-settings-card'))return;
          const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
          const menuPanel=document.querySelector('[data-panel="menu"] .kp-studio-card:last-child')||document.querySelector('[data-panel="menu"] .kp-studio-card');
          if(menuPanel){const row=document.createElement('label');row.className='kp-studio-control';row.innerHTML=`<span class="kp-studio-control-head"><strong>Menübutton links / rechts</strong><output><?php echo esc_js( (int) $s['menu_offset_x'] ); ?> px</output></span><input type="range" name="kp_studio_extra[menu_offset_x]" value="<?php echo esc_attr( (int) $s['menu_offset_x'] ); ?>" min="-140" max="140" step="2"><small>Minus = weiter rechts · Plus = weiter links.</small>`;menuPanel.appendChild(row);const range=row.querySelector('input'),out=row.querySelector('output');range?.addEventListener('input',()=>{if(out)out.textContent=`${range.value} px`;});}
          const tabs=document.querySelector('.kp-studio-tabs'),controls=document.querySelector('.kp-studio-controls');if(!tabs||!controls)return;
          const tab=document.createElement('button');tab.type='button';tab.dataset.tab='social';tab.textContent='Social Media';tabs.appendChild(tab);
          const section=document.createElement('section');section.className='kp-studio-tab';section.dataset.panel='social';
          section.innerHTML=`<div class="kp-studio-card" id="kp-social-settings-card"><h2>Social Media</h2><p class="kp-studio-muted">Profile zentral verwalten. Die Besitzer-Web-App zeigt Social als eigenen Hauptbereich.</p>
            <label class="kp-studio-text-control"><strong>Instagram</strong><input type="url" name="kp_studio_extra[instagram_url]" value="${esc(<?php echo wp_json_encode( (string) $s['instagram_url'] ); ?>)}"></label>
            <label class="kp-studio-text-control"><strong>Facebook</strong><input type="url" name="kp_studio_extra[facebook_url]" value="${esc(<?php echo wp_json_encode( (string) $s['facebook_url'] ); ?>)}"></label>
            <label class="kp-studio-text-control"><strong>YouTube</strong><input type="url" name="kp_studio_extra[youtube_url]" value="${esc(<?php echo wp_json_encode( (string) $s['youtube_url'] ); ?>)}"></label>
            <label class="kp-studio-text-control"><strong>TikTok</strong><input type="url" name="kp_studio_extra[tiktok_url]" value="${esc(<?php echo wp_json_encode( (string) $s['tiktok_url'] ); ?>)}"></label>
            <input type="hidden" name="kp_studio_extra[instagram_label]" value="Instagram">
            <div class="kp-social-place-grid">
              <label><input type="hidden" name="kp_studio_extra[instagram_show_footer]" value="0"><input type="checkbox" name="kp_studio_extra[instagram_show_footer]" value="1" <?php checked( (int) $s['instagram_show_footer'], 1 ); ?>> <strong>Footer</strong></label>
              <label><input type="hidden" name="kp_studio_extra[instagram_show_menu]" value="0"><input type="checkbox" name="kp_studio_extra[instagram_show_menu]" value="1" <?php checked( (int) $s['instagram_show_menu'], 1 ); ?>> <strong>Mobiles Menü</strong></label>
              <label><input type="hidden" name="kp_studio_extra[instagram_show_topbar]" value="0"><input type="checkbox" name="kp_studio_extra[instagram_show_topbar]" value="1" <?php checked( (int) $s['instagram_show_topbar'], 1 ); ?>> <strong>Obere Infobar</strong></label>
              <label><input type="hidden" name="kp_studio_extra[instagram_show_home]" value="0"><input type="checkbox" name="kp_studio_extra[instagram_show_home]" value="1" <?php checked( (int) $s['instagram_show_home'], 1 ); ?>> <strong>Startseite</strong></label>
            </div></div>`;controls.appendChild(section);
          tab.addEventListener('click',()=>{tabs.querySelectorAll('button[data-tab]').forEach(b=>b.classList.toggle('is-active',b===tab));controls.querySelectorAll('.kp-studio-tab[data-panel]').forEach(p=>p.classList.toggle('is-active',p===section));});
          const style=document.createElement('style');style.textContent='.kp-social-place-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:16px 0}.kp-social-place-grid label{display:flex;gap:8px;padding:13px;border:1px solid #dcdcde;border-radius:12px;background:#fff}@media(max-width:782px){.kp-social-place-grid{grid-template-columns:1fr}}';document.head.appendChild(style);
        })();
        </script>
        <?php
    }

    public static function frontend_css() {
        if ( is_admin() ) { return; }
        $s = self::settings();
        $x = max( -140, min( 140, (int) $s['menu_offset_x'] ) );
        ?>
        <style id="kp-social-menu-extensions-css">
        :root{--kp-owner-menu-offset-x:<?php echo (int) $x; ?>px}
        @media(max-width:781px){
          .kp-site-nav .wp-block-navigation__responsive-container-open{position:relative!important;right:var(--kp-owner-menu-offset-x)!important}
          body.kp-menu-floating .kp-site-nav .wp-block-navigation__responsive-container-open,body.kp-menu-floating.kp-menu-open .kp-site-nav .wp-block-navigation__responsive-container-open{right:calc(max(14px,env(safe-area-inset-right)) + var(--kp-owner-menu-offset-x))!important}
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,.kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close{right:calc(max(78px,calc(env(safe-area-inset-right) + 68px)) + var(--kp-owner-menu-offset-x))!important}
        }
        .kp-social-link{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;text-decoration:none!important}
        .kp-social-mark{display:inline-grid;place-items:center;width:1.35em;height:1.35em;border:1px solid currentColor;border-radius:50%;font-size:.72em;font-weight:800}
        .kp-social-footer-wrap{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.75rem}.kp-social-footer{padding:.46rem .72rem;border:1px solid color-mix(in srgb,var(--kp-studio-accent,#f07a22) 34%,transparent);border-radius:999px;color:var(--kp-studio-text,#f7f1eb)!important;background:rgba(255,255,255,.035)}
        .kp-social-home-wrap{display:flex;flex-wrap:wrap;justify-content:center;gap:.55rem;margin:1rem auto 0}.kp-social-home{padding:.62rem .95rem;border-radius:999px;background:var(--kp-studio-accent,#f07a22);color:#fff!important;font-weight:750}
        .kp-social-topbar{margin-left:.5rem;color:inherit!important;font-weight:700}.kp-social-menu{margin:.18rem 0!important;padding:.52rem .68rem!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:11px!important;background:rgba(255,255,255,.05)!important;color:#fff!important;font-weight:700!important}
        </style>
        <?php
    }

    public static function frontend_markup_and_script() {
        if ( is_admin() ) { return; }
        $s = self::settings();
        $profiles = array();
        $labels = array( 'instagram' => 'Instagram', 'facebook' => 'Facebook', 'youtube' => 'YouTube', 'tiktok' => 'TikTok' );
        foreach ( $labels as $platform => $label ) {
            $key = $platform . '_url';
            $url = self::clean_social_url( $platform, isset( $s[ $key ] ) ? $s[ $key ] : '' );
            if ( $url ) { $profiles[] = array( 'platform' => $platform, 'label' => $label, 'url' => $url, 'mark' => strtoupper( substr( $label, 0, 1 ) ) ); }
        }
        if ( ! $profiles ) { self::undo_label_script(); return; }
        $config = array(
            'profiles' => $profiles,
            'footer'   => ! empty( $s['instagram_show_footer'] ),
            'menu'     => ! empty( $s['instagram_show_menu'] ),
            'topbar'   => ! empty( $s['instagram_show_topbar'] ),
            'home'     => ! empty( $s['instagram_show_home'] ) && is_front_page(),
        );
        ?>
        <script id="kp-social-placement">
        (()=>{const cfg=<?php echo wp_json_encode( $config ); ?>;
          const make=(p,cls)=>{const a=document.createElement('a');a.className='kp-social-link '+cls+' kp-social-'+p.platform;a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',p.label);a.innerHTML=`<span class="kp-social-mark" aria-hidden="true">${p.mark}</span><span>${p.label}</span>`;return a;};
          const place=()=>{
            if(cfg.footer&&!document.querySelector('.kp-social-footer-wrap')){const footer=document.querySelector('.kp-footer footer,.kp-footer,footer'),host=footer?.querySelector('.wp-block-group,.wp-block-columns')||footer;if(host){const wrap=document.createElement('div');wrap.className='kp-social-footer-wrap';cfg.profiles.forEach(p=>wrap.appendChild(make(p,'kp-social-footer')));host.appendChild(wrap);}}
            if(cfg.menu&&!document.querySelector('.kp-social-menu-item')){const list=document.querySelector('.kp-site-nav .wp-block-navigation__responsive-container-content .wp-block-navigation__container');if(list)cfg.profiles.forEach(p=>{const li=document.createElement('li');li.className='wp-block-navigation-item kp-social-menu-item';li.appendChild(make(p,'kp-social-menu'));list.appendChild(li);});}
            if(cfg.topbar&&!document.querySelector('.kp-social-topbar')){const bar=document.querySelector('.kp-topbar');if(bar)cfg.profiles.forEach(p=>bar.appendChild(make(p,'kp-social-topbar')));}
            if(cfg.home&&!document.querySelector('.kp-social-home-wrap')){const hero=document.querySelector('.kp-booking-section,.kp-next-section,.kp-hero');if(hero){const wrap=document.createElement('div');wrap.className='kp-social-home-wrap';cfg.profiles.forEach(p=>wrap.appendChild(make(p,'kp-social-home')));hero.insertAdjacentElement('afterend',wrap);}}
          };if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',place,{once:true});else place();
        })();
        </script>
        <?php
        self::undo_label_script();
    }

    private static function undo_label_script() {
        ?>
        <script id="kp-fe-undo-clarity">
        (()=>{const improve=()=>{const button=document.querySelector('.kp-fe2-undo');if(!button)return;const label=button.querySelector('span:last-child');if(label)label.textContent='Rückgängig';button.title='Letzte noch nicht abgeschlossene Bearbeitungsänderung rückgängig machen';const sync=()=>{const save=document.querySelector('.kp-fe2-save'),hasChange=Boolean(save?.classList.contains('is-dirty'));button.classList.toggle('is-muted',!hasChange);button.setAttribute('aria-disabled',hasChange?'false':'true');};sync();const save=document.querySelector('.kp-fe2-save');if(save)new MutationObserver(sync).observe(save,{attributes:true,attributeFilter:['class']});};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',improve,{once:true});else improve();})();
        </script>
        <style id="kp-fe-undo-clarity-css">.kp-fe2-undo.is-muted{opacity:.48}.kp-fe2-undo.is-muted:hover{opacity:.62}</style>
        <?php
    }
}
