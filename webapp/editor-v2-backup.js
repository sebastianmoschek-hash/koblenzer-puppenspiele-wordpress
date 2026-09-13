/* Portable, versioned V2 document backups. No server or account required. */
(() => {
  'use strict';
  const v2 = window.KPEditorV2;
  if (!v2 || window.KPEditorV2Backup) return;

  const STORAGE_KEY = 'kp-editor-v2-backups';
  const FORMAT = 'koblenzer-puppenspiele-editor-v2';
  const MAX_BACKUPS = 20;
  const MAX_BYTES = 8 * 1024 * 1024;
  const MAX_NODES = 12000;
  const ELEMENT_TYPES = new Set(['text', 'heading', 'button', 'image']);
  const clone = value => JSON.parse(JSON.stringify(value));
  const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  function cleanUnsafeKeys(value) {
    if (Array.isArray(value)) return value.map(cleanUnsafeKeys);
    if (!isObject(value)) return value;
    const clean = {};
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor', 'editorUi', 'editorChrome'].includes(key)) continue;
      clean[key] = cleanUnsafeKeys(child);
    }
    return clean;
  }

  function validateDocument(document) {
    if (!isObject(document)) throw new TypeError('Die Sicherung enthält kein Dokument.');
    const schemaVersion = Number(document.schemaVersion) || 0;
    if (!Number.isInteger(schemaVersion) || schemaVersion < 0) throw new TypeError('Die Schema-Version ist ungültig.');
    if (schemaVersion > v2.SCHEMA_VERSION) throw new RangeError(`Diese Sicherung benötigt Editor-Schema ${schemaVersion}. Installiert ist ${v2.SCHEMA_VERSION}.`);
    if (!isObject(document.site)) throw new TypeError('Die Sicherung enthält keine Website-Daten.');
    if (!Array.isArray(document.pages) || document.pages.length === 0) throw new TypeError('Die Sicherung enthält keine Seite.');

    const ids = new Set();
    let nodes = 0;
    const requireId = (value, label) => {
      if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} besitzt keine stabile ID.`);
      if (ids.has(value)) throw new TypeError(`Die ID „${value}“ ist mehrfach vorhanden.`);
      ids.add(value);
      nodes += 1;
      if (nodes > MAX_NODES) throw new RangeError(`Die Sicherung enthält mehr als ${MAX_NODES} Objekte.`);
    };

    for (const page of document.pages) {
      if (!isObject(page)) throw new TypeError('Eine Seite ist ungültig.');
      requireId(page.id, 'Eine Seite');
      if (!Array.isArray(page.sections)) throw new TypeError(`Seite „${page.id}“ enthält keine Abschnittsliste.`);
      for (const section of page.sections) {
        if (!isObject(section)) throw new TypeError('Ein Abschnitt ist ungültig.');
        requireId(section.id, 'Ein Abschnitt');
        if (!Array.isArray(section.elements)) throw new TypeError(`Abschnitt „${section.id}“ enthält keine Elementliste.`);
        for (const element of section.elements) {
          if (!isObject(element)) throw new TypeError('Ein Element ist ungültig.');
          requireId(element.id, 'Ein Element');
          if (!ELEMENT_TYPES.has(element.type)) throw new TypeError(`Elementtyp „${String(element.type)}“ wird nicht unterstützt.`);
          if (!isObject(element.content)) throw new TypeError(`Element „${element.id}“ enthält keinen Inhalt.`);
        }
      }
    }
    const items = document.navigation?.items;
    if (items != null && !Array.isArray(items)) throw new TypeError('Die Navigation ist ungültig.');
    for (const item of items || []) {
      if (!isObject(item)) throw new TypeError('Ein Navigationspunkt ist ungültig.');
      requireId(item.id, 'Ein Navigationspunkt');
    }
    return true;
  }

  function parse(raw) {
    return parsePackage(raw).document;
  }

  function parsePackage(raw) {
    if (typeof raw !== 'string') throw new TypeError('Die Sicherung muss eine JSON-Datei sein.');
    if (!raw.trim()) throw new TypeError('Die Sicherungsdatei ist leer.');
    if (new Blob([raw]).size > MAX_BYTES) throw new RangeError('Die Sicherungsdatei ist größer als 8 MB.');
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { throw new SyntaxError('Die Sicherungsdatei enthält kein gültiges JSON.'); }
    if (!isObject(parsed)) throw new TypeError('Die Sicherung besitzt ein ungültiges Format.');
    if (parsed.format != null && parsed.format !== FORMAT) throw new TypeError('Die Datei gehört nicht zum Koblenzer-Puppenspiele-Editor.');
    const document = cleanUnsafeKeys(parsed.document || parsed);
    validateDocument(document);
    const migrated = v2.migrate(document);
    const requestedPageId = typeof parsed.workspace?.activePageId === 'string' ? parsed.workspace.activePageId : null;
    const activePageId = migrated.pages.some(page => page.id === requestedPageId) ? requestedPageId : migrated.pages[0]?.id || null;
    return { document: migrated, activePageId };
  }

  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value.filter(entry => isObject(entry) && isObject(entry.document)) : [];
    } catch (_) { return []; }
  };
  const write = entries => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_BACKUPS))); return true; }
    catch (_) { return false; }
  };
  const signature = document => JSON.stringify(document);
  const remember = (label = 'Lokale Sicherung') => {
    const state = v2.store.get(), document = clone(state.document);
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, label: String(label), savedAt: new Date().toISOString(), activePageId: state.activePageId, document };
    const currentSignature = signature({ document, activePageId: entry.activePageId });
    write([entry, ...read().filter(item => signature({ document: item.document, activePageId: item.activePageId || null }) !== currentSignature)]);
    return entry;
  };
  const save = (label = 'Gespeichert') => { v2.persistence.save(); return remember(label); };
  const serialize = () => {
    const state = v2.store.get(), document = clone(state.document);
    return JSON.stringify({ format: FORMAT, schemaVersion: v2.SCHEMA_VERSION, exportedAt: new Date().toISOString(), workspace: { activePageId: state.activePageId }, document }, null, 2);
  };
  const download = (filename, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportDocument = () => {
    const entry = remember('Export');
    download(`koblenzer-puppenspiele-v2-${entry.savedAt.slice(0, 10)}.json`, serialize());
    return entry;
  };
  const applyDocument = (document, label, persistenceState, activePageId = null) => {
    v2.store.transact(label, state => {
      state.document = document;
      state.activePageId = document.pages.some(page => page.id === activePageId) ? activePageId : document.pages[0]?.id || null;
      state.activeSectionId = null;
      state.selection = null;
      state.persistence = persistenceState;
    });
    v2.persistence.save();
    return remember(label);
  };
  const importText = raw => { const backup = parsePackage(raw); return applyDocument(backup.document, 'Import', 'imported', backup.activePageId); };
  const importFromFile = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > MAX_BYTES) throw new RangeError('Die Sicherungsdatei ist größer als 8 MB.');
        importText(await file.text());
        window.dispatchEvent(new CustomEvent('kp-v2-feedback', { detail: 'Sicherung importiert ✓' }));
      } catch (error) { window.dispatchEvent(new CustomEvent('kp-v2-feedback', { detail: `Import fehlgeschlagen: ${error.message}` })); }
    };
    input.click();
  };
  const restore = entry => {
    if (!isObject(entry)) throw new TypeError('Die lokale Version ist ungültig.');
    const backup = parsePackage(JSON.stringify({ format: FORMAT, workspace: { activePageId: entry.activePageId }, document: entry.document }));
    const result = applyDocument(backup.document, 'Lokale Version wiederherstellen', 'restored', backup.activePageId);
    window.dispatchEvent(new CustomEvent('kp-v2-feedback', { detail: 'Lokale Version wiederhergestellt ✓' }));
    return result;
  };
  const history = () => {
    const entries = read();
    if (!entries.length) { window.dispatchEvent(new CustomEvent('kp-v2-feedback', { detail: 'Noch keine lokalen Sicherungen vorhanden' })); return; }
    const panel = document.createElement('div');
    panel.id = 'kpV2BackupSheet';
    panel.innerHTML = '<div class="kp-v2-sheet-scrim"></div><div class="kp-v2-sheet" role="dialog" aria-modal="true" aria-labelledby="kpV2BackupTitle"><header><strong id="kpV2BackupTitle">Lokale Sicherungen</strong><button type="button" data-close aria-label="Schließen">×</button></header><small>Diese Versionen bleiben auf diesem Gerät. Für andere Geräte exportierst du eine JSON-Datei.</small><div data-list></div></div>';
    const list = panel.querySelector('[data-list]');
    entries.forEach(entry => {
      const button = document.createElement('button');
      button.type = 'button';
      const date = new Date(entry.savedAt);
      button.textContent = `${entry.label} · ${isNaN(date) ? '' : date.toLocaleString('de-DE')}`;
      button.onclick = () => { restore(entry); panel.remove(); };
      list.append(button);
    });
    panel.querySelector('[data-close]').onclick = () => panel.remove();
    panel.querySelector('.kp-v2-sheet-scrim').onclick = () => panel.remove();
    document.body.append(panel);
    panel.querySelector('[data-close]').focus();
  };

  window.KPEditorV2Backup = Object.freeze({ FORMAT, MAX_BYTES, export: exportDocument, import: importFromFile, importText, parse, parsePackage, serialize, history, read, remember, restore, save });
})();
