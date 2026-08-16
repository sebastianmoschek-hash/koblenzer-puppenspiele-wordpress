(() => {
  'use strict';

  const cfg = window.KPFrontendEditor;
  if (!cfg || !cfg.editMode) return;

  const body = document.body;
  const panel = document.querySelector('.kp-fe-panel');
  const hint = document.querySelector('.kp-fe-hint');
  if (!body || !panel) return;

  const TEXT_BLOCKS = new Set(['core/paragraph', 'core/heading', 'core/list-item']);
  let activeText = null;
  let activeElement = null;

  const style = document.createElement('style');
  style.id = 'kp-fe-inline-word-style';
  style.textContent = `
    .kp-fe-inline-tools{position:fixed;top:calc(var(--wp-admin--admin-bar--height,0px) + 54px);right:12px;z-index:100079;display:flex;align-items:center;gap:7px;max-width:calc(100vw - 24px);padding:6px 7px 6px 10px;border:1px solid rgba(240,122,34,.34);border-radius:999px;background:rgba(23,17,14,.94);box-shadow:0 10px 30px rgba(0,0,0,.28);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);color:#f8eee7;font:700 11px/1.1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:0;pointer-events:none;transform:translateY(-5px);transition:.14s ease}
    .kp-fe-inline-tools.is-visible{opacity:1;pointer-events:auto;transform:translateY(0)}
    .kp-fe-inline-tools>span{white-space:nowrap;opacity:.82}
    .kp-fe-inline-tools button{min-height:30px;padding:5px 9px;border:1px solid rgba(240,122,34,.6);border-radius:999px;background:rgba(240,122,34,.14);color:#fff;font:800 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;white-space:nowrap}
    .kp-fe-inline-tools button:hover,.kp-fe-inline-tools button:focus,.kp-fe-inline-tools button.is-active{background:#f07a22;outline:none}
    body.kp-fe-editing [contenteditable="true"]{caret-color:#f07a22;-webkit-user-select:text;user-select:text;cursor:text!important}
    body.kp-fe-editing.kp-fe-inline-text:not(.kp-fe-inline-design-open) .kp-fe-panel.is-open{visibility:hidden!important;opacity:0!important;pointer-events:none!important}
    @media(max-width:782px){.kp-fe-inline-tools{top:calc(var(--wp-admin--admin-bar--height,0px) + 48px);right:8px}.kp-fe-inline-tools>span{display:none}.kp-fe-inline-tools button{min-height:34px;padding:6px 11px}}
  `;
  document.head.appendChild(style);

  const tools = document.createElement('div');
  tools.className = 'kp-fe-inline-tools';
  tools.setAttribute('aria-hidden', 'true');
  tools.innerHTML = '<span>✎ Direkt schreiben</span><button type="button" class="kp-fe-inline-design" title="Schrift, Farbe und Abstände ändern">Aa Gestaltung</button>';
  document.body.appendChild(tools);

  const designButton = tools.querySelector('.kp-fe-inline-design');

  if (hint) {
    hint.textContent = 'Text antippen und direkt schreiben · Bilder, Termine und Stücke antippen · Gestaltung nur bei Bedarf über „Aa Gestaltung“.';
  }

  function editableElementFromNode(node) {
    if (!(node instanceof Element)) return null;
    return node.closest('[data-kp-edit-key],[data-kp-dom-key]');
  }

  function textTarget(el) {
    if (!el) return null;
    const name = el.dataset.kpBlockName || '';
    if (TEXT_BLOCKS.has(name) || el.matches('h1,h2,h3,h4,p,li')) return el;
    return null;
  }

  function isEditorUi(target) {
    return target instanceof Element && !!target.closest('.kp-fe-toolbar,.kp-fe-panel,.kp-fe-modal-backdrop,.kp-fe-quick,.kp-fe-inline-tools,#wpadminbar');
  }

  function showTools() {
    tools.classList.add('is-visible');
    tools.setAttribute('aria-hidden', 'false');
  }

  function hideTools() {
    tools.classList.remove('is-visible');
    tools.setAttribute('aria-hidden', 'true');
  }

  function setDesignOpen(open) {
    body.classList.toggle('kp-fe-inline-design-open', !!open);
    designButton.classList.toggle('is-active', !!open);
    designButton.setAttribute('aria-pressed', open ? 'true' : 'false');

    if (open) {
      panel.classList.add('is-open');
      panel.setAttribute('aria-hidden', 'false');
    }
  }

  function enterDirectTextMode(el) {
    activeElement = el;
    body.classList.add('kp-fe-inline-text');
    setDesignOpen(false);
    showTools();
  }

  function leaveDirectTextMode(closeSelection = false) {
    body.classList.remove('kp-fe-inline-text', 'kp-fe-inline-design-open');
    designButton.classList.remove('is-active');
    designButton.setAttribute('aria-pressed', 'false');
    hideTools();

    if (closeSelection) {
      document.querySelectorAll('[contenteditable="true"]').forEach((editable) => {
        editable.contentEditable = 'false';
        editable.blur();
      });
      document.querySelectorAll('.kp-fe-selected').forEach((selected) => selected.classList.remove('kp-fe-selected'));
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
    }

    activeText = null;
    activeElement = null;
  }

  function caretAtPoint(el, x, y) {
    if (!el || !el.isContentEditable) return;
    let range = null;

    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos && (pos.offsetNode === el || el.contains(pos.offsetNode))) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    } else if (document.caretRangeFromPoint) {
      const candidate = document.caretRangeFromPoint(x, y);
      if (candidate && (candidate.startContainer === el || el.contains(candidate.startContainer))) {
        range = candidate;
        range.collapse(true);
      }
    }

    if (!range) return;
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function focusAtPoint(el, event) {
    requestAnimationFrame(() => {
      if (!el || !el.isConnected || !el.isContentEditable) return;
      activeText = el;
      try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
      caretAtPoint(el, event.clientX, event.clientY);
    });
  }

  designButton.setAttribute('aria-pressed', 'false');
  designButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!activeElement) return;
    setDesignOpen(!body.classList.contains('kp-fe-inline-design-open'));
  });

  panel.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('.kp-fe-panel-close')) return;
    queueMicrotask(() => leaveDirectTextMode(false));
  });

  // Keep pasted content clean: only text, no foreign Word/website formatting.
  document.addEventListener('paste', (event) => {
    const editable = event.target instanceof Element ? event.target.closest('[contenteditable="true"]') : null;
    if (!editable || editable !== activeText) return;

    const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
    if (!text) return;

    event.preventDefault();
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

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

  // This listener sits on window, one level before the base editor's document
  // capture listener. First tap is allowed through so the base editor enables
  // contentEditable and wires saving. Later taps inside the same text are kept
  // away from the base selector so the cursor can move normally without
  // reopening/resetting the large design panel.
  window.addEventListener('click', (event) => {
    if (isEditorUi(event.target)) return;

    const el = editableElementFromNode(event.target);

    if (!el) {
      if (activeElement || document.querySelector('[contenteditable="true"]')) {
        leaveDirectTextMode(true);
      }
      return;
    }

    const target = textTarget(el);
    if (!target) {
      leaveDirectTextMode(false);
      return;
    }

    enterDirectTextMode(el);

    if (target.isContentEditable) {
      if (event.target instanceof Element && event.target.closest('a')) event.preventDefault();
      event.stopPropagation();
      focusAtPoint(target, event);
      return;
    }

    // First tap: base editor will make this element contentEditable and attach
    // its input recorder. The direct-mode CSS is already active, so its panel
    // never flashes open. Then place the caret exactly where the owner tapped.
    focusAtPoint(target, event);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !document.querySelector('[contenteditable="true"]')) return;
    event.preventDefault();
    leaveDirectTextMode(true);
  }, true);

  document.querySelector('.kp-fe-toolbar')?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.kp-fe-save,.kp-fe-undo')) leaveDirectTextMode(false);
  });

  window.addEventListener('scroll', () => {
    if (activeText && !activeText.isConnected) leaveDirectTextMode(false);
  }, { passive: true });
})();