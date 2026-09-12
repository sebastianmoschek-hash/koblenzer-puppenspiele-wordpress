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
  function closeSheet() { ['#kpV2CommandSheet', '#kpV2NavSheet', '#kpV2ViewportSheet', '#kpV2SectionSheet', '#kpV2HeaderSheet', '#kpV2LayerSheet'].forEach(selector => q(selector)?.remove()); }
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
  function viewportSheet() {
    closeSheet();
    const panel = document.createElement('div'); panel.id = 'kpV2ViewportSheet';
    panel.innerHTML = '<header><div><strong>Responsive Ansicht</strong><small>Vorschau für Smartphone, Tablet und Desktop</small></div><button type="button" data-close>×</button></header><div class="kp-v2-viewport-grid"><button type="button" data-viewport="mobile">▯ Smartphone</button><button type="button" data-viewport="tablet">▯ Tablet</button><button type="button" data-viewport="desktop">▱ Desktop</button></div><small>Die Vorschau verändert nur die Editoransicht. Inhalte und Layoutregeln bleiben responsive.</small>';
    panel.querySelector('[data-close]').onclick = closeSheet;
    panel.querySelectorAll('[data-viewport]').forEach(node => node.onclick = () => { v2.store.setViewport(node.dataset.viewport); document.body.dataset.v2Viewport = node.dataset.viewport; panel.querySelectorAll('[data-viewport]').forEach(item => item.setAttribute('aria-pressed', String(item === node))); feedback(`${node.textContent.trim()}-Vorschau aktiv`); });
    document.body.append(panel);
  }
  function sectionSheet(section) {
    closeSheet();
    const panel = document.createElement('div'); panel.id = 'kpV2SectionSheet';
    panel.innerHTML = '<header><div><strong>Abschnitt gestalten</strong><small>Design ändern, Inhalte bleiben erhalten</small></div><button type="button" data-close>×</button></header><div class="kp-v2-section-grid"><button type="button" data-template="plain">Ruhig</button><button type="button" data-template="dark">Bühne</button><button type="button" data-template="warm">Warm</button><button type="button" data-template="cards">Kartenfläche</button></div><div class="kp-v2-section-fields"><label>Abschnittstyp<select data-type><option value="content">Inhalt</option><option value="hero">Aufmacher</option><option value="gallery">Galerie</option><option value="cta">Call-to-Action</option></select></label><label>Inhaltsbreite<select data-layout><option value="normal">Normal</option><option value="narrow">Schmal</option><option value="wide">Breit</option></select></label><label>Hintergrundfarbe<input data-background type="color"></label><label>Hintergrundbild<select data-background-image><option value="">Keins</option></select></label></div><label>Mindesthöhe <output data-height-out>0</output> px<input data-height type="range" min="0" max="900" step="10" value="0"></label><label>Abstand oben <output data-top-out>72</output> px<input data-top type="range" min="0" max="180" value="72"></label><label>Abstand unten <output data-bottom-out>72</output> px<input data-bottom type="range" min="0" max="180" value="72"></label><footer><button type="button" data-cancel>Verwerfen</button><button type="button" data-accept disabled>Übernehmen</button></footer>';
    const original = { ...section.design };
    const presets = { plain: { className: 'editable', type: 'content', layout: 'normal', backgroundColor: '#2b1c16', backgroundImage: '' }, dark: { className: 'dark editable', type: 'content', layout: 'normal', backgroundColor: '#17100d', backgroundImage: '' }, warm: { className: 'editable', type: 'content', layout: 'normal', backgroundColor: '#3a2119', backgroundImage: '' }, cards: { className: 'dark editable', type: 'gallery', layout: 'wide', backgroundColor: '#241713', backgroundImage: '', paddingTop: 56, paddingBottom: 56 } };
    const cancel = () => { v2.store.cancelPreview(); panel.remove(); };
    const preview = design => { v2.actions.previewBatch('Abschnitts-Design Vorschau', [{ name: 'setSectionDesign', payload: [section.id, design] }]); panel.querySelector('[data-accept]').disabled = false; };
    panel.querySelector('[data-close]').onclick = cancel; panel.querySelector('[data-cancel]').onclick = cancel;
    panel.querySelectorAll('[data-template]').forEach(node => node.onclick = () => preview(presets[node.dataset.template]));
    const mediaSelect = panel.querySelector('[data-background-image]');
    (window.KPEditorV2Media?.collect() || []).forEach(item => { const option = document.createElement('option'); option.value = 'url("' + item.src + '")'; option.textContent = item.alt; mediaSelect.append(option); });
    panel.querySelector('[data-type]').value = original.type || 'content'; panel.querySelector('[data-layout]').value = original.layout || 'normal';
    panel.querySelector('[data-background]').value = /^#[0-9a-f]{6}$/i.test(original.backgroundColor || '') ? original.backgroundColor : '#2b1c16';
    mediaSelect.value = original.backgroundImage || '';
    const setRange = (name, value) => { panel.querySelector('[data-' + name + ']').value = value; panel.querySelector('[data-' + name + '-out]').value = value; };
    setRange('height', Number(original.minHeight) || 0); setRange('top', Number(original.paddingTop) || 72); setRange('bottom', Number(original.paddingBottom) || 72);
    panel.querySelector('[data-type]').onchange = event => preview({ type: event.target.value });
    panel.querySelector('[data-layout]').onchange = event => preview({ layout: event.target.value });
    panel.querySelector('[data-background]').oninput = event => preview({ backgroundColor: event.target.value });
    mediaSelect.onchange = event => preview({ backgroundImage: event.target.value, backgroundSize: event.target.value ? 'cover' : '', backgroundPosition: event.target.value ? 'center' : '' });
    panel.querySelector('[data-height]').oninput = event => { panel.querySelector('[data-height-out]').value = event.target.value; preview({ minHeight: Number(event.target.value) }); };
    panel.querySelector('[data-top]').oninput = event => { panel.querySelector('[data-top-out]').value = event.target.value; preview({ paddingTop: Number(event.target.value) }); };
    panel.querySelector('[data-bottom]').oninput = event => { panel.querySelector('[data-bottom-out]').value = event.target.value; preview({ paddingBottom: Number(event.target.value) }); };
    panel.querySelector('[data-accept]').onclick = () => { v2.store.commitPreview(); panel.remove(); feedback('Abschnitts-Design übernommen · Rückgängig möglich'); };
    document.body.append(panel);
  }
  function headerSheet() {
    closeSheet();
    const panel = document.createElement('div'); panel.id = 'kpV2HeaderSheet';
    panel.innerHTML = '<header><div><strong>Header gestalten</strong><small>Marke, Navigation und Höhe</small></div><button type="button" data-close>×</button></header><div class="kp-v2-header-grid"><button type="button" data-header="original">Original</button><button type="button" data-header="warm">Warmes Theater</button><button type="button" data-header="dark">Nachtbühne</button></div><label>Headerhöhe <output data-out>64</output> px<input data-height type="range" min="56" max="140" value="64"></label><footer><button type="button" data-cancel>Verwerfen</button><button type="button" data-accept disabled>Übernehmen</button></footer>';
    const presets = { original: { preset: 'original', background: '#17100d', color: '#fff7ef', height: 64 }, warm: { preset: 'warm', background: '#4b2318', color: '#fff7ef', height: 76 }, dark: { preset: 'night', background: '#080d18', color: '#f8fafc', height: 70 } };
    const cancel = () => { v2.store.cancelPreview(); panel.remove(); };
    const preview = design => { v2.actions.previewBatch('Header-Design Vorschau', [{ name: 'setHeaderDesign', payload: [design] }]); panel.querySelector('[data-accept]').disabled = false; };
    panel.querySelector('[data-close]').onclick = cancel; panel.querySelector('[data-cancel]').onclick = cancel;
    panel.querySelectorAll('[data-header]').forEach(node => node.onclick = () => preview(presets[node.dataset.header]));
    panel.querySelector('[data-height]').oninput = event => { panel.querySelector('[data-out]').value = event.target.value; preview({ height: Number(event.target.value) }); };
    panel.querySelector('[data-accept]').onclick = () => { v2.store.commitPreview(); panel.remove(); feedback('Header-Design übernommen · Rückgängig möglich'); };
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
    panel.querySelector('[data-add]').onclick = () => { const sectionId = unique('section'), label = 'Neue Seite'; v2.actions.createSection('home', { id: sectionId, design: { className: 'dark editable' }, elements: [{ id: unique('el'), type: 'heading', order: 0, content: { text: label }, styles: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, source: { tag: 'h2', className: '' } }] }); v2.actions.createNavigationItem(label, `#${sectionId}`); render(); };
    document.body.append(panel); render();
  }
  function layerSheet(current) {
    closeSheet();
    const panel = document.createElement('div'); panel.id = 'kpV2LayerSheet';
    panel.innerHTML = '<div class="kp-v2-sheet-scrim"></div><div class="kp-v2-sheet" role="dialog" aria-modal="true" aria-labelledby="kpV2LayerTitle"><header><div><strong id="kpV2LayerTitle">Ebenen</strong><small>Vorne liegende Elemente stehen oben.</small></div><button type="button" data-close aria-label="Schließen">×</button></header><div data-layers></div><footer><button type="button" data-front>Ganz nach vorne</button><button type="button" data-forward>Eine Ebene vor</button><button type="button" data-backward>Eine Ebene zurück</button><button type="button" data-back>Ganz nach hinten</button></footer></div>';
    let selectedId = current.element.id;
    const elementLabel = element => {
      const type = { image: 'Bild', heading: 'Überschrift', text: 'Text', button: 'Button' }[element.type] || 'Element';
      const content = element.type === 'image' ? element.content?.alt : element.content?.text;
      return `${type}: ${String(content || 'Ohne Bezeichnung').trim().slice(0, 54)}`;
    };
    const renderLayers = () => {
      const section = v2.store.get().document.pages.flatMap(page => page.sections).find(item => item.id === current.section.id);
      const elements = [...(section?.elements || [])].sort((a, b) => (b.order || 0) - (a.order || 0));
      const host = panel.querySelector('[data-layers]'); host.replaceChildren();
      elements.forEach(element => {
        const row = document.createElement('button'); row.type = 'button'; row.dataset.elementId = element.id; row.setAttribute('aria-pressed', String(element.id === selectedId));
        const label = document.createElement('span'); label.textContent = elementLabel(element); row.append(label);
        row.onclick = () => { selectedId = element.id; v2.actions.selectElement(element.id); renderLayers(); q(`[data-v2-id="${element.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
        host.append(row);
      });
      const modelOrder = [...(section?.elements || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
      const index = modelOrder.findIndex(element => element.id === selectedId);
      panel.querySelector('[data-front]').disabled = index < 0 || index === modelOrder.length - 1;
      panel.querySelector('[data-forward]').disabled = index < 0 || index === modelOrder.length - 1;
      panel.querySelector('[data-backward]').disabled = index <= 0;
      panel.querySelector('[data-back]').disabled = index <= 0;
    };
    const move = direction => { v2.actions.moveLayer(selectedId, direction); renderLayers(); feedback('Ebene geändert · Rückgängig möglich'); };
    panel.querySelector('[data-front]').onclick = () => move('front'); panel.querySelector('[data-forward]').onclick = () => move('forward');
    panel.querySelector('[data-backward]').onclick = () => move('backward'); panel.querySelector('[data-back]').onclick = () => move('back');
    panel.querySelector('[data-close]').onclick = closeSheet; panel.querySelector('.kp-v2-sheet-scrim').onclick = closeSheet;
    document.body.append(panel); renderLayers(); panel.querySelector('[data-close]').focus();
  }
  function moreSheet(current) {
    closeSheet();
    const panel = document.createElement('div'); panel.id = 'kpV2CommandSheet';
    panel.innerHTML = '<div class="kp-v2-sheet-scrim"></div><div class="kp-v2-sheet"><strong>Weitere Aktionen</strong></div>';
    const host = panel.querySelector('.kp-v2-sheet');
    const add = (label, handler) => { const node = button(label, 'sheet'); node.onclick = () => { handler(); closeSheet(); }; host.append(node); };
    if (current.kind === 'section') { add('Abschnitt nach oben', () => v2.actions.moveSection(current.section.id, -1)); add('Abschnitt nach unten', () => v2.actions.moveSection(current.section.id, 1)); add('Abschnitt duplizieren', () => v2.actions.duplicateSection(current.section.id)); add('Abschnitt löschen', () => v2.actions.deleteSection(current.section.id)); }
    else if (current.kind === 'header') { add('Header-Höhe und Farben', headerSheet); add('Navigation bearbeiten', navigationSheet); }
    else { if (current.kind === 'image') { add('Bild vergrößern', () => v2.actions.resizeElement(current.element.id, (current.element.transform?.scale || 1) * 1.15)); add('Bild verkleinern', () => v2.actions.resizeElement(current.element.id, (current.element.transform?.scale || 1) / 1.15)); add('90° drehen', () => v2.actions.rotateElement(current.element.id, (current.element.transform?.rotation || 0) + 90)); add('Bildrand zuschneiden', () => v2.actions.setImageAdjustments(current.element.id, { crop: { x: .08, y: .08, width: .84, height: .84 } })); add('Bild zurücksetzen', () => v2.actions.resetImage(current.element.id)); } add('Ebenen verwalten', () => layerSheet(current)); add('Duplizieren', () => v2.actions.duplicateElement(current.element.id)); add('Löschen', () => v2.actions.deleteElement(current.element.id)); }
    panel.querySelector('.kp-v2-sheet-scrim').onclick = closeSheet; document.body.append(panel);
  }
  function addSection() {
    closeSheet();
    const panel = document.createElement('div'); panel.id = 'kpV2SectionSheet';
    panel.innerHTML = '<header><div><strong>Neuer Abschnitt</strong><small>Wähle eine Vorlage, Inhalte bleiben bearbeitbar</small></div><button type="button" data-close>×</button></header><div class="kp-v2-template-grid"><button type="button" data-template="text">Textbereich</button><button type="button" data-template="image">Bildbereich</button><button type="button" data-template="cta">Call-to-Action</button></div>';
    const create = template => { const sectionId = unique('section'), headingId = unique('el'), textId = unique('el'), imageId = unique('el'); const elements = [{ id: headingId, type: 'heading', order: 0, content: { text: template === 'cta' ? 'Ihr nächster Auftritt' : template === 'image' ? 'Ein neuer Bühnenmoment' : 'Neue Überschrift' }, styles: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, source: { tag: 'h2', className: '' } }, { id: textId, type: 'text', order: 1, content: { text: template === 'cta' ? 'Erzählen Sie uns von Ihrer Veranstaltung.' : 'Hier kann der neue Inhalt direkt bearbeitet werden.' }, styles: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, source: { tag: 'p', className: '' } }]; if (template === 'image') elements.push({ id: imageId, type: 'image', order: 2, content: { src: 'assets/header.webp', alt: 'Koblenzer Puppenspiele' }, styles: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, source: { tag: 'img', className: 'kp-added-image' } }); v2.actions.createSection('home', { id: sectionId, design: { className: template === 'cta' ? 'dark editable' : 'editable' }, elements }); v2.store.setSelection({ sectionId }); panel.remove(); q(`[data-v2-section-id="${sectionId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); feedback('Neuer Abschnitt erstellt'); };
    panel.querySelector('[data-close]').onclick = () => panel.remove(); panel.querySelectorAll('[data-template]').forEach(node => node.onclick = () => create(node.dataset.template)); document.body.append(panel);
  }
  function render(state) {
    document.body.classList.toggle('kp-v2-ui', state.mode === 'edit');
    if (state.mode === 'edit') document.querySelectorAll('[contenteditable]').forEach(node => node.setAttribute('contenteditable', 'false'));
    const bar = toolbar(), current = locate(state); bar.replaceChildren();
    if (state.mode !== 'edit' || !current) { bar.hidden = true; return; }
    bar.hidden = false;
    const add = (label, action, handler, primary = false) => { const node = button(label, action, primary); node.onclick = event => { event.preventDefault(); event.stopPropagation(); handler(); }; bar.append(node); };
    if (current.kind === 'image') { add('Ersetzen', 'replace', () => window.KPEditorV2Media?.open(current.element.id), true); add('Bild bearbeiten', 'edit', () => window.kpProImageEditor?.open(current.node)); add('Duplizieren', 'duplicate', () => v2.actions.duplicateElement(current.element.id)); }
    else if (['text', 'heading', 'button'].includes(current.kind)) { add(current.kind === 'button' ? 'Button bearbeiten' : 'Text bearbeiten', 'edit', () => window.kpElementSheet?.open(current.node), true); add('Duplizieren', 'duplicate', () => v2.actions.duplicateElement(current.element.id)); }
    else if (current.kind === 'section') { add('Design wechseln', 'design', () => sectionSheet(current.section)); add('Duplizieren', 'duplicate', () => v2.actions.duplicateSection(current.section.id)); }
    else if (current.kind === 'header') { add('Navigation', 'navigation', navigationSheet, true); add('Header-Design', 'header-design', headerSheet); }
    if (current.element && current.section) add('Ebenen', 'layers', () => layerSheet(current));
    add('Mehr', 'more', () => moreSheet(current));
  }
  function bindMainControls() {
    const replace = (selector, label, handler) => { const old = q(selector); if (!old) return; const fresh = old.cloneNode(true); fresh.textContent = label; old.replaceWith(fresh); fresh.onclick = handler; };
    replace('#addSection', '＋ Abschnitt', addSection);
    replace('#undo', '↶', () => v2.store.undo()); replace('#redo', '↷', () => v2.store.redo());
    replace('#cloudSave', '▣ Auf Gerät speichern', () => { window.KPEditorV2Backup?.save() || v2.persistence.save(); feedback('Auf diesem Gerät gespeichert ✓'); });
    replace('#save', '▣ Gerät sichern', () => { window.KPEditorV2Backup?.save() || v2.persistence.save(); feedback('Auf diesem Gerät gespeichert ✓'); });
    const host = q('#editor .tool-main'); if (host && !q('#kpV2AI')) { const ai = button('✦ KI-Assistent', 'ai'); ai.id = 'kpV2AI'; ai.onclick = aiSheet; host.append(ai); }
    if (host && !q('#kpV2Theme')) { const design = button('◐ Website-Design', 'theme'); design.id = 'kpV2Theme'; design.onclick = themeSheet; host.append(design); }
    if (host && !q('#kpV2Viewport')) { const viewport = button('▱ Responsive Ansicht', 'viewport'); viewport.id = 'kpV2Viewport'; viewport.onclick = viewportSheet; host.append(viewport); }
    if (host && !q('#kpV2BackupExport')) { const backup = button('⇩ Sicherung', 'backup'); backup.id = 'kpV2BackupExport'; backup.onclick = () => { window.KPEditorV2Backup?.export(); feedback('JSON-Sicherung heruntergeladen ✓'); }; host.append(backup); }
    if (host && !q('#kpV2BackupImport')) { const backup = button('⇧ Import', 'backup'); backup.id = 'kpV2BackupImport'; backup.onclick = () => window.KPEditorV2Backup?.import(); host.append(backup); }
    if (host && !q('#kpV2BackupHistory')) { const backup = button('◷ Lokale Versionen', 'backup'); backup.id = 'kpV2BackupHistory'; backup.onclick = () => window.KPEditorV2Backup?.history(); host.append(backup); }
  }
  const init = () => { bindMainControls(); v2.store.subscribe(render); render(v2.store.get()); window.addEventListener('kp-editor-restored', () => render(v2.store.get())); window.addEventListener('kp-v2-feedback', event => feedback(event.detail || 'Aktualisiert')); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
  window.KPEditorV2Overlay = Object.freeze({ render, navigationSheet, layerSheet, addSection, aiSheet, themeSheet });
})();
