(() => {
  const form = document.getElementById('kp-studio-form');
  if (!form) return;
  const tabs = [...document.querySelectorAll('.kp-studio-tabs button')];
  const panels = [...document.querySelectorAll('.kp-studio-tab')];
  const preview = document.getElementById('kp-studio-preview');
  const drawer = document.querySelector('.kp-studio-preview-drawer');
  const drawerBody = document.querySelector('.kp-studio-preview-drawer-body');
  const dirty = document.getElementById('kp-studio-dirty');
  let previewFrame = preview;
  let hasChanges = false;

  const fontStacks = {
    body: {
      system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      humanist: "Optima, Candara, 'Segoe UI', system-ui, sans-serif",
      classic: "Georgia, 'Times New Roman', serif"
    },
    heading: {
      georgia: "Georgia, 'Times New Roman', serif",
      palatino: "Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif",
      system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    }
  };

  const field = key => form.querySelector(`[data-studio-key="${key}"]`);
  const value = key => {
    const el = field(key);
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked ? 1 : 0;
    return el.value;
  };

  const hexRgb = hex => {
    let h = String(hex || '#000000').replace('#','');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0];
  };
  const rgba = (hex,a) => { const [r,g,b]=hexRgb(hex); return `rgba(${r},${g},${b},${Math.max(0,Math.min(1,a))})`; };
  const shade = (hex,pct) => { const [r,g,b]=hexRgb(hex); const f=Math.max(0,1+pct/100); return '#' + [r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v*f))).toString(16).padStart(2,'0')).join(''); };

  const currentVars = () => {
    const menuOpacity = Number(value('menu_opacity')) / 100;
    return {
      '--kp-studio-accent': value('accent_color'),
      '--kp-studio-accent-dark': value('accent_dark'),
      '--kp-studio-bg': value('background_color'),
      '--kp-studio-nav': value('nav_color'),
      '--kp-studio-surface': value('surface_color'),
      '--kp-studio-text': value('text_color'),
      '--kp-studio-muted': value('muted_color'),
      '--kp-studio-line': value('line_color'),
      '--kp-studio-content-width': `${value('content_width')}px`,
      '--kp-studio-wide-width': `${value('wide_width')}px`,
      '--kp-studio-card-radius': `${value('card_radius')}px`,
      '--kp-studio-button-radius': `${value('button_radius')}px`,
      '--kp-studio-header-max-width': `${value('header_max_width')}px`,
      '--kp-studio-header-side-gap': `${value('header_side_gap')}px`,
      '--kp-studio-header-radius': `${value('header_radius')}px`,
      '--kp-studio-header-gap': `${value('header_vertical_gap')}px`,
      '--kp-studio-desktop-nav-opacity': `${value('desktop_nav_opacity')}%`,
      '--kp-studio-desktop-nav-height': `${value('desktop_nav_height')}px`,
      '--kp-studio-desktop-nav-radius': `${value('desktop_nav_radius')}px`,
      '--kp-studio-menu-bg-start': rgba(value('menu_color'), Math.min(1,menuOpacity+.03)),
      '--kp-studio-menu-bg-mid': rgba(shade(value('menu_color'),-52), Math.max(.05,(Number(value('menu_opacity'))-6)/100)),
      '--kp-studio-menu-bg-end': rgba(shade(value('menu_color'),-76), Math.max(.05,(Number(value('menu_opacity'))+2)/100)),
      '--kp-studio-menu-border': rgba(value('accent_color'), Number(value('menu_border_opacity'))/100),
      '--kp-studio-menu-scrim': rgba(value('background_color'), Number(value('menu_scrim_opacity'))/100),
      '--kp-studio-menu-blur': `${value('menu_blur')}px`,
      '--kp-studio-menu-width': `${value('menu_width')}px`,
      '--kp-studio-menu-radius': `${value('menu_radius')}px`,
      '--kp-studio-menu-offset-y': `${value('menu_offset_y')}px`,
      '--kp-studio-menu-item-padding': `${value('menu_item_padding')}px`,
      '--kp-studio-menu-item-gap': `${value('menu_item_gap')}px`,
      '--kp-studio-menu-font-delta': `${value('menu_font_delta')}px`,
      '--kp-studio-menu-button-size': `${value('menu_button_size')}px`,
      '--kp-studio-body-font': fontStacks.body[value('body_font')] || fontStacks.body.system,
      '--kp-studio-heading-font': fontStacks.heading[value('heading_font')] || fontStacks.heading.georgia,
    };
  };

  const applyPreview = () => {
    const frame = previewFrame;
    if (!frame || !frame.contentDocument) return;
    try {
      const doc = frame.contentDocument;
      const root = doc.documentElement;
      Object.entries(currentVars()).forEach(([k,v]) => root.style.setProperty(k,v));
      const topbar = doc.querySelector('.kp-topbar');
      const header = doc.querySelector('.kp-header-stage');
      if (topbar) topbar.style.setProperty('display', value('show_topbar') ? '' : 'none', 'important');
      if (header) header.style.setProperty('display', value('show_header_image') ? '' : 'none', 'important');
      const texts = doc.querySelectorAll('.kp-topbar p');
      if (texts[0]) texts[0].textContent = value('topbar_left');
      if (texts[1]) texts[1].textContent = value('topbar_right');
    } catch(e) {}
  };

  const markDirty = () => {
    hasChanges = true;
    dirty.classList.add('is-dirty');
    dirty.innerHTML = '<span class="dashicons dashicons-warning"></span> Noch nicht gespeichert';
    applyPreview();
  };

  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.toggle('is-active', b === btn));
    panels.forEach(p => p.classList.toggle('is-active', p.dataset.panel === btn.dataset.tab));
  }));

  form.querySelectorAll('[data-studio-key]').forEach(el => {
    const updateGroup = () => {
      const key = el.dataset.studioKey;
      form.querySelectorAll(`[data-studio-key="${key}"]`).forEach(peer => {
        if (peer === el) return;
        if (peer.type === 'checkbox') peer.checked = el.checked;
        else peer.value = el.value;
      });
      document.querySelectorAll(`[data-output-for="${key}"]`).forEach(output => {
        output.textContent = `${el.value}${el.dataset.unit || ''}`;
      });
      if (el.type === 'color') {
        form.querySelectorAll(`[data-studio-key="${key}"]`).forEach(peer => {
          const code = peer.closest('.kp-studio-color-input')?.querySelector('code');
          if (code) code.textContent = el.value.toUpperCase();
        });
      }
    };
    el.addEventListener('input', () => { updateGroup(); markDirty(); });
    el.addEventListener('change', () => { updateGroup(); markDirty(); });
  });

  const presets = {
    original:{menu_opacity:74,menu_blur:22,menu_radius:21,menu_scrim_opacity:3,card_radius:16,desktop_nav_opacity:100},
    solid:{menu_opacity:90,menu_blur:14,menu_radius:18,menu_scrim_opacity:12,card_radius:14,desktop_nav_opacity:100},
    glass:{menu_opacity:58,menu_blur:30,menu_radius:24,menu_scrim_opacity:2,card_radius:18,desktop_nav_opacity:92},
    clean:{menu_opacity:82,menu_blur:10,menu_radius:12,menu_scrim_opacity:5,card_radius:10,button_radius:12,desktop_nav_radius:10}
  };
  document.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
    const data = presets[btn.dataset.preset] || {};
    Object.entries(data).forEach(([key,val]) => {
      const el = field(key); if (!el) return; el.value = val; el.dispatchEvent(new Event('input',{bubbles:true}));
    });
  }));

  preview?.addEventListener('load', applyPreview);

  const openDrawer = () => {
    if (!drawer || !drawerBody || !preview) return;
    drawerBody.appendChild(preview);
    previewFrame = preview;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    window.setTimeout(applyPreview,50);
  };
  const closeDrawer = () => {
    if (!drawer || !preview) return;
    const card = document.querySelector('.kp-studio-preview-card');
    if (card) card.appendChild(preview);
    previewFrame = preview;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
  };
  document.querySelector('.kp-studio-preview-toggle')?.addEventListener('click',openDrawer);
  document.querySelector('.kp-studio-preview-close')?.addEventListener('click',closeDrawer);

  let mediaFrame = null;
  document.getElementById('kp-studio-pick-image')?.addEventListener('click', () => {
    if (!window.wp?.media) return;
    if (!mediaFrame) {
      mediaFrame = wp.media({title:'Headerbild auswählen',button:{text:'Dieses Bild verwenden'},multiple:false});
      mediaFrame.on('select', () => {
        const image = mediaFrame.state().get('selection').first().toJSON();
        const id = document.getElementById('kp-studio-header-image-id');
        const box = document.getElementById('kp-studio-header-image-preview');
        id.value = image.id;
        box.innerHTML = `<img src="${image.sizes?.medium?.url || image.url}" alt="">`;
        box.classList.add('has-image');
        try { const img = previewFrame?.contentDocument?.querySelector('.kp-header-photo img'); if (img) { img.src = image.url; img.removeAttribute('srcset'); } } catch(e) {}
        markDirty();
      });
    }
    mediaFrame.open();
  });
  document.getElementById('kp-studio-clear-image')?.addEventListener('click', () => {
    const id = document.getElementById('kp-studio-header-image-id');
    const box = document.getElementById('kp-studio-header-image-preview');
    id.value = '0';
    box.innerHTML = '<span class="dashicons dashicons-format-image"></span>';
    box.classList.remove('has-image');
    try { if (previewFrame) previewFrame.src = previewFrame.src; } catch(e) {}
    markDirty();
  });

  form.addEventListener('submit', () => { hasChanges = false; });
  window.addEventListener('beforeunload', e => { if (!hasChanges) return; e.preventDefault(); e.returnValue=''; });
})();
