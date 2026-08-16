(() => {
  'use strict';
  const cfg = window.KPFrontendEditor;
  if (!cfg) return;

  const clone = (v) => JSON.parse(JSON.stringify(v || {}));
  const ensureScope = (v) => {
    const x = clone(v);
    if (!x.blocks || typeof x.blocks !== 'object') x.blocks = {};
    if (!x.dom || typeof x.dom !== 'object') x.dom = {};
    if (!Array.isArray(x.order)) x.order = [];
    return x;
  };
  let draftGlobal = ensureScope(cfg.global);
  let draftPage = ensureScope(cfg.page);
  let editorDevice = currentDevice();
  let selected = null;
  let activeText = null;
  let activeTextHandler = null;
  const history = [];
  let historyLock = false;

  function currentDevice() {
    const w = window.innerWidth;
    if (w <= 640) return 'mobile';
    if (w <= 900) return 'tablet';
    if (w <= 1400) return 'laptop';
    return 'desktop';
  }

  function deviceLabel(device) {
    return ({mobile:'Handy',tablet:'Tablet',laptop:'Laptop',desktop:'Desktop'})[device] || device;
  }

  function hashString(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }

  function pathFor(el, root) {
    const parts = [];
    let cur = el;
    while (cur && cur !== root && cur.nodeType === 1) {
      let n = 1, sib = cur.previousElementSibling;
      while (sib) { if (sib.tagName === cur.tagName) n++; sib = sib.previousElementSibling; }
      parts.unshift(cur.tagName.toLowerCase() + ':' + n);
      cur = cur.parentElement;
    }
    return parts.join('/');
  }

  function scopeFor(el) {
    return el && el.closest && el.closest('header,footer') ? 'global' : 'page';
  }

  function assignDomFallbackKeys() {
    const roots = [...document.querySelectorAll('header,main,footer')];
    roots.forEach((root, ri) => {
      root.querySelectorAll('h1,h2,h3,h4,p,a,img,li,button').forEach((el) => {
        if (el.closest('.kp-fe-toolbar,.kp-fe-panel,.kp-fe-modal-backdrop,#wpadminbar')) return;
        if (el.closest('.kp-termin-card,.kp-repertoire-card')) return;
        if (el.closest('[data-kp-edit-key]')) return;
        if (el.matches('.wp-block-navigation__responsive-container-open,.wp-block-navigation__responsive-container-close')) return;
        const key = 'd-' + hashString(ri + '|' + root.tagName + '|' + pathFor(el, root));
        el.dataset.kpDomKey = key;
      });
    });
  }

  function keyInfo(el) {
    if (!el) return null;
    if (el.dataset.kpEditKey) return {collection:'blocks', key:el.dataset.kpEditKey};
    if (el.dataset.kpDomKey) return {collection:'dom', key:el.dataset.kpDomKey};
    return null;
  }

  function scopeObject(scope) { return scope === 'global' ? draftGlobal : draftPage; }
  function itemFor(el, create = true) {
    const info = keyInfo(el);
    if (!info) return null;
    const scope = scopeFor(el);
    const store = scopeObject(scope);
    if (!store[info.collection][info.key] && create) store[info.collection][info.key] = {};
    return {scope, store, info, item:store[info.collection][info.key] || null};
  }

  function contentTarget(el) {
    if (!el) return null;
    const name = el.dataset.kpBlockName || '';
    if (name === 'core/button' || name === 'core/navigation-link') return el.matches('a') ? el : el.querySelector('a');
    if (name === 'core/image') return el.matches('img') ? el : el.querySelector('img');
    if (name === 'core/paragraph' || name === 'core/heading' || name === 'core/list-item') return el;
    if (el.matches('a,img,h1,h2,h3,h4,p,li,button')) return el;
    return el;
  }

  function kindFor(el) {
    if (!el) return 'section';
    const name = el.dataset.kpBlockName || '';
    if (name === 'core/image' || el.matches('img')) return 'image';
    if (name === 'core/button' || name === 'core/navigation-link' || el.matches('a,button')) return 'link';
    if (['core/paragraph','core/heading','core/list-item'].includes(name) || el.matches('h1,h2,h3,h4,p,li')) return 'text';
    return 'section';
  }

  function applyContentToElement(el, content) {
    if (!el || !content) return;
    const target = contentTarget(el);
    if (!target) return;
    if (content.type === 'html') target.innerHTML = content.value || '';
    if (content.type === 'link') {
      if ('label' in content) target.textContent = content.label || '';
      if (target.tagName === 'A' && content.href) target.setAttribute('href', content.href);
    }
    if (content.type === 'image' && target.tagName === 'IMG' && content.src) {
      target.src = content.src;
      target.removeAttribute('srcset'); target.removeAttribute('sizes');
      target.alt = content.alt || '';
    }
  }

  function applyStyleToElement(el, style) {
    if (!el || !style) return;
    const target = contentTarget(el) || el;
    if (style.font_px) target.style.setProperty('font-size', style.font_px + 'px', 'important');
    if (style.padding_y !== undefined) {
      el.style.setProperty('padding-top', style.padding_y + 'px', 'important');
      el.style.setProperty('padding-bottom', style.padding_y + 'px', 'important');
    }
    if (style.width_pct) { el.style.setProperty('width', style.width_pct + '%', 'important'); el.style.setProperty('max-width', style.width_pct + '%', 'important'); }
    if (style.color) target.style.setProperty('color', style.color, 'important');
    if (style.background) el.style.setProperty('background-color', style.background, 'important');
    if (style.radius !== undefined) el.style.setProperty('border-radius', style.radius + 'px', 'important');
    if (style.align) target.style.setProperty('text-align', style.align, 'important');
    if (style.hidden) el.style.setProperty('display', 'none', 'important');
  }

  function actualStyle(item) {
    return item && item.styles && item.styles[currentDevice()] ? item.styles[currentDevice()] : null;
  }

  function applyDomScope(scopeData, scopeName) {
    if (!scopeData || !scopeData.dom) return;
    Object.entries(scopeData.dom).forEach(([key, item]) => {
      document.querySelectorAll('[data-kp-dom-key="' + CSS.escape(key) + '"]').forEach((el) => {
        if (scopeFor(el) !== scopeName) return;
        if (item.content) applyContentToElement(el, item.content);
        const style = actualStyle(item); if (style) applyStyleToElement(el, style);
      });
    });
  }

  function sectionRootAndItems() {
    const site = document.querySelector('.wp-site-blocks');
    if (site) {
      const items = [...site.children].filter((el) => el.dataset && el.dataset.kpEditKey && !['HEADER','FOOTER'].includes(el.tagName));
      if (items.length >= 2) return {root:site, items};
    }
    const content = document.querySelector('main .wp-block-post-content');
    if (content) {
      const items = [...content.children].filter((el) => el.dataset && el.dataset.kpEditKey);
      if (items.length >= 2) return {root:content, items};
    }
    const main = document.querySelector('main');
    if (main) {
      const items = [...main.children].filter((el) => el.dataset && el.dataset.kpEditKey);
      if (items.length >= 2) return {root:main, items};
    }
    return {root:null, items:[]};
  }

  function applyOrder(order) {
    if (!Array.isArray(order) || !order.length) return;
    const {root, items} = sectionRootAndItems();
    if (!root || !items.length) return;
    const map = new Map(items.map(el => [el.dataset.kpEditKey, el]));
    order.forEach(key => { if (map.has(key)) root.appendChild(map.get(key)); });
  }

  assignDomFallbackKeys();
  applyDomScope(draftGlobal, 'global');
  applyDomScope(draftPage, 'page');
  applyOrder(draftPage.order);

  if (!cfg.editMode) return;

  document.body.classList.add('kp-fe-editing');
  document.addEventListener('submit', (e) => {
    if (!e.target.closest('.kp-fe-modal')) { e.preventDefault(); toast('Formulare sind im Bearbeitungsmodus geschützt.', 'error'); }
  }, true);

  function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
  function pushHistory() {
    if (historyLock) return;
    history.push({global:clone(draftGlobal), page:clone(draftPage)});
    if (history.length > 30) history.shift();
  }

  function toast(text, type = '') {
    const el = document.querySelector('.kp-fe-status');
    if (!el) return;
    el.textContent = text; el.className = 'kp-fe-status is-visible' + (type ? ' is-' + type : '');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('is-visible'), 2200);
  }

  function buildUi() {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="kp-fe-hint">Element antippen → direkt ändern. Orange Umrandung = ausgewählt. Termine und Stücke öffnen eigene sichere Formulare.</div>
      <div class="kp-fe-status" aria-live="polite"></div>
      <div class="kp-fe-quick">
        <a href="${esc(cfg.newTerminUrl)}" target="_blank" title="Termin hinzufügen"><span class="dashicons dashicons-calendar-alt"></span></a>
        <a href="${esc(cfg.repertoireUrl)}" target="_blank" title="Repertoire"><span class="dashicons dashicons-format-gallery"></span></a>
        <a href="${esc(cfg.studioUrl)}" target="_blank" title="Website Studio"><span class="dashicons dashicons-admin-customizer"></span></a>
      </div>
      <div class="kp-fe-panel" aria-hidden="true"></div>
      <div class="kp-fe-modal-backdrop"><div class="kp-fe-modal"></div></div>
      <div class="kp-fe-toolbar">
        <a href="${esc(cfg.exitUrl)}" title="Bearbeitungsmodus verlassen"><span class="dashicons dashicons-no-alt"></span><span class="kp-fe-toolbar-label">Beenden</span></a>
        <span class="kp-fe-toolbar-sep"></span>
        <button type="button" class="kp-fe-undo" title="Letzte Änderung rückgängig"><span class="dashicons dashicons-undo"></span><span class="kp-fe-toolbar-label">Zurück</span></button>
        ${['mobile','tablet','laptop','desktop'].map(d => `<button type="button" class="kp-fe-device ${d===editorDevice?'is-active':''}" data-device="${d}" title="Änderungen für ${deviceLabel(d)}"><span class="dashicons ${d==='mobile'?'dashicons-smartphone':d==='tablet'?'dashicons-tablet':d==='laptop'?'dashicons-laptop':'dashicons-desktop'}"></span><span class="kp-fe-toolbar-label">${deviceLabel(d)}</span></button>`).join('')}
        <span class="kp-fe-toolbar-sep"></span>
        <button type="button" class="kp-fe-save"><span class="dashicons dashicons-saved"></span>Speichern</button>
      </div>`);
  }
  buildUi();
  const panel = document.querySelector('.kp-fe-panel');
  const modalBackdrop = document.querySelector('.kp-fe-modal-backdrop');
  const modal = document.querySelector('.kp-fe-modal');

  function deactivateText() {
    if (activeText) {
      activeText.contentEditable = 'false';
      if (activeTextHandler) activeText.removeEventListener('input', activeTextHandler);
    }
    activeText = null; activeTextHandler = null;
  }

  function clearSelection() {
    deactivateText();
    document.querySelectorAll('.kp-fe-selected').forEach(el => el.classList.remove('kp-fe-selected'));
    selected = null;
    panel.classList.remove('is-open'); panel.setAttribute('aria-hidden','true');
  }

  function blockTitle(el, kind) {
    if (kind === 'text') return 'Text bearbeiten';
    if (kind === 'link') return 'Button / Link bearbeiten';
    if (kind === 'image') return 'Bild bearbeiten';
    const name = (el.dataset.kpBlockName || '').replace('core/','');
    return name ? 'Bereich: ' + name : 'Bereich gestalten';
  }

  function rgbToHex(value, fallback = '#ffffff') {
    if (!value) return fallback;
    if (value.startsWith('#')) return value.length === 4 ? '#' + [...value.slice(1)].map(c=>c+c).join('') : value.slice(0,7);
    const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return fallback;
    return '#' + [m[1],m[2],m[3]].map(n => Math.max(0,Math.min(255,+n)).toString(16).padStart(2,'0')).join('');
  }

  function currentStyleData(el, device) {
    const ref = itemFor(el, false);
    return ref && ref.item && ref.item.styles && ref.item.styles[device] ? ref.item.styles[device] : {};
  }

  function styleControls(el, kind) {
    const target = contentTarget(el) || el;
    const cs = getComputedStyle(target), ecs = getComputedStyle(el);
    if (!el.dataset.kpFeBaseFont) el.dataset.kpFeBaseFont = parseFloat(cs.fontSize) || 16;
    if (!el.dataset.kpFeBasePadding) el.dataset.kpFeBasePadding = ((parseFloat(ecs.paddingTop)||0)+(parseFloat(ecs.paddingBottom)||0))/2 || (kind==='section'?18:4);
    const baseFont = +el.dataset.kpFeBaseFont, basePadding = +el.dataset.kpFeBasePadding;
    const s = currentStyleData(el, editorDevice);
    const fontPct = s.font_px ? Math.round((s.font_px/baseFont)*100) : 100;
    const padPct = s.padding_y !== undefined ? Math.round((s.padding_y/basePadding)*100) : 100;
    const width = s.width_pct || 100;
    const radius = s.radius !== undefined ? s.radius : Math.round(parseFloat(ecs.borderRadius)||0);
    const color = s.color || rgbToHex(cs.color,'#ffffff');
    const bg = s.background || rgbToHex(ecs.backgroundColor,'#17110e');
    return `
      <div class="kp-fe-panel-note">Diese Werte gelten für <strong>${deviceLabel(editorDevice)}</strong>. Die anderen Geräte bleiben unverändert.</div>
      ${kind!=='image' && kind!=='section' ? `<div class="kp-fe-field"><label>Textgröße</label><div class="kp-fe-range-row"><input class="kp-fe-style" data-style="font" type="range" min="70" max="170" value="${fontPct}"><span class="kp-fe-range-value">${fontPct}%</span></div></div>`:''}
      <div class="kp-fe-field"><label>Innenabstand</label><div class="kp-fe-range-row"><input class="kp-fe-style" data-style="padding" type="range" min="40" max="220" value="${padPct}"><span class="kp-fe-range-value">${padPct}%</span></div></div>
      ${kind==='image'||kind==='section'?`<div class="kp-fe-field"><label>Breite</label><div class="kp-fe-range-row"><input class="kp-fe-style" data-style="width" type="range" min="50" max="100" value="${width}"><span class="kp-fe-range-value">${width}%</span></div></div>`:''}
      <div class="kp-fe-mini-grid">
        <div class="kp-fe-field"><label>Textfarbe</label><input class="kp-fe-style-color" data-style="color" type="color" value="${esc(color)}"></div>
        <div class="kp-fe-field"><label>Hintergrund</label><input class="kp-fe-style-color" data-style="background" type="color" value="${esc(bg)}"></div>
      </div>
      <div class="kp-fe-field"><label>Rundung</label><div class="kp-fe-range-row"><input class="kp-fe-style" data-style="radius" type="range" min="0" max="60" value="${radius}"><span class="kp-fe-range-value">${radius}px</span></div></div>
      <div class="kp-fe-field kp-fe-check"><input class="kp-fe-style-hidden" type="checkbox" ${s.hidden?'checked':''}><label>Auf ${deviceLabel(editorDevice)} ausblenden</label></div>`;
  }

  function deviceRow() {
    return `<div class="kp-fe-device-row">${['mobile','tablet','laptop','desktop'].map(d=>`<button type="button" data-panel-device="${d}" class="${d===editorDevice?'is-active':''}">${deviceLabel(d)}</button>`).join('')}</div>`;
  }

  function renderPanel(el) {
    const kind = kindFor(el); const target = contentTarget(el);
    let special = '';
    if (kind === 'link' && target) {
      special = `<div class="kp-fe-field"><label>Beschriftung</label><input type="text" class="kp-fe-link-label" value="${esc(target.textContent.trim())}"></div>
        <div class="kp-fe-field"><label>Ziel / Link</label><input type="url" class="kp-fe-link-href" value="${esc(target.getAttribute('href')||'')}"></div>`;
    } else if (kind === 'image' && target) {
      special = `<div class="kp-fe-panel-note">Bild anklicken oder unten „Bild austauschen“. Das Original bleibt in der Mediathek erhalten.</div>
        <div class="kp-fe-panel-actions"><button type="button" class="kp-fe-image-pick is-primary">Bild austauschen</button></div>`;
    } else if (kind === 'text') {
      special = `<div class="kp-fe-panel-note"><strong>Direkt im Bild tippen:</strong> Der ausgewählte Text ist jetzt editierbar. Du kannst ihn einfach überschreiben.</div>`;
    } else {
      special = `<div class="kp-fe-panel-note">Bereich auswählen, Abstände/Farbe ändern oder den Bereich auf der Seite nach oben bzw. unten verschieben.</div>
        <div class="kp-fe-panel-actions kp-fe-section-controls"><button type="button" class="kp-fe-move-up">↑ Nach oben</button><button type="button" class="kp-fe-move-down">↓ Nach unten</button></div>`;
    }
    panel.innerHTML = `<div class="kp-fe-panel-head"><div><h3 class="kp-fe-panel-title">${blockTitle(el,kind)}</h3><p class="kp-fe-panel-sub">Keine Technikbegriffe nötig – antippen, ändern, speichern.</p></div><button type="button" class="kp-fe-panel-close">×</button></div>${deviceRow()}${special}${styleControls(el,kind)}
      <div class="kp-fe-panel-actions"><button type="button" class="kp-fe-reset is-danger">Änderungen dieses Elements zurücksetzen</button>${cfg.pageEditorUrl?`<a href="${esc(cfg.pageEditorUrl)}" target="_blank">WordPress-Profiansicht ↗</a>`:''}</div>`;
    panel.classList.add('is-open'); panel.setAttribute('aria-hidden','false');
    bindPanel(el, kind);
  }

  function mutateItem(el, fn, push = true) {
    if (push) pushHistory();
    const ref = itemFor(el, true); if (!ref) return;
    fn(ref.item, ref);
  }

  function previewSelectedStyle(el) {
    const ref = itemFor(el, false); if (!ref || !ref.item || !ref.item.styles) return;
    const s = ref.item.styles[editorDevice]; if (s) applyStyleToElement(el, s);
  }

  function bindPanel(el, kind) {
    panel.querySelector('.kp-fe-panel-close')?.addEventListener('click', clearSelection);
    panel.querySelectorAll('[data-panel-device]').forEach(btn => btn.addEventListener('click', () => {
      editorDevice = btn.dataset.panelDevice; syncDeviceButtons(); renderPanel(el); previewSelectedStyle(el);
    }));
    const label = panel.querySelector('.kp-fe-link-label'), href = panel.querySelector('.kp-fe-link-href');
    const updateLink = () => {
      const target = contentTarget(el); if (!target) return;
      mutateItem(el, item => { item.content = {type:'link',label:label.value,href:href.value}; }, false);
      target.textContent = label.value; if (target.tagName === 'A') target.href = href.value || '#';
    };
    if (label && href) { pushHistory(); label.addEventListener('input', updateLink); href.addEventListener('input', updateLink); }
    panel.querySelector('.kp-fe-image-pick')?.addEventListener('click', () => pickImage(el));
    panel.querySelectorAll('.kp-fe-style').forEach(input => {
      let pushed = false;
      input.addEventListener('input', () => {
        if (!pushed) { pushHistory(); pushed = true; }
        const value = +input.value; const styleName = input.dataset.style;
        mutateItem(el, item => {
          item.styles = item.styles || {}; item.styles[editorDevice] = item.styles[editorDevice] || {};
          const s = item.styles[editorDevice];
          const baseFont = +el.dataset.kpFeBaseFont || 16, basePadding = +el.dataset.kpFeBasePadding || 4;
          if (styleName === 'font') s.font_px = +(baseFont * value / 100).toFixed(2);
          if (styleName === 'padding') s.padding_y = +(basePadding * value / 100).toFixed(2);
          if (styleName === 'width') s.width_pct = value;
          if (styleName === 'radius') s.radius = value;
        }, false);
        input.nextElementSibling.textContent = styleName === 'radius' ? value + 'px' : value + '%';
        previewSelectedStyle(el);
      });
    });
    panel.querySelectorAll('.kp-fe-style-color').forEach(input => input.addEventListener('input', () => {
      pushHistory(); mutateItem(el, item => { item.styles=item.styles||{}; item.styles[editorDevice]=item.styles[editorDevice]||{}; item.styles[editorDevice][input.dataset.style]=input.value; }, false); previewSelectedStyle(el);
    }));
    panel.querySelector('.kp-fe-style-hidden')?.addEventListener('change', (e) => {
      pushHistory(); mutateItem(el, item => { item.styles=item.styles||{}; item.styles[editorDevice]=item.styles[editorDevice]||{}; item.styles[editorDevice].hidden=e.target.checked?1:0; }, false); previewSelectedStyle(el);
      if (e.target.checked) toast('Wird nach dem Speichern auf ' + deviceLabel(editorDevice) + ' ausgeblendet.');
    });
    panel.querySelector('.kp-fe-move-up')?.addEventListener('click', () => moveSection(el,-1));
    panel.querySelector('.kp-fe-move-down')?.addEventListener('click', () => moveSection(el,1));
    panel.querySelector('.kp-fe-reset')?.addEventListener('click', () => resetSelected(el));
  }

  function activateText(el) {
    deactivateText();
    const target = contentTarget(el); if (!target) return;
    pushHistory();
    activeText = target; activeText.contentEditable = 'true'; activeText.spellcheck = true;
    activeTextHandler = () => mutateItem(el, item => { item.content={type:'html',value:target.innerHTML}; }, false);
    activeText.addEventListener('input', activeTextHandler);
    target.focus();
    try { const r=document.createRange(); r.selectNodeContents(target); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch(e){}
  }

  function pickImage(el, recordCallback) {
    if (!window.wp || !wp.media) { toast('Mediathek konnte nicht geöffnet werden.','error'); return; }
    const frame = wp.media({title:'Bild auswählen',button:{text:'Dieses Bild verwenden'},multiple:false,library:{type:'image'}});
    frame.on('select', () => {
      const a = frame.state().get('selection').first().toJSON();
      if (recordCallback) { recordCallback(a); return; }
      pushHistory();
      const target = contentTarget(el); if (!target) return;
      mutateItem(el, item => { item.content={type:'image',src:a.url,alt:a.alt||a.title||'',attachment_id:a.id}; }, false);
      target.src=a.url; target.alt=a.alt||a.title||''; target.removeAttribute('srcset'); target.removeAttribute('sizes');
      toast('Bild ausgewählt – noch speichern.');
    });
    frame.open();
  }

  function selectElement(el) {
    if (!el) return;
    clearSelection(); selected = el; el.classList.add('kp-fe-selected');
    renderPanel(el); if (kindFor(el) === 'text') activateText(el);
  }

  function moveSection(el, dir) {
    const {root,items} = sectionRootAndItems();
    if (!root || !items.includes(el)) { toast('Dieser innere Bereich wird über die Profi-Ansicht verschoben.','error'); return; }
    const idx = items.indexOf(el), next = idx + dir;
    if (next < 0 || next >= items.length) return;
    pushHistory();
    if (dir < 0) root.insertBefore(el, items[next]); else root.insertBefore(items[next], el);
    draftPage.order = [...sectionRootAndItems().items].map(x=>x.dataset.kpEditKey).filter(Boolean);
    toast('Bereich verschoben – noch speichern.');
  }

  function resetSelected(el) {
    const info = keyInfo(el); if (!info) return;
    pushHistory(); const scope = scopeFor(el), store=scopeObject(scope);
    delete store[info.collection][info.key];
    toast('Zurückgesetzt. Nach Speichern wird die Originaldarstellung geladen.');
  }

  function syncDeviceButtons() {
    document.querySelectorAll('.kp-fe-device').forEach(b => b.classList.toggle('is-active', b.dataset.device===editorDevice));
  }

  document.querySelectorAll('.kp-fe-device').forEach(btn => btn.addEventListener('click', () => {
    editorDevice = btn.dataset.device; syncDeviceButtons(); if (selected) renderPanel(selected); toast('Zielansicht: ' + deviceLabel(editorDevice));
  }));

  document.querySelector('.kp-fe-undo')?.addEventListener('click', () => {
    const prev = history.pop(); if (!prev) { toast('Nichts mehr rückgängig.'); return; }
    historyLock=true; draftGlobal=ensureScope(prev.global); draftPage=ensureScope(prev.page); historyLock=false;
    toast('Letzte Änderung zurückgenommen. Seite wird neu aufgebaut.');
    sessionStorage.setItem('kpFeDraftRestore', JSON.stringify({global:draftGlobal,page:draftPage,at:Date.now()}));
    location.reload();
  });

  const restored = (()=>{ try { const r=JSON.parse(sessionStorage.getItem('kpFeDraftRestore')||'null'); sessionStorage.removeItem('kpFeDraftRestore'); return r&&Date.now()-r.at<10000?r:null; } catch(e){return null;} })();
  if (restored) {
    draftGlobal=ensureScope(restored.global); draftPage=ensureScope(restored.page);
    // Apply unsaved restored DOM values so undo remains visual without saving.
    Object.entries(draftGlobal.dom||{}).forEach(([key,item])=>document.querySelectorAll('[data-kp-dom-key="'+CSS.escape(key)+'"]').forEach(el=>{if(item.content)applyContentToElement(el,item.content);if(item.styles?.[editorDevice])applyStyleToElement(el,item.styles[editorDevice]);}));
    Object.entries(draftPage.dom||{}).forEach(([key,item])=>document.querySelectorAll('[data-kp-dom-key="'+CSS.escape(key)+'"]').forEach(el=>{if(item.content)applyContentToElement(el,item.content);if(item.styles?.[editorDevice])applyStyleToElement(el,item.styles[editorDevice]);}));
    Object.entries({...draftGlobal.blocks,...draftPage.blocks}).forEach(([key,item])=>document.querySelectorAll('[data-kp-edit-key="'+CSS.escape(key)+'"]').forEach(el=>{if(item.content)applyContentToElement(el,item.content);if(item.styles?.[editorDevice])applyStyleToElement(el,item.styles[editorDevice]);}));
    applyOrder(draftPage.order);
  }

  async function saveAll() {
    deactivateText(); const btn=document.querySelector('.kp-fe-save'); btn.classList.add('is-saving'); btn.innerHTML='<span class="dashicons dashicons-update"></span>Speichert…';
    const fd=new FormData(); fd.append('action','kp_frontend_editor_save'); fd.append('nonce',cfg.nonce); fd.append('payload',JSON.stringify({global:draftGlobal,page:draftPage}));
    try {
      const res=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',body:fd}); const json=await res.json();
      if(!json.success) throw new Error(json.data?.message||'Speichern fehlgeschlagen');
      toast('Gespeichert ✓','ok'); setTimeout(()=>location.reload(),650);
    } catch(e) { toast(e.message||'Speichern fehlgeschlagen','error'); btn.classList.remove('is-saving'); btn.innerHTML='<span class="dashicons dashicons-saved"></span>Speichern'; }
  }
  document.querySelector('.kp-fe-save')?.addEventListener('click', saveAll);

  document.addEventListener('click', (e) => {
    if (e.target.closest('.kp-fe-toolbar,.kp-fe-panel,.kp-fe-modal-backdrop,.kp-fe-quick,#wpadminbar')) return;
    const term=e.target.closest('.kp-termin-card'); if(term){e.preventDefault();e.stopPropagation();openRecord('termin',term);return;}
    const rep=e.target.closest('.kp-repertoire-card'); if(rep){e.preventDefault();e.stopPropagation();openRecord('repertoire',rep);return;}
    const el=e.target.closest('[data-kp-edit-key],[data-kp-dom-key]');
    if(!el)return;
    if(e.target.closest('a')) e.preventDefault();
    e.stopPropagation(); selectElement(el);
  },true);

  modalBackdrop.addEventListener('click',e=>{if(e.target===modalBackdrop)closeModal();});
  function closeModal(){modalBackdrop.classList.remove('is-open');modal.innerHTML='';}
  function loadingModal(){modal.innerHTML='<div class="kp-fe-loading"><span class="kp-fe-spinner"></span><br>Lade Daten…</div>';modalBackdrop.classList.add('is-open');}

  async function api(action, fields={}) {
    const fd=new FormData(); fd.append('action',action); fd.append('nonce',cfg.nonce); Object.entries(fields).forEach(([k,v])=>fd.append(k,typeof v==='string'?v:JSON.stringify(v)));
    const res=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',body:fd}); const json=await res.json(); if(!json.success)throw new Error(json.data?.message||'Aktion fehlgeschlagen'); return json.data;
  }

  function recordSignature(type, card) {
    if(type==='termin'){
      const time=(card.querySelector('.kp-termin-time')?.textContent||'').match(/\d{1,2}:\d{2}/)?.[0]||'';
      return {title:card.querySelector('.kp-termin-main h3')?.textContent.trim()||'',city:card.querySelector('.kp-termin-place strong')?.textContent.trim()||'',time};
    }
    return {title:card.querySelector('h3')?.textContent.trim()||'',href:card.querySelector('h3 a,.kp-repertoire-image')?.href||''};
  }

  async function openRecord(type,card){loadingModal();try{const data=await api('kp_frontend_editor_record',{type,signature:recordSignature(type,card)});type==='termin'?renderTermin(data):renderRepertoire(data);}catch(e){modal.innerHTML=`<div class="kp-fe-modal-head"><div><h2>Nicht eindeutig gefunden</h2><p>${esc(e.message)}</p></div><button class="kp-fe-modal-close">×</button></div><div class="kp-fe-record-footer"><a href="${type==='termin'?esc(cfg.termineUrl):esc(cfg.repertoireUrl)}" target="_blank">In WordPress öffnen ↗</a></div>`;modal.querySelector('.kp-fe-modal-close').onclick=closeModal;}}

  function renderTermin(d){
    modal.innerHTML=`<div class="kp-fe-modal-head"><div><h2>Termin direkt bearbeiten</h2><p>Datum, Uhrzeit, Ort und Stück bleiben echte Termin-Daten.</p></div><button class="kp-fe-modal-close">×</button></div>
      <div class="kp-fe-modal-grid">
        <div class="kp-fe-field is-wide"><label>Stück aus dem Repertoire</label><select data-f="repertoire_id"><option value="0">Freier Titel</option>${(d.repertoire||[]).map(r=>`<option value="${r.id}" ${+d.repertoire_id===+r.id?'selected':''}>${esc(r.title)}</option>`).join('')}</select></div>
        <div class="kp-fe-field is-wide"><label>Freier / interner Titel</label><input data-f="title" type="text" value="${esc(d.title)}"></div>
        <div class="kp-fe-field"><label>Datum</label><input data-f="date" type="date" value="${esc(d.date)}"></div>
        <div class="kp-fe-field"><label>Beginn</label><input data-f="time" type="time" value="${esc(d.time)}"></div>
        <div class="kp-fe-field"><label>Ende</label><input data-f="end_time" type="time" value="${esc(d.end_time)}"></div>
        <div class="kp-fe-field"><label>Status</label><select data-f="status"><option value="standard" ${d.status==='standard'?'selected':''}>Normal</option><option value="free" ${d.status==='free'?'selected':''}>Freier Eintritt</option><option value="sold_out" ${d.status==='sold_out'?'selected':''}>Ausverkauft</option><option value="cancelled" ${d.status==='cancelled'?'selected':''}>Abgesagt</option><option value="closed" ${d.status==='closed'?'selected':''}>Geschlossen</option></select></div>
        <div class="kp-fe-field"><label>Ort / Stadt</label><input data-f="city" type="text" value="${esc(d.city)}"></div>
        <div class="kp-fe-field"><label>Spielstätte</label><input data-f="venue" type="text" value="${esc(d.venue)}"></div>
        <div class="kp-fe-field is-wide"><label>Adresse</label><input data-f="address" type="text" value="${esc(d.address)}"></div>
        <div class="kp-fe-field"><label>Ticket-Link</label><input data-f="ticket_url" type="url" value="${esc(d.ticket_url)}"></div>
        <div class="kp-fe-field"><label>Info-Link</label><input data-f="info_url" type="url" value="${esc(d.info_url)}"></div>
        <div class="kp-fe-field is-wide"><label>Hinweis</label><textarea data-f="note">${esc(d.note)}</textarea></div>
      </div><div class="kp-fe-record-footer"><a href="${esc(d.edit_url)}" target="_blank">Erweiterte Terminansicht ↗</a><button class="kp-fe-record-save">Termin speichern</button></div>`;
    modal.querySelector('.kp-fe-modal-close').onclick=closeModal; modal.querySelector('.kp-fe-record-save').onclick=()=>saveRecord('termin',d.id,false);
  }

  function renderRepertoire(d){
    modal.innerHTML=`<div class="kp-fe-modal-head"><div><h2>Stück direkt bearbeiten</h2><p>Titel, Kurztext, Bild und wichtigste Angaben sofort ändern.</p></div><button class="kp-fe-modal-close">×</button></div>
      <div class="kp-fe-record-image"><img class="kp-fe-rep-preview" src="${esc(d.thumbnail_url||'')}" alt=""><div><button type="button" class="kp-fe-record-save kp-fe-rep-image">Titelbild austauschen</button><input type="hidden" data-f="thumbnail_id" value="${+d.thumbnail_id||0}"></div></div>
      <div class="kp-fe-modal-grid" style="margin-top:14px">
        <div class="kp-fe-field is-wide"><label>Titel</label><input data-f="title" type="text" value="${esc(d.title)}"></div>
        <div class="kp-fe-field is-wide"><label>Kurzbeschreibung</label><textarea data-f="excerpt">${esc(d.excerpt)}</textarea></div>
        ${d.complex?`<div class="kp-fe-panel-note is-wide">Der ausführliche Text enthält komplexe WordPress-Blöcke. Er bleibt geschützt und wird über die erweiterte Ansicht bearbeitet.</div><input data-f="complex" type="hidden" value="1">`:`<div class="kp-fe-field is-wide"><label>Ausführlicher Text</label><textarea data-f="description">${esc(d.description)}</textarea><input data-f="complex" type="hidden" value="0"></div>`}
        <div class="kp-fe-field"><label>Alter / Zielgruppe</label><input data-f="age" type="text" value="${esc(d.age)}"></div>
        <div class="kp-fe-field"><label>Dauer</label><input data-f="duration" type="text" value="${esc(d.duration)}"></div>
        <div class="kp-fe-field"><label>Spieler*innen</label><input data-f="players" type="text" value="${esc(d.players)}"></div>
        <div class="kp-fe-field"><label>Spielweise</label><input data-f="play_style" type="text" value="${esc(d.play_style)}"></div>
        <div class="kp-fe-field is-wide"><label>Technische Hinweise</label><textarea data-f="technical">${esc(d.technical)}</textarea></div>
        <div class="kp-fe-field"><label>Rechte / Vorlage</label><input data-f="rights" type="text" value="${esc(d.rights)}"></div>
        <div class="kp-fe-field"><label>Premiere</label><input data-f="premiere" type="text" value="${esc(d.premiere)}"></div>
        <div class="kp-fe-field kp-fe-check is-wide"><input data-f="bookable" type="checkbox" ${d.bookable?'checked':''}><label>Dieses Stück ist buchbar</label></div>
      </div><div class="kp-fe-record-footer"><a href="${esc(d.edit_url)}" target="_blank">Erweiterte Stückansicht ↗</a><button class="kp-fe-record-save kp-fe-record-main-save">Stück speichern</button></div>`;
    modal.querySelector('.kp-fe-modal-close').onclick=closeModal;
    modal.querySelector('.kp-fe-rep-image').onclick=()=>pickImage(null,a=>{modal.querySelector('[data-f="thumbnail_id"]').value=a.id;modal.querySelector('.kp-fe-rep-preview').src=a.url;});
    modal.querySelector('.kp-fe-record-main-save').onclick=()=>saveRecord('repertoire',d.id,d.complex);
  }

  async function saveRecord(type,id,complex){
    const btn=modal.querySelector('.kp-fe-record-main-save,.kp-fe-record-save:last-child'); if(btn){btn.disabled=true;btn.textContent='Speichert…';}
    const fields={}; modal.querySelectorAll('[data-f]').forEach(el=>{fields[el.dataset.f]=el.type==='checkbox'?el.checked:el.value;}); if(type==='repertoire')fields.complex=!!complex;
    try{const data=await api('kp_frontend_editor_record_save',{type,id,fields});toast(data.message||'Gespeichert','ok');setTimeout(()=>location.reload(),550);}catch(e){toast(e.message||'Speichern fehlgeschlagen','error');if(btn){btn.disabled=false;btn.textContent=type==='termin'?'Termin speichern':'Stück speichern';}}
  }

  window.addEventListener('resize',()=>{if(!selected){editorDevice=currentDevice();syncDeviceButtons();}},{passive:true});
})();
