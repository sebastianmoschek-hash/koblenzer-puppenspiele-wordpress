/* Local, provider-free media library for V2 image replacement. */
(() => {
  'use strict';
  const v2 = window.KPEditorV2;
  if (!v2 || window.KPEditorV2Media) return;
  const q = selector => document.querySelector(selector);
  const localSource = src => {
    try {
      const url = new URL(src, location.href);
      return url.origin === location.origin && /\/assets\//.test(url.pathname);
    } catch (_) { return false; }
  };
  const collect = () => {
    const entries = new Map();
    const add = (src, alt = '') => {
      if (!src || !localSource(src)) return;
      const normalized = new URL(src, location.href).pathname.replace(/^\//, '');
      if (!entries.has(normalized)) entries.set(normalized, { src: normalized, alt: String(alt || normalized.split('/').pop() || 'Bild') });
    };
    for (const page of v2.store.get().document.pages) for (const section of page.sections) for (const element of section.elements) {
      if (element.type === 'image') add(element.content?.src, element.content?.alt);
    }
    document.querySelectorAll('img[src]').forEach(image => add(image.getAttribute('src'), image.alt));
    return [...entries.values()].sort((a, b) => a.alt.localeCompare(b.alt, 'de'));
  };
  const locate = id => {
    for (const page of v2.store.get().document.pages) for (const section of page.sections) {
      const element = section.elements.find(item => item.id === id);
      if (element) return element;
    }
    return null;
  };
  function open(elementId) {
    const element = locate(elementId);
    if (element?.type !== 'image') throw new TypeError('Für den Medienbrowser muss ein Bild ausgewählt sein.');
    q('#kpV2MediaSheet')?.remove();
    const panel = document.createElement('div'); panel.id = 'kpV2MediaSheet';
    panel.innerHTML = '<div class="kp-v2-sheet-scrim"></div><div class="kp-v2-media-dialog" role="dialog" aria-modal="true" aria-labelledby="kpV2MediaTitle"><header><div><strong id="kpV2MediaTitle">Bild ersetzen</strong><small>Lokale Originalmedien – ohne Upload oder externen Dienst</small></div><button type="button" data-close aria-label="Schließen">×</button></header><label class="kp-v2-media-search">Bilder suchen<input type="search" data-search placeholder="Name oder Ordner"></label><div class="kp-v2-media-grid" data-grid></div><p data-empty hidden>Keine passenden lokalen Bilder gefunden.</p><footer><button type="button" data-cancel>Verwerfen</button><button type="button" data-accept disabled>Übernehmen</button></footer></div>';
    const all = collect();
    let selected = null;
    const close = cancel => {
      if (cancel) v2.store.cancelPreview();
      panel.remove();
    };
    const render = filter => {
      const term = String(filter || '').trim().toLocaleLowerCase('de');
      const items = all.filter(item => !term || `${item.alt} ${item.src}`.toLocaleLowerCase('de').includes(term));
      const grid = panel.querySelector('[data-grid]'); grid.replaceChildren();
      for (const item of items) {
        const card = document.createElement('button'); card.type = 'button'; card.dataset.mediaSrc = item.src; card.setAttribute('aria-pressed', String(item.src === selected));
        const image = document.createElement('img'); image.src = item.src; image.alt = '';
        const label = document.createElement('span'); label.textContent = item.alt;
        card.append(image, label);
        card.onclick = () => {
          selected = item.src;
          v2.actions.previewBatch('Bild ersetzen', [{ name: 'replaceImage', payload: [elementId, item.src, item.alt] }]);
          panel.querySelector('[data-accept]').disabled = false;
          render(panel.querySelector('[data-search]').value);
        };
        grid.append(card);
      }
      panel.querySelector('[data-empty]').hidden = items.length > 0;
    };
    panel.querySelector('[data-search]').oninput = event => render(event.target.value);
    panel.querySelector('[data-close]').onclick = () => close(true);
    panel.querySelector('[data-cancel]').onclick = () => close(true);
    panel.querySelector('.kp-v2-sheet-scrim').onclick = () => close(true);
    panel.querySelector('[data-accept]').onclick = () => {
      v2.store.commitPreview(); panel.remove();
      window.dispatchEvent(new CustomEvent('kp-v2-feedback', { detail: 'Bild ersetzt · Rückgängig möglich' }));
    };
    document.body.append(panel); render(''); panel.querySelector('[data-search]').focus();
    return { count: all.length };
  }
  window.KPEditorV2Media = Object.freeze({ collect, open });
})();
