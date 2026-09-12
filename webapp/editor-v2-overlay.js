/* Single visible command surface for Editor V2. */
(() => {
  'use strict';
  const v2 = window.KPEditorV2;
  if (!v2 || window.KPEditorV2Overlay) return;
  const q = selector => document.querySelector(selector);
  const unique = prefix => `${prefix}-${crypto.randomUUID?.() || Date.now()}`;
  function locate(state) {
    const selection = state.selection || {};
    for (const page of state.document.pages) for (const section of page.sections) {
      if (selection.sectionId === section.id) return { kind: 'section', section, page };
      const element = section.elements.find(item => item.id === selection.elementId);
      if (element) return { kind: element.type, element, section, page, node: q(`[data-v2-id="${element.id}"]`) };
    }
    const headerElement = state.document.header?.elements?.find(item => item.id === selection.elementId);
    return headerElement ? { kind: 'header', element: headerElement, node: q(`[data-v2-id="${headerElement.id}"]`) } : null;
  }
  function button(label, action, primary = false) {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.dataset.v2Tool = action; if (primary) node.className = 'primary'; return node;
  }
  function toolbar() {
    let bar = q('#kpV2Toolbar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'kpV2Toolbar'; bar.hidden = true; document.body.append(bar); }
    return bar;
  }
  function closeSheet() { q('#kpV2CommandSheet')?.remove(); q('#kpV2NavSheet')?.remove(); }
  function aiSheet() {
    q('#kpV2AISheet')?.remove();
    const panel = document.createElement('div'); panel.id = 'kpV2AISheet';
    panel.innerHTML = '<header><div><strong>KI-Assistent</strong><small>Nicht verbunden</small></div><button type="button" data-close>×</button></header><p>Der Editor funktioniert vollständig lokal. Für natürliche Live-Unterhaltung, Bild-KI und Sprachausgabe ist noch kein KI-Anbieter verbunden.</p><button type="button" disabled>🎙 Live sprechen</button><button type="button" disabled>▣ Bildschirm teilen</button><small>Es wird kein kostenpflichtiger Dienst automatisch aktiviert.</small>';
    panel.querySelector('[data-close]').onclick = () => panel.remove(); document.body.append(panel);
  }
  function themeSheet() {
    q('#kpV2ThemeSheet')?.remove();
    const presets = { original: { preset: 'original-koblenz', colors: { accent: '#f28b35', background: '#2b1c16', surface: '#17100d', text: '#fff7ef', muted: '#d7c5b8' } }, warm: { preset: 'warm-theater', colors: { accent: '#f6ad55', background: '#3a2119', surface: '#22110e', text: '#fff8ee', muted: '#e2c5b4' } }, night: { preset: 'night-stage', colors: { accent: '#eab308', background: '#111827', surface: '#080d18', text: '#f8fafc', muted: '#cbd5e1' } } };
    const panel = document.createElement('div'); panel.id = 'kpV2ThemeSheet';
    panel.innerHTML = '<header><div><strong>Website-Design</strong><small>Inhalte bleiben unverändert</small></div><button type="button" data-close>×</button></header><div class="kp-v2-theme-grid"><button type="button" data-theme="original">Original</button><button type="button" data-theme="warm">Warmes Theater</button><button type="button" data-theme="night">Nachtbühne</button></div><footer><button type="button" data-cancel>Verwerfen</button><button type="button" data-accept disabled>Übernehmen</button></footer>';
    const cancel = () => { v2.store.cancelPreview(); panel.remove(); };
    panel.querySelector('[data-close]').onclick = cancel; panel.querySelector('[data-cancel]').onclick = cancel;
    panel.querySelectorAll('[data-theme]').forEach(node => node.onclick = () => { v2.actions.previewBatch('Website-Design Vorschau', [{ name: 'applyTheme', payload: [presets[node.dataset.theme]] }]); panel.querySelector('[data-accept]').disabled = false; });
    panel.querySelector('[data-accept]').onclick = () => { v2.store.commitPreview(); panel.remove(); feedback('Website-Design übernommen · Rückgängig möglich'); };
    document.body.append(panel);
  }
  function feedback(text) { const status = q('#status'); if (status) status.textContent = text; }
  function navigationSheet() {
    closeSheet();
    const panel = document.createElement('div'); panel.id = 'kpV2NavSheet';
    panel.innerHTML = '<header><strong>Navigation bearbeiten</strong><button type="button" data-close>×</button></header><div data-items></div><button type="button" data-add>＋ Menüpunkt hinzufügen</button>';
    const render = () => {
      const host = panel.querySelector('[data-items]'); host.innerHTML = '';
      v2.store.get().document.navigation.items.forEach((item, index, items) => {
        const row = document.createElement('div'); row.className = 'kp-v2-nav-row';
        row.innerHTML = `<input aria-label="Menütext" value="${String(item.label).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"><button type="button" data-up aria-label="Nach oben">↑</button><button type="button" data-down aria-label="Nach unten">↓</button><button type="button" data-delete aria-label="Löschen">×</button>`;
        row.querySelector('input').onchange = event => v2.actions.renameNavigationItem(item.id, event.target.value);
        row.querySelector('[data-up]').disabled = index === 0; row.querySelector('[data-up]').onclick = () => { v2.actions.moveNavigationItem(item.id, -1); render(); };
        row.querySelector('[data-down]').disabled = index === items.length - 1; row.querySelector('[data-down]').onclick = () => { v2.actions.moveNavigationItem(item.id, 1); render(); };
        row.querySelector('[data-delete]').onclick = () => { v2.actions.deleteNavigationItem(item.id); render(); };
        host.append(row);
      });
    };
    panel.querySelector('[data-close]').onclick = closeSheet;
    panel.querySelector('[data-add]').onclick = () => { v2.actions.createNavigationItem('Neue Seite', '#neue-seite'); render(); };
    document.body.append(panel); render();
  }
  function moreSheet(current) {
    closeSheet();
    const panel = document.createElement('div'); panel.id = 'kpV2CommandSheet';
    panel.innerHTML = '<div class="kp-v2-sheet-scrim"></div><div class="kp-v2-sheet"><strong>Weitere Aktionen</strong></div>';
    const host = panel.querySelector('.kp-v2-sheet');
    const add = (label, handler) => { const node = button(label, 'sheet'); node.onclick = () => { handler(); closeSheet(); }; host.append(node); };
    if (current.kind === 'section') { add('Abschnitt nach oben', () => v2.actions.moveSection(current.section.id, -1)); add('Abschnitt nach unten', () => v2.actions.moveSection(current.section.id, 1)); add('Abschnitt duplizieren', () => v2.actions.duplicateSection(current.section.id)); add('Abschnitt löschen', () => v2.actions.deleteSection(current.section.id)); }
    else { if (current.kind === 'image') { add('Bild vergrößern', () => v2.actions.resizeElement(current.element.id, (current.element.transform?.scale || 1) * 1.15)); add('Bild verkleinern', () => v2.actions.resizeElement(current.element.id, (current.element.transform?.scale || 1) / 1.15)); add('90° drehen', () => v2.actions.rotateElement(current.element.id, (current.element.transform?.rotation || 0) + 90)); add('Bildrand zuschneiden', () => v2.actions.setImageAdjustments(current.element.id, { crop: { x: .08, y: .08, width: .84, height: .84 } })); add('Bild zurücksetzen', () => v2.actions.resetImage(current.element.id)); } add('Ganz nach vorne', () => v2.actions.moveLayer(current.element.id, 'front')); add('Ganz nach hinten', () => v2.actions.moveLayer(current.element.id, 'back')); add('Duplizieren', () => v2.actions.duplicateElement(current.element.id)); add('Löschen', () => v2.actions.deleteElement(current.element.id)); }
    panel.querySelector('.kp-v2-sheet-scrim').onclick = closeSheet; document.body.append(panel);
  }
  function addSection() {
    const sectionId = unique('section'), headingId = unique('el'), textId = unique('el');
    v2.actions.createSection('home', { id: sectionId, design: { className: 'dark editable' }, elements: [{ id: headingId, type: 'heading', order: 0, content: { text: 'Neue Überschrift' }, styles: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, source: { tag: 'h2', className: '' } }, { id: textId, type: 'text', order: 1, content: { text: 'Hier kann der neue Inhalt direkt bearbeitet werden.' }, styles: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, source: { tag: 'p', className: '' } }] });
    v2.store.setSelection({ sectionId }); q(`[data-v2-section-id="${sectionId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); feedback('Neuer Abschnitt erstellt');
  }
  function render(state) {
    document.body.classList.toggle('kp-v2-ui', state.mode === 'edit');
    if (state.mode === 'edit') document.querySelectorAll('[contenteditable]').forEach(node => node.setAttribute('contenteditable', 'false'));
    const bar = toolbar(), current = locate(state); bar.replaceChildren();
    if (state.mode !== 'edit' || !current) { bar.hidden = true; return; }
    bar.hidden = false;
    const add = (label, action, handler, primary = false) => { const node = button(label, action, primary); node.onclick = event => { event.preventDefault(); event.stopPropagation(); handler(); }; bar.append(node); };
    if (current.kind === 'image') { add('Bild bearbeiten', 'edit', () => window.kpProImageEditor?.open(current.node), true); add('Duplizieren', 'duplicate', () => v2.actions.duplicateElement(current.element.id)); }
    else if (['text', 'heading', 'button'].includes(current.kind)) { add(current.kind === 'button' ? 'Button bearbeiten' : 'Text bearbeiten', 'edit', () => window.kpElementSheet?.open(current.node), true); add('Duplizieren', 'duplicate', () => v2.actions.duplicateElement(current.element.id)); }
    else if (current.kind === 'section') { add('Design wechseln', 'design', () => { const dark = String(current.section.design?.className || '').split(/\s+/).includes('dark'); v2.actions.setSectionDesign(current.section.id, { ...current.section.design, className: dark ? 'editable' : 'dark editable' }); }); add('Duplizieren', 'duplicate', () => v2.actions.duplicateSection(current.section.id)); }
    else if (current.kind === 'header') { add('Navigation', 'navigation', navigationSheet, true); add('Header-Design', 'header-design', () => { const warm = v2.store.get().document.header.design?.preset !== 'warm'; v2.actions.setHeaderDesign(warm ? { preset: 'warm', background: '#4b2318', color: '#fff7ef', height: 76 } : { preset: 'original', background: '#17100d', color: '#fff7ef', height: 64 }); }); }
    add('Mehr', 'more', () => moreSheet(current));
  }
  function bindMainControls() {
    const replace = (selector, label, handler) => { const old = q(selector); if (!old) return; const fresh = old.cloneNode(true); fresh.textContent = label; old.replaceWith(fresh); fresh.onclick = handler; };
    replace('#addSection', '＋ Abschnitt', addSection);
    replace('#undo', '↶', () => v2.store.undo()); replace('#redo', '↷', () => v2.store.redo());
    replace('#cloudSave', '▣ Auf Gerät speichern', () => { v2.persistence.save(); feedback('Auf diesem Gerät gespeichert ✓'); });
    replace('#save', '▣ Gerät sichern', () => { v2.persistence.save(); feedback('Auf diesem Gerät gespeichert ✓'); });
    const host = q('#editor .tool-main'); if (host && !q('#kpV2AI')) { const ai = button('✦ KI-Assistent', 'ai'); ai.id = 'kpV2AI'; ai.onclick = aiSheet; host.append(ai); }
    if (host && !q('#kpV2Theme')) { const design = button('◐ Website-Design', 'theme'); design.id = 'kpV2Theme'; design.onclick = themeSheet; host.append(design); }
  }
  const init = () => { bindMainControls(); v2.store.subscribe(render); render(v2.store.get()); window.addEventListener('kp-editor-restored', () => render(v2.store.get())); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
  window.KPEditorV2Overlay = Object.freeze({ render, navigationSheet, addSection, aiSheet, themeSheet });
})();
