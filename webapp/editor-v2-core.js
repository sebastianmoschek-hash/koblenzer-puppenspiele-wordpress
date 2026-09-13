/* Editor V2 foundation: document model, store, actions, history and persistence. */
(() => {
  'use strict';
  if (window.KPEditorV2) return;

  const SCHEMA_VERSION = 3;
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = prefix => `${prefix}-${(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9-]/gi, '')}`;
  const slugify = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'seite';
  const pageHref = pageId => pageId === 'home' ? '#home' : `#page/${encodeURIComponent(pageId)}`;

  function resolveNavigationTarget(doc, item) {
    const explicit = item?.target;
    if (explicit?.type === 'page' && explicit.pageId) return { type: 'page', pageId: String(explicit.pageId), exists: doc.pages.some(page => page.id === explicit.pageId) };
    if (explicit?.type === 'section' && explicit.sectionId) {
      const page = doc.pages.find(entry => entry.id === explicit.pageId) || doc.pages.find(entry => entry.sections.some(section => section.id === explicit.sectionId));
      return { type: 'section', pageId: page?.id || String(explicit.pageId || ''), sectionId: String(explicit.sectionId), exists: Boolean(page?.sections.some(section => section.id === explicit.sectionId)) };
    }
    const href = String(item?.href || '');
    if (href.startsWith('#page/')) {
      let pageId = href.slice(6);
      try { pageId = decodeURIComponent(pageId); } catch (_) { /* malformed hashes remain free links */ }
      return { type: 'page', pageId, exists: doc.pages.some(page => page.id === pageId) };
    }
    if (href.startsWith('#') && href.length > 1) {
      let targetId = href.slice(1);
      try { targetId = decodeURIComponent(targetId); } catch (_) { /* malformed hashes remain free links */ }
      const page = doc.pages.find(entry => entry.id === targetId);
      if (page) return { type: 'page', pageId: page.id, exists: true };
      const sectionPage = doc.pages.find(entry => entry.sections.some(section => section.id === targetId));
      if (sectionPage) return { type: 'section', pageId: sectionPage.id, sectionId: targetId, exists: true };
    }
    const page = doc.pages.find(entry => entry.path && entry.path === href);
    if (page) return { type: 'page', pageId: page.id, exists: true };
    return { type: 'url', href, exists: Boolean(href) };
  }

  function elementFromDOM(node, index = 0, scope = 'document') {
    const tag = node.tagName?.toLowerCase() || 'div';
    const type = tag === 'img' ? 'image' : tag === 'a' ? 'button' : /^h[1-6]$/.test(tag) ? 'heading' : 'text';
    const stableId = `${scope}-el-${index}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const elementId = node.dataset?.v2Id || stableId;
    if (node.dataset) node.dataset.v2Id = elementId;
    return { id: elementId, type, order: index, content: type === 'image' ? { src: node.getAttribute('src') || '', alt: node.getAttribute('alt') || '' } : type === 'button' ? { text: node.textContent?.trim() || '', href: node.getAttribute('href') || '#' } : { text: node.textContent?.trim() || '' }, styles: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, source: { tag, className: node.className || '' } };
  }

  function importDocument(root = document) {
    const main = root.querySelector?.('main');
    const sections = [...(main?.querySelectorAll(':scope > section') || [])];
    return {
      schemaVersion: SCHEMA_VERSION,
      site: { id: 'koblenzer-puppenspiele', title: root.title || '', design: { preset: 'original' } },
      navigation: { items: [...(root.querySelectorAll('#nav a[href]') || [])].map((a, order) => { const itemId = a.dataset.v2NavId || `nav-${order}`; a.dataset.v2NavId = itemId; return { id: itemId, label: a.textContent?.trim() || '', href: a.getAttribute('href') || '', order, className: a.className || '' }; }) },
      header: { id: 'header', elements: [...(root.querySelectorAll('.top > .brand,#menu') || [])].map((node, index) => elementFromDOM(node, index, 'header')) },
      pages: [{ id: 'home', title: 'Startseite', path: '/', order: 0, metadata: { title: 'Startseite', slug: 'startseite' }, sections: sections.map((section, order) => { const sectionId = section.dataset.v2SectionId || section.id || `section-${order}`; section.dataset.v2SectionId = sectionId; section.dataset.v2PageId = 'home'; return { id: sectionId, order, design: { className: section.className || '' }, elements: [...section.querySelectorAll('h1,h2,h3,p,a,img,button')].map((node, index) => elementFromDOM(node, index, sectionId)) }; }) }],
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
    out.pages.forEach((page, pageOrder) => {
      page.id = String(page.id || `page-${pageOrder}`);
      page.title = String(page.title || page.metadata?.title || (page.id === 'home' ? 'Startseite' : `Seite ${pageOrder + 1}`));
      page.path = String(page.path || (page.id === 'home' ? '/' : `/${slugify(page.title)}`));
      page.order = Number.isFinite(Number(page.order)) ? Number(page.order) : pageOrder;
      page.metadata = { ...(page.metadata || {}), title: String(page.metadata?.title || page.title), slug: String(page.metadata?.slug || slugify(page.path === '/' ? page.title : page.path)) };
      page.sections = Array.isArray(page.sections) ? page.sections : [];
      page.sections.forEach((section, sectionOrder) => {
        section.order = Number.isFinite(Number(section.order)) ? Number(section.order) : sectionOrder;
        section.elements = Array.isArray(section.elements) ? section.elements : [];
      });
    });
    out.navigation.items.forEach((item, order) => {
      item.order = Number.isFinite(Number(item.order)) ? Number(item.order) : order;
      const target = resolveNavigationTarget(out, item);
      if (target.type === 'page') { item.target = { type: 'page', pageId: target.pageId }; item.href ||= pageHref(target.pageId); }
      else if (target.type === 'section') { item.target = { type: 'section', pageId: target.pageId, sectionId: target.sectionId }; item.href ||= `#${target.sectionId}`; }
      else if (item.target) delete item.target;
    });
    return out;
  }

  function migrate(doc) {
    const source = clone(doc || {});
    const version = Number(source.schemaVersion) || 0;
    if (version > SCHEMA_VERSION) throw new Error(`Dokumentschema ${version} wird noch nicht unterstützt`);
    if (version < SCHEMA_VERSION) { source.schemaVersion = SCHEMA_VERSION; source.meta = { ...(source.meta || {}), migratedFrom: version, migratedAt: new Date().toISOString() }; }
    return normalize(source);
  }

  function mergeDocuments(baseDocument, savedDocument) {
    const base = normalize(baseDocument), saved = migrate(savedDocument);
    base.site = clone(saved.site || base.site); base.navigation = clone(saved.navigation || base.navigation); base.header = { ...base.header, ...clone(saved.header || {}), elements: base.header?.elements || [] };
    const basePages = new Map(base.pages.map(page => [page.id, page]));
    base.pages = (saved.pages.length ? saved.pages : base.pages).map(savedPage => {
      const basePage = basePages.get(savedPage.id);
      if (!basePage) return clone(savedPage);
      const baseSections = new Map(basePage.sections.map(section => [section.id, section]));
      return { ...basePage, ...clone(savedPage), sections: savedPage.sections.map(savedSection => {
        const baseSection = baseSections.get(savedSection.id);
        if (!baseSection) return clone(savedSection);
        const baseElements = new Map(baseSection.elements.map(element => [element.id, element]));
        return { ...baseSection, ...clone(savedSection), elements: savedSection.elements.map(savedElement => ({ ...(baseElements.get(savedElement.id) || {}), ...clone(savedElement) })) };
      }) };
    });
    return normalize(base);
  }

  function createStore(initial) {
    const initialDocument = normalize(initial);
    let state = { document: initialDocument, selection: null, activePageId: initialDocument.pages.find(page => page.id === 'home')?.id || initialDocument.pages[0]?.id || null, activeSectionId: null, mode: 'view', viewport: 'desktop', breakpoint: 'desktop', gesture: { type: 'idle' }, dirty: false, persistence: 'idle', preview: null, aiContext: null, diagnosticsContext: null };
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
      setActivePage: pageId => { const page = state.document.pages.find(item => item.id === pageId); if (!page || page.id === state.activePageId) return Boolean(page); set({ ...state, activePageId: page.id, activeSectionId: null, selection: null }); return true; },
      replaceDocument: (document, options = {}) => {
        const nextDocument = normalize(document);
        const requestedPageId = options.activePageId || state.activePageId;
        const activePageId = nextDocument.pages.some(page => page.id === requestedPageId) ? requestedPageId : nextDocument.pages[0]?.id || null;
        return set({ ...state, document: nextDocument, activePageId, activeSectionId: null, selection: options.preserveSelection ? state.selection : null, dirty: Boolean(options.dirty), persistence: options.persistence || state.persistence });
      },
      markPersisted: persistence => set({ ...state, dirty: false, persistence: persistence || 'saved' }),
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
    const ordered = items => items.forEach((item, order) => { item.order = order; });
    const navigationTarget = (document, item) => resolveNavigationTarget(document, item);
    const uniquePageId = (document, preferred) => {
      const base = slugify(preferred || 'seite');
      let candidate = base, suffix = 2;
      while (document.pages.some(page => page.id === candidate)) candidate = `${base}-${suffix++}`;
      return candidate;
    };
    const uniquePagePath = (document, preferred, exceptId = '') => {
      const requested = String(preferred || '').trim();
      const stem = requested === '/' ? '/' : `/${slugify(requested)}`;
      if (stem === '/' && !document.pages.some(page => page.id !== exceptId && page.path === '/')) return stem;
      const base = stem === '/' ? '/seite' : stem;
      let candidate = base, suffix = 2;
      while (document.pages.some(page => page.id !== exceptId && page.path === candidate)) candidate = `${base}-${suffix++}`;
      return candidate;
    };
    const appendNavigation = (state, label, target = null, href = '#') => {
      const item = { id: id('nav'), label: String(label || 'Menüpunkt'), href: String(href || '#'), order: state.document.navigation.items.length };
      if (target?.type === 'page') { item.target = { type: 'page', pageId: target.pageId }; item.href = pageHref(target.pageId); }
      if (target?.type === 'section') { item.target = { type: 'section', pageId: target.pageId, sectionId: target.sectionId }; item.href = `#${target.sectionId}`; }
      state.document.navigation.items.push(item);
      return item;
    };
    const appendPage = (state, pageInput = {}, createNavigation = false) => {
      const input = typeof pageInput === 'string' ? { title: pageInput } : clone(pageInput || {});
      const title = String(input.title || input.metadata?.title || 'Neue Seite').trim().slice(0, 120) || 'Neue Seite';
      const pageId = uniquePageId(state.document, input.id || title);
      const path = uniquePagePath(state.document, input.path || title);
      const page = {
        ...input,
        id: pageId,
        title,
        path,
        order: state.document.pages.length,
        metadata: { ...(input.metadata || {}), title, slug: slugify(path), createdAt: input.metadata?.createdAt || new Date().toISOString() },
        sections: Array.isArray(input.sections) ? input.sections : []
      };
      state.document.pages.push(page);
      state.activePageId = page.id;
      state.activeSectionId = null;
      state.selection = null;
      const navigationItem = createNavigation ? appendNavigation(state, title, { type: 'page', pageId: page.id }) : null;
      return { pageId: page.id, navigationItemId: navigationItem?.id || null };
    };
    const targetMatchesPage = (document, item, pageId) => {
      const target = navigationTarget(document, item);
      if (target.type === 'page') return target.pageId === pageId;
      return target.type === 'section' && target.pageId === pageId;
    };
    const removePage = (state, pageId, deleteNavigation) => {
      const index = state.document.pages.findIndex(page => page.id === pageId);
      if (index < 0 || state.document.pages.length <= 1) return false;
      const linked = state.document.navigation.items.filter(item => targetMatchesPage(state.document, item, pageId));
      if (deleteNavigation) state.document.navigation.items = state.document.navigation.items.filter(item => !linked.includes(item));
      else linked.forEach(item => { delete item.target; item.href = '#'; });
      state.document.pages.splice(index, 1);
      ordered(state.document.pages);
      ordered(state.document.navigation.items);
      if (state.activePageId === pageId || !state.document.pages.some(page => page.id === state.activePageId)) state.activePageId = state.document.pages[Math.min(index, state.document.pages.length - 1)]?.id || null;
      state.activeSectionId = null;
      state.selection = null;
      return true;
    };
    const regeneratePageIds = page => {
      const sectionIds = new Map();
      page.sections.forEach(section => { const previous = section.id; section.id = id('section'); sectionIds.set(previous, section.id); section.elements.forEach(element => { element.id = id('el'); }); });
      page.sections.forEach(section => section.elements.forEach(element => {
        if (element.type !== 'button') return;
        const targetId = String(element.content?.href || '').replace(/^#/, '');
        if (sectionIds.has(targetId)) element.content.href = `#${sectionIds.get(targetId)}`;
      }));
      return page;
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
      openPage: pageId => store.setActivePage(pageId),
      createPage: (page = {}, createNavigation = false) => store.transact(createNavigation ? 'Seite und Menüpunkt hinzufügen' : 'Seite hinzufügen', state => appendPage(state, page, createNavigation)),
      createPageWithNavigation: (title = 'Neue Seite', page = {}) => store.transact('Seite und Menüpunkt hinzufügen', state => appendPage(state, { ...clone(page || {}), title }, true)),
      renamePage: (pageId, title, syncNavigation = true) => store.transact('Seite umbenennen', state => {
        const page = state.document.pages.find(item => item.id === pageId);
        const nextTitle = String(title || '').trim().slice(0, 120);
        if (!page || !nextTitle) return false;
        page.title = nextTitle;
        page.metadata = { ...(page.metadata || {}), title: nextTitle };
        if (syncNavigation) state.document.navigation.items.forEach(item => { const target = navigationTarget(state.document, item); if (target.type === 'page' && target.pageId === pageId) item.label = nextTitle; });
        return true;
      }),
      setPageMetadata: (pageId, metadata = {}) => store.transact('Seiteneinstellungen ändern', state => {
        const page = state.document.pages.find(item => item.id === pageId);
        if (!page) return false;
        const changes = clone(metadata || {});
        if (changes.title != null) { const title = String(changes.title).trim().slice(0, 120); if (title) { page.title = title; changes.title = title; } else delete changes.title; }
        if (changes.path != null) { page.path = uniquePagePath(state.document, changes.path, pageId); delete changes.path; }
        page.metadata = { ...(page.metadata || {}), ...changes, title: page.title, slug: slugify(page.path) };
        return true;
      }),
      movePage: (pageId, direction) => store.transact('Seite verschieben', state => { const pages = state.document.pages, index = pages.findIndex(page => page.id === pageId), target = Math.max(0, Math.min(pages.length - 1, index + Number(direction))); if (index < 0 || target === index) return false; pages.splice(target, 0, pages.splice(index, 1)[0]); ordered(pages); return true; }),
      reorderPage: (pageId, targetIndex) => store.transact('Seite sortieren', state => { const pages = state.document.pages, index = pages.findIndex(page => page.id === pageId), target = Math.max(0, Math.min(pages.length - 1, Number(targetIndex) || 0)); if (index < 0 || target === index) return false; pages.splice(target, 0, pages.splice(index, 1)[0]); ordered(pages); return true; }),
      duplicatePage: (pageId, createNavigation = false) => store.transact(createNavigation ? 'Seite mit Menüpunkt duplizieren' : 'Seite duplizieren', state => {
        const source = state.document.pages.find(page => page.id === pageId);
        if (!source) return false;
        const copy = regeneratePageIds(clone(source));
        copy.title = `${source.title || 'Seite'} Kopie`;
        copy.path = `/${slugify(copy.title)}`;
        copy.metadata = { ...(copy.metadata || {}), title: copy.title, duplicatedFrom: source.id, createdAt: new Date().toISOString() };
        delete copy.id;
        return appendPage(state, copy, createNavigation);
      }),
      deletePage: (pageId, deleteNavigation = true) => store.transact(deleteNavigation ? 'Seite und Menüeinträge löschen' : 'Seite löschen', state => removePage(state, pageId, deleteNavigation)),
      createSection: (pageId = null, section = {}) => store.transact('Abschnitt hinzufügen', state => { const page = state.document.pages.find(item => item.id === (pageId || state.activePageId)) || state.document.pages[0]; if (page) { const created = { id: id('section'), order: page.sections.length, design: {}, elements: [], ...clone(section) }; page.sections.push(created); return created.id; } return null; }),
      duplicateSection: sectionId => store.transact('Abschnitt duplizieren', state => { for (const page of state.document.pages) { const source = page.sections.find(section => section.id === sectionId); if (source) { const copy = clone(source); copy.id = id('section'); copy.order = page.sections.length; copy.elements.forEach(element => { element.id = id('el'); }); page.sections.push(copy); return; } } }),
      deleteSection: sectionId => store.transact('Abschnitt löschen', state => { for (const page of state.document.pages) page.sections = page.sections.filter(section => section.id !== sectionId); state.document.navigation.items.forEach(item => { const target = navigationTarget(state.document, item); if (target.type === 'section' && target.sectionId === sectionId) { delete item.target; item.href = '#'; } }); if (state.selection?.sectionId === sectionId) state.selection = null; }),
      moveSection: (sectionId, direction) => store.transact('Abschnitt verschieben', state => { for (const page of state.document.pages) { const index = page.sections.findIndex(section => section.id === sectionId); if (index < 0) continue; const target = Math.max(0, Math.min(page.sections.length - 1, index + Number(direction))); if (target === index) return; page.sections.splice(target, 0, page.sections.splice(index, 1)[0]); page.sections.forEach((section, order) => { section.order = order; }); return; } }),
      setSectionDesign: (sectionId, design = {}) => store.transact('Abschnitt gestalten', state => { for (const page of state.document.pages) { const section = page.sections.find(item => item.id === sectionId); if (section) section.design = { ...section.design, ...clone(design) }; } }),
      moveLayer: (elementId, direction) => store.transact('Ebene ändern', state => { const found = find(state.document, elementId); if (!found) return; const elements = found.section.elements; const index = elements.findIndex(item => item.id === elementId); const target = direction === 'front' ? elements.length - 1 : direction === 'back' ? 0 : Math.max(0, Math.min(elements.length - 1, index + (direction === 'forward' ? 1 : -1))); elements.splice(target, 0, elements.splice(index, 1)[0]); elements.forEach((element, order) => { element.order = order; }); }),
      setHeaderDesign: design => store.transact('Header gestalten', state => { state.document.header.design = { ...(state.document.header.design || {}), ...clone(design || {}) }; }),
      renameNavigationItem: (itemId, label) => store.transact('Menüpunkt umbenennen', state => { const item = state.document.navigation.items.find(entry => entry.id === itemId); if (item) item.label = String(label); }),
      updateNavigationItem: (itemId, changes = {}) => store.transact('Menüpunkt bearbeiten', state => { const item = state.document.navigation.items.find(entry => entry.id === itemId); if (item) { if (changes.label != null) item.label = String(changes.label); if (changes.href != null) { item.href = String(changes.href); delete item.target; const target = navigationTarget(state.document, item); if (target.type === 'page') item.target = { type: 'page', pageId: target.pageId }; else if (target.type === 'section') item.target = { type: 'section', pageId: target.pageId, sectionId: target.sectionId }; } } }),
      createNavigationItem: (label, href = '#', target = null) => store.transact('Menüpunkt hinzufügen', state => appendNavigation(state, label, target, href)),
      linkNavigationToPage: (itemId, pageId) => store.transact('Menüpunkt mit Seite verbinden', state => { const item = state.document.navigation.items.find(entry => entry.id === itemId), page = state.document.pages.find(entry => entry.id === pageId); if (!item || !page) return false; item.target = { type: 'page', pageId: page.id }; item.href = pageHref(page.id); return true; }),
      linkNavigationToSection: (itemId, pageId, sectionId) => store.transact('Menüpunkt mit Abschnitt verbinden', state => { const item = state.document.navigation.items.find(entry => entry.id === itemId), page = state.document.pages.find(entry => entry.id === pageId), section = page?.sections.find(entry => entry.id === sectionId); if (!item || !section) return false; item.target = { type: 'section', pageId: page.id, sectionId: section.id }; item.href = `#${section.id}`; return true; }),
      unlinkNavigationItem: (itemId, href = '#') => store.transact('Menüverknüpfung lösen', state => { const item = state.document.navigation.items.find(entry => entry.id === itemId); if (!item) return false; delete item.target; item.href = String(href || '#'); return true; }),
      createNavigationSection: (label = 'Neuer Abschnitt', pageId = null) => store.transact('Menüpunkt und Abschnitt hinzufügen', state => { const page = state.document.pages.find(item => item.id === (pageId || state.activePageId)) || state.document.pages[0]; if (!page) return; const sectionId = id('section'); page.sections.push({ id: sectionId, order: page.sections.length, design: { className: 'dark editable', type: 'content', layout: 'normal' }, elements: [{ id: id('el'), type: 'heading', order: 0, content: { text: String(label) }, styles: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, source: { tag: 'h2', className: '' } }] }); const item = appendNavigation(state, label, { type: 'section', pageId: page.id, sectionId }); return { sectionId, itemId: item.id }; }),
      createNavigationPage: (label = 'Neue Seite') => store.transact('Menüpunkt und Seite hinzufügen', state => appendPage(state, { title: String(label) }, true)),
      deleteNavigationItem: itemId => store.transact('Menüpunkt löschen', state => { state.document.navigation.items = state.document.navigation.items.filter(item => item.id !== itemId); state.document.navigation.items.forEach((item, order) => { item.order = order; }); }),
      deleteNavigationTarget: (itemId, deleteTarget = false) => store.transact(deleteTarget ? 'Menüpunkt und Ziel löschen' : 'Menüpunkt löschen', state => {
        const item = state.document.navigation.items.find(entry => entry.id === itemId);
        if (!item) return false;
        const target = navigationTarget(state.document, item);
        state.document.navigation.items = state.document.navigation.items.filter(entry => entry.id !== itemId);
        if (deleteTarget && target.type === 'section' && target.sectionId) {
          const page = state.document.pages.find(entry => entry.id === target.pageId);
          if (page) page.sections = page.sections.filter(section => section.id !== target.sectionId);
          state.document.navigation.items = state.document.navigation.items.filter(entry => { const other = navigationTarget(state.document, entry); return other.type !== 'section' || other.sectionId !== target.sectionId; });
        } else if (deleteTarget && target.type === 'page' && target.pageId && state.document.pages.length > 1) removePage(state, target.pageId, true);
        ordered(state.document.navigation.items);
        return true;
      }),
      moveNavigationItem: (itemId, direction) => store.transact('Menüpunkt verschieben', state => { const items = state.document.navigation.items, index = items.findIndex(item => item.id === itemId), target = Math.max(0, Math.min(items.length - 1, index + Number(direction))); if (index < 0 || target === index) return; items.splice(target, 0, items.splice(index, 1)[0]); items.forEach((item, order) => { item.order = order; }); }),
      reorderNavigationItem: (itemId, targetIndex) => store.transact('Menüpunkt sortieren', state => { const items = state.document.navigation.items, index = items.findIndex(item => item.id === itemId), target = Math.max(0, Math.min(items.length - 1, Number(targetIndex) || 0)); if (index < 0 || target === index) return; items.splice(target, 0, items.splice(index, 1)[0]); items.forEach((item, order) => { item.order = order; }); }),
      applyTheme: theme => store.transact('Website-Design anwenden', state => { state.document.site.design = { ...state.document.site.design, ...clone(theme || {}) }; }),
      previewBatch: (label, commands = []) => {
        const temporaryStore = createStore(store.get().document), temporaryActions = createActions(temporaryStore);
        temporaryActions.executeBatch(label, commands);
        return store.preview(label, state => { state.document = clone(temporaryStore.get().document); });
      },
      executeBatch: (label, commands = []) => store.executeBatch(label, () => commands.map(command => api.apply(command.name, command.payload))),
      apply: (name, payload) => { const action = api[name]; if (typeof action !== 'function' || ['apply', 'executeBatch', 'previewBatch'].includes(name)) throw new Error(`Unbekannte V2-Action: ${name}`); return action(...(Array.isArray(payload) ? payload : [payload])); }
    };
    return api;
  }

  function createPersistence(store, key = 'kp-editor-v2-document') {
    const workspaceKey = `${key}-workspace`;
    const loadWorkspace = () => {
      try { const value = JSON.parse(localStorage.getItem(workspaceKey) || 'null'); return value && typeof value === 'object' ? value : null; }
      catch (_) { return null; }
    };
    return {
      save: () => { const state = store.get(), value = state.document; localStorage.setItem(key, JSON.stringify(value)); localStorage.setItem(workspaceKey, JSON.stringify({ activePageId: state.activePageId, savedAt: new Date().toISOString() })); store.markPersisted('saved'); return value; },
      load: () => { const raw = localStorage.getItem(key); return raw ? migrate(JSON.parse(raw)) : null; },
      loadWorkspace,
      restore: () => { const raw = localStorage.getItem(key); if (!raw) return false; const workspace = loadWorkspace(); store.replaceDocument(migrate(JSON.parse(raw)), { activePageId: workspace?.activePageId, dirty: false, persistence: 'loaded' }); return true; },
      clear: () => { localStorage.removeItem(key); localStorage.removeItem(workspaceKey); }
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
      render(doc, root, activePageId = null) {
        if (!root || !doc) throw new TypeError('Renderer benötigt Dokument und Ziel-Element');
        root.dataset.v2Schema = String(doc.schemaVersion || SCHEMA_VERSION);
        root.dataset.v2Rendered = 'true';
        const main = root.querySelector('main');
        const pages = [...doc.pages].sort((a, b) => (a.order || 0) - (b.order || 0));
        const activePage = pages.find(page => page.id === activePageId) || pages[0] || null;
        const sectionEntries = pages.flatMap(page => [...page.sections].sort((a, b) => (a.order || 0) - (b.order || 0)).map(section => ({ page, section })));
        const modelSections = sectionEntries.map(entry => entry.section);
        const sectionIds = new Set(modelSections.map(section => section.id));
        root.querySelectorAll('main > section[data-v2-section-id]').forEach(node => { if (!sectionIds.has(node.dataset.v2SectionId)) node.remove(); });
        sectionEntries.forEach(({ page, section }) => {
          let sectionNode = root.querySelector(`main > section[data-v2-section-id="${section.id}"]`);
          if (!sectionNode && main) { sectionNode = document.createElement('section'); sectionNode.dataset.v2SectionId = section.id; sectionNode.className = section.design?.className || 'editable'; sectionNode.innerHTML = '<div class="wrap"></div>'; main.append(sectionNode); }
          if (!sectionNode) return;
          sectionNode.dataset.v2PageId = page.id;
          sectionNode.hidden = page.id !== activePage?.id;
          if (section.design?.className != null) sectionNode.className = section.design.className;
          sectionNode.dataset.v2Type = section.design?.type || 'content';
          sectionNode.dataset.v2Layout = section.design?.layout || 'normal';
          for (const [property, value] of Object.entries(section.design || {})) {
            if (['className', 'preset', 'type', 'layout'].includes(property)) continue;
            const pixels = ['minHeight', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'].includes(property);
            if (value == null) sectionNode.style.removeProperty(property); else sectionNode.style[property] = typeof value === 'number' && pixels ? `${value}px` : String(value);
          }
          const host = sectionNode.querySelector('.wrap,.hero-copy') || sectionNode;
          if (host !== sectionNode) host.style.maxWidth = section.design?.layout === 'narrow' ? '760px' : section.design?.layout === 'wide' ? '1320px' : '';
          section.elements.sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(element => { if (!root.querySelector(`[data-v2-id="${element.id}"]`)) host.append(makeElement(element)); });
        });
        if (main) {
          main.dataset.v2ActivePageId = activePage?.id || '';
          main.setAttribute('aria-label', activePage?.metadata?.title || activePage?.title || 'Seite');
          sectionEntries.forEach(({ section }) => { const node = root.querySelector(`main > section[data-v2-section-id="${section.id}"]`); if (node) main.append(node); });
        }
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
          node.style.setProperty('--kp-v2-layer', String(Number(element.order) || 0));
          const transform = element.transform || {};
          const flipX = Number(transform.flipX) === -1 ? -1 : 1, flipY = Number(transform.flipY) === -1 ? -1 : 1;
          node.style.setProperty('transform', `translate(${Number(transform.x) || 0}px, ${Number(transform.y) || 0}px) scale(${(Number(transform.scale) || 1) * flipX}, ${(Number(transform.scale) || 1) * flipY}) rotate(${Number(transform.rotation) || 0}deg)`);
          if (element.type === 'image') {
            const adjustment = element.content.adjustments || {};
            const brightness = 100 + (Number(adjustment.brightness) || 0), contrast = 100 + (Number(adjustment.contrast) || 0), saturation = 100 + (Number(adjustment.saturation) || 0), blur = Math.max(0, Number(adjustment.blur) || 0), temperature = Number(adjustment.temperature) || 0, grayscale = Math.max(0, Number(adjustment.grayscale) || 0), sepia = Math.max(Number(adjustment.sepia) || 0, Math.max(0, temperature));
            node.style.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${sepia}%) hue-rotate(${temperature < 0 ? Math.round(temperature * .35) : 0}deg) blur(${blur}px) grayscale(${grayscale}%)`;
            if (adjustment.opacity != null) node.style.opacity = String(Math.max(0, Math.min(1, Number(adjustment.opacity))));
            const crop = adjustment.crop;
            if (crop) { const top = Math.max(0, Number(crop.y) || 0) * 100, left = Math.max(0, Number(crop.x) || 0) * 100, right = Math.max(0, 1 - (Number(crop.x) || 0) - (Number(crop.width) || 1)) * 100, bottom = Math.max(0, 1 - (Number(crop.y) || 0) - (Number(crop.height) || 1)) * 100; node.style.clipPath = `inset(${top}% ${right}% ${bottom}% ${left}%)`; } else node.style.removeProperty('clip-path');
          }
        });
        const nav = root.querySelector('#nav');
        if (nav) {
          const items = [...(doc.navigation?.items || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
          const itemIds = new Set(items.map(item => item.id));
          nav.querySelectorAll('a[data-v2-nav-id]').forEach(node => { if (!itemIds.has(node.dataset.v2NavId)) (node.closest('.kp-nav-row') || node).remove(); });
          items.forEach(item => {
            let node = nav.querySelector(`a[data-v2-nav-id="${item.id}"]`);
            if (!node) { node = document.createElement('a'); node.dataset.v2NavId = item.id; node.className = item.className || ''; nav.append(node); }
            const target = resolveNavigationTarget(doc, item);
            node.textContent = item.label;
            node.setAttribute('href', item.href || '#');
            node.dataset.v2TargetType = target.type;
            if (target.pageId) node.dataset.v2PageTarget = target.pageId; else delete node.dataset.v2PageTarget;
            if (target.sectionId) node.dataset.v2SectionTarget = target.sectionId; else delete node.dataset.v2SectionTarget;
            node.setAttribute('aria-current', target.type === 'page' && target.pageId === activePage?.id ? 'page' : 'false');
            const row = node.closest('.kp-nav-row'); if (row) nav.append(row); else nav.append(node);
          });
        }
        const header = root.querySelector('.top');
        if (header && doc.header?.design) {
          const design = doc.header.design;
          if (design.height != null) header.style.minHeight = `${Number(design.height) || 0}px`;
          if (design.background != null && design.backgroundColor == null) header.style.backgroundColor = String(design.background);
          if (design.backgroundColor != null) header.style.backgroundColor = String(design.backgroundColor);
          header.style.backgroundImage = String(design.backgroundImage || '');
          if (design.color != null) header.style.color = String(design.color);
          header.dataset.v2HeaderLayout = design.layout || 'spread';
          header.style.flexDirection = design.layout === 'stacked' ? 'column' : 'row';
          header.style.justifyContent = design.layout === 'centered' ? 'center' : 'space-between';
          const navNode = header.querySelector('#nav'), brand = header.querySelector('.brand');
          if (navNode) { navNode.style.justifyContent = design.navPosition || 'end'; navNode.style.gap = (Number(design.gap) || 18) + 'px'; }
          if (brand) {
            const title = design.title || doc.header.elements?.[0]?.content?.text || 'Koblenzer Puppenspiele';
            brand.replaceChildren();
            if (design.logoSrc) {
              const logo = document.createElement('img'); logo.className = 'kp-v2-header-logo'; logo.src = design.logoSrc; logo.alt = '';
              logo.style.width = (Number(design.logoSize) || 42) + 'px'; logo.style.height = (Number(design.logoSize) || 42) + 'px';
              const text = document.createElement('span'); text.textContent = title;
              if (design.logoPosition === 'right') brand.append(text, logo); else brand.append(logo, text);
            } else brand.textContent = title;
          }
        }
        const theme = doc.site?.design;
        const variables = { accent: '--orange', background: '--brown', surface: '--bg', text: '--text', muted: '--muted' };
        Object.entries(variables).forEach(([name, variable]) => { root.style.removeProperty(`--v2-${name}`); root.style.removeProperty(variable); });
        if (theme?.colors) Object.entries(theme.colors).forEach(([name, value]) => { root.style.setProperty(`--v2-${name}`, String(value)); if (variables[name]) root.style.setProperty(variables[name], String(value)); });
        return root;
      },
      mount(root, store) {
        const update = state => this.render(state.document, root, state.activePageId);
        update(store.get());
        return store.subscribe(update);
      },
      bindNavigation(root, store) {
        if (!root || !store) throw new TypeError('Navigation benötigt Ziel-Element und Store');
        const navigate = (target, { updateHistory = false } = {}) => {
          if (!target?.exists || !['page', 'section'].includes(target.type)) return false;
          store.setActivePage(target.pageId);
          if (updateHistory) {
            const hash = target.type === 'section' ? `#${encodeURIComponent(target.sectionId)}` : pageHref(target.pageId);
            if (location.hash !== hash) history.pushState(null, '', hash);
          }
          requestAnimationFrame(() => {
            if (target.type === 'section') root.querySelector(`main > section[data-v2-section-id="${target.sectionId}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
            else root.querySelector('main')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
          });
          return true;
        };
        const handler = event => {
          const anchor = event.target.closest?.('#nav a[data-v2-nav-id],.brand[href]');
          if (!anchor) return;
          const state = store.get();
          const item = anchor.dataset.v2NavId ? state.document.navigation.items.find(entry => entry.id === anchor.dataset.v2NavId) : { href: anchor.getAttribute('href') || '#home' };
          const target = resolveNavigationTarget(state.document, item);
          if (!target.exists || !['page', 'section'].includes(target.type)) return;
          event.preventDefault();
          anchor.closest('#nav')?.classList.remove('open');
          navigate(target, { updateHistory: true });
        };
        const historyHandler = () => {
          const target = resolveNavigationTarget(store.get().document, { href: location.hash || '#home' });
          navigate(target);
        };
        root.addEventListener('click', handler);
        window.addEventListener('popstate', historyHandler);
        window.addEventListener('hashchange', historyHandler);
        historyHandler();
        return () => { root.removeEventListener('click', handler); window.removeEventListener('popstate', historyHandler); window.removeEventListener('hashchange', historyHandler); };
      },
      bindSelection(root, store) {
        if (!root || !store) throw new TypeError('Selection benötigt Ziel-Element und Store');
        const update = state => { root.querySelectorAll('[data-v2-id]').forEach(node => { node.style.outline = state.mode === 'edit' && state.selection?.elementId === node.dataset.v2Id ? '2px solid #1683ff' : ''; node.style.outlineOffset = '2px'; }); root.querySelectorAll('[data-v2-section-id]').forEach(node => { node.style.outline = state.mode === 'edit' && state.selection?.sectionId === node.dataset.v2SectionId ? '2px solid #f28b35' : ''; node.style.outlineOffset = '-3px'; }); };
        const unsubscribe = store.subscribe(update);
        const handler = event => { if (store.get().mode !== 'edit') return; const node = event.target.closest?.('[data-v2-id]'), section = event.target.closest?.('main > section[data-v2-section-id]'); if (node) { event.preventDefault(); store.setSelection({ elementId: node.dataset.v2Id }); } else if (section) { event.preventDefault(); store.setSelection({ sectionId: section.dataset.v2SectionId }); } };
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
        const guides = () => { let node = root.querySelector?.('#kpV2SnapGuides'); if (!node && root.body) { node = document.createElement('div'); node.id = 'kpV2SnapGuides'; node.innerHTML = '<i data-v></i><i data-h></i>'; root.body.append(node); } return node; };
        const showGuides = (x, y) => { const node = guides(); if (!node) return; const vertical = node.querySelector('[data-v]'), horizontal = node.querySelector('[data-h]'); node.hidden = x == null && y == null; vertical.hidden = x == null; horizontal.hidden = y == null; if (x != null) vertical.style.left = `${x}px`; if (y != null) horizontal.style.top = `${y}px`; };
        const alignedPosition = (point, event) => {
          let x = point.originX + event.clientX - point.startX, y = point.originY + event.clientY - point.startY;
          point.node.style.transform = `translate(${x}px, ${y}px)`;
          const rect = point.node.getBoundingClientRect(), candidatesX = [innerWidth / 2], candidatesY = [innerHeight / 2];
          root.querySelectorAll('[data-v2-id]').forEach(node => { if (node === point.node) return; const other = node.getBoundingClientRect(); if (other.bottom < 0 || other.top > innerHeight) return; candidatesX.push(other.left, other.left + other.width / 2, other.right); candidatesY.push(other.top, other.top + other.height / 2, other.bottom); });
          const best = (values, candidates) => { let match = null; for (const value of values) for (const candidate of candidates) { const delta = candidate - value; if (Math.abs(delta) <= 6 && (!match || Math.abs(delta) < Math.abs(match.delta))) match = { delta, guide: candidate }; } return match; };
          const snapX = best([rect.left, rect.left + rect.width / 2, rect.right], candidatesX), snapY = best([rect.top, rect.top + rect.height / 2, rect.bottom], candidatesY);
          if (snapX) x += snapX.delta; else if (snap > 0) x = Math.round(x / snap) * snap;
          if (snapY) y += snapY.delta; else if (snap > 0) y = Math.round(y / snap) * snap;
          point.finalX = x; point.finalY = y; showGuides(snapX?.guide ?? null, snapY?.guide ?? null);
          return { x, y };
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
          if (point.dragging) { event.preventDefault(); point.x = event.clientX; point.y = event.clientY; showTrash(true); document.body.classList.add('kp-image-drag-active'); const aligned = alignedPosition(point, event); point.node.style.transform = `translate(${aligned.x}px, ${aligned.y}px)`; const bounds = trash()?.getBoundingClientRect?.(); trash()?.classList.toggle('hot', Boolean(bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom)); }
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
            showTrash(false); showGuides(null, null); document.body.classList.remove('kp-image-drag-active');
            if (inTrash) { const label = point.node.tagName === 'IMG' ? 'Bild gelöscht' : 'Element gelöscht'; actions.deleteElement(point.node.dataset.v2Id); showUndo(label); }
            else {
              actions.moveElement(point.node.dataset.v2Id, point.finalX ?? point.originX + point.x - point.startX, point.finalY ?? point.originY + point.y - point.startY);
            }
          }
          active.delete(event.pointerId);
        };
        root.addEventListener('pointerdown', onDown, true); root.addEventListener('pointermove', onMove, { passive: false, capture: true }); root.addEventListener('pointerup', onUp, true); root.addEventListener('pointercancel', onUp, true);
        return () => { active.forEach(point => clearTimeout(point.timer)); active.clear(); gesture = null; showTrash(false); showGuides(null, null); root.removeEventListener('pointerdown', onDown, true); root.removeEventListener('pointermove', onMove, true); root.removeEventListener('pointerup', onUp, true); root.removeEventListener('pointercancel', onUp, true); };
      }
    };
  }

  function createContextProvider(store) {
    return { snapshot: () => { const state = store.get(), activePage = state.document.pages.find(page => page.id === state.activePageId) || null; return { document: clone(state.document), activePageId: state.activePageId, activePage: activePage ? clone({ id: activePage.id, title: activePage.title, path: activePage.path, metadata: activePage.metadata }) : null, activeSectionId: state.activeSectionId, selection: state.selection, mode: state.mode, viewport: state.viewport, breakpoint: state.breakpoint }; } };
  }

  function createDiagnostics(store) {
    const runtimeErrors = [], networkFailures = [];
    const add = (list, value) => { list.push({ at: new Date().toISOString(), ...clone(value) }); if (list.length > 50) list.shift(); };
    window.addEventListener('error', event => add(runtimeErrors, { message: event.message || String(event.error || 'Unbekannter Laufzeitfehler'), source: event.filename || '', line: event.lineno || 0 }));
    window.addEventListener('unhandledrejection', event => add(runtimeErrors, { message: String(event.reason?.message || event.reason || 'Unbehandelte Promise-Ablehnung') }));
    return {
      recordRuntimeError: error => add(runtimeErrors, { message: String(error?.message || error) }),
      recordNetworkFailure: failure => add(networkFailures, typeof failure === 'string' ? { url: failure } : failure),
      clear: () => { runtimeErrors.length = 0; networkFailures.length = 0; },
      snapshot: () => ({ ...createContextProvider(store).snapshot(), history: store.history(), runtimeErrors: clone(runtimeErrors), networkFailures: clone(networkFailures), layout: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 } })
    };
  }

  function createAIAdapter(store, editorActions) {
    const forbidden = new Set(['apply', 'executeBatch', 'previewBatch']);
    const validatePlan = plan => {
      if (!plan || !Array.isArray(plan.actions) || plan.actions.length === 0 || plan.actions.length > 100) return { ok: false, error: 'Ungültiger oder leerer Action-Plan' };
      const invalid = plan.actions.find(command => !command || typeof command.name !== 'string' || forbidden.has(command.name) || typeof editorActions[command.name] !== 'function' || (command.payload != null && !Array.isArray(command.payload)));
      return invalid ? { ok: false, error: `Nicht erlaubte Action: ${invalid?.name || 'unbekannt'}` } : { ok: true };
    };
    return {
      plan: async () => { throw new Error('Kein KI-Provider verbunden'); },
      validatePlan,
      previewPlan: (plan, label = 'KI-Vorschau') => { const validation = validatePlan(plan); if (!validation.ok) throw new TypeError(validation.error); return editorActions.previewBatch(label, plan.actions); },
      applyPlan: (plan, label = 'KI-Änderung') => { const validation = validatePlan(plan); if (!validation.ok) throw new TypeError(validation.error); return editorActions.executeBatch(label, plan.actions); },
      commit: () => store.commitPreview(),
      cancel: () => store.cancelPreview()
    };
  }

  const documentModel = importDocument();
  const store = createStore(documentModel);
  const actions = createActions(store);
  const persistence = createPersistence(store);
  const savedDocument = (() => { try { return persistence.load(); } catch (error) { console.warn('[Editor V2] Gespeichertes Dokument konnte nicht geladen werden', error); return null; } })();
  const savedWorkspace = persistence.loadWorkspace();
  const renderer = createRenderer();
  const context = createContextProvider(store);
  const diagnostics = createDiagnostics(store);
  const ai = createAIAdapter(store, actions);
  const refreshFromDOM = root => { if (store.get().dirty || store.get().mode === 'edit') return false; store.replaceDocument(importDocument(root || document), { dirty: false, persistence: store.get().persistence }); return true; };
  const runtime = {
    unmountRenderer: renderer.mount(document.documentElement, store),
    unbindNavigation: renderer.bindNavigation(document, store),
    unbindSelection: renderer.bindSelection(document, store),
    unbindGestures: renderer.bindGestures(document, store, actions)
  };
  document.getElementById('edit')?.addEventListener('click', () => store.setMode('edit'));
  document.getElementById('close')?.addEventListener('click', () => { store.setSelection(null); store.setMode('view'); });
  document.getElementById('save')?.addEventListener('click', () => persistence.save(), true);
  window.addEventListener('load', () => setTimeout(() => { if (savedDocument) store.replaceDocument(mergeDocuments(importDocument(document), savedDocument), { activePageId: savedWorkspace?.activePageId, dirty: false, persistence: 'loaded' }); else refreshFromDOM(document); }, 500), { once: true });
  window.KPEditorV2 = Object.freeze({ SCHEMA_VERSION, importDocument, normalize, migrate, mergeDocuments, resolveNavigationTarget, pageHref, refreshFromDOM, store, actions, persistence, renderer, context, diagnostics, ai, runtime });
  if (!document.querySelector('script[data-kp-v2-ai]')) {
    const script = document.createElement('script');
    script.src = 'editor-v2-ai.js?v=20260912-1';
    script.dataset.kpV2Ai = '1';
    document.head.append(script);
  }
  if (!document.querySelector('script[data-kp-v2-overlay]')) {
    const script = document.createElement('script');
    script.src = 'editor-v2-overlay.js?v=20260913-2';
    script.dataset.kpV2Overlay = '1';
    document.head.append(script);
  }
  if (!document.querySelector('script[data-kp-v2-backup]')) {
    const script = document.createElement('script');
    script.src = 'editor-v2-backup.js?v=20260913-2';
    script.dataset.kpV2Backup = '1';
    document.head.append(script);
  }
  if (!document.querySelector('script[data-kp-v2-media]')) {
    const script = document.createElement('script');
    script.src = 'editor-v2-media.js?v=20260913-1';
    script.dataset.kpV2Media = '1';
    document.head.append(script);
  }
  if (!document.querySelector('script[data-kp-v2-keyboard]')) {
    const script = document.createElement('script');
    script.src = 'editor-v2-keyboard.js?v=20260913-2';
    script.dataset.kpV2Keyboard = '1';
    document.head.append(script);
  }
})();
