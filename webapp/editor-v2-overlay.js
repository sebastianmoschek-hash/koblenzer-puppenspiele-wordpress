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
    if (!bar) { bar = document.createElement('div'); bar.id = 'kpV2Toolbar'; bar.hidden = true; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Werkzeuge für das ausgewählte Element'); document.body.append(bar); }
    return bar;
  }
  function closeSheet() { ['#kpV2CommandSheet', '#kpV2NavSheet', '#kpV2PageSheet', '#kpV2ViewportSheet', '#kpV2SectionSheet', '#kpV2HeaderSheet', '#kpV2LayerSheet', '#kpV2NavDeleteSheet', '#kpV2PageDeleteSheet'].forEach(selector => q(selector)?.remove()); }
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
    panel.innerHTML = '<header><div><strong>Responsive Ansicht</strong><small>Vorschau und Bearbeitungsbereich getrennt wählen</small></div><button type="button" data-close>×</button></header><div class="kp-v2-viewport-grid"><button type="button" data-viewport="mobile">▯ Smartphone</button><button type="button" data-viewport="tablet">▯ Tablet</button><button type="button" data-viewport="desktop">▱ Desktop</button></div><strong>Änderungen speichern in</strong><div class="kp-v2-viewport-grid"><button type="button" data-scope="base">Basis für alle</button><button type="button" data-scope="mobile">Smartphone</button><button type="button" data-scope="tablet">Tablet</button><button type="button" data-scope="desktop">Desktop</button></div><small>Eine Bereichsänderung überschreibt nur diesen Breakpoint; Basiswerte bleiben erhalten.</small>';
    panel.querySelector('[data-close]').onclick = closeSheet;
    panel.querySelectorAll('[data-viewport]').forEach(node => node.onclick = () => { v2.store.setViewport(node.dataset.viewport); document.body.dataset.v2Viewport = node.dataset.viewport; panel.querySelectorAll('[data-viewport]').forEach(item => item.setAttribute('aria-pressed', String(item === node))); feedback(`${node.textContent.trim()}-Vorschau aktiv`); });
    panel.querySelectorAll('[data-scope]').forEach(node => { node.setAttribute('aria-pressed', String(v2.store.get().responsiveScope === node.dataset.scope)); node.onclick = () => { v2.store.setResponsiveScope(node.dataset.scope); panel.querySelectorAll('[data-scope]').forEach(item => item.setAttribute('aria-pressed', String(item === node))); feedback(`${node.textContent.trim()} wird bearbeitet`); }; });
    document.body.append(panel);
  }
  function sectionSheet(section) {
    closeSheet();
    const panel = document.createElement('div'); panel.id = 'kpV2SectionSheet';
    panel.innerHTML = '<header><div><strong>Abschnitt gestalten</strong><small>Design ändern, Inhalte bleiben erhalten</small></div><button type="button" data-close>×</button></header><div class="kp-v2-section-grid"><button type="button" data-template="plain">Ruhig</button><button type="button" data-template="dark">Bühne</button><button type="button" data-template="warm">Warm</button><button type="button" data-template="cards">Kartenfläche</button></div><div class="kp-v2-section-fields"><label>Abschnittstyp<select data-type><option value="content">Inhalt</option><option value="hero">Aufmacher</option><option value="gallery">Galerie</option><option value="cta">Call-to-Action</option></select></label><label>Inhaltsbreite<select data-layout><option value="normal">Normal</option><option value="narrow">Schmal</option><option value="wide">Breit</option></select></label><label>Hintergrundfarbe<input data-background type="color"></label><label>Hintergrundbild<select data-background-image><option value="">Keins</option></select></label></div><label>Mindesthöhe <output data-height-out>0</output> px<input data-height type="range" min="0" max="900" step="10" value="0"></label><label>Abstand oben <output data-top-out>72</output> px<input data-top type="range" min="0" max="180" value="72"></label><label>Abstand unten <output data-bottom-out>72</output> px<input data-bottom type="range" min="0" max="180" value="72"></label><footer><button type="button" data-cancel>Verwerfen</button><button type="button" data-accept disabled>Übernehmen</button></footer>';
    const original = { ...section.design };
    const presets = { plain: { className: 'editable', type: 'content', layout: 'normal', backgroundColor: '#2b1c16', backgroundImage: '' }, dark: { className: 'dark editable', type: 'content', layout: 'normal', backgroundColor: '#17100d', backgroundImage: '' }, warm: { className: 'editable', type: 'content', layout: 'normal', backgroundColor: '#3a2119', backgroundImage: '' }, cards: { className: 'dark editable', type: 'gallery', layout: 'wide', backgroundColor: '#241713', backgroundImage: '', paddingTop: 56, paddingBottom: 56 } };
    const cancel = () => { v2.store.cancelPreview(); panel.remove(); };
    const preview = design => { v2.actions.previewBatch('Abschnitts-Design Vorschau', [{ name: 'setSectionDesign', payload: [section.id, design, v2.store.get().responsiveScope] }]); panel.querySelector('[data-accept]').disabled = false; };
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
    panel.innerHTML = '<header><div><strong>Header gestalten</strong><small>Logo, Titel, Navigation und Layout</small></div><button type="button" data-close>×</button></header><div class="kp-v2-header-grid"><button type="button" data-header="original">Original</button><button type="button" data-header="warm">Warmes Theater</button><button type="button" data-header="dark">Nachtbühne</button></div><div class="kp-v2-header-fields"><label>Titel<input data-title type="text"></label><label>Layout<select data-layout><option value="spread">Marke links</option><option value="centered">Zentriert</option><option value="stacked">Untereinander</option></select></label><label>Hintergrundfarbe<input data-background type="color"></label><label>Hintergrundbild<select data-background-image><option value="">Keins</option></select></label><label>Logo<select data-logo><option value="">Kein zusätzliches Logo</option></select></label><label>Logoposition<select data-logo-position><option value="left">Links</option><option value="right">Rechts</option></select></label><label>Navigation<select data-nav-position><option value="start">Links</option><option value="center">Mittig</option><option value="end">Rechts</option></select></label></div><label>Headerhöhe <output data-height-out>64</output> px<input data-height type="range" min="56" max="180" value="64"></label><label>Logogröße <output data-logo-size-out>42</output> px<input data-logo-size type="range" min="24" max="96" value="42"></label><label>Menüabstand <output data-gap-out>18</output> px<input data-gap type="range" min="4" max="44" value="18"></label><footer><button type="button" data-cancel>Verwerfen</button><button type="button" data-accept disabled>Übernehmen</button></footer>';
    const current = { ...(v2.store.get().document.header?.design || {}) };
    const originalTitle = v2.store.get().document.header?.elements?.[0]?.content?.text || 'Koblenzer Puppenspiele';
    const presets = { original: { preset: 'original', backgroundColor: '#17100d', backgroundImage: '', color: '#fff7ef', height: 64, layout: 'spread', navPosition: 'end', gap: 18 }, warm: { preset: 'warm', backgroundColor: '#4b2318', backgroundImage: '', color: '#fff7ef', height: 76, layout: 'spread', navPosition: 'end', gap: 20 }, dark: { preset: 'night', backgroundColor: '#080d18', backgroundImage: '', color: '#f8fafc', height: 70, layout: 'centered', navPosition: 'center', gap: 16 } };
    const cancel = () => { v2.store.cancelPreview(); panel.remove(); };
    const preview = design => { v2.actions.previewBatch('Header-Design Vorschau', [{ name: 'setHeaderDesign', payload: [design, v2.store.get().responsiveScope] }]); panel.querySelector('[data-accept]').disabled = false; };
    panel.querySelector('[data-close]').onclick = cancel; panel.querySelector('[data-cancel]').onclick = cancel;
    panel.querySelectorAll('[data-header]').forEach(node => node.onclick = () => preview(presets[node.dataset.header]));
    const images = window.KPEditorV2Media?.collect() || [], backgroundSelect = panel.querySelector('[data-background-image]'), logoSelect = panel.querySelector('[data-logo]');
    images.forEach(item => {
      const backgroundOption = document.createElement('option'); backgroundOption.value = 'url("' + item.src + '")'; backgroundOption.textContent = item.alt; backgroundSelect.append(backgroundOption);
      const logoOption = document.createElement('option'); logoOption.value = item.src; logoOption.textContent = item.alt; logoSelect.append(logoOption);
    });
    panel.querySelector('[data-title]').value = current.title || originalTitle;
    panel.querySelector('[data-layout]').value = current.layout || 'spread'; panel.querySelector('[data-logo-position]').value = current.logoPosition || 'left'; panel.querySelector('[data-nav-position]').value = current.navPosition || 'end';
    panel.querySelector('[data-background]').value = /^#[0-9a-f]{6}$/i.test(current.backgroundColor || current.background || '') ? (current.backgroundColor || current.background) : '#17100d';
    backgroundSelect.value = current.backgroundImage || ''; logoSelect.value = current.logoSrc || '';
    const setRange = (name, value) => { panel.querySelector('[data-' + name + ']').value = value; panel.querySelector('[data-' + name + '-out]').value = value; };
    setRange('height', Number(current.height) || 64); setRange('logo-size', Number(current.logoSize) || 42); setRange('gap', Number(current.gap) || 18);
    panel.querySelector('[data-title]').oninput = event => preview({ title: event.target.value });
    panel.querySelector('[data-layout]').onchange = event => preview({ layout: event.target.value });
    panel.querySelector('[data-background]').oninput = event => preview({ backgroundColor: event.target.value });
    backgroundSelect.onchange = event => preview({ backgroundImage: event.target.value });
    logoSelect.onchange = event => preview({ logoSrc: event.target.value });
    panel.querySelector('[data-logo-position]').onchange = event => preview({ logoPosition: event.target.value });
    panel.querySelector('[data-nav-position]').onchange = event => preview({ navPosition: event.target.value });
    panel.querySelector('[data-height]').oninput = event => { panel.querySelector('[data-height-out]').value = event.target.value; preview({ height: Number(event.target.value) }); };
    panel.querySelector('[data-logo-size]').oninput = event => { panel.querySelector('[data-logo-size-out]').value = event.target.value; preview({ logoSize: Number(event.target.value) }); };
    panel.querySelector('[data-gap]').oninput = event => { panel.querySelector('[data-gap-out]').value = event.target.value; preview({ gap: Number(event.target.value) }); };
    panel.querySelector('[data-accept]').onclick = () => { v2.store.commitPreview(); panel.remove(); feedback('Header-Design übernommen · Rückgängig möglich'); };
    document.body.append(panel);
  }
  function feedback(text) { const status = q('#status'); if (status) status.textContent = text; }
  function pageSheet() {
    closeSheet();
    const panel = document.createElement('div'); panel.id = 'kpV2PageSheet';
    panel.innerHTML = '<header><div><strong id="kpV2PageTitle">Seiten verwalten</strong><small>Öffnen, benennen, sortieren, duplizieren oder löschen</small></div><button type="button" data-close aria-label="Schließen">×</button></header><div data-pages></div><footer><label>Neue Seite<input type="text" data-new-title value="Neue Seite" maxlength="120"></label><label class="kp-v2-check"><input type="checkbox" data-new-nav checked> Im Menü anzeigen</label><button type="button" data-create class="primary">＋ Seite anlegen</button></footer>';
    let draggedId = '';
    const render = () => {
      const state = v2.store.get(), pages = [...state.document.pages].sort((a, b) => (a.order || 0) - (b.order || 0)), host = panel.querySelector('[data-pages]');
      host.replaceChildren();
      pages.forEach((page, index) => {
        const linked = state.document.navigation.items.filter(item => { const target = v2.resolveNavigationTarget(state.document, item); return target.type === 'page' && target.pageId === page.id; }).length;
        const row = document.createElement('div'); row.className = 'kp-v2-page-row'; row.dataset.pageId = page.id; row.draggable = true; row.classList.toggle('active', page.id === state.activePageId);
        row.innerHTML = '<span class="kp-v2-page-grip" aria-hidden="true">⋮⋮</span><button type="button" data-open></button><label>Titel<input type="text" data-title maxlength="120"></label><label>Pfad<input type="text" data-path></label><small data-linked></small><button type="button" data-up aria-label="Seite nach oben">↑</button><button type="button" data-down aria-label="Seite nach unten">↓</button><button type="button" data-duplicate aria-label="Seite duplizieren">⧉</button><button type="button" data-delete aria-label="Seite löschen">×</button>';
        row.querySelector('[data-open]').textContent = page.id === state.activePageId ? 'Geöffnet' : 'Öffnen'; row.querySelector('[data-open]').setAttribute('aria-pressed', String(page.id === state.activePageId));
        row.querySelector('[data-title]').value = page.title || page.metadata?.title || 'Seite'; row.querySelector('[data-path]').value = page.path || '';
        row.querySelector('[data-linked]').textContent = linked ? `${linked} Menüeintrag${linked === 1 ? '' : 'e'} verbunden` : 'Nicht im Menü';
        row.querySelector('[data-open]').onclick = () => { v2.actions.openPage(page.id); render(); q('main')?.scrollIntoView({ block: 'start' }); feedback(`Seite „${page.title}“ geöffnet`); };
        row.querySelector('[data-title]').onchange = event => { v2.actions.renamePage(page.id, event.target.value, true); render(); };
        row.querySelector('[data-path]').onchange = event => { v2.actions.setPageMetadata(page.id, { path: event.target.value }); render(); };
        row.querySelector('[data-up]').disabled = index === 0; row.querySelector('[data-up]').onclick = () => { v2.actions.movePage(page.id, -1); render(); };
        row.querySelector('[data-down]').disabled = index === pages.length - 1; row.querySelector('[data-down]').onclick = () => { v2.actions.movePage(page.id, 1); render(); };
        row.querySelector('[data-duplicate]').onclick = () => { v2.actions.duplicatePage(page.id, panel.querySelector('[data-new-nav]').checked); render(); feedback('Seite dupliziert · Rückgängig möglich'); };
        row.querySelector('[data-delete]').disabled = pages.length <= 1; row.querySelector('[data-delete]').onclick = () => deletePageChoice(page, linked, render);
        row.ondragstart = () => { draggedId = page.id; row.classList.add('dragging'); }; row.ondragend = () => row.classList.remove('dragging');
        row.ondragover = event => event.preventDefault(); row.ondrop = event => { event.preventDefault(); if (draggedId) { v2.actions.reorderPage(draggedId, index); render(); } };
        host.append(row);
      });
    };
    panel.querySelector('[data-close]').onclick = closeSheet;
    panel.querySelector('[data-create]').onclick = () => { const input = panel.querySelector('[data-new-title]'), title = input.value.trim() || 'Neue Seite'; v2.actions.createPage({ title }, panel.querySelector('[data-new-nav]').checked); input.value = 'Neue Seite'; render(); feedback(`Seite „${title}“ angelegt · Rückgängig möglich`); };
    document.body.append(panel); render(); panel.querySelector('[data-close]').focus();
  }
  function deletePageChoice(page, linkedCount, refresh) {
    q('#kpV2PageDeleteSheet')?.remove();
    const panel = document.createElement('div'); panel.id = 'kpV2PageDeleteSheet';
    panel.innerHTML = '<div class="kp-v2-sheet-scrim"></div><div class="kp-v2-sheet" role="dialog" aria-modal="true" aria-labelledby="kpV2PageDeleteTitle"><strong id="kpV2PageDeleteTitle"></strong><small data-copy></small><button type="button" data-page>Nur Seite löschen</button><button type="button" data-both>Seite und verbundene Menüeinträge löschen</button><button type="button" data-cancel>Abbrechen</button></div>';
    panel.querySelector('strong').textContent = `Seite „${page.title}“ löschen?`;
    panel.querySelector('[data-copy]').textContent = linkedCount ? `${linkedCount} Menüeintrag${linkedCount === 1 ? '' : 'e'} verweist auf diese Seite. Beim Löschen nur der Seite werden diese Verknüpfungen gelöst.` : 'Diese Seite besitzt keinen verbundenen Menüeintrag.';
    const finish = removeNavigation => { v2.actions.deletePage(page.id, removeNavigation); panel.remove(); refresh(); feedback('Seite gelöscht · Rückgängig möglich'); };
    panel.querySelector('[data-page]').onclick = () => finish(false); panel.querySelector('[data-both]').onclick = () => finish(true);
    panel.querySelector('[data-cancel]').onclick = () => panel.remove(); panel.querySelector('.kp-v2-sheet-scrim').onclick = () => panel.remove();
    document.body.append(panel); panel.querySelector('[data-cancel]').focus();
  }
  function navigationSheet() {
    closeSheet();
    const panel = document.createElement('div'); panel.id = 'kpV2NavSheet';
    panel.innerHTML = '<header><div><strong id="kpV2NavTitle">Navigation bearbeiten</strong><small>Menüpunkte mit Seiten, Abschnitten oder freien Links verbinden</small></div><button type="button" data-close aria-label="Schließen">×</button></header><div data-items></div><footer><label>Bezeichnung<input type="text" data-new-label value="Neuer Menüpunkt" maxlength="120"></label><div><button type="button" data-add>＋ Abschnitt + Menü</button><button type="button" data-add-page>＋ Seite + Menü</button><button type="button" data-add-free>＋ Freier Link</button></div></footer>';
    let draggedId = '';
    const render = () => {
      const state = v2.store.get(), host = panel.querySelector('[data-items]'); host.replaceChildren();
      state.document.navigation.items.forEach((item, index, items) => {
        const target = v2.resolveNavigationTarget(state.document, item), hasTarget = target.exists && ['page', 'section'].includes(target.type);
        const row = document.createElement('div'); row.className = 'kp-v2-nav-row'; row.draggable = true; row.dataset.itemId = item.id;
        row.innerHTML = '<span class="kp-v2-nav-grip" aria-hidden="true">⋮⋮</span><label>Text<input data-label aria-label="Menütext"></label><label>Ziel<select data-target aria-label="Menüziel"><option value="free">Freier Link</option></select></label><label class="kp-v2-nav-href">Link<input data-href aria-label="Linkziel"></label><small data-status></small><button type="button" data-up aria-label="Nach oben">↑</button><button type="button" data-down aria-label="Nach unten">↓</button><button type="button" data-delete aria-label="Löschen">×</button>';
        row.querySelector('[data-label]').value = item.label || ''; row.querySelector('[data-href]').value = item.href || '';
        const select = row.querySelector('[data-target]');
        state.document.pages.forEach(page => {
          const pageOption = document.createElement('option'); pageOption.value = `page:${encodeURIComponent(page.id)}`; pageOption.textContent = `Seite: ${page.title}`; select.append(pageOption);
          page.sections.forEach(section => { const option = document.createElement('option'); option.value = `section:${encodeURIComponent(page.id)}:${encodeURIComponent(section.id)}`; const heading = section.elements.find(element => element.type === 'heading')?.content?.text; option.textContent = `Abschnitt: ${heading || section.id} (${page.title})`; select.append(option); });
        });
        select.value = target.type === 'page' ? `page:${encodeURIComponent(target.pageId)}` : target.type === 'section' ? `section:${encodeURIComponent(target.pageId)}:${encodeURIComponent(target.sectionId)}` : 'free';
        row.querySelector('[data-status]').textContent = target.type === 'page' ? (target.exists ? 'Seite verbunden' : 'Seite fehlt') : target.type === 'section' ? (target.exists ? 'Abschnitt verbunden' : 'Abschnitt fehlt') : 'Externes/freies Ziel';
        row.querySelector('[data-href]').disabled = hasTarget;
        row.querySelector('[data-label]').onchange = event => v2.actions.updateNavigationItem(item.id, { label: event.target.value });
        row.querySelector('[data-href]').onchange = event => { v2.actions.unlinkNavigationItem(item.id, event.target.value); render(); };
        select.onchange = event => {
          const [kind, pageId, sectionId] = event.target.value.split(':').map((part, partIndex) => partIndex ? decodeURIComponent(part) : part);
          if (kind === 'page') v2.actions.linkNavigationToPage(item.id, pageId);
          else if (kind === 'section') v2.actions.linkNavigationToSection(item.id, pageId, sectionId);
          else v2.actions.unlinkNavigationItem(item.id, item.href || '#');
          render();
        };
        row.querySelector('[data-up]').disabled = index === 0; row.querySelector('[data-up]').onclick = () => { v2.actions.moveNavigationItem(item.id, -1); render(); };
        row.querySelector('[data-down]').disabled = index === items.length - 1; row.querySelector('[data-down]').onclick = () => { v2.actions.moveNavigationItem(item.id, 1); render(); };
        row.querySelector('[data-delete]').onclick = () => deleteNavigationChoice(item, target, render);
        row.ondragstart = () => { draggedId = item.id; row.classList.add('dragging'); }; row.ondragend = () => row.classList.remove('dragging');
        row.ondragover = event => event.preventDefault(); row.ondrop = event => { event.preventDefault(); if (draggedId) { v2.actions.reorderNavigationItem(draggedId, index); render(); } };
        host.append(row);
      });
    };
    const newLabel = () => panel.querySelector('[data-new-label]').value.trim() || 'Neuer Menüpunkt';
    panel.querySelector('[data-close]').onclick = closeSheet;
    panel.querySelector('[data-add]').onclick = () => { v2.actions.createNavigationSection(newLabel(), v2.store.get().activePageId); render(); };
    panel.querySelector('[data-add-page]').onclick = () => { v2.actions.createNavigationPage(newLabel()); render(); };
    panel.querySelector('[data-add-free]').onclick = () => { v2.actions.createNavigationItem(newLabel(), '#'); render(); };
    document.body.append(panel); render(); panel.querySelector('[data-close]').focus();
  }
  function deleteNavigationChoice(item, target, refresh) {
    q('#kpV2NavDeleteSheet')?.remove();
    const panel = document.createElement('div'); panel.id = 'kpV2NavDeleteSheet';
    panel.innerHTML = '<div class="kp-v2-sheet-scrim"></div><div class="kp-v2-sheet" role="dialog" aria-modal="true"><strong>Menüpunkt löschen?</strong><small data-copy></small><button type="button" data-nav>Nur Menüpunkt löschen</button><button type="button" data-both></button><button type="button" data-cancel>Abbrechen</button></div>';
    const targetLabel = target.type === 'page' ? 'Seite' : 'Abschnitt';
    panel.querySelector('[data-copy]').textContent = `Du kannst nur „${item.label}“ entfernen oder zusätzlich ${target.type === 'page' ? 'die verbundene Seite' : 'den verbundenen Abschnitt'}.`;
    panel.querySelector('[data-both]').textContent = `Menüpunkt und ${targetLabel} löschen`;
    panel.querySelector('[data-both]').disabled = !target.exists || !['page', 'section'].includes(target.type) || (target.type === 'page' && v2.store.get().document.pages.length <= 1);
    const finish = both => { v2.actions.deleteNavigationTarget(item.id, both); panel.remove(); refresh(); };
    panel.querySelector('[data-nav]').onclick = () => finish(false); panel.querySelector('[data-both]').onclick = () => finish(true);
    panel.querySelector('[data-cancel]').onclick = () => panel.remove(); panel.querySelector('.kp-v2-sheet-scrim').onclick = () => panel.remove();
    document.body.append(panel); panel.querySelector('[data-cancel]').focus();
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
    const create = template => { const sectionId = unique('section'), headingId = unique('el'), textId = unique('el'), imageId = unique('el'); const elements = [{ id: headingId, type: 'heading', order: 0, content: { text: template === 'cta' ? 'Ihr nächster Auftritt' : template === 'image' ? 'Ein neuer Bühnenmoment' : 'Neue Überschrift' }, styles: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, source: { tag: 'h2', className: '' } }, { id: textId, type: 'text', order: 1, content: { text: template === 'cta' ? 'Erzählen Sie uns von Ihrer Veranstaltung.' : 'Hier kann der neue Inhalt direkt bearbeitet werden.' }, styles: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, source: { tag: 'p', className: '' } }]; if (template === 'image') elements.push({ id: imageId, type: 'image', order: 2, content: { src: 'assets/header.webp', alt: 'Koblenzer Puppenspiele' }, styles: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, source: { tag: 'img', className: 'kp-added-image' } }); v2.actions.createSection(v2.store.get().activePageId, { id: sectionId, design: { className: template === 'cta' ? 'dark editable' : 'editable' }, elements }); v2.store.setSelection({ sectionId }); panel.remove(); q(`[data-v2-section-id="${sectionId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); feedback('Neuer Abschnitt erstellt'); };
    panel.querySelector('[data-close]').onclick = () => panel.remove(); panel.querySelectorAll('[data-template]').forEach(node => node.onclick = () => create(node.dataset.template)); document.body.append(panel);
  }
  function render(state) {
    document.body.classList.toggle('kp-v2-ui', state.mode === 'edit');
    document.body.dataset.v2ActivePage = state.activePageId || '';
    if (state.mode === 'edit') document.querySelectorAll('[contenteditable]').forEach(node => node.setAttribute('contenteditable', 'false'));
    const activePage = state.document.pages.find(page => page.id === state.activePageId) || state.document.pages[0];
    const editorContext = q('#editorContext'); if (editorContext) editorContext.textContent = `${activePage?.title || 'Seite'} bearbeiten`;
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
    if (host && !q('#kpV2Pages')) { const pages = button('▤ Seiten', 'pages'); pages.id = 'kpV2Pages'; pages.onclick = pageSheet; host.append(pages); }
    if (host && !q('#kpV2Theme')) { const design = button('◐ Website-Design', 'theme'); design.id = 'kpV2Theme'; design.onclick = themeSheet; host.append(design); }
    if (host && !q('#kpV2Viewport')) { const viewport = button('▱ Responsive Ansicht', 'viewport'); viewport.id = 'kpV2Viewport'; viewport.onclick = viewportSheet; host.append(viewport); }
    if (host && !q('#kpV2BackupExport')) { const backup = button('⇩ Sicherung', 'backup'); backup.id = 'kpV2BackupExport'; backup.onclick = () => { window.KPEditorV2Backup?.export(); feedback('JSON-Sicherung heruntergeladen ✓'); }; host.append(backup); }
    if (host && !q('#kpV2BackupImport')) { const backup = button('⇧ Import', 'backup'); backup.id = 'kpV2BackupImport'; backup.onclick = () => window.KPEditorV2Backup?.import(); host.append(backup); }
    if (host && !q('#kpV2BackupHistory')) { const backup = button('◷ Lokale Versionen', 'backup'); backup.id = 'kpV2BackupHistory'; backup.onclick = () => window.KPEditorV2Backup?.history(); host.append(backup); }
  }
  const init = () => {
    bindMainControls(); q('#status')?.setAttribute('aria-live', 'polite');
    const markDialogs = root => root.querySelectorAll?.('[id^="kpV2"][id$="Sheet"]').forEach(panel => { panel.dataset.kpV2Dialog = 'true'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); if (!panel.getAttribute('aria-label') && !panel.getAttribute('aria-labelledby')) panel.setAttribute('aria-label', panel.querySelector('strong')?.textContent || 'Editor-Dialog'); });
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === 1) { if (node.matches?.('[id^="kpV2"][id$="Sheet"]')) markDialogs({ querySelectorAll: () => [node] }); markDialogs(node); } }))).observe(document.body, { childList: true, subtree: true });
    v2.store.subscribe(render); render(v2.store.get()); window.addEventListener('kp-editor-restored', () => render(v2.store.get())); window.addEventListener('kp-v2-feedback', event => feedback(event.detail || 'Aktualisiert'));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
  window.KPEditorV2Overlay = Object.freeze({ render, pageSheet, navigationSheet, layerSheet, addSection, aiSheet, themeSheet });
})();
