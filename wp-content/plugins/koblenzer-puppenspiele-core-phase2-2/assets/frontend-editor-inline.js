(() => {
  'use strict';

  const cfg = window.KPFrontendEditor;
  if (!cfg || !cfg.editMode) return;

  let activeText = null;
  let designOpen = false;
  const panel = document.querySelector('.kp-fe-panel');
  const hint = document.querySelector('.kp-fe-hint');

  const style = document.createElement('style');
  style.id = 'kp-fe-inline-word-style';
  style.textContent = `
    .kp-fe-inline-tools{position:fixed;top:calc(var(--wp-admin--admin-bar--height,0px) + 54px);right:12px;z-index:100079;display:flex;align-items:center;gap:7px;max-width:calc(100vw - 24px);padding:6px 7px 6px 10px;border:1px solid rgba(240,122,34,.34);border-radius:999px;background:rgba(23,17,14,.94);box-shadow:0 10px 30px rgba(0,0,0,.28);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);color:#f8eee7;font:700 11px/1.1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:0;pointer-events:none;transform:translateY(-5px);transition:.14s ease}
    .kp-fe-inline-tools.is-visible{opacity:1;pointer-events:auto;transform:translateY(0)}
    .kp-fe-inline-tools>span{white-space:nowrap;opacity:.82}
    .kp-fe-inline-tools button{min-height:30px;padding:5px 9px;border:1px solid rgba(240,122,34,.6);border-radius:999px;background:rgba(240,122,34,.14);color:#fff;font:800 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;white-space:nowrap}
    .kp-fe-inline-tools button:hover,.kp-fe-inline-tools button:focus{background:#f07a22;outline:none}
    body.kp-fe-editing [contenteditable="true"]{caret-color:#f07a22;-webkit-user-select:text;user-select:text}
    @media(max-width:782px){.kp-fe-inline-tools{top:calc(var(--wp-admin--admin-bar--height,0px) + 48px);right:8px}.kp-fe-inline-tools>span{display:none}.kp-fe-inline-tools button{min-height:34px;padding:6px 11px}}
  `;
  document.head.appendChild(style);

  const tools = document.createElement('div');
  tools.className = 'kp-fe-inline-tools';
  tools.setAttribute('aria-hidden', 'true');
  tools.innerHTML = '<span>✎ Direkt schreiben</span><button type="button" class="kp-fe-inline-design" title="Schrift, Farbe und Abstände ändern">Aa Gestaltung</button>';
  document.body.appendChild(tools);

  if (hint) {
    hint.textContent = 'Text antippen und direkt schreiben · Bilder, Termine und Stücke antippen · Gestaltung nur bei Bedarf über „Aa Gestaltung“.';
  }

  function hideTools() {
    tools.classList.remove('is-visible');
    tools.setAttribute('aria-hidden', 'true');
  }

  function showTools() {
    tools.classList.add('is-visible');
    tools.setAttribute('aria-hidden', 'false');
  }

  function hideDesignPanel() {
    if (!panel || designOpen) return;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
  }

  function activatedTextFromClick(target) {
    if (!(target instanceof Element)) return null;
    const direct = target.closest('[contenteditable="true"]');
    if (direct) return direct;
    return document.querySelector('.kp-fe-selected[contenteditable="true"]');
  }

  function caretAtPoint(el, x, y) {
    if (!el) return;
    let range = null;

    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos && el.contains(pos.offsetNode)) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    } else if (document.caretRangeFromPoint) {
      const candidate = document.caretRangeFromPoint(x, y);
      if (candidate && el.contains(candidate.startContainer)) range = candidate;
    }

    if (range) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function activateWordLikeEditing(el, event) {
    activeText = el;
    designOpen = false;
    hideDesignPanel();
    showTools();

    // The base editor enables contentEditable and records changes. We only
    // simplify the interaction here: caret at the tapped position, no giant
    // design panel unless the owner explicitly asks for it.
    requestAnimationFrame(() => {
      if (!activeText || !activeText.isConnected) return;
      try { activeText.focus({ preventScroll: true }); } catch (e) { activeText.focus(); }
      if ((event.detail || 1) === 1) caretAtPoint(activeText, event.clientX, event.clientY);
    });
  }

  tools.querySelector('.kp-fe-inline-design').addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!activeText || !panel) return;
    designOpen = true;
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
  });

  // Paste plain text so foreign Word/website formatting cannot accidentally
  // damage the responsive design. The base editor still receives an input event
  // and therefore stores the changed text normally.
  document.addEventListener('paste', (event) => {
    const editable = event.target instanceof Element ? event.target.closest('[contenteditable="true"]') : null;
    if (!editable || editable !== activeText) return;
    const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
    if (!text) return;
    event.preventDefault();
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    const inputEvent = typeof InputEvent === 'function'
      ? new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })
      : new Event('input', { bubbles: true });
    editable.dispatchEvent(inputEvent);
  }, true);

  // Registered after the base editor. Its document capture listener runs first
  // and enables contentEditable; this listener then switches to the simple UX.
  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.kp-fe-inline-tools')) return;

    if (event.target instanceof Element && event.target.closest('.kp-fe-panel-close')) {
      designOpen = false;
      setTimeout(hideTools, 0);
      return;
    }

    if (event.target instanceof Element && event.target.closest('.kp-fe-save,.kp-fe-undo')) {
      hideTools();
      return;
    }

    if (event.target instanceof Element && event.target.closest('.kp-fe-device')) {
      if (activeText && !designOpen) requestAnimationFrame(hideDesignPanel);
      return;
    }

    if (event.target instanceof Element && event.target.closest('.kp-fe-panel,.kp-fe-modal-backdrop,.kp-fe-quick,#wpadminbar')) return;
    if (event.target instanceof Element && event.target.closest('.kp-termin-card,.kp-repertoire-card')) {
      activeText = null;
      designOpen = false;
      hideTools();
      return;
    }

    const editable = activatedTextFromClick(event.target);
    if (editable) {
      activateWordLikeEditing(editable, event);
      return;
    }

    activeText = null;
    designOpen = false;
    hideTools();
  }, true);

  window.addEventListener('scroll', () => {
    if (activeText && !activeText.isConnected) {
      activeText = null;
      hideTools();
    }
  }, { passive: true });
})();
