(() => {
  'use strict';

  // WordPress/PWA navigation can evaluate the MU-plugin more than once in the
  // same document. A second MutationObserver would repeatedly reassign the
  // same keys and amplify the editor's DOM observers into a class mutation
  // storm. Keep one authoritative runtime per document.
  if (window.KPCanvaKeys?.__initialized) return;

  const hashString = str => {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
  };

  const pathFor = (el, root) => {
    const parts = [];
    let cur = el;
    while (cur && cur !== root && cur.nodeType === 1) {
      let index = 1;
      let sib = cur.previousElementSibling;
      while (sib) {
        if (sib.tagName === cur.tagName) index++;
        sib = sib.previousElementSibling;
      }
      parts.unshift(`${cur.tagName.toLowerCase()}:${index}`);
      cur = cur.parentElement;
    }
    return parts.join('/');
  };

  const cardSignature = card => {
    const link = card?.querySelector('h3 a[href],.kp-repertoire-image[href],a[href]');
    if (link) {
      try { return new URL(link.getAttribute('href'), location.href).pathname; } catch (_) {}
    }
    return (card?.querySelector('h3')?.textContent || card?.textContent || '').trim().slice(0, 120);
  };

  const rawKey = el => {
    if (!el) return '';
    if (el.dataset.kpEditKey) return 'block:' + el.dataset.kpEditKey;
    if (el.dataset.kpDomKey) return 'dom:' + el.dataset.kpDomKey;
    const card = el.closest('.kp-repertoire-card,.kp-termin-card');
    if (card) {
      const roleRoot = el.closest('.kp-repertoire-image,.kp-repertoire-card-actions,.kp-repertoire-facts,.kp-repertoire-meta') || card;
      return 'card:' + cardSignature(card) + ':' + pathFor(el, roleRoot);
    }
    const root = el.closest('header,main,footer') || document.body;
    return 'site:' + root.tagName.toLowerCase() + ':' + pathFor(el, root);
  };

  const uiSelector = '.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop,.kp-fe-card-sheet-backdrop,.kp-oa-backdrop,.kp-oa-sheet,.kp-wa-bar,.kp-canva-image-panel,.kp-canva-preview-return,.kp-canva-discard,#wpadminbar';

  const selectors = [
    '[data-kp-edit-key]',
    '[data-kp-dom-key]',
    '.wp-block-button',
    '.wp-block-button__link',
    '.wp-element-button',
    '.wp-block-image',
    '.wp-block-image img',
    'figure.wp-block-image',
    'figure.wp-block-image img',
    '.wp-block-cover',
    '.wp-block-cover__inner-container',
    '.wp-block-media-text',
    '.wp-block-media-text__content',
    '.wp-block-columns',
    '.wp-block-column',
    'header .wp-block-group',
    'header .wp-block-group > *',
    'main .wp-block-group > *',
    '.wp-site-blocks > main > *',
    '.kp-header-stage',
    '.kp-header-photo',
    '.kp-repertoire-card',
    '.kp-repertoire-card-body > *',
    '.kp-repertoire-card-actions a',
    '.kp-repertoire-facts > *',
    '.kp-repertoire-meta > *',
    '.kp-termin-card',
    '.kp-termine-button',
    '.kp-repertoire-cta > a',
    '.kp-site-nav .wp-block-navigation__responsive-container-open',
    '.kp-site-nav .wp-block-navigation__responsive-close',
    '.kp-header-stage img',
    '.kp-header-photo img'
  ].join(',');

  const compactText = (el, limit = 96) => (el?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);

  function editableTypeFor(el) {
    if (!(el instanceof Element)) return 'node';
    if (el.matches('.kp-site-nav .wp-block-navigation__responsive-container-open')) return 'menu-button';
    if (el.matches('.kp-site-nav .wp-block-navigation__responsive-close')) return 'menu-panel';
    if (el.matches('img,figure.wp-block-image,.wp-block-image img,.kp-header-stage img,.kp-header-photo img')) return 'image';
    if (el.matches('.wp-block-button,.wp-block-button__link,.wp-element-button,.kp-repertoire-cta > a,.kp-termine-button')) return 'button';
    if (el.matches('.kp-header-stage,.kp-header-photo,.wp-block-cover,.wp-block-media-text,.wp-block-columns,.wp-block-column,.wp-site-blocks > main > *')) return 'section';
    if (el.matches('.kp-repertoire-card,.kp-termin-card')) return 'card';
    if (el.matches('header .wp-block-group')) return 'header-group';
    if (el.matches('main .wp-block-group > *,.kp-repertoire-card-body > *,.kp-repertoire-card-actions a,.kp-repertoire-facts > *,.kp-repertoire-meta > *')) return 'content';
    if (el.matches('[data-kp-edit-key]')) return 'block';
    if (el.matches('[data-kp-dom-key]')) return 'dom';
    return 'content';
  }

  function setEditableMetadata(el, type, id) {
    if (!(el instanceof Element)) return;
    if (id) el.dataset.kpElementId = id;
    if (type) el.dataset.kpEditableType = type;
  }

  function visibleRect(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  }

  function editableSnapshot(root = document) {
    const base = root && typeof root.querySelectorAll === 'function' ? root : document;
    const elements = [];
    if (base instanceof Element && base.hasAttribute('data-kp-element-id')) elements.push(base);
    base.querySelectorAll?.('[data-kp-element-id]').forEach(el => elements.push(el));
    const seen = new Set();
    const items = [];
    elements.forEach(el => {
      if (!(el instanceof Element) || seen.has(el)) return;
      seen.add(el);
      if (el.closest(uiSelector)) return;
      if (!visibleRect(el)) return;
      const rect = el.getBoundingClientRect();
      const id = el.dataset.kpElementId || '';
      if (!id) return;
      items.push({
        id,
        type: el.dataset.kpEditableType || editableTypeFor(el),
        tag: el.tagName.toLowerCase(),
        text: compactText(el),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    });
    return {
      v: 1,
      url: location.href,
      body: document.body?.className || '',
      vp: { w: innerWidth, h: innerHeight },
      els: items.slice(0, 48),
    };
  }

  function eligible(el) {
    if (!(el instanceof Element)) return false;
    if (el.closest(uiSelector)) return false;
    if (el.closest('.kp-site-nav')) return false;
    if (el.matches('input,textarea,select,option,script,style,link,meta')) return false;
    if (el.closest('form') && !el.matches('button,a,.wp-block-button,.wp-block-button__link')) return false;
    return true;
  }

  function ensureGestureKey(el) {
    if (!eligible(el)) return '';
    if (el.dataset.kpGestureKey) return el.dataset.kpGestureKey;
    const raw = rawKey(el);
    if (!raw) return '';
    const key = 'g-' + hashString(raw);
    el.dataset.kpGestureKey = key;
    return key;
  }

  function imageKey(img) {
    if (!(img instanceof HTMLImageElement)) return '';
    if (img.dataset.kpCanvaImageKey) return img.dataset.kpCanvaImageKey;
    const own = img.dataset.kpEditKey || img.dataset.kpDomKey || ensureGestureKey(img) || rawKey(img);
    const key = 'img-' + hashString(String(own || img.currentSrc || img.src || 'image'));
    img.dataset.kpCanvaImageKey = key;
    setEditableMetadata(img, 'image', key);
    return key;
  }

  function assign(root = document) {
    const roots = Array.isArray(root) ? root : [root];
    roots.forEach(current => {
      if (!current) return;
      const nodes = [];
      if (current instanceof Element && current.matches(selectors)) nodes.push(current);
      current.querySelectorAll?.(selectors).forEach(el => nodes.push(el));
      nodes.forEach(el => {
        if (el.dataset.kpCanvaKeysAssigned === '1') return;
        // Die frühere Hilfsklasse wurde bei jedem Durchlauf erneut gesetzt und
        // verstärkte sich mit anderen Observern zu einem Klassen-Mutations-Sturm.
        // Das stabile data-Attribut ist zugleich Selektor und Einmal-Markierung.
        const key = ensureGestureKey(el);
        if (key) {
          setEditableMetadata(el, editableTypeFor(el), key);
          el.dataset.kpCanvaKeysAssigned = '1';
        }
      });
      const images = [];
      if (current instanceof HTMLImageElement) images.push(current);
      current.querySelectorAll?.('img').forEach(img => images.push(img));
      images.forEach(imageKey);
    });
  }

  window.KPCanvaKeys = {
    hashString,
    pathFor,
    rawKey,
    ensureGestureKey,
    imageKey,
    assign,
    selectors,
    exportEditableRegionSnapshot: editableSnapshot,
    snapshotEditableRegion: editableSnapshot,
    __initialized:true
  };
  if (window.KPCanvaEditor && typeof window.KPCanvaEditor === 'object') {
    window.KPCanvaEditor.exportEditableRegionSnapshot = editableSnapshot;
    window.KPCanvaEditor.snapshotEditableRegion = editableSnapshot;
  }
  window.KPCanvaSnapshot = editableSnapshot;

  assign();
  let assignScheduled = false;
  const pendingRoots = new Set();
  const flushAssign = () => {
    if (assignScheduled || !pendingRoots.size) return;
    assignScheduled = true;
    requestAnimationFrame(() => {
      assignScheduled = false;
      const roots = [...pendingRoots];
      pendingRoots.clear();
      // Nur die neu hinzugekommenen Canvas-Aeste anfassen; Owner-UI bleibt
      // ausserhalb des Passes und wird nicht erneut durchlaufen.
      assign(roots);
    });
  };
  new MutationObserver(records => {
    // Owner sheets can add dozens of controls at once, but they are explicitly
    // outside the editable canvas. Do not turn those UI-only insertions into a
    // full-page key pass (and another observer cascade).
    let sawCanvasAddition = false;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(uiSelector) || node.closest(uiSelector)) continue;
        pendingRoots.add(node);
        sawCanvasAddition = true;
      }
    }
    if (sawCanvasAddition) {
      flushAssign();
    }
  }).observe(document.documentElement, { childList:true, subtree:true });
})();
