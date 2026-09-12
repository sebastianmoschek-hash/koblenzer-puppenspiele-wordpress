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
    return { id: elementId, type, order: index, content: type === 'image' ? { src: node.getAttribute('src') || '', alt: node.getAttribute('alt') || '' } : { text: node.textContent?.trim() || '' }, styles: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, source: { tag, className: node.className || '' } };
  }

  function importDocument(root = document) {
    const main = root.querySelector?.('main');
    const sections = [...(main?.querySelectorAll(':scope > section') || [])];
    return {
      schemaVersion: SCHEMA_VERSION,
      site: { id: 'koblenzer-puppenspiele', title: root.title || '', design: { preset: 'original' } },
      navigation: { items: [...(root.querySelectorAll('#nav > a') || [])].map((a, order) => ({ id: id('nav'), label: a.textContent?.trim() || '', href: a.getAttribute('href') || '', order })) },
      header: { id: 'header', elements: [...(root.querySelectorAll('.top > .brand,.top > nav,#menu') || [])].map(elementFromDOM) },
      pages: [{ id: 'home', path: '/', sections: sections.map((section, order) => ({ id: section.id || id('section'), order, design: { className: section.className || '' }, elements: [...section.querySelectorAll('h1,h2,h3,p,a,img,button')].map(elementFromDOM) })) }],
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

  function createStore(initial) {
    let state = { document: normalize(initial), selection: null, mode: 'view', viewport: 'desktop', dirty: false, persistence: 'idle' };
    const listeners = new Set();
    const history = [], future = [];
    const emit = () => listeners.forEach(listener => listener(state));
    const snapshot = () => clone(state);
    const set = next => { state = next; emit(); return state; };
    const transact = (label, mutator) => {
      const before = snapshot();
      const draft = snapshot();
      const result = mutator(draft);
      if (JSON.stringify(before) === JSON.stringify(draft)) return result;
      history.push({ label, before, after: draft, at: Date.now() });
      if (history.length > 100) history.shift();
      future.length = 0;
      draft.dirty = true;
      set(draft);
      return result;
    };
    return {
      get: () => state,
      snapshot,
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      setMode: mode => set({ ...state, mode }),
      setSelection: selection => set({ ...state, selection }),
      transact,
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
    return {
      selectElement: elementId => store.setSelection(elementId ? { elementId } : null),
      setText: (elementId, text) => store.transact('Text ändern', doc => { const found = find(doc.document, elementId); if (found && ['text', 'heading', 'button'].includes(found.element.type)) found.element.content.text = String(text); }),
      moveElement: (elementId, x, y) => store.transact('Element verschieben', doc => { const found = find(doc.document, elementId); if (found) { found.element.transform.x = Number(x) || 0; found.element.transform.y = Number(y) || 0; } }),
      resizeElement: (elementId, scale) => store.transact('Element skalieren', doc => { const found = find(doc.document, elementId); if (found) found.element.transform.scale = Math.max(.1, Math.min(10, Number(scale) || 1)); }),
      rotateElement: (elementId, rotation) => store.transact('Element drehen', doc => { const found = find(doc.document, elementId); if (found) found.element.transform.rotation = Number(rotation) || 0; }),
      deleteElement: elementId => store.transact('Element löschen', doc => { for (const page of doc.pages) for (const section of page.sections) section.elements = section.elements.filter(item => item.id !== elementId); }),
      apply: (name, payload) => { const action = actions[name]; if (typeof action !== 'function') throw new Error(`Unbekannte V2-Action: ${name}`); return action(...(Array.isArray(payload) ? payload : [payload])); }
    };
  }

  function createPersistence(store, key = 'kp-editor-v2-document') {
    return {
      save: () => { const value = store.get().document; localStorage.setItem(key, JSON.stringify(value)); return value; },
      load: () => { const raw = localStorage.getItem(key); return raw ? normalize(JSON.parse(raw)) : null; },
      clear: () => localStorage.removeItem(key)
    };
  }

  function createRenderer() {
    return {
      render(doc, root) {
        if (!root || !doc) throw new TypeError('Renderer benötigt Dokument und Ziel-Element');
        root.dataset.v2Schema = String(doc.schemaVersion || SCHEMA_VERSION);
        root.dataset.v2Rendered = 'true';
        return root;
      },
      bindSelection(root, store) {
        if (!root || !store) throw new TypeError('Selection benötigt Ziel-Element und Store');
        const nodes = [...root.querySelectorAll('[data-v2-id]')];
        const update = state => nodes.forEach(node => { node.style.outline = state.mode === 'edit' && state.selection?.elementId === node.dataset.v2Id ? '2px solid #1683ff' : ''; node.style.outlineOffset = '2px'; });
        const unsubscribe = store.subscribe(update);
        const handlers = nodes.map(node => { const handler = event => { if (store.get().mode === 'edit') { event.preventDefault(); event.stopPropagation(); store.setSelection({ elementId: node.dataset.v2Id }); } }; node.addEventListener('click', handler); return [node, handler]; });
        update(store.get());
        return () => { unsubscribe(); handlers.forEach(([node, handler]) => node.removeEventListener('click', handler)); nodes.forEach(node => { node.style.outline = ''; node.style.outlineOffset = ''; }); };
      },
      bindGestures(root, store, actions, { holdMs = 350, moveThreshold = 8 } = {}) {
        if (!root || !store || !actions) throw new TypeError('Gestures benötigen Ziel-Element, Store und Actions');
        const active = new Map();
        const onDown = event => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          const node = event.target.closest?.('[data-v2-id]');
          if (!node || store.get().mode !== 'edit') return;
          const point = { x: event.clientX, y: event.clientY, node, dragging: false };
          point.timer = setTimeout(() => { point.dragging = true; store.setSelection({ elementId: node.dataset.v2Id }); try { node.setPointerCapture?.(event.pointerId); } catch (_) { /* synthetic pointers may not be capturable */ } }, holdMs);
          active.set(event.pointerId, point);
        };
        const onMove = event => {
          const point = active.get(event.pointerId); if (!point) return;
          const dx = event.clientX - point.x, dy = event.clientY - point.y;
          if (!point.dragging && Math.hypot(dx, dy) > moveThreshold) { clearTimeout(point.timer); active.delete(event.pointerId); return; }
          if (point.dragging) { event.preventDefault(); actions.moveElement(point.node.dataset.v2Id, dx, dy); point.x = event.clientX; point.y = event.clientY; }
        };
        const onUp = event => { const point = active.get(event.pointerId); if (!point) return; clearTimeout(point.timer); active.delete(event.pointerId); };
        root.addEventListener('pointerdown', onDown); root.addEventListener('pointermove', onMove, { passive: false }); root.addEventListener('pointerup', onUp); root.addEventListener('pointercancel', onUp);
        return () => { active.forEach(point => clearTimeout(point.timer)); active.clear(); root.removeEventListener('pointerdown', onDown); root.removeEventListener('pointermove', onMove); root.removeEventListener('pointerup', onUp); root.removeEventListener('pointercancel', onUp); };
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
  window.KPEditorV2 = Object.freeze({ SCHEMA_VERSION, importDocument, normalize, store, actions, persistence, renderer, context, diagnostics, ai });
})();
