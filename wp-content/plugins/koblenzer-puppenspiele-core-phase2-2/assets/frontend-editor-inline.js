(() => {
  'use strict';

  const cfg = window.KPFrontendEditor;
  if (!cfg || !cfg.editMode) return;

  let activeText = null;
  let designOpen = false;
  const panel = document.querySelector('.kp-fe-panel');
  const hint = document.querySelector('.kp-fe-hint');

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
    const selected = document.querySelector('.kp-fe-selected[contenteditable="true"]');
    return selected || null;
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

    // The base editor intentionally enables contentEditable first. We then
    // restore normal editor behaviour: caret where the owner actually tapped,
    // instead of selecting/replacing the complete text block.
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

  // Keep pasted copy clean. Formatting remains controlled by the website,
  // while ordinary text can be pasted as naturally as in a word processor.
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
    editable.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }, true);

  // Registered after the base editor. Its capture listener runs first and
  // enables contentEditable; this listener then simplifies the visible UX.
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
    // The compact controls stay fixed and never cover the text being edited.
    if (activeText && !activeText.isConnected) {
      activeText = null;
      hideTools();
    }
  }, { passive: true });
})();
