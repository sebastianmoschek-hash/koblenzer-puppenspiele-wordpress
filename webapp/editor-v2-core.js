/* Editor V2 foundation: document model, store, actions, history and persistence. */
(() => {
  'use strict';
  if (window.KPEditorV2) return;

  const SCHEMA_VERSION = 1;
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = prefix => `${prefix}-${(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9-]/gi, '')}`;

  function elementFromDOM(node, index = 0) {
    const tag = node.tagName?.toLowerCase() || 'div';
    const type = tag === 'img' ? 'image' : tag === 'a' ? 'button' : /^h[1-6]$/.test(tag) ? 'heading' : 'text';
    const elementId = node.dataset?.v2Id || id('el');
    if (node.dataset) node.dataset.v2Id = elementId;
    return { id: elementId, type, order: index, content: type === 'image' ? { src: node.getAttribute('src') || '', alt: node.getAttribute('alt') || '' } : type === 'button' ? { text: node.textContent?.trim() || '', href: node.getAttribute('href') || '#' } : { text: node.textContent?.trim() || '' }, styles: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, source: { tag, className: node.className || '' } };
  }

  function importDocument(root = document) {
    const main = root.querySelector?.('main');
    const sections = [...(main?.querySelectorAll(':scope > section') || [])];
    return {
      schemaVersion: SCHEMA_VERSION,
      site: { id: 'koblenzer-puppenspiele', title: root.title || '', design: { preset: 'original' } },
      navigation: { items: [...(root.querySelectorAll('#nav > a') || [])].map((a, order) => { const itemId = a.dataset.v2NavId || id('nav'); a.dataset.v2NavId = itemId; return { id: itemId, label: a.textContent?.trim() || '', href: a.getAttribute('href') || '', order, className: a.className || '' }; }) },
      header: { id: 'header', elements: [...(root.querySelectorAll('.top > .brand,.top > nav,#menu') || [])].map(elementFromDOM) },
      pages: [{ id: 'home', path: '/', sections: sections.map((section, order) => { const sectionId = section.dataset.v2SectionId || section.id || id('section'); section.dataset.v2SectionId = sectionId; return { id: sectionId, order, design: { className: section.className || '' }, elements: [...section.querySelectorAll('h1,h2,h3,p,a,img,button')].map(elementFromDOM) }; }) }],
      meta: { importedAt: new Date().toISOString(), source: 'standalone-dom' }
    };
  }

  function normalize(doc) {
    const out = clone(doc || {});
    out.schemaVersion = SCHEMA_VERSION;
    out.site ||= { id: 'site', title: '', design: { preset: 'original' } };
    out.pages = Array.isArray(out.pages) ? out.pages : [];
    out.navigation ||= { items: [] };
    out.navigation.items = Array.isArray(out.navigation.items) ? out.navigation.items : [];
    out.pages.forEach(page => { page.sections = Array.isArray(page.sections) ? page.sections : []; page.sections.forEach(section => { section.elements = Array.isArray(section.elements) ? section.elements : []; }); });
    return out;
  }

  function migrate(doc) {
    const source = clone(doc || {});
    const version = Number(source.schemaVersion) || 0;
    if (version > SCHEMA_VERSION) throw new Error(`Dokumentschema ${version} wird noch nicht unterstützt`);
    if (version === 0) { source.schemaVersion = 1; source.meta = { ...(source.meta || {}), migratedFrom: 0, migratedAt: new Date().toISOString() }; }
    return normalize(source);
  }

  function createStore(initial) {
    let state = { document: normalize(initial), selection: null, activePageId: 'home', activeSectionId: null, mode: 'view', viewport: 'desktop', breakpoint: 'desktop', gesture: { type: 'idle' }, dirty: false, persistence: 'idle', preview: null, aiContext: null, diagnosticsContext: null };
    const listeners = new Set();
    const history = [], future = [];
    const emit = () => listeners.forEach(listener => listener(state));
    const snapshot = () => clone(state);
    const set = next => { state = next; emit(); return state; };
    let batchDepth = 0;
    const transact = (label, mutator) => {
      const before = snapshot();
      const draft = snapshot();
      const result = mutator(draft);
      if (JSON.stringify(before) === JSON.stringify(draft)) return result;
      if (batchDepth > 0) { draft.dirty = true; set(draft); return result; }
      history.push({ label, before, after: draft, at: Date.now() });
      if (history.length > 100) history.shift();
      future.length = 0;
      draft.dirty = true;
      set(draft);
      return result;
    };
    const executeBatch = (label, callback) => {
      if (typeof callback !== 'function') throw new TypeError('Batch benötigt eine Funktion');
      if (batchDepth > 0) return callback();
      const before = snapshot();
      batchDepth += 1;
      let result;
      try { result = callback(); } finally { batchDepth -= 1; }
      const after = snapshot();
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        after.dirty = true;
        history.push({ label: String(label || 'Mehrere Änderungen'), before, after, at: Date.now() });
        if (history.length > 100) history.shift();
        future.length = 0;
        set(after);
      }
      return result;
    };
    const preview = (label, mutator) => {
      const before = state.preview?.before || snapshot();
      const draft = snapshot();
      draft.preview = { label, before };
      mutator(draft);
      set(draft);
      return draft;
    };
    const commitPreview = () => {
      if (!state.preview) return false;
      const { label, before } = state.preview;
      const after = snapshot(); after.preview = null; after.dirty = true;
      history.push({ label, before, after, at: Date.now() }); future.length = 0; set(after); return true;
    };
    const cancelPreview = () => { if (!state.preview) return false; const before = state.preview.before; set(before); return true; };
    return {
      get: () => state,
      snapshot,
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      setMode: mode => set({ ...state, mode }),
      setViewport: viewport => set({ ...state, viewport, breakpoint: viewport }),
      setSelection: selection => set({ ...state, selection }),
      replaceDocument: (document, options = {}) => set({ ...state, document: normalize(document), selection: null, dirty: Boolean(options.dirty), persistence: options.persistence || state.persistence }),
      transact,
      executeBatch,
      preview,
      commitPreview,
      cancelPreview,
      undo: () => { const entry = history.pop(); if (!entry) return false; future.push(entry); set(entry.before); return true; },
      redo: () => { const entry = future.pop(); if (!entry) return false; history.push(entry); set(entry.after); return true; },
      history: () => ({ undo: history.length, redo: future.length })
    };
  }

  function createActions(store) {
    const find = (doc, elementId) => {
      for (const page of doc.pages) for (const section of page.sections) { const element = section.elements.find(item => item.id === elementId); if (element) return { page, section, element }; }
      return null;
    };
    const api = {
      selectElement: elementId => store.setSelection(elementId ? { elementId } : null),
      setText: (elementId, text) => store.transact('Text ändern', doc => { const found = find(doc.document, elementId); if (found && ['text', 'heading', 'button'].includes(found.element.type)) found.element.content.text = String(text); }),
      setTextStyle: (elementId, styles = {}) => store.transact('Text gestalten', doc => { const found = find(doc.document, elementId); if (found && ['text', 'heading', 'button'].includes(found.element.type)) found.element.styles = { ...found.element.styles, ...clone(styles) }; }),
      setButtonLink: (elementId, href) => store.transact('Button-Link ändern', doc => { const found = find(doc.document, elementId); if (found?.element.type === 'button') found.element.content.href = String(href); }),
      moveElement: (elementId, x, y) => store.transact('Element verschieben', doc => { const found = find(doc.document, elementId); if (found) { found.element.transform.x = Number(x) || 0; found.element.transform.y = Number(y) || 0; } }),
      resizeElement: (elementId, scale) => store.transact('Element skalieren', doc => { const found = find(doc.document, elementId); if (found) found.element.transform.scale = Math.max(.1, Math.min(10, Number(scale) || 1)); }),
      rotateElement: (elementId, rotation) => store.transact('Element drehen', doc => { const found = find(doc.document, elementId); if (found) found.element.transform.rotation = Number(rotation) || 0; }),
      setImageTransform: (elementId, transform = {}) => store.transact('Bild ausrichten', doc => { const found = find(doc.document, elementId); if (found?.element.type === 'image') found.element.transform = { ...found.element.transform, ...clone(transform) }; }),
      duplicateElement: elementId => store.transact('Element duplizieren', doc => { const found = find(doc.document, elementId); if (found) { const copy = clone(found.element); copy.id = id('el'); copy.order += .01; found.section.elements.push(copy); } }),
      replaceImage: (elementId, src, alt = '') => store.transact('Bild ersetzen', doc => { const found = find(doc.document, elementId); if (found?.element.type === 'image') { found.element.content.src = String(src); found.element.content.alt = String(alt); } }),
      setImageAdjustments: (elementId, adjustments = {}) => store.transact('Bild bearbeiten', doc => { const found = find(doc.document, elementId); if (found?.element.type === 'image') found.element.content.adjustments = { ...(found.element.content.adjustments || {}), ...clone(adjustments) }; }),
      resetImage: elementId => store.transact('Bild zurücksetzen', doc => { const found = find(doc.document, elementId); if (found?.element.type === 'image') { found.element.transform = { x: 0, y: 0, scale: 1, rotation: 0 }; delete found.element.content.adjustments; } }),
      deleteElement: elementId => store.transact('Element löschen', state => { for (const page of state.document.pages) for (const section of page.sections) section.elements = section.elements.filter(item => item.id !== elementId); if (state.selection?.elementId === elementId) state.selection = null; }),
      createSection: (pageId = 'home', section = {}) => store.transact('Abschnitt hinzufügen', state => { const page = state.document.pages.find(item => item.id === pageId) || state.document.pages[0]; if (page) page.sections.push({ id: id('section'), order: page.sections.length, design: {}, elements: [], ...clone(section) }); }),
      duplicateSection: sectionId => store.transact('Abschnitt duplizieren', state => { for (const page of state.document.pages) { const source = page.sections.find(section => section.id === sectionId); if (source) { const copy = clone(source); copy.id = id('section'); copy.order = page.sections.length; copy.elements.forEach(element => { element.id = id('el'); }); page.sections.push(copy); return; } } }),
      deleteSection: sectionId => store.transact('Abschnitt löschen', state => { for (const page of state.document.pages) page.sections = page.sections.filter(section => section.id !== sectionId); }),
      setSectionDesign: (sectionId, design = {}) => store.transact('Abschnitt gestalten', state => { for (const page of state.document.pages) { const section = page.sections.find(item => item.id === sectionId); if (section) section.design = { ...section.design, ...clone(design) }; } }),
      moveLayer: (elementId, direction) => store.transact('Ebene ändern', state => { const found = find(state.document, elementId); if (!found) return; const elements = found.section.elements; const index = elements.findIndex(item => item.id === elementId); const target = direction === 'front' ? elements.length - 1 : direction === 'back' ? 0 : Math.max(0, Math.min(elements.length - 1, index + (direction === 'forward' ? 1 : -1))); elements.splice(target, 0, elements.splice(index, 1)[0]); elements.forEach((element, order) => { element.order = order; }); }),
      setHeaderDesign: design => store.transact('Header gestalten', state => { state.document.header.design = { ...(state.document.header.design || {}), ...clone(design || {}) }; }),
      renameNavigationItem: (itemId, label) => store.transact('Menüpunkt umbenennen', state => { const item = state.document.navigation.items.find(entry => entry.id === itemId); if (item) item.label = String(label); }),
      createNavigationItem: (label, href = '#') => store.transact('Menüpunkt hinzufügen', state => { state.document.navigation.items.push({ id: id('nav'), label: String(label), href: String(href), order: state.document.navigation.items.length }); }),
      deleteNavigationItem: itemId => store.transact('Menüpunkt löschen', state => { state.document.navigation.items = state.document.navigation.items.filter(item => item.id !== itemId); state.document.navigation.items.forEach((item, order) => { item.order = order; }); }),
      applyTheme: theme => store.transact('Website-Design anwenden', state => { state.document.site.design = { ...state.document.site.design, ...clone(theme || {}) }; }),
      executeBatch: (label, commands = []) => store.executeBatch(label, () => commands.map(command => api.apply(command.name, command.payload))),
      apply: (name, payload) => { const action = api[name]; if (typeof action !== 'function' || name === 'apply' || name === 'executeBatch') throw new Error(`Unbekannte V2-Action: ${name}`); return action(...(Array.isArray(payload) ? payload : [payload])); }
    };
    return api;
  }

  function createPersistence(store, key = 'kp-editor-v2-document') {
    return {
      save: () => { const value = store.get().document; localStorage.setItem(key, JSON.stringify(value)); store.replaceDocument(value, { dirty: false, persistence: 'saved' }); return value; },
      load: () => { const raw = localStorage.getItem(key); return raw ? migrate(JSON.parse(raw)) : null; },
      restore: () => { const raw = localStorage.getItem(key); if (!raw) return false; store.replaceDocument(migrate(JSON.parse(raw)), { dirty: false, persistence: 'loaded' }); return true; },
      clear: () => localStorage.removeItem(key)
    };
  }

  function createRenderer() {
    const makeElement = element => {
      const safeTags = new Set(['a', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'p', 'blockquote', 'figcaption', 'li']);
      const fallback = element.type === 'image' ? 'img' : element.type === 'button' ? 'a' : element.type === 'heading' ? 'h2' : 'p';
      const tag = safeTags.has(element.source?.tag) ? element.source.tag : fallback;
      const node = document.createElement(tag);
      node.dataset.v2Id = element.id;
      node.className = element.source?.className || (element.type === 'button' ? 'btn' : '');
      return node;
    };
    return {
      render(doc, root) {
        if (!root || !doc) throw new TypeError('Renderer benötigt Dokument und Ziel-Element');
        root.dataset.v2Schema = String(doc.schemaVersion || SCHEMA_VERSION);
        root.dataset.v2Rendered = 'true';
        const main = root.querySelector('main');
        const modelSections = doc.pages.flatMap(page => page.sections).sort((a, b) => (a.order || 0) - (b.order || 0));
        const sectionIds = new Set(modelSections.map(section => section.id));
        root.querySelectorAll('main > section[data-v2-section-id]').forEach(node => { if (!sectionIds.has(node.dataset.v2SectionId)) node.remove(); });
        modelSections.forEach(section => {
          let sectionNode = root.querySelector(`main > section[data-v2-section-id="${section.id}"]`);
          if (!sectionNode && main) { sectionNode = document.createElement('section'); sectionNode.dataset.v2SectionId = section.id; sectionNode.className = section.design?.className || 'editable'; sectionNode.innerHTML = '<div class="wrap"></div>'; main.append(sectionNode); }
          if (!sectionNode) return;
          if (section.design?.className != null) sectionNode.className = section.design.className;
          for (const [property, value] of Object.entries(section.design || {})) {
            if (property === 'className' || property === 'preset') continue;
            if (value == null) sectionNode.style.removeProperty(property); else sectionNode.style[property] = String(value);
          }
          const host = sectionNode.querySelector('.wrap,.hero-copy') || sectionNode;
          section.elements.sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(element => { if (!root.querySelector(`[data-v2-id="${element.id}"]`)) host.append(makeElement(element)); });
        });
        const modelElements = modelSections.flatMap(section => section.elements).concat(doc.header?.elements || []);
        const elementIds = new Set(modelElements.map(element => element.id));
        root.querySelectorAll('[data-v2-id]').forEach(node => { if (!elementIds.has(node.dataset.v2Id)) node.remove(); });
        modelElements.forEach(element => {
          const node = root.querySelector(`[data-v2-id="${element.id}"]`);
          if (!node) return;
          if (element.type === 'image') { node.setAttribute('src', element.content.src || ''); node.setAttribute('alt', element.content.alt || ''); node.style.maxWidth = '100%'; node.style.height = 'auto'; }
          else if (typeof element.content?.text === 'string' && node.textContent !== element.content.text) node.textContent = element.content.text;
          if (element.type === 'button' && element.content?.href) node.setAttribute('href', element.content.href);
          Object.entries(element.styles || {}).forEach(([property, value]) => { if (value == null) node.style.removeProperty(property); else node.style[property] = typeof value === 'number' && ['fontSize', 'letterSpacing', 'borderRadius'].includes(property) ? `${value}px` : String(value); });
          const transform = element.transform || {};
          const flipX = Number(transform.flipX) === -1 ? -1 : 1, flipY = Number(transform.flipY) === -1 ? -1 : 1;
          node.style.setProperty('transform', `translate(${Number(transform.x) || 0}px, ${Number(transform.y) || 0}px) scale(${(Number(transform.scale) || 1) * flipX}, ${(Number(transform.scale) || 1) * flipY}) rotate(${Number(transform.rotation) || 0}deg)`);
          if (element.type === 'image') {
            const adjustment = element.content.adjustments || {};
            const brightness = 100 + (Number(adjustment.brightness) || 0), contrast = 100 + (Number(adjustment.contrast) || 0), saturation = 100 + (Number(adjustment.saturation) || 0), blur = Math.max(0, Number(adjustment.blur) || 0), temperature = Number(adjustment.temperature) || 0, grayscale = Math.max(0, Number(adjustment.grayscale) || 0), sepia = Math.max(Number(adjustment.sepia) || 0, Math.max(0, temperature));
            node.style.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${sepia}%) hue-rotate(${temperature < 0 ? Math.round(temperature * .35) : 0}deg) blur(${blur}px) grayscale(${grayscale}%)`;
            if (adjustment.opacity != null) node.style.opacity = String(Math.max(0, Math.min(1, Number(adjustment.opacity))));
          }
        });
        const nav = root.querySelector('#nav');
        if (nav) {
          const items = [...(doc.navigation?.items || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
          const itemIds = new Set(items.map(item => item.id));
          nav.querySelectorAll(':scope > a[data-v2-nav-id]').forEach(node => { if (!itemIds.has(node.dataset.v2NavId)) node.remove(); });
          items.forEach(item => { let node = nav.querySelector(`:scope > a[data-v2-nav-id="${item.id}"]`); if (!node) { node = document.createElement('a'); node.dataset.v2NavId = item.id; node.className = item.className || ''; nav.append(node); } node.textContent = item.label; node.setAttribute('href', item.href || '#'); nav.append(node); });
        }
        const header = root.querySelector('.top');
        if (header && doc.header?.design) {
          const design = doc.header.design;
          if (design.height != null) header.style.minHeight = `${Number(design.height) || 0}px`;
          if (design.background != null) header.style.background = String(design.background);
          if (design.color != null) header.style.color = String(design.color);
        }
        const theme = doc.site?.design;
        if (theme?.colors) Object.entries(theme.colors).forEach(([name, value]) => root.style.setProperty(`--v2-${name}`, String(value)));
        return root;
      },
      mount(root, store) {
        const update = state => this.render(state.document, root);
        update(store.get());
        return store.subscribe(update);
      },
      bindSelection(root, store) {
        if (!root || !store) throw new TypeError('Selection benötigt Ziel-Element und Store');
        const update = state => root.querySelectorAll('[data-v2-id]').forEach(node => { node.style.outline = state.mode === 'edit' && state.selection?.elementId === node.dataset.v2Id ? '2px solid #1683ff' : ''; node.style.outlineOffset = '2px'; });
        const unsubscribe = store.subscribe(update);
        const handler = event => { const node = event.target.closest?.('[data-v2-id]'); if (node && store.get().mode === 'edit') { event.preventDefault(); store.setSelection({ elementId: node.dataset.v2Id }); } };
        root.addEventListener('click', handler, true);
        update(store.get());
        return () => { unsubscribe(); root.removeEventListener('click', handler, true); root.querySelectorAll('[data-v2-id]').forEach(node => { node.style.outline = ''; node.style.outlineOffset = ''; }); };
      },
      bindGestures(root, store, actions, { holdMs = 350, moveThreshold = 8, snap = 8, trashSelector = '#kpDragTrash' } = {}) {
        if (!root || !store || !actions) throw new TypeError('Gestures benötigen Ziel-Element, Store und Actions');
        const active = new Map();
        let gesture = null;
        const position = points => { const [a, b] = points; return { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI }; };
        const trash = () => {
          let node = root.querySelector?.(trashSelector);
          if (!node && root.body) { node = document.createElement('div'); node.id = trashSelector.replace(/^#/, '') || 'kpDragTrash'; node.innerHTML = '<span class="kp-trash-icon">🗑</span><strong>Hierher ziehen zum Löschen</strong>'; root.body.append(node); }
          return node;
        };
        const showTrash = visible => { const node = trash(); node?.classList.toggle('show', visible); if (!visible) node?.classList.remove('hot'); };
        const showUndo = label => {
          let node = root.querySelector?.('#kpUndoSnack');
          if (!node && root.body) { node = document.createElement('div'); node.id = 'kpUndoSnack'; root.body.append(node); }
          if (!node) return;
          node.innerHTML = `<span>${label}</span><button type="button">RÜCKGÄNGIG</button>`;
          node.classList.add('show');
          node.querySelector('button').onclick = () => { store.undo(); node.classList.remove('show'); };
          setTimeout(() => node.classList.remove('show'), 5000);
        };
        const onDown = event => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          const node = event.target.closest?.('[data-v2-id]');
          if (!node || store.get().mode !== 'edit') return;
          event.stopImmediatePropagation();
          const found = (() => { for (const page of store.get().document.pages) for (const section of page.sections) { const element = section.elements.find(item => item.id === node.dataset.v2Id); if (element) return element; } return null; })();
          const point = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, originX: found?.transform?.x || 0, originY: found?.transform?.y || 0, node, dragging: false };
          point.timer = setTimeout(() => { point.dragging = true; store.setSelection({ elementId: node.dataset.v2Id }); try { node.setPointerCapture?.(event.pointerId); } catch (_) { /* synthetic pointers may not be capturable */ } }, holdMs);
          active.set(event.pointerId, point);
          const shared = [...active.entries()].filter(([, item]) => item.node === node);
          if (shared.length === 2) {
            shared.forEach(([, item]) => clearTimeout(item.timer));
            const start = position(shared.map(([, item]) => item));
            gesture = { ids: shared.map(([pointerId]) => pointerId), node, elementId: node.dataset.v2Id, start, scale: found?.transform?.scale || 1, rotation: found?.transform?.rotation || 0 };
            store.setSelection({ elementId: node.dataset.v2Id });
          }
        };
        const onMove = event => {
          const point = active.get(event.pointerId); if (!point) return;
          event.stopImmediatePropagation();
          if (gesture?.ids.includes(event.pointerId)) {
            point.x = event.clientX; point.y = event.clientY;
            const points = gesture.ids.map(pointerId => active.get(pointerId)).filter(Boolean);
            if (points.length === 2) { const current = position(points); const scale = Math.max(.1, Math.min(10, gesture.scale * current.distance / gesture.start.distance)); const rotation = gesture.rotation + current.angle - gesture.start.angle; gesture.node.style.transform = `scale(${scale}) rotate(${rotation}deg)`; event.preventDefault(); }
            return;
          }
          const dx = event.clientX - point.x, dy = event.clientY - point.y;
          if (!point.dragging && Math.hypot(dx, dy) > moveThreshold) { clearTimeout(point.timer); active.delete(event.pointerId); return; }
          if (point.dragging) { event.preventDefault(); point.x = event.clientX; point.y = event.clientY; showTrash(true); document.body.classList.add('kp-image-drag-active'); point.node.style.transform = `translate(${point.originX + event.clientX - point.startX}px, ${point.originY + event.clientY - point.startY}px)`; const bounds = trash()?.getBoundingClientRect?.(); trash()?.classList.toggle('hot', Boolean(bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom)); }
        };
        const onUp = event => {
          const point = active.get(event.pointerId); if (!point) return; clearTimeout(point.timer);
          event.stopImmediatePropagation();
          if (gesture?.ids.includes(event.pointerId)) {
            const points = gesture.ids.map(pointerId => active.get(pointerId)).filter(Boolean), current = points.length === 2 ? position(points) : gesture.start;
            const scale = Math.max(.1, Math.min(10, gesture.scale * current.distance / gesture.start.distance)), rotation = gesture.rotation + current.angle - gesture.start.angle;
            gesture.node.style.transform = '';
            actions.executeBatch('Element skalieren und drehen', [{ name: 'resizeElement', payload: [gesture.elementId, scale] }, { name: 'rotateElement', payload: [gesture.elementId, rotation] }]);
            gesture.ids.forEach(pointerId => active.delete(pointerId)); gesture = null; return;
          }
          if (point.dragging) {
            const trash = root.querySelector?.(trashSelector), bounds = trash?.getBoundingClientRect?.();
            const inTrash = bounds && bounds.width > 0 && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
            point.node.style.transform = '';
            showTrash(false); document.body.classList.remove('kp-image-drag-active');
            if (inTrash) { const label = point.node.tagName === 'IMG' ? 'Bild gelöscht' : 'Element gelöscht'; actions.deleteElement(point.node.dataset.v2Id); showUndo(label); }
            else {
              const x = point.originX + point.x - point.startX, y = point.originY + point.y - point.startY;
              actions.moveElement(point.node.dataset.v2Id, snap > 0 ? Math.round(x / snap) * snap : x, snap > 0 ? Math.round(y / snap) * snap : y);
            }
          }
          active.delete(event.pointerId);
        };
        root.addEventListener('pointerdown', onDown, true); root.addEventListener('pointermove', onMove, { passive: false, capture: true }); root.addEventListener('pointerup', onUp, true); root.addEventListener('pointercancel', onUp, true);
        return () => { active.forEach(point => clearTimeout(point.timer)); active.clear(); gesture = null; showTrash(false); root.removeEventListener('pointerdown', onDown, true); root.removeEventListener('pointermove', onMove, true); root.removeEventListener('pointerup', onUp, true); root.removeEventListener('pointercancel', onUp, true); };
      }
    };
  }

  function createContextProvider(store) {
    return { snapshot: () => { const state = store.get(); return { document: clone(state.document), selection: state.selection, mode: state.mode, viewport: state.viewport }; } };
  }

  function createDiagnostics(store) {
    return { snapshot: () => ({ ...createContextProvider(store).snapshot(), history: store.history() }) };
  }

  function createAIAdapter(store) {
    return {
      plan: async () => { throw new Error('Kein KI-Provider verbunden'); },
      validatePlan: plan => Boolean(plan && Array.isArray(plan.actions) && plan.actions.every(item => item && typeof item.name === 'string')),
      applyPlan: plan => { if (!plan || !Array.isArray(plan.actions)) throw new TypeError('Ungültiger Action-Plan'); return plan.actions.map(item => store.get() && actions.apply(item.name, item.payload)); }
    };
  }

  const documentModel = importDocument();
  const store = createStore(documentModel);
  const actions = createActions(store);
  const persistence = createPersistence(store);
  const renderer = createRenderer();
  const context = createContextProvider(store);
  const diagnostics = createDiagnostics(store);
  const ai = createAIAdapter(store);
  const refreshFromDOM = root => { if (store.get().dirty || store.get().mode === 'edit') return false; store.replaceDocument(importDocument(root || document), { dirty: false, persistence: store.get().persistence }); return true; };
  const runtime = {
    unmountRenderer: renderer.mount(document.documentElement, store),
    unbindSelection: renderer.bindSelection(document, store),
    unbindGestures: renderer.bindGestures(document, store, actions)
  };
  document.getElementById('edit')?.addEventListener('click', () => store.setMode('edit'));
  document.getElementById('close')?.addEventListener('click', () => { store.setSelection(null); store.setMode('view'); });
  window.addEventListener('load', () => setTimeout(() => refreshFromDOM(document), 300), { once: true });
  window.KPEditorV2 = Object.freeze({ SCHEMA_VERSION, importDocument, normalize, migrate, refreshFromDOM, store, actions, persistence, renderer, context, diagnostics, ai, runtime });
  if (!document.querySelector('script[data-kp-v2-ai]')) {
    const script = document.createElement('script');
    script.src = 'editor-v2-ai.js?v=20260912-1';
    script.dataset.kpV2Ai = '1';
    document.head.append(script);
  }
})();
