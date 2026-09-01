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

  const uiSelector = '.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop,.kp-fe-card-sheet-backdrop,.kp-oa-backdrop,.kp-canva-image-panel,.kp-canva-preview-return,.kp-canva-discard,#wpadminbar';

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
    '.kp-repertoire-cta > a'
  ].join(',');

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
    return key;
  }

  function assign(root = document) {
    const nodes = [];
    if (root instanceof Element && root.matches(selectors)) nodes.push(root);
    root.querySelectorAll?.(selectors).forEach(el => nodes.push(el));
    nodes.forEach(el => {
          const key = ensureGestureKey(el);
          // Idempotenz (Root-Cause-Fix, CI-Lauf 25): classList.add nur wenn die
          // Klasse fehlt. Vorher wurde bei JEDER childList-Mutation der gesamte
          // Selektoren-Bestand neu markiert; zusammen mit den Observer-Kaskaden
          // (canva-editor uiObserver/imageButtonObserver) erzeugte das einen
          // selbstverstaerkenden Klassen-Mutations-Sturm auf dem Hauptthread.
          if (key && !el.classList.contains('kp-canva-movable')) el.classList.add('kp-canva-movable');
        });
    const images = [];
    if (root instanceof HTMLImageElement) images.push(root);
    root.querySelectorAll?.('img').forEach(img => images.push(img));
    images.forEach(imageKey);
  }

  window.KPCanvaKeys = { hashString, pathFor, rawKey, ensureGestureKey, imageKey, assign, selectors, __initialized:true };

  assign();
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof Element) assign(node);
    }));
  }).observe(document.documentElement, { childList:true, subtree:true });
})();
