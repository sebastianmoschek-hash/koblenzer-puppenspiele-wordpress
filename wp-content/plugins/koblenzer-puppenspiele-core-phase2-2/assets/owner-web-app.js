(() => {
  'use strict';
  const cfg = window.KPOwnerWebApp;
  if (!cfg) return;

  let installPrompt = null;
  let navDraft = Array.isArray(cfg.navigation) ? cfg.navigation.map(x => ({...x})) : [];
  let designDraft = cfg.design ? {...cfg.design} : {};
  let selectedHeaderImageUrl = cfg.headerImageUrl || '';

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const q = (s, r=document) => r.querySelector(s);
  const qa = (s, r=document) => [...r.querySelectorAll(s)];
  const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

  function canonicalUrl(raw) {
    try {
      const u = new URL(raw, window.location.href);
      return u.origin === window.location.origin ? u.pathname.replace(/\/+$/,'/') + u.search : u.href;
    } catch (e) { return String(raw || ''); }
  }

  function createNavItem(item) {
    const li = document.createElement('li');
    li.className = 'wp-block-navigation-item wp-block-navigation-link';
    li.innerHTML = `<a class="wp-block-navigation-item__content" href="${esc(item.url)}"><span class="wp-block-navigation-item__label">${esc(item.label)}</span></a>`;
    return li;
  }

  function navRoots() {
    return qa('.kp-site-nav .wp-block-navigation__container').filter((root, index, all) => !all.some((other, oi) => oi !== index && other.contains(root)));
  }

  function applyNavigation(items) {
    if (!Array.isArray(items) || !items.length) return;
    navRoots().forEach(root => {
      const existing = [...root.children].filter(el => el.matches('.wp-block-navigation-item'));
      const pool = new Map();
      existing.forEach(el => {
        const a = el.querySelector('a[href]');
        if (a) pool.set(canonicalUrl(a.getAttribute('href')), el);
      });
      const ordered = [];
      items.forEach(item => {
        let el = pool.get(canonicalUrl(item.url));
        if (!el) el = createNavItem(item);
        const a = el.querySelector('a[href]');
        if (a) {
          a.setAttribute('href', item.url);
          const label = a.querySelector('.wp-block-navigation-item__label');
          if (label) label.textContent = item.label; else a.textContent = item.label;
        }
        ordered.push(el);
      });
      root.replaceChildren(...ordered);
    });
  }

  function extractNavigation() {
    const root = navRoots()[0];
    if (!root) return [];
    return [...root.children].map(el => {
      const a = el.querySelector('a[href]');
      return a ? {label:(a.textContent || '').trim(), url:a.getAttribute('href') || '/'} : null;
    }).filter(Boolean);
  }

  if (navDraft.length) applyNavigation(navDraft);
  document.addEventListener('DOMContentLoaded', () => { if (navDraft.length) applyNavigation(navDraft); });

  if ('serviceWorker' in navigator && cfg.serviceWorkerUrl) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(cfg.serviceWorkerUrl, {scope:'/'}).catch(() => {});
    });
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    updateInstallButtons();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    document.documentElement.classList.add('kp-owner-app-installed');
    updateInstallButtons();
  });
  if (isStandalone()) document.documentElement.classList.add('kp-owner-app-standalone');

  if (!cfg.canEdit) return;

  function toast(text, type='') {
    let el = q('.kp-oa-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'kp-oa-toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.className = 'kp-oa-toast is-visible' + (type ? ' is-' + type : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('is-visible'), 2600);
  }

  async function api(action, fields={}) {
    const fd = new FormData();
    fd.append('action', action);
    fd.append('nonce', cfg.nonce);
    Object.entries(fields).forEach(([k,v]) => fd.append(k, typeof v === 'string' ? v : JSON.stringify(v)));
    const response = await fetch(cfg.ajaxUrl, {method:'POST', credentials:'same-origin', body:fd});
    let json;
    try { json = await response.json(); } catch (e) { throw new Error('WordPress hat keine gültige Antwort geliefert.'); }
    if (!json.success) throw new Error(json.data?.message || 'Aktion fehlgeschlagen.');
    return json.data;
  }

  function ensureOverlay() {
    let backdrop = q('.kp-oa-backdrop');
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.className = 'kp-oa-backdrop';
    backdrop.innerHTML = '<div class="kp-oa-sheet" role="dialog" aria-modal="true"></div>';
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeSheet(); });
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function sheet() { return q('.kp-oa-sheet', ensureOverlay()); }
  function openSheet(html, className='') {
    const backdrop = ensureOverlay();
    const box = sheet();
    box.className = 'kp-oa-sheet' + (className ? ' ' + className : '');
    box.innerHTML = html;
    backdrop.classList.add('is-open');
    document.body.classList.add('kp-oa-open');
    q('.kp-oa-close', box)?.addEventListener('click', closeSheet);
  }
  function closeSheet() {
    q('.kp-oa-backdrop')?.classList.remove('is-open');
    document.body.classList.remove('kp-oa-open');
  }

  function installButtonLabel() {
    if (isStandalone()) return 'App ist installiert';
    return installPrompt ? 'App installieren' : 'Web-App installieren';
  }

  async function installApp() {
    if (isStandalone()) { toast('Die Web-App läuft bereits als installierte App.','ok'); return; }
    if (installPrompt) {
      installPrompt.prompt();
      try { await installPrompt.userChoice; } catch (e) {}
      installPrompt = null;
      updateInstallButtons();
      return;
    }
    openSheet(`<div class="kp-oa-head"><div><h2>Web-App installieren</h2><p>Auf Android/Chrome kannst du die Seite wie eine App auf den Startbildschirm legen.</p></div><button class="kp-oa-close">×</button></div>
      <div class="kp-oa-help"><strong>Falls kein Installieren-Fenster erscheint:</strong><ol><li>Browser-Menü ⋮ öffnen</li><li>„App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen</li><li>Bestätigen</li></ol></div>
      <div class="kp-oa-actions"><button class="kp-oa-primary kp-oa-close-action">Verstanden</button></div>`);
    q('.kp-oa-close-action', sheet())?.addEventListener('click', closeSheet);
  }

  function updateInstallButtons() {
    qa('[data-kp-oa-install]').forEach(btn => {
      btn.textContent = installButtonLabel();
      btn.disabled = isStandalone();
    });
  }

  function goEdit(url) {
    try {
      const target = new URL(url, cfg.homeUrl);
      target.searchParams.set('kp_edit','1');
      window.location.href = target.toString();
    } catch (e) { window.location.href = url; }
  }

  function buildOwnerTools() {
    if (!cfg.editMode || q('.kp-oa-tools')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kp-oa-tools';
    button.innerHTML = '<span aria-hidden="true">✦</span><b>Werkzeuge</b>';
    button.addEventListener('click', openHub);
    document.body.appendChild(button);
  }

  function buildInstallPill() {
    if (cfg.editMode || isStandalone() || q('.kp-oa-install-pill')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kp-oa-install-pill';
    button.setAttribute('data-kp-oa-install','1');
    button.textContent = installButtonLabel();
    button.addEventListener('click', installApp);
    document.body.appendChild(button);
  }

  function openHub() {
    openSheet(`<div class="kp-oa-head"><div><span class="kp-oa-kicker">Koblenzer Puppenspiele</span><h2>Website bearbeiten</h2><p>Alles Wichtige direkt hier – ohne WordPress-Backend.</p></div><button class="kp-oa-close">×</button></div>
      <div class="kp-oa-action-grid">
        ${cfg.canDesign ? '<button data-action="design"><span>🎨</span><strong>Design</strong><small>Farben, Header, Menü, Abstände</small></button>' : ''}
        <button data-action="nav"><span>☰</span><strong>Navigation</strong><small>Reihenfolge, Namen und Links</small></button>
        <button data-action="termin"><span>📅</span><strong>Neuer Termin</strong><small>Direkt auf der Website anlegen</small></button>
        <button data-action="piece"><span>🎭</span><strong>Neues Stück</strong><small>Repertoire erweitern</small></button>
        <button data-action="page"><span>＋</span><strong>Neue Seite</strong><small>Seite erstellen und sofort bearbeiten</small></button>
        <button data-action="terms"><span>↗</span><strong>Termine bearbeiten</strong><small>Terminseite im Bearbeitungsmodus</small></button>
        <button data-action="repertoire"><span>↗</span><strong>Repertoire bearbeiten</strong><small>Stücke direkt antippen</small></button>
        <button data-action="install" data-kp-oa-install="1"><span>▣</span><strong>${esc(installButtonLabel())}</strong><small>Als Web-App auf Handy/Tablet</small></button>
      </div>`);
    const box = sheet();
    q('[data-action="design"]',box)?.addEventListener('click',openDesign);
    q('[data-action="nav"]',box)?.addEventListener('click',openNavigation);
    q('[data-action="termin"]',box)?.addEventListener('click',openNewTermin);
    q('[data-action="piece"]',box)?.addEventListener('click',openNewPiece);
    q('[data-action="page"]',box)?.addEventListener('click',openNewPage);
    q('[data-action="terms"]',box)?.addEventListener('click',()=>goEdit(cfg.termineEditUrl));
    q('[data-action="repertoire"]',box)?.addEventListener('click',()=>goEdit(cfg.repertoireEditUrl));
    q('[data-action="install"]',box)?.addEventListener('click',installApp);
  }

  const range = (key,label,min,max,step,unit='') => `<label class="kp-oa-control"><span><strong>${esc(label)}</strong><output>${esc(designDraft[key])}${esc(unit)}</output></span><input type="range" data-design="${key}" min="${min}" max="${max}" step="${step}" value="${esc(designDraft[key])}" data-unit="${esc(unit)}"></label>`;
  const color = (key,label) => `<label class="kp-oa-color"><span>${esc(label)}</span><input type="color" data-design="${key}" value="${esc(designDraft[key])}"></label>`;
  const toggle = (key,label) => `<label class="kp-oa-toggle"><input type="checkbox" data-design="${key}" ${+designDraft[key]?'checked':''}><span>${esc(label)}</span></label>`;
  const text = (key,label) => `<label class="kp-oa-field"><span>${esc(label)}</span><input type="text" data-design="${key}" value="${esc(designDraft[key])}"></label>`;
  const select = (key,label,opts) => `<label class="kp-oa-field"><span>${esc(label)}</span><select data-design="${key}">${Object.entries(opts).map(([v,l])=>`<option value="${esc(v)}" ${designDraft[key]===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;

  function openDesign() {
    designDraft = {...(cfg.design || {})};
    selectedHeaderImageUrl = cfg.headerImageUrl || selectedHeaderImageUrl;
    openSheet(`<div class="kp-oa-head"><div><span class="kp-oa-kicker">Direktgestaltung</span><h2>Design</h2><p>Änderungen werden sofort als Vorschau gezeigt. Erst „Design speichern“ macht sie dauerhaft.</p></div><button class="kp-oa-close">×</button></div>
      <div class="kp-oa-tabs">
        <button class="is-active" data-tab="colors">Farben</button><button data-tab="header">Header</button><button data-tab="menu">Menü</button><button data-tab="layout">Layout</button>
      </div>
      <div class="kp-oa-tab is-active" data-pane="colors">
        <div class="kp-oa-color-grid">${color('accent_color','Akzent / Orange')}${color('accent_dark','Akzent dunkel')}${color('background_color','Seitenhintergrund')}${color('nav_color','Navigation')}${color('surface_color','Karten / Flächen')}${color('text_color','Text')}${color('muted_color','Dezenter Text')}${color('line_color','Linien')}</div>
      </div>
      <div class="kp-oa-tab" data-pane="header">
        ${toggle('show_topbar','Obere Infozeile anzeigen')}${text('topbar_left','Text links')}${text('topbar_right','Text rechts')}${toggle('show_header_image','Großes Headerbild anzeigen')}
        <div class="kp-oa-image-row"><div class="kp-oa-header-preview">${selectedHeaderImageUrl?`<img src="${esc(selectedHeaderImageUrl)}" alt="Header-Vorschau">`:'<span>Aktuelles Headerbild</span>'}</div><button type="button" class="kp-oa-secondary kp-oa-header-pick">Headerbild austauschen</button></div>
        ${range('header_max_width','Maximale Headerbreite',540,1400,10,'px')}${range('header_side_gap','Seitenabstand',0,100,1,'px')}${range('header_vertical_gap','Abstand oben/unten',0,40,1,'px')}${range('header_radius','Rundung',0,36,1,'px')}
      </div>
      <div class="kp-oa-tab" data-pane="menu">
        <h3>Desktop / Laptop</h3>${range('desktop_nav_opacity','Transparenz',0,100,1,'%')}${range('desktop_nav_height','Höhe',36,72,1,'px')}${range('desktop_nav_radius','Rundung',0,999,1,'px')}
        <h3>Handy / Tablet</h3>${color('menu_color','Menüfarbe')}${range('menu_opacity','Transparenz',30,100,1,'%')}${range('menu_blur','Glas-Unschärfe',0,40,1,'px')}${range('menu_width','Breite',220,360,2,'px')}${range('menu_radius','Rundung',0,36,1,'px')}${range('menu_offset_y','Vertikale Position',-120,180,1,'px')}${range('menu_border_opacity','Rand sichtbar',0,100,1,'%')}${range('menu_scrim_opacity','Seite abdunkeln',0,45,1,'%')}${range('menu_item_padding','Zeilenhöhe',5,18,1,'px')}${range('menu_item_gap','Abstand der Punkte',0,12,1,'px')}${range('menu_font_delta','Schriftgröße',-4,6,1,'px')}${range('menu_button_size','Menü-Button',44,72,1,'px')}
      </div>
      <div class="kp-oa-tab" data-pane="layout">
        ${range('content_width','Textbreite',560,980,10,'px')}${range('wide_width','Breite Bereiche',820,1440,10,'px')}${range('card_radius','Kartenrundung',0,36,1,'px')}${range('button_radius','Buttonrundung',0,999,1,'px')}${select('body_font','Textschrift',{system:'Modern',humanist:'Weicher',classic:'Klassisch'})}${select('heading_font','Überschriften',{georgia:'Georgia',palatino:'Palatino',system:'Modern'})}${toggle('motion','Sanfte Bewegungen aktiv')}
      </div>
      <div class="kp-oa-sticky-actions"><button class="kp-oa-secondary kp-oa-design-reset">Standardwerte</button><button class="kp-oa-primary kp-oa-design-save">Design speichern</button></div>`,'is-design');

    bindDesign();
  }

  function hexRgb(hex) {
    let h=String(hex||'#000000').replace('#',''); if(h.length===3)h=[...h].map(c=>c+c).join('');
    return [parseInt(h.slice(0,2),16)||0,parseInt(h.slice(2,4),16)||0,parseInt(h.slice(4,6),16)||0];
  }
  function rgba(hex,alpha){const [r,g,b]=hexRgb(hex);return `rgba(${r},${g},${b},${Math.max(0,Math.min(1,alpha))})`;}
  function shade(hex,pct){const [r,g,b]=hexRgb(hex),f=Math.max(0,1+pct/100);return '#'+[r,g,b].map(v=>Math.min(255,Math.max(0,Math.round(v*f))).toString(16).padStart(2,'0')).join('');}
  function fontStack(value,heading=false){
    if(heading){if(value==='palatino')return "Palatino,'Palatino Linotype','Book Antiqua',Georgia,serif";if(value==='system')return "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";return "Georgia,'Times New Roman',serif";}
    if(value==='humanist')return "Optima,Candara,'Segoe UI',system-ui,sans-serif";if(value==='classic')return "Georgia,'Times New Roman',serif";return "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  }

  function applyDesign(d) {
    const root=document.documentElement.style;
    const vars={
      '--kp-studio-accent':d.accent_color,'--kp-studio-accent-dark':d.accent_dark,'--kp-studio-bg':d.background_color,'--kp-studio-nav':d.nav_color,'--kp-studio-surface':d.surface_color,'--kp-studio-text':d.text_color,'--kp-studio-muted':d.muted_color,'--kp-studio-line':d.line_color,
      '--kp-studio-content-width':`${d.content_width}px`,'--kp-studio-wide-width':`${d.wide_width}px`,'--kp-studio-card-radius':`${d.card_radius}px`,'--kp-studio-button-radius':`${d.button_radius}px`,'--kp-studio-header-max-width':`${d.header_max_width}px`,'--kp-studio-header-side-gap':`${d.header_side_gap}px`,'--kp-studio-header-radius':`${d.header_radius}px`,'--kp-studio-header-gap':`${d.header_vertical_gap}px`,'--kp-studio-desktop-nav-opacity':`${d.desktop_nav_opacity}%`,'--kp-studio-desktop-nav-height':`${d.desktop_nav_height}px`,'--kp-studio-desktop-nav-radius':`${d.desktop_nav_radius}px`,
      '--kp-studio-menu-bg-start':rgba(d.menu_color,Math.min(1,d.menu_opacity/100+.03)),'--kp-studio-menu-bg-mid':rgba(shade(d.menu_color,-52),Math.max(.05,(d.menu_opacity-6)/100)),'--kp-studio-menu-bg-end':rgba(shade(d.menu_color,-76),Math.max(.05,(d.menu_opacity+2)/100)),'--kp-studio-menu-border':rgba(d.accent_color,d.menu_border_opacity/100),'--kp-studio-menu-scrim':rgba(d.background_color,d.menu_scrim_opacity/100),'--kp-studio-menu-blur':`${d.menu_blur}px`,'--kp-studio-menu-width':`${d.menu_width}px`,'--kp-studio-menu-radius':`${d.menu_radius}px`,'--kp-studio-menu-offset-y':`${d.menu_offset_y}px`,'--kp-studio-menu-item-padding':`${d.menu_item_padding}px`,'--kp-studio-menu-item-gap':`${d.menu_item_gap}px`,'--kp-studio-menu-font-delta':`${d.menu_font_delta}px`,'--kp-studio-menu-button-size':`${d.menu_button_size}px`,'--kp-studio-body-font':fontStack(d.body_font,false),'--kp-studio-heading-font':fontStack(d.heading_font,true)
    };
    Object.entries(vars).forEach(([k,v])=>root.setProperty(k,v));
    document.body.style.setProperty('background-color',d.background_color,'important');
    document.body.style.setProperty('color',d.text_color,'important');
    document.body.style.setProperty('font-family',fontStack(d.body_font,false),'important');
    qa('h1,h2,h3,h4,h5,h6,.wp-block-heading').forEach(el=>el.style.setProperty('font-family',fontStack(d.heading_font,true),'important'));
    const top=q('.kp-topbar'); if(top)top.style.setProperty('display',+d.show_topbar?'':'none','important');
    const topTexts=qa('.kp-topbar p'); if(topTexts[0])topTexts[0].textContent=d.topbar_left||''; if(topTexts[1])topTexts[1].textContent=d.topbar_right||'';
    const stage=q('.kp-header-stage'); if(stage)stage.style.setProperty('display',+d.show_header_image?'':'none','important');
    if(stage){stage.style.setProperty('max-width',`${d.header_max_width}px`,'important');stage.style.setProperty('border-radius',`${d.header_radius}px`,'important');}
  }

  function bindDesign() {
    const box=sheet();
    qa('[data-tab]',box).forEach(btn=>btn.addEventListener('click',()=>{
      qa('[data-tab]',box).forEach(x=>x.classList.toggle('is-active',x===btn));
      qa('[data-pane]',box).forEach(p=>p.classList.toggle('is-active',p.dataset.pane===btn.dataset.tab));
    }));
    qa('[data-design]',box).forEach(input=>{
      const key=input.dataset.design;
      const update=()=>{
        designDraft[key]=input.type==='checkbox'?(input.checked?1:0):(input.type==='range'?Number(input.value):input.value);
        if(input.type==='range'){const out=input.closest('label')?.querySelector('output');if(out)out.textContent=input.value+(input.dataset.unit||'');}
        applyDesign(designDraft);
      };
      input.addEventListener(input.type==='checkbox'||input.tagName==='SELECT'?'change':'input',update);
    });
    q('.kp-oa-header-pick',box)?.addEventListener('click',()=>{
      if(!window.wp?.media){toast('Mediathek konnte nicht geöffnet werden.','error');return;}
      const frame=wp.media({title:'Headerbild auswählen',button:{text:'Als Header verwenden'},multiple:false,library:{type:'image'}});
      frame.on('select',()=>{
        const a=frame.state().get('selection').first().toJSON();designDraft.header_image_id=Number(a.id)||0;selectedHeaderImageUrl=a.url||'';
        const preview=q('.kp-oa-header-preview',box);if(preview)preview.innerHTML=`<img src="${esc(selectedHeaderImageUrl)}" alt="Header-Vorschau">`;
        const img=q('.kp-header-photo img');if(img){img.src=selectedHeaderImageUrl;img.removeAttribute('srcset');img.removeAttribute('sizes');}
      });frame.open();
    });
    q('.kp-oa-design-reset',box)?.addEventListener('click',()=>{designDraft={...(cfg.designDefaults||{})};applyDesign(designDraft);openDesign();});
    q('.kp-oa-design-save',box)?.addEventListener('click',async e=>{
      const btn=e.currentTarget;btn.disabled=true;btn.textContent='Speichert…';
      try{const data=await api('kp_owner_design_save',{settings:designDraft});cfg.design={...data.settings};toast(data.message||'Design gespeichert ✓','ok');setTimeout(()=>window.location.reload(),500);}
      catch(err){toast(err.message,'error');btn.disabled=false;btn.textContent='Design speichern';}
    });
  }

  function openNavigation() {
    navDraft = navDraft.length ? navDraft.map(x=>({...x})) : extractNavigation();
    openSheet(`<div class="kp-oa-head"><div><span class="kp-oa-kicker">Menü</span><h2>Navigation</h2><p>Reihenfolge, Namen und Ziele direkt ändern. Die mobile Navigation übernimmt dieselben Punkte.</p></div><button class="kp-oa-close">×</button></div>
      <div class="kp-oa-nav-list"></div>
      <div class="kp-oa-actions"><button class="kp-oa-secondary kp-oa-nav-add">＋ Menüpunkt</button><button class="kp-oa-primary kp-oa-nav-save">Navigation speichern</button></div>`);
    renderNavRows();
    q('.kp-oa-nav-add',sheet()).addEventListener('click',()=>{navDraft.push({label:'Neue Seite',url:'/'});renderNavRows();});
    q('.kp-oa-nav-save',sheet()).addEventListener('click',saveNavigation);
  }

  function renderNavRows() {
    const list=q('.kp-oa-nav-list',sheet());if(!list)return;
    list.innerHTML=navDraft.map((item,i)=>`<div class="kp-oa-nav-row" data-i="${i}"><div class="kp-oa-nav-move"><button data-dir="-1" ${i===0?'disabled':''}>↑</button><button data-dir="1" ${i===navDraft.length-1?'disabled':''}>↓</button></div><label>Name<input data-nav="label" value="${esc(item.label)}"></label><label>Link<input data-nav="url" value="${esc(item.url)}"></label><button class="kp-oa-nav-delete" title="Entfernen">×</button></div>`).join('');
    qa('.kp-oa-nav-row',list).forEach(row=>{
      const i=Number(row.dataset.i);
      qa('[data-nav]',row).forEach(inp=>inp.addEventListener('input',()=>navDraft[i][inp.dataset.nav]=inp.value));
      qa('[data-dir]',row).forEach(btn=>btn.addEventListener('click',()=>{const j=i+Number(btn.dataset.dir);if(j<0||j>=navDraft.length)return;[navDraft[i],navDraft[j]]=[navDraft[j],navDraft[i]];renderNavRows();}));
      q('.kp-oa-nav-delete',row).addEventListener('click',()=>{navDraft.splice(i,1);renderNavRows();});
    });
  }

  async function saveNavigation() {
    const btn=q('.kp-oa-nav-save',sheet());btn.disabled=true;btn.textContent='Speichert…';
    try{const data=await api('kp_owner_nav_save',{items:navDraft});navDraft=(data.items||[]).map(x=>({...x}));cfg.navigation=navDraft;applyNavigation(navDraft);toast(data.message||'Navigation gespeichert ✓','ok');closeSheet();}
    catch(err){toast(err.message,'error');btn.disabled=false;btn.textContent='Navigation speichern';}
  }

  const statuses={standard:'Normal / Tickets über Veranstalter',free:'Eintritt frei',planned:'In Planung',box_office:'Eintritt Tageskasse',sold_out:'Ausverkauft',closed:'Geschlossene Vorstellung',cancelled:'Abgesagt'};

  function openNewTermin() {
    openSheet(`<div class="kp-oa-head"><div><span class="kp-oa-kicker">Termine</span><h2>Neuen Termin anlegen</h2><p>Die wichtigen Angaben zuerst. Alles bleibt später direkt antippbar.</p></div><button class="kp-oa-close">×</button></div>
      <div class="kp-oa-form-grid">
        <label class="wide">Stück<select data-f="repertoire_id"><option value="0">Freier Titel</option>${(cfg.repertoire||[]).map(r=>`<option value="${r.id}">${esc(r.title)}</option>`).join('')}</select></label>
        <label class="wide">Freier Titel<input data-f="title" type="text" placeholder="Nur nötig, wenn kein Stück gewählt ist"></label>
        <label>Datum *<input data-f="date" type="date"></label><label>Beginn<input data-f="time" type="time"></label>
        <label>Ort / Stadt *<input data-f="city" type="text"></label><label>Spielstätte<input data-f="venue" type="text"></label>
        <label class="wide">Status<select data-f="status">${Object.entries(statuses).map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
      </div>
      <details class="kp-oa-more"><summary>Mehr Angaben</summary><div class="kp-oa-form-grid"><label>Ende<input data-f="end_time" type="time"></label><label>Adresse<input data-f="address" type="text"></label><label>Ticket-Link<input data-f="ticket_url" type="url"></label><label>Info-Link<input data-f="info_url" type="url"></label><label class="wide">Hinweis<textarea data-f="note"></textarea></label></div></details>
      <div class="kp-oa-actions"><button class="kp-oa-primary kp-oa-create-record" data-type="termin">Termin anlegen</button></div>`);
    q('.kp-oa-create-record',sheet()).addEventListener('click',()=>createRecord('termin'));
  }

  function openNewPiece() {
    openSheet(`<div class="kp-oa-head"><div><span class="kp-oa-kicker">Repertoire</span><h2>Neues Stück anlegen</h2><p>Titel, Bild und die wichtigsten Angaben – ohne Backend.</p></div><button class="kp-oa-close">×</button></div>
      <div class="kp-oa-new-piece-image"><div class="kp-oa-piece-preview">Noch kein Bild</div><button type="button" class="kp-oa-secondary kp-oa-piece-pick">Bild auswählen</button><input data-f="thumbnail_id" type="hidden" value="0"></div>
      <div class="kp-oa-form-grid">
        <label class="wide">Titel *<input data-f="title" type="text"></label><label class="wide">Kurzbeschreibung<textarea data-f="excerpt"></textarea></label><label class="wide">Ausführlicher Text<textarea data-f="description"></textarea></label>
        <label>Alter / Zielgruppe<input data-f="age" type="text"></label><label>Dauer<input data-f="duration" type="text"></label>
        <label>Gruppe<select data-f="category_id"><option value="0">Ohne Gruppe</option>${(cfg.categories||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label><label>Premiere<input data-f="premiere" type="text"></label>
        <label>Spieler*innen<input data-f="players" type="text"></label><label>Spielweise<input data-f="play_style" type="text"></label><label class="wide">Technische Hinweise<textarea data-f="technical"></textarea></label><label class="wide">Rechte / Vorlage<input data-f="rights" type="text"></label><label class="wide kp-oa-check"><input data-f="bookable" type="checkbox" checked> Dieses Stück ist buchbar</label>
      </div><div class="kp-oa-actions"><button class="kp-oa-primary kp-oa-create-record" data-type="repertoire">Stück anlegen</button></div>`);
    q('.kp-oa-piece-pick',sheet()).addEventListener('click',()=>{
      if(!window.wp?.media){toast('Mediathek konnte nicht geöffnet werden.','error');return;}
      const frame=wp.media({title:'Titelbild auswählen',button:{text:'Dieses Bild verwenden'},multiple:false,library:{type:'image'}});frame.on('select',()=>{const a=frame.state().get('selection').first().toJSON();q('[data-f="thumbnail_id"]',sheet()).value=a.id;q('.kp-oa-piece-preview',sheet()).innerHTML=`<img src="${esc(a.url)}" alt="">`;});frame.open();
    });
    q('.kp-oa-create-record',sheet()).addEventListener('click',()=>createRecord('repertoire'));
  }

  function collectFields(root=sheet()) {
    const fields={};qa('[data-f]',root).forEach(el=>{fields[el.dataset.f]=el.type==='checkbox'?el.checked:el.value;});return fields;
  }

  async function createRecord(type) {
    const btn=q('.kp-oa-create-record',sheet());btn.disabled=true;btn.textContent='Legt an…';
    try{const data=await api('kp_owner_record_create',{type,fields:collectFields()});toast(data.message||'Angelegt ✓','ok');setTimeout(()=>goEdit(data.url),450);}
    catch(err){toast(err.message,'error');btn.disabled=false;btn.textContent=type==='termin'?'Termin anlegen':'Stück anlegen';}
  }

  function openNewPage() {
    openSheet(`<div class="kp-oa-head"><div><span class="kp-oa-kicker">Seiten</span><h2>Neue Seite</h2><p>WordPress legt eine saubere responsive Startstruktur an. Danach bearbeitest du sie direkt auf der Seite.</p></div><button class="kp-oa-close">×</button></div>
      <div class="kp-oa-form-grid"><label class="wide">Seitentitel *<input data-page="title" type="text" placeholder="z. B. Workshops"></label><label class="wide">Adresse / Kurzname<input data-page="slug" type="text" placeholder="workshops"></label><label class="wide">Erster Text<textarea data-page="intro" placeholder="Optional – kann anschließend direkt geändert werden."></textarea></label><label class="wide kp-oa-check"><input data-page="add_nav" type="checkbox" checked> Direkt zur Navigation hinzufügen</label></div>
      <div class="kp-oa-actions"><button class="kp-oa-primary kp-oa-page-create">Seite anlegen und öffnen</button></div>`);
    q('.kp-oa-page-create',sheet()).addEventListener('click',createPage);
  }

  async function createPage() {
    const fields={};qa('[data-page]',sheet()).forEach(el=>fields[el.dataset.page]=el.type==='checkbox'?el.checked:el.value);
    const btn=q('.kp-oa-page-create',sheet());btn.disabled=true;btn.textContent='Legt Seite an…';
    try{
      const data=await api('kp_owner_page_create',{fields});
      if(fields.add_nav){
        const items=navDraft.length?navDraft.map(x=>({...x})):extractNavigation();items.push({label:data.label,url:data.url});
        try{const navData=await api('kp_owner_nav_save',{items});navDraft=(navData.items||items).map(x=>({...x}));cfg.navigation=navDraft;}catch(e){toast('Seite erstellt; Menüpunkt konnte nicht automatisch gespeichert werden.','error');}
      }
      toast(data.message||'Seite angelegt ✓','ok');setTimeout(()=>goEdit(data.edit_url),500);
    }catch(err){toast(err.message,'error');btn.disabled=false;btn.textContent='Seite anlegen und öffnen';}
  }

  document.addEventListener('DOMContentLoaded',()=>{buildOwnerTools();buildInstallPill();updateInstallButtons();});
  window.addEventListener('load',()=>{buildOwnerTools();buildInstallPill();updateInstallButtons();});
})();
