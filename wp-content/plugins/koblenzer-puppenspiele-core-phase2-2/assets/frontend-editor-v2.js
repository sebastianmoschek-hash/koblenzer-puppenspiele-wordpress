(() => {
  'use strict';
  const cfg = window.KPFrontendEditorV2;
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
  let selected = null;
  let activeText = null;
  let activeTextHandler = null;
  let editorDevice = currentDevice();
  let inspectorExpanded = false;
  let dirty = false;
  const history = [];
  const redoHistory = [];
  const HISTORY_LIMIT = 50;

  function currentDevice() {
    const w = window.innerWidth;
    if (w <= 640) return 'mobile';
    if (w <= 900) return 'tablet';
    if (w <= 1400) return 'laptop';
    return 'desktop';
  }

  const deviceLabels = {mobile:'Handy', tablet:'Tablet', laptop:'Laptop', desktop:'Desktop'};
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  function hashString(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }

  function pathFor(el, root) {
    const parts = [];
    let cur = el;
    while (cur && cur !== root && cur.nodeType === 1) {
      let n = 1;
      let sib = cur.previousElementSibling;
      while (sib) { if (sib.tagName === cur.tagName) n++; sib = sib.previousElementSibling; }
      parts.unshift(cur.tagName.toLowerCase() + ':' + n);
      cur = cur.parentElement;
    }
    return parts.join('/');
  }

  function assignFallbackKeys() {
    const roots = [...document.querySelectorAll('header,main,footer')];
    roots.forEach((root, ri) => {
      root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,img,li,figcaption').forEach((el) => {
        if (el.dataset.kpEditKey || el.dataset.kpDomKey) return;
        if (el.closest('#wpadminbar,.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop')) return;
        if (el.closest('.kp-termin-card,.kp-repertoire-card')) return;
        if (el.closest('form') && !el.matches('p,h1,h2,h3,h4,h5,h6')) return;
        if (el.matches('.wp-block-navigation__responsive-container-open,.wp-block-navigation__responsive-container-close')) return;
        const key = 'd-' + hashString(`${ri}|${root.tagName}|${pathFor(el, root)}`);
        el.dataset.kpDomKey = key;
      });
    });
  }

  function scopeFor(el) {
    return el?.closest?.('header,footer') ? 'global' : 'page';
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
    if (['core/paragraph','core/heading','core/list-item'].includes(name)) return el;
    if (el.matches('a,img,h1,h2,h3,h4,h5,h6,p,li,figcaption')) return el;
    return el;
  }

  function kindFor(el) {
    if (!el) return 'section';
    const name = el.dataset.kpBlockName || '';
    if (name === 'core/image' || el.matches('img')) return 'image';
    if (name === 'core/button' || name === 'core/navigation-link' || el.matches('a')) return 'link';
    if (['core/paragraph','core/heading','core/list-item'].includes(name) || el.matches('h1,h2,h3,h4,h5,h6,p,li,figcaption')) return 'text';
    return 'section';
  }

  function applyContent(el, content) {
    if (!el || !content) return;
    const target = contentTarget(el);
    if (!target) return;
    if (content.type === 'html') target.innerHTML = content.value || '';
    if (content.type === 'link') {
      target.textContent = content.label || '';
      if (target.tagName === 'A' && content.href) target.setAttribute('href', content.href);
    }
    if (content.type === 'image' && target.tagName === 'IMG' && content.src) {
      target.src = content.src;
      target.alt = content.alt || '';
      target.removeAttribute('srcset');
      target.removeAttribute('sizes');
    }
  }

  function applyStyle(el, style) {
    if (!el || !style) return;
    const target = contentTarget(el) || el;
    if (style.font_px) target.style.setProperty('font-size', style.font_px + 'px', 'important');
    if (style.padding_y !== undefined) {
      el.style.setProperty('padding-top', style.padding_y + 'px', 'important');
      el.style.setProperty('padding-bottom', style.padding_y + 'px', 'important');
    }
    if (style.width_pct) {
      el.style.setProperty('width', style.width_pct + '%', 'important');
      el.style.setProperty('max-width', style.width_pct + '%', 'important');
    }
    if (style.color) target.style.setProperty('color', style.color, 'important');
    if (style.background) el.style.setProperty('background-color', style.background, 'important');
    if (style.radius !== undefined) el.style.setProperty('border-radius', style.radius + 'px', 'important');
    if (style.align) target.style.setProperty('text-align', style.align, 'important');
    if (style.hidden) el.style.setProperty('display', 'none', 'important');
  }

  function actualStyle(item) {
    return item?.styles?.[currentDevice()] || null;
  }

  function applyScope(scopeData, scopeName) {
    if (!scopeData) return;
    Object.entries(scopeData.dom || {}).forEach(([key,item]) => {
      document.querySelectorAll(`[data-kp-dom-key="${CSS.escape(key)}"]`).forEach(el => {
        if (scopeFor(el) !== scopeName) return;
        if (item.content) applyContent(el, item.content);
        const s = actualStyle(item); if (s) applyStyle(el, s);
      });
    });
    Object.entries(scopeData.blocks || {}).forEach(([key,item]) => {
      document.querySelectorAll(`[data-kp-edit-key="${CSS.escape(key)}"]`).forEach(el => {
        if (scopeFor(el) !== scopeName) return;
        if (item.content) applyContent(el, item.content);
        const s = actualStyle(item); if (s) applyStyle(el, s);
      });
    });
  }

  function sectionRootAndItems() {
    const selectors = ['main.wp-block-group','main','.wp-block-post-content','.wp-site-blocks'];
    for (const selector of selectors) {
      const root = document.querySelector(selector);
      if (!root) continue;
      const items = [...root.children].filter(el => el.dataset?.kpEditKey && !['HEADER','FOOTER'].includes(el.tagName));
      if (items.length >= 2) return {root,items};
    }
    return {root:null,items:[]};
  }

  function applyOrder(order) {
    if (!Array.isArray(order) || !order.length) return;
    const {root,items} = sectionRootAndItems();
    if (!root || !items.length) return;
    const map = new Map(items.map(el => [el.dataset.kpEditKey, el]));
    order.forEach(key => { if (map.has(key)) root.appendChild(map.get(key)); });
  }

  assignFallbackKeys();
  applyScope(draftGlobal,'global');
  applyScope(draftPage,'page');
  applyOrder(draftPage.order);
  if (!cfg.editMode) return;

  document.body.classList.add('kp-fe2-editing');

  function captureHistoryDom() {
    const nodes = [...document.querySelectorAll('[data-kp-dom-key],[data-kp-edit-key]')].map(el => {
      const target = contentTarget(el) || el;
      return {
        el,
        target,
        elStyle: el.getAttribute('style'),
        targetStyle: target === el ? null : target.getAttribute('style'),
        html: target.tagName === 'IMG' ? null : target.innerHTML,
        href: target.tagName === 'A' ? target.getAttribute('href') : null,
        src: target.tagName === 'IMG' ? target.getAttribute('src') : null,
        alt: target.tagName === 'IMG' ? target.getAttribute('alt') : null,
        srcset: target.tagName === 'IMG' ? target.getAttribute('srcset') : null,
        sizes: target.tagName === 'IMG' ? target.getAttribute('sizes') : null,
      };
    });
    const section = sectionRootAndItems();
    return {nodes, order: section.items.slice()};
  }

  function restoreAttr(el, name, value) {
    if (value === null || value === undefined) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }

  function restoreHistoryDom(dom) {
    if (!dom) return;
    deactivateText();
    (dom.nodes || []).forEach(saved => {
      const el = saved.el, target = saved.target;
      if (!el?.isConnected || !target?.isConnected) return;
      if (saved.elStyle === null) el.removeAttribute('style');
      else el.setAttribute('style', saved.elStyle);
      if (target !== el) {
        if (saved.targetStyle === null) target.removeAttribute('style');
        else target.setAttribute('style', saved.targetStyle);
      }
      if (target.tagName === 'IMG') {
        restoreAttr(target, 'src', saved.src);
        restoreAttr(target, 'alt', saved.alt);
        restoreAttr(target, 'srcset', saved.srcset);
        restoreAttr(target, 'sizes', saved.sizes);
      } else {
        target.innerHTML = saved.html ?? '';
        if (target.tagName === 'A') restoreAttr(target, 'href', saved.href);
      }
    });
    const section = sectionRootAndItems();
    if (section.root && Array.isArray(dom.order)) {
      dom.order.forEach(el => { if (el?.isConnected) section.root.appendChild(el); });
    }
    clearSelection();
  }

  function emitHistoryChange() {
    window.dispatchEvent(new CustomEvent('kp:frontend-history-change', {
      detail: {undo: history.length, redo: redoHistory.length}
    }));
  }

  function snapshot() {
    history.push({global:clone(draftGlobal),page:clone(draftPage),dom:captureHistoryDom()});
    if (history.length > HISTORY_LIMIT) history.shift();
    redoHistory.length = 0;
    window.dispatchEvent(new CustomEvent('kp:frontend-history-push'));
    emitHistoryChange();
  }

  function setDirty(value = true) {
    dirty = value;
    const save = document.querySelector('.kp-fe2-save');
    if (save) save.classList.toggle('is-dirty', dirty);
  }

  function toast(text, type='') {
    const el = document.querySelector('.kp-fe2-toast');
    if (!el) return;
    el.textContent = text;
    el.className = 'kp-fe2-toast is-visible' + (type ? ' is-' + type : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('is-visible'), 2300);
  }

  function buildUI() {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="kp-fe2-hint">Direkt bearbeiten: Text, Bild oder Bereich antippen.</div>
      <div class="kp-fe2-toast" aria-live="polite"></div>
      <div class="kp-fe2-inspector" aria-hidden="true"></div>
      <div class="kp-fe2-record-backdrop"><div class="kp-fe2-record"></div></div>
      <div class="kp-fe2-toolbar">
        <a class="kp-fe2-exit" href="${esc(cfg.exitUrl)}"><span class="dashicons dashicons-no-alt"></span><span>Beenden</span></a>
        <button type="button" class="kp-fe2-undo"><span class="dashicons dashicons-undo"></span><span>Zurück</span></button>
        <label class="kp-fe2-device-wrap"><span class="dashicons dashicons-smartphone"></span><select class="kp-fe2-device" aria-label="Geräteansicht">
          ${Object.entries(deviceLabels).map(([k,v])=>`<option value="${k}" ${k===editorDevice?'selected':''}>${v}</option>`).join('')}
        </select></label>
        <button type="button" class="kp-fe2-save"><span class="dashicons dashicons-saved"></span><span>Speichern</span></button>
      </div>`);
  }
  buildUI();

  const inspector = document.querySelector('.kp-fe2-inspector');
  const recordBackdrop = document.querySelector('.kp-fe2-record-backdrop');
  const recordBox = document.querySelector('.kp-fe2-record');

  function deactivateText() {
    if (activeText) {
      activeText.contentEditable = 'false';
      activeText.classList.remove('kp-fe2-inline-text');
      if (activeTextHandler) activeText.removeEventListener('input', activeTextHandler);
    }
    activeText = null;
    activeTextHandler = null;
  }

  function clearSelection() {
    deactivateText();
    document.querySelectorAll('.kp-fe2-selected').forEach(el=>el.classList.remove('kp-fe2-selected'));
    selected = null;
    inspectorExpanded = false;
    inspector.classList.remove('is-open','is-expanded');
    inspector.setAttribute('aria-hidden','true');
  }

  function rgbToHex(value, fallback='#ffffff') {
    if (!value) return fallback;
    if (value.startsWith('#')) return value.length===4 ? '#' + [...value.slice(1)].map(c=>c+c).join('') : value.slice(0,7);
    const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return fallback;
    return '#' + [m[1],m[2],m[3]].map(n=>Math.max(0,Math.min(255,+n)).toString(16).padStart(2,'0')).join('');
  }

  function mutateItem(el, fn, makeSnapshot=true) {
    if (makeSnapshot) snapshot();
    const ref = itemFor(el,true);
    if (!ref) return;
    fn(ref.item,ref);
    setDirty(true);
  }

  function styleFor(el) {
    const ref = itemFor(el,false);
    return ref?.item?.styles?.[editorDevice] || {};
  }

  function styleControls(el, kind) {
    const target = contentTarget(el) || el;
    const cs = getComputedStyle(target), es = getComputedStyle(el);
    if (!el.dataset.kpFe2BaseFont) el.dataset.kpFe2BaseFont = parseFloat(cs.fontSize)||16;
    if (!el.dataset.kpFe2BasePad) el.dataset.kpFe2BasePad = ((parseFloat(es.paddingTop)||0)+(parseFloat(es.paddingBottom)||0))/2 || 6;
    const baseFont=+el.dataset.kpFe2BaseFont, basePad=+el.dataset.kpFe2BasePad;
    const s=styleFor(el);
    const fontPct=s.font_px?Math.round(s.font_px/baseFont*100):100;
    const padPct=s.padding_y!==undefined?Math.round(s.padding_y/basePad*100):100;
    const width=s.width_pct||100;
    const radius=s.radius!==undefined?s.radius:Math.round(parseFloat(es.borderRadius)||0);
    return `<div class="kp-fe2-style-grid">
      ${kind!=='image'&&kind!=='section'?`<label>Textgröße <span>${fontPct}%</span><input data-style="font" type="range" min="70" max="170" value="${fontPct}"></label>`:''}
      <label>Abstand <span>${padPct}%</span><input data-style="padding" type="range" min="30" max="220" value="${padPct}"></label>
      <label>Breite <span>${width}%</span><input data-style="width" type="range" min="40" max="100" value="${width}"></label>
      <label>Rundung <span>${radius}px</span><input data-style="radius" type="range" min="0" max="50" value="${radius}"></label>
      ${kind!=='image'?`<label class="kp-fe2-color">Textfarbe <input data-style-color="color" type="color" value="${rgbToHex(cs.color,'#ffffff')}"></label>`:''}
      <label class="kp-fe2-color">Hintergrund <input data-style-color="background" type="color" value="${rgbToHex(es.backgroundColor,'#17110e')}"></label>
    </div>`;
  }

  function nearestSection(el) {
    let cur=el?.parentElement;
    while(cur && cur!==document.body) {
      const name=cur.dataset?.kpBlockName||'';
      if (['core/group','core/cover','core/columns','core/media-text'].includes(name)) return cur;
      cur=cur.parentElement;
    }
    return null;
  }

  function renderInspector(el, expanded=false) {
    const kind=kindFor(el);
    inspectorExpanded=expanded;
    const target=contentTarget(el);
    let body='';
    if (kind==='text') {
      body=`<div class="kp-fe2-compact-copy"><strong>Text direkt bearbeiten</strong><small>Jetzt einfach in den markierten Text tippen.</small></div>
        <div class="kp-fe2-actions"><button class="kp-fe2-done is-primary">Fertig</button><button class="kp-fe2-expand">${expanded?'Weniger':'Gestaltung'}</button>${nearestSection(el)?'<button class="kp-fe2-parent">Bereich</button>':''}</div>`;
    } else if (kind==='link') {
      body=`<div class="kp-fe2-field"><label>Beschriftung</label><input class="kp-fe2-link-label" type="text" value="${esc(target?.textContent?.trim()||'')}"></div>
        <div class="kp-fe2-field"><label>Link</label><input class="kp-fe2-link-url" type="url" value="${esc(target?.getAttribute?.('href')||'')}"></div>
        <div class="kp-fe2-actions"><button class="kp-fe2-done is-primary">Fertig</button><button class="kp-fe2-expand">${expanded?'Weniger':'Gestaltung'}</button></div>`;
    } else if (kind==='image') {
      body=`<div class="kp-fe2-compact-copy"><strong>Bild ausgewählt</strong><small>Bild austauschen oder die Darstellung anpassen.</small></div>
        <div class="kp-fe2-actions"><button class="kp-fe2-image-pick is-primary">Bild austauschen</button><button class="kp-fe2-expand">${expanded?'Weniger':'Gestaltung'}</button>${nearestSection(el)?'<button class="kp-fe2-parent">Bereich</button>':''}</div>`;
    } else {
      body=`<div class="kp-fe2-compact-copy"><strong>Bereich ausgewählt</strong><small>Verschieben oder Gestaltung für ${deviceLabels[editorDevice]} ändern.</small></div>
        <div class="kp-fe2-actions"><button class="kp-fe2-up">↑ Hoch</button><button class="kp-fe2-down">↓ Runter</button><button class="kp-fe2-expand is-primary">${expanded?'Weniger':'Gestaltung'}</button></div>`;
    }
    inspector.innerHTML=`<div class="kp-fe2-inspector-head"><span>${deviceLabels[editorDevice]}</span><button class="kp-fe2-close" aria-label="Schließen">×</button></div>${body}${expanded?styleControls(el,kind):''}<div class="kp-fe2-reset-row"><button class="kp-fe2-reset">Element zurücksetzen</button>${cfg.pageEditorUrl?`<a href="${esc(cfg.pageEditorUrl)}" target="_blank" rel="noopener">Profiansicht ↗</a>`:''}</div>`;
    inspector.classList.add('is-open');
    inspector.classList.toggle('is-expanded',expanded);
    inspector.setAttribute('aria-hidden','false');
    bindInspector(el,kind);
  }

  function activateText(el) {
    deactivateText();
    const target=contentTarget(el);
    if(!target)return;
    let pushed=false;
    activeText=target;
    target.contentEditable='true';
    target.spellcheck=true;
    target.classList.add('kp-fe2-inline-text');
    activeTextHandler=()=>{
      if(!pushed){snapshot();pushed=true;}
      mutateItem(el,item=>{item.content={type:'html',value:target.innerHTML};},false);
    };
    target.addEventListener('input',activeTextHandler);
    setTimeout(()=>{try{target.focus({preventScroll:true});}catch(e){target.focus();}},10);
  }

  function selectElement(el) {
    if(!el)return;
    clearSelection();
    selected=el;
    el.classList.add('kp-fe2-selected');
    const kind=kindFor(el);
    if(kind==='text') activateText(el);
    renderInspector(el,false);
  }

  function bindInspector(el,kind) {
    inspector.querySelector('.kp-fe2-close')?.addEventListener('click',clearSelection);
    inspector.querySelector('.kp-fe2-done')?.addEventListener('click',()=>{deactivateText();clearSelection();toast('Änderung bereit zum Speichern.');});
    inspector.querySelector('.kp-fe2-expand')?.addEventListener('click',()=>renderInspector(el,!inspectorExpanded));
    inspector.querySelector('.kp-fe2-parent')?.addEventListener('click',()=>{const p=nearestSection(el);if(p)selectElement(p);});
    inspector.querySelector('.kp-fe2-image-pick')?.addEventListener('click',()=>pickImage(el));
    inspector.querySelector('.kp-fe2-up')?.addEventListener('click',()=>moveSection(el,-1));
    inspector.querySelector('.kp-fe2-down')?.addEventListener('click',()=>moveSection(el,1));
    inspector.querySelector('.kp-fe2-reset')?.addEventListener('click',()=>resetElement(el));

    const label=inspector.querySelector('.kp-fe2-link-label');
    const url=inspector.querySelector('.kp-fe2-link-url');
    if(label&&url){
      let pushed=false;
      const update=()=>{
        if(!pushed){snapshot();pushed=true;}
        const target=contentTarget(el);
        mutateItem(el,item=>{item.content={type:'link',label:label.value,href:url.value};},false);
        if(target){target.textContent=label.value;if(target.tagName==='A')target.setAttribute('href',url.value||'#');}
      };
      label.addEventListener('input',update);url.addEventListener('input',update);
    }

    inspector.querySelectorAll('[data-style]').forEach(input=>{
      let pushed=false;
      input.addEventListener('input',()=>{
        if(!pushed){snapshot();pushed=true;}
        const value=+input.value, styleName=input.dataset.style;
        mutateItem(el,item=>{
          item.styles=item.styles||{};item.styles[editorDevice]=item.styles[editorDevice]||{};
          const s=item.styles[editorDevice];
          const baseFont=+el.dataset.kpFe2BaseFont||16, basePad=+el.dataset.kpFe2BasePad||6;
          if(styleName==='font')s.font_px=+(baseFont*value/100).toFixed(2);
          if(styleName==='padding')s.padding_y=+(basePad*value/100).toFixed(2);
          if(styleName==='width')s.width_pct=value;
          if(styleName==='radius')s.radius=value;
        },false);
        input.previousElementSibling && (input.previousElementSibling.textContent = styleName==='radius'?value+'px':value+'%');
        applyStyle(el,styleFor(el));
      });
    });
    inspector.querySelectorAll('[data-style-color]').forEach(input=>{
      let pushed=false;
      input.addEventListener('input',()=>{
        if(!pushed){snapshot();pushed=true;}
        mutateItem(el,item=>{item.styles=item.styles||{};item.styles[editorDevice]=item.styles[editorDevice]||{};item.styles[editorDevice][input.dataset.styleColor]=input.value;},false);
        applyStyle(el,styleFor(el));
      });
    });
  }

  function pickImage(el, callback) {
    if(!window.wp?.media){toast('Mediathek konnte nicht geöffnet werden.','error');return;}
    const frame=wp.media({title:'Bild auswählen',button:{text:'Dieses Bild verwenden'},multiple:false,library:{type:'image'}});
    frame.on('select',()=>{
      const a=frame.state().get('selection').first().toJSON();
      if(callback){callback(a);return;}
      const target=contentTarget(el);if(!target)return;
      snapshot();
      mutateItem(el,item=>{item.content={type:'image',src:a.url,alt:a.alt||a.title||'',attachment_id:a.id};},false);
      target.src=a.url;target.alt=a.alt||a.title||'';target.removeAttribute('srcset');target.removeAttribute('sizes');
      toast('Bild gewählt – jetzt speichern.');
    });
    frame.open();
  }

  function moveSection(el,dir) {
    const {root,items}=sectionRootAndItems();
    if(!root||!items.includes(el)){toast('Diesen inneren Bereich bitte über „Bereich“ auswählen.','error');return;}
    const idx=items.indexOf(el),next=idx+dir;if(next<0||next>=items.length)return;
    snapshot();
    if(dir<0)root.insertBefore(el,items[next]);else root.insertBefore(items[next],el);
    draftPage.order=[...sectionRootAndItems().items].map(x=>x.dataset.kpEditKey).filter(Boolean);
    setDirty(true);toast('Bereich verschoben – noch speichern.');
  }

  function resetElement(el) {
    const info=keyInfo(el);if(!info)return;
    snapshot();
    const store=scopeObject(scopeFor(el));delete store[info.collection][info.key];setDirty(true);
    toast('Zurückgesetzt. Nach Speichern wird das Original geladen.');
  }

  document.querySelector('.kp-fe2-device')?.addEventListener('change',e=>{
    editorDevice=e.target.value;if(selected)renderInspector(selected,inspectorExpanded);toast('Gestaltung für '+deviceLabels[editorDevice]);
  });

  function currentHistoryEntry() {
    return {global:clone(draftGlobal),page:clone(draftPage),dom:captureHistoryDom()};
  }

  function applyHistoryEntry(entry) {
    if (!entry) return false;
    draftGlobal=ensureScope(entry.global);
    draftPage=ensureScope(entry.page);
    restoreHistoryDom(entry.dom);
    setDirty(true);
    emitHistoryChange();
    return true;
  }

  function undoHistory() {
    const prev=history.pop();
    if(!prev){emitHistoryChange();return false;}
    redoHistory.push(currentHistoryEntry());
    if(redoHistory.length>HISTORY_LIMIT)redoHistory.shift();
    applyHistoryEntry(prev);
    return true;
  }

  function redoHistoryStep() {
    const next=redoHistory.pop();
    if(!next){emitHistoryChange();return false;}
    history.push(currentHistoryEntry());
    if(history.length>HISTORY_LIMIT)history.shift();
    applyHistoryEntry(next);
    return true;
  }

  document.querySelector('.kp-fe2-undo')?.addEventListener('click',()=>{
    if(window.KPWordHistory?.undo)window.KPWordHistory.undo();
    else undoHistory();
  });

  window.KPFrontendEditorHistory={
    undo:undoHistory,
    redo:redoHistoryStep,
    canUndo:()=>history.length>0,
    canRedo:()=>redoHistory.length>0,
    counts:()=>({undo:history.length,redo:redoHistory.length}),
    clearRedo:()=>{redoHistory.length=0;emitHistoryChange();}
  };
  emitHistoryChange();

  async function api(action,fields={}) {
    const fd=new FormData();fd.append('action',action);fd.append('nonce',cfg.nonce);
    Object.entries(fields).forEach(([k,v])=>fd.append(k,typeof v==='string'?v:JSON.stringify(v)));
    const res=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',body:fd});
    const json=await res.json();if(!json.success)throw new Error(json.data?.message||'Aktion fehlgeschlagen');return json.data;
  }

  async function saveAll() {
    deactivateText();
    const btn=document.querySelector('.kp-fe2-save');btn.disabled=true;btn.classList.add('is-saving');btn.innerHTML='<span class="dashicons dashicons-update"></span><span>Speichert…</span>';
    try{
      const data=await api('kp_fe_v2_save',{page_key:cfg.pageKey,payload:{global:draftGlobal,page:draftPage}});
      setDirty(false);toast(data.message||'Gespeichert ✓','ok');
      setTimeout(()=>location.reload(),500);
    }catch(e){toast(e.message||'Speichern fehlgeschlagen','error');btn.disabled=false;btn.classList.remove('is-saving');btn.innerHTML='<span class="dashicons dashicons-saved"></span><span>Speichern</span>';}
  }
  // The unified save bridge must invoke the real FE2 save after specialist runtimes flush.
  // Expose the existing saveAll function without adding a second click listener.
  window.KPFrontendEditorNativeSave=saveAll;
  document.querySelector('.kp-fe2-save')?.addEventListener('click',saveAll);

  document.addEventListener('submit',e=>{
    if(!e.target.closest('.kp-fe2-record')){e.preventDefault();toast('Formulare sind im Bearbeitungsmodus geschützt.','error');}
  },true);

  document.addEventListener('click',e=>{
    if(e.target.closest('.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop,#wpadminbar'))return;
    if(activeText&&activeText.contains(e.target))return;
    const term=e.target.closest('.kp-termin-card');
    if(term){e.preventDefault();e.stopPropagation();openRecord('termin',term);return;}
    const rep=e.target.closest('.kp-repertoire-card');
    if(rep){e.preventDefault();e.stopPropagation();openRecord('repertoire',rep);return;}
    const el=e.target.closest('[data-kp-dom-key],[data-kp-edit-key]');
    if(!el)return;
    if(e.target.closest('a'))e.preventDefault();
    e.stopPropagation();selectElement(el);
  },true);

  function closeRecord(){recordBackdrop.classList.remove('is-open');recordBox.innerHTML='';}
  recordBackdrop.addEventListener('click',e=>{if(e.target===recordBackdrop)closeRecord();});

  function loadingRecord(){recordBox.innerHTML='<div class="kp-fe2-loading"><span></span><p>Lade Daten…</p></div>';recordBackdrop.classList.add('is-open');}

  function recordSignature(type,card){
    if(type==='termin'){
      const time=(card.querySelector('.kp-termin-time')?.textContent||'').match(/\d{1,2}:\d{2}/)?.[0]||'';
      const dateLabel=[card.querySelector('.kp-termin-weekday')?.textContent,card.querySelector('.kp-termin-date strong')?.textContent,card.querySelector('.kp-termin-date>span:last-child')?.textContent].filter(Boolean).join(' ');
      return {title:card.querySelector('.kp-termin-main h3')?.textContent.trim()||'',city:card.querySelector('.kp-termin-place strong')?.textContent.trim()||'',time,date_label:dateLabel};
    }
    return {title:card.querySelector('h3')?.textContent.trim()||'',href:card.querySelector('h3 a,.kp-repertoire-image')?.href||''};
  }

  async function openRecord(type,card){
    loadingRecord();
    try{const d=await api('kp_fe_v2_record',{type,signature:recordSignature(type,card)});type==='termin'?renderTermin(d):renderRepertoire(d);}
    catch(e){recordBox.innerHTML=`<div class="kp-fe2-record-head"><div><h2>Nicht eindeutig gefunden</h2><p>${esc(e.message)}</p></div><button class="kp-fe2-record-close">×</button></div><a class="kp-fe2-wide-link" target="_blank" rel="noopener" href="${type==='termin'?esc(cfg.termineUrl):esc(cfg.repertoireUrl)}">In WordPress öffnen ↗</a>`;recordBox.querySelector('.kp-fe2-record-close').onclick=closeRecord;}
  }

  function renderTermin(d){
    const statuses=d.statuses||{};
    recordBox.innerHTML=`<div class="kp-fe2-record-head"><div><h2>Termin bearbeiten</h2><p>Die wichtigsten Angaben zuerst. „Mehr“ zeigt die seltenen Felder.</p></div><button class="kp-fe2-record-close">×</button></div>
      <div class="kp-fe2-record-grid">
        <label class="wide">Stück<select data-f="repertoire_id"><option value="0">Freier Titel</option>${(d.repertoire||[]).map(r=>`<option value="${r.id}" ${+d.repertoire_id===+r.id?'selected':''}>${esc(r.title)}</option>`).join('')}</select></label>
        <label class="wide">Freier Titel<input data-f="title" type="text" value="${esc(d.title)}"></label>
        <label>Datum<input data-f="date" type="date" value="${esc(d.date)}"></label>
        <label>Beginn<input data-f="time" type="time" value="${esc(d.time)}"></label>
        <label>Ort / Stadt<input data-f="city" type="text" value="${esc(d.city)}"></label>
        <label>Spielstätte<input data-f="venue" type="text" value="${esc(d.venue)}"></label>
        <label class="wide">Status<select data-f="status">${Object.entries(statuses).map(([k,v])=>`<option value="${esc(k)}" ${d.status===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label>
      </div>
      <details class="kp-fe2-more"><summary>Mehr Angaben</summary><div class="kp-fe2-record-grid">
        <label>Ende<input data-f="end_time" type="time" value="${esc(d.end_time)}"></label>
        <label>Adresse<input data-f="address" type="text" value="${esc(d.address)}"></label>
        <label>Ticket-Link<input data-f="ticket_url" type="url" value="${esc(d.ticket_url)}"></label>
        <label>Info-Link<input data-f="info_url" type="url" value="${esc(d.info_url)}"></label>
        <label class="wide">Hinweis<textarea data-f="note">${esc(d.note)}</textarea></label>
      </div></details>
      <div class="kp-fe2-record-footer"><a href="${esc(d.edit_url)}" target="_blank" rel="noopener">Erweitert ↗</a><button class="kp-fe2-record-main-save">Termin speichern</button></div>`;
    recordBox.querySelector('.kp-fe2-record-close').onclick=closeRecord;
    recordBox.querySelector('.kp-fe2-record-main-save').onclick=()=>saveRecord('termin',d.id,false);
  }

  function renderRepertoire(d){
    recordBox.innerHTML=`<div class="kp-fe2-record-head"><div><h2>Stück bearbeiten</h2><p>Titel, Bild und Kurzangaben direkt ändern.</p></div><button class="kp-fe2-record-close">×</button></div>
      <div class="kp-fe2-rep-image"><img src="${esc(d.thumbnail_url||'')}" alt=""><button type="button" class="kp-fe2-rep-pick">Bild austauschen</button><input type="hidden" data-f="thumbnail_id" value="${+d.thumbnail_id||0}"></div>
      <div class="kp-fe2-record-grid">
        <label class="wide">Titel<input data-f="title" type="text" value="${esc(d.title)}"></label>
        <label class="wide">Kurzbeschreibung<textarea data-f="excerpt">${esc(d.excerpt)}</textarea></label>
        <label>Alter / Zielgruppe<input data-f="age" type="text" value="${esc(d.age)}"></label>
        <label>Dauer<input data-f="duration" type="text" value="${esc(d.duration)}"></label>
      </div>
      <details class="kp-fe2-more"><summary>Mehr Angaben</summary><div class="kp-fe2-record-grid">
        ${d.complex?`<div class="kp-fe2-note wide">Der ausführliche Text besteht aus mehreren Blöcken und bleibt geschützt. Einzelne sichtbare Texte kannst du auf der Stückseite direkt antippen.</div><input data-f="complex" type="hidden" value="1">`:`<label class="wide">Ausführlicher Text<textarea data-f="description">${esc(d.description)}</textarea><input data-f="complex" type="hidden" value="0"></label>`}
        <label>Spieler*innen<input data-f="players" type="text" value="${esc(d.players)}"></label>
        <label>Spielweise<input data-f="play_style" type="text" value="${esc(d.play_style)}"></label>
        <label class="wide">Technische Hinweise<textarea data-f="technical">${esc(d.technical)}</textarea></label>
        <label>Rechte / Vorlage<input data-f="rights" type="text" value="${esc(d.rights)}"></label>
        <label>Premiere<input data-f="premiere" type="text" value="${esc(d.premiere)}"></label>
        <label class="wide kp-fe2-check"><input data-f="bookable" type="checkbox" ${d.bookable?'checked':''}> Dieses Stück ist buchbar</label>
      </div></details>
      <div class="kp-fe2-record-footer"><a href="${esc(d.edit_url)}" target="_blank" rel="noopener">Erweitert ↗</a><button class="kp-fe2-record-main-save">Stück speichern</button></div>`;
    recordBox.querySelector('.kp-fe2-record-close').onclick=closeRecord;
    recordBox.querySelector('.kp-fe2-rep-pick').onclick=()=>pickImage(null,a=>{recordBox.querySelector('[data-f="thumbnail_id"]').value=a.id;recordBox.querySelector('.kp-fe2-rep-image img').src=a.url;});
    recordBox.querySelector('.kp-fe2-record-main-save').onclick=()=>saveRecord('repertoire',d.id,d.complex);
  }

  async function saveRecord(type,id,complex){
    const btn=recordBox.querySelector('.kp-fe2-record-main-save');btn.disabled=true;btn.textContent='Speichert…';
    const fields={};recordBox.querySelectorAll('[data-f]').forEach(el=>{fields[el.dataset.f]=el.type==='checkbox'?el.checked:el.value;});if(type==='repertoire')fields.complex=!!complex;
    try{const data=await api('kp_fe_v2_record_save',{type,id,fields});toast(data.message||'Gespeichert ✓','ok');setTimeout(()=>location.reload(),500);}
    catch(e){toast(e.message||'Speichern fehlgeschlagen','error');btn.disabled=false;btn.textContent=type==='termin'?'Termin speichern':'Stück speichern';}
  }

  // Deliberately no beforeunload confirmation: owner actions such as X/Beenden
  // must execute immediately. Unsaved changes are handled by the explicit
  // Save/Undo/Discard UI instead of a browser-level reload dialog.
})();
