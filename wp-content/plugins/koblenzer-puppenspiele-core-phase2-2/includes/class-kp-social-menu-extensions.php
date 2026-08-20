<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Small owner-facing extensions that belong to the visual Website Studio:
 * - horizontal position of the mobile menu trigger/panel
 * - Instagram profile link and placement controls
 * - clearer frontend-editor undo affordance
 *
 * These settings are stored alongside the Website Studio option without changing
 * its existing sanitiser. A pre_update_option filter adds the extra safe values.
 */
final class KP_Social_Menu_Extensions {
    const OPTION = 'kp_website_studio';

    public static function init() {
        add_filter( 'pre_update_option_' . self::OPTION, array( __CLASS__, 'preserve_extra_settings' ), 20, 2 );
        add_action( 'admin_footer', array( __CLASS__, 'studio_controls' ), 80 );
        add_action( 'wp_head', array( __CLASS__, 'frontend_css' ), 330 );
        add_action( 'wp_footer', array( __CLASS__, 'frontend_markup_and_script' ), 330 );
    }

    public static function defaults() {
        return array(
            'menu_offset_x'          => 0,
            'instagram_url'          => '',
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

    private static function clean_instagram_url( $raw ) {
        $url = esc_url_raw( trim( (string) $raw ) );
        if ( ! $url ) { return ''; }
        $host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
        if ( ! in_array( $host, array( 'instagram.com', 'www.instagram.com' ), true ) ) { return ''; }
        return $url;
    }

    public static function preserve_extra_settings( $new_value, $old_value ) {
        if ( ! is_array( $new_value ) ) { $new_value = array(); }
        $old = is_array( $old_value ) ? $old_value : array();
        $defaults = self::defaults();

        if ( isset( $_POST['action'] ) && 'kp_save_website_studio' === sanitize_key( wp_unslash( $_POST['action'] ) ) ) {
            $raw = isset( $_POST['kp_studio_extra'] ) && is_array( $_POST['kp_studio_extra'] ) ? wp_unslash( $_POST['kp_studio_extra'] ) : array();
            $new_value['menu_offset_x'] = max( -8, min( 140, isset( $raw['menu_offset_x'] ) ? (int) $raw['menu_offset_x'] : 0 ) );
            $new_value['instagram_url'] = self::clean_instagram_url( isset( $raw['instagram_url'] ) ? $raw['instagram_url'] : '' );
            $label = isset( $raw['instagram_label'] ) ? sanitize_text_field( $raw['instagram_label'] ) : $defaults['instagram_label'];
            $new_value['instagram_label'] = $label ? mb_substr( $label, 0, 40 ) : $defaults['instagram_label'];
            foreach ( array( 'instagram_show_footer', 'instagram_show_menu', 'instagram_show_topbar', 'instagram_show_home' ) as $key ) {
                $new_value[ $key ] = empty( $raw[ $key ] ) ? 0 : 1;
            }
            return $new_value;
        }

        /* Other code may update Website Studio. Keep the extension values intact. */
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
          const form = document.getElementById('kp-studio-form');
          if (!form || document.getElementById('kp-social-settings-card')) return;

          const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
          const menuPanel = document.querySelector('[data-panel="menu"] .kp-studio-card:last-child') || document.querySelector('[data-panel="menu"] .kp-studio-card');
          if (menuPanel) {
            const row = document.createElement('label');
            row.className = 'kp-studio-control';
            row.innerHTML = `<span class="kp-studio-control-head"><strong>Menübutton links / rechts</strong><output id="kp-menu-offset-x-output"><?php echo esc_js( (int) $s['menu_offset_x'] ); ?> px</output></span>
              <input type="range" name="kp_studio_extra[menu_offset_x]" value="<?php echo esc_attr( (int) $s['menu_offset_x'] ); ?>" min="-8" max="140" step="2" id="kp-menu-offset-x">
              <small>0 = aktuelle Position. Nach rechts bis fast an den Rand: negative Werte. Nach links: positive Werte.</small>`;
            menuPanel.appendChild(row);
            const range = row.querySelector('input');
            const output = row.querySelector('output');
            range?.addEventListener('input', () => { if (output) output.textContent = `${range.value} px`; });
          }

          const tabs = document.querySelector('.kp-studio-tabs');
          const controls = document.querySelector('.kp-studio-controls');
          if (!tabs || !controls) return;
          const tab = document.createElement('button');
          tab.type = 'button'; tab.dataset.tab = 'social'; tab.textContent = 'Social & Instagram'; tabs.appendChild(tab);

          const section = document.createElement('section');
          section.className = 'kp-studio-tab'; section.dataset.panel = 'social';
          section.innerHTML = `<div class="kp-studio-card" id="kp-social-settings-card">
            <h2>Instagram</h2>
            <p class="kp-studio-muted">Der Profil-Link kann sofort genutzt werden. Ein automatischer Instagram-Feed wird erst eingeschaltet, wenn später ein echtes Meta/Instagram-Konto technisch verbunden ist.</p>
            <label class="kp-studio-text-control"><strong>Instagram-Profil</strong><input type="url" name="kp_studio_extra[instagram_url]" value="${esc(<?php echo wp_json_encode( (string) $s['instagram_url'] ); ?>)}" placeholder="https://www.instagram.com/…"><small>Erst wenn hier ein gültiger Instagram-Link steht, werden öffentliche Instagram-Buttons angezeigt.</small></label>
            <label class="kp-studio-text-control"><strong>Beschriftung</strong><input type="text" maxlength="40" name="kp_studio_extra[instagram_label]" value="${esc(<?php echo wp_json_encode( (string) $s['instagram_label'] ); ?>)}"></label>
            <div class="kp-social-place-grid">
              <label><input type="hidden" name="kp_studio_extra[instagram_show_footer]" value="0"><input type="checkbox" name="kp_studio_extra[instagram_show_footer]" value="1" <?php checked( (int) $s['instagram_show_footer'], 1 ); ?>> <strong>Footer</strong><small>Empfohlen: dauerhaft und unaufdringlich.</small></label>
              <label><input type="hidden" name="kp_studio_extra[instagram_show_menu]" value="0"><input type="checkbox" name="kp_studio_extra[instagram_show_menu]" value="1" <?php checked( (int) $s['instagram_show_menu'], 1 ); ?>> <strong>Mobiles Menü</strong><small>Schnell erreichbar auf dem Handy.</small></label>
              <label><input type="hidden" name="kp_studio_extra[instagram_show_topbar]" value="0"><input type="checkbox" name="kp_studio_extra[instagram_show_topbar]" value="1" <?php checked( (int) $s['instagram_show_topbar'], 1 ); ?>> <strong>Obere Infobar</strong><small>Optional, wenn Instagram sehr präsent sein soll.</small></label>
              <label><input type="hidden" name="kp_studio_extra[instagram_show_home]" value="0"><input type="checkbox" name="kp_studio_extra[instagram_show_home]" value="1" <?php checked( (int) $s['instagram_show_home'], 1 ); ?>> <strong>Startseite</strong><small>Zusätzlicher „Auf Instagram folgen“-Button.</small></label>
            </div>
            <div class="kp-studio-tip"><span class="dashicons dashicons-instagram"></span><strong>Vorbereitet für später:</strong>&nbsp; Die Platzierung ist schon unabhängig vom Konto steuerbar. Sobald eine echte Instagram/Meta-Verbindung eingerichtet wird, kann hier zusätzlich ein Feed-Schalter ergänzt werden, ohne das Design neu zu bauen.</div>
          </div>`;
          controls.appendChild(section);

          const activate = (name) => {
            tabs.querySelectorAll('button[data-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.tab === name));
            controls.querySelectorAll('.kp-studio-tab[data-panel]').forEach(p => p.classList.toggle('is-active', p.dataset.panel === name));
          };
          tab.addEventListener('click', () => activate('social'));

          const style = document.createElement('style');
          style.textContent = `.kp-social-place-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:16px 0}.kp-social-place-grid label{display:flex;align-items:flex-start;gap:8px;padding:13px;border:1px solid #dcdcde;border-radius:12px;background:#fff}.kp-social-place-grid label small{display:block;margin-top:3px;color:#646970}.kp-social-place-grid input[type=checkbox]{margin-top:3px}@media(max-width:782px){.kp-social-place-grid{grid-template-columns:1fr}}`;
          document.head.appendChild(style);
        })();
        </script>
        <?php
    }

    public static function frontend_css() {
        if ( is_admin() ) { return; }
        $s = self::settings();
        $x = max( -8, min( 140, (int) $s['menu_offset_x'] ) );
        ?>
        <style id="kp-social-menu-extensions-css">
        :root{--kp-owner-menu-offset-x:<?php echo (int) $x; ?>px}
        @media(max-width:781px){
          .kp-site-nav .wp-block-navigation__responsive-container-open{position:relative!important;right:var(--kp-owner-menu-offset-x)!important}
          body.kp-menu-floating .kp-site-nav .wp-block-navigation__responsive-container-open,
          body.kp-menu-floating.kp-menu-open .kp-site-nav .wp-block-navigation__responsive-container-open{right:calc(max(14px,env(safe-area-inset-right)) + var(--kp-owner-menu-offset-x))!important}
          .kp-site-nav .wp-block-navigation__responsive-container.is-menu-open .wp-block-navigation__responsive-close,
          .kp-site-nav .wp-block-navigation__responsive-container.has-modal-open .wp-block-navigation__responsive-close{right:calc(max(78px,calc(env(safe-area-inset-right) + 68px)) + var(--kp-owner-menu-offset-x))!important}
        }
        .kp-instagram-link{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;text-decoration:none!important}
        .kp-instagram-link svg{width:1.15em;height:1.15em;flex:0 0 auto}
        .kp-instagram-footer{margin-top:.75rem;padding:.46rem .72rem;border:1px solid color-mix(in srgb,var(--kp-studio-accent,#f07a22) 34%,transparent);border-radius:999px;color:var(--kp-studio-text,#f7f1eb)!important;background:rgba(255,255,255,.035)}
        .kp-instagram-home{margin:1rem auto 0;padding:.62rem .95rem;border-radius:999px;background:var(--kp-studio-accent,#f07a22);color:#fff!important;font-weight:750}
        .kp-instagram-topbar{margin-left:.5rem;color:inherit!important;font-weight:700}
        .kp-instagram-menu{margin:.38rem 0 .12rem!important;padding:.52rem .68rem!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:11px!important;background:rgba(255,255,255,.05)!important;color:#fff!important;font-weight:700!important}
        </style>
        <?php
    }

    private static function icon() {
        return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9Zm9.75 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>';
    }

    public static function frontend_markup_and_script() {
        if ( is_admin() ) { return; }
        $s = self::settings();
        $url = self::clean_instagram_url( $s['instagram_url'] );
        if ( ! $url ) {
            self::undo_label_script();
            return;
        }
        $label = sanitize_text_field( $s['instagram_label'] ?: 'Instagram' );
        $config = array(
            'url'     => $url,
            'label'   => $label,
            'icon'    => self::icon(),
            'footer'  => ! empty( $s['instagram_show_footer'] ),
            'menu'    => ! empty( $s['instagram_show_menu'] ),
            'topbar'  => ! empty( $s['instagram_show_topbar'] ),
            'home'    => ! empty( $s['instagram_show_home'] ) && is_front_page(),
        );
        ?>
        <script id="kp-instagram-placement">
        (() => {
          const cfg = <?php echo wp_json_encode( $config ); ?>;
          const make = (className, text) => {
            const a=document.createElement('a');a.className='kp-instagram-link '+className;a.href=cfg.url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label', text || cfg.label);a.innerHTML=cfg.icon+`<span>${text||cfg.label}</span>`;return a;
          };
          const place = () => {
            if(cfg.footer && !document.querySelector('.kp-instagram-footer')){
              const footer=document.querySelector('.kp-footer footer,.kp-footer,footer');
              const host=footer?.querySelector('.wp-block-group,.wp-block-columns')||footer;
              if(host) host.appendChild(make('kp-instagram-footer',cfg.label));
            }
            if(cfg.menu && !document.querySelector('.kp-instagram-menu')){
              const list=document.querySelector('.kp-site-nav .wp-block-navigation__responsive-container-content .wp-block-navigation__container');
              if(list){const li=document.createElement('li');li.className='wp-block-navigation-item kp-instagram-menu-item';li.appendChild(make('kp-instagram-menu',cfg.label));list.appendChild(li);}
            }
            if(cfg.topbar && !document.querySelector('.kp-instagram-topbar')){
              const bar=document.querySelector('.kp-topbar');if(bar)bar.appendChild(make('kp-instagram-topbar',cfg.label));
            }
            if(cfg.home && !document.querySelector('.kp-instagram-home')){
              const hero=document.querySelector('.kp-booking-section,.kp-next-section,.kp-hero');if(hero){const wrap=document.createElement('div');wrap.style.textAlign='center';wrap.appendChild(make('kp-instagram-home','Auf Instagram folgen'));hero.insertAdjacentElement('afterend',wrap);}
            }
          };
          if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',place,{once:true});else place();
        })();
        </script>
        <?php
        self::undo_label_script();
    }

    private static function undo_label_script() {
        ?>
        <script id="kp-fe-undo-clarity">
        (() => {
          const improve = () => {
            const button=document.querySelector('.kp-fe2-undo');
            if(!button)return;
            const label=button.querySelector('span:last-child');
            if(label)label.textContent='Rückgängig';
            button.title='Letzte noch nicht abgeschlossene Bearbeitungsänderung rückgängig machen';
            const sync=()=>{
              const save=document.querySelector('.kp-fe2-save');
              const hasChange=Boolean(save?.classList.contains('is-dirty'));
              button.classList.toggle('is-muted',!hasChange);
              button.setAttribute('aria-disabled',hasChange?'false':'true');
            };
            sync();
            const save=document.querySelector('.kp-fe2-save');
            if(save)new MutationObserver(sync).observe(save,{attributes:true,attributeFilter:['class']});
          };
          if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',improve,{once:true});else improve();
        })();
        </script>
        <style id="kp-fe-undo-clarity-css">.kp-fe2-undo.is-muted{opacity:.48}.kp-fe2-undo.is-muted:hover{opacity:.62}</style>
        <?php
    }
}
