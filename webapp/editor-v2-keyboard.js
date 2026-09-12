/* Desktop keyboard commands routed through the central V2 store/actions. */
(() => {
  'use strict';
  const v2 = window.KPEditorV2;
  if (!v2 || window.KPEditorV2Keyboard) return;
  const isTyping = target => Boolean(target?.closest?.('input,textarea,select,[contenteditable="true"]'));
  const closeTopSheet = () => {
    const cancel = document.querySelector('#kpElementSheet:not([hidden]) .kp-es-scrim,#kpProImageEditor:not([hidden]) [data-cancel],#kpV2MediaSheet [data-cancel],#kpV2ThemeSheet [data-cancel],#kpV2SectionSheet [data-cancel],#kpV2HeaderSheet [data-cancel]');
    if (cancel) { cancel.click(); return true; }
    const close = document.querySelector('#kpV2LayerSheet [data-close],#kpV2NavSheet [data-close],#kpV2ViewportSheet [data-close],#kpV2AISheet [data-close],#kpV2CommandSheet .kp-v2-sheet-scrim,#kpV2BackupSheet [data-close]');
    if (close) { close.click(); return true; }
    return false;
  };
  const handle = event => {
    if (v2.store.get().mode !== 'edit') return false;
    const key = String(event.key || '').toLowerCase(), modifier = event.ctrlKey || event.metaKey;
    if (isTyping(event.target)) {
      if (key === 'escape') event.target.blur();
      return false;
    }
    let handled = true;
    if (modifier && key === 'z') event.shiftKey ? v2.store.redo() : v2.store.undo();
    else if (modifier && key === 'y') v2.store.redo();
    else if (modifier && key === 's') { window.KPEditorV2Backup?.save() || v2.persistence.save(); window.dispatchEvent(new CustomEvent('kp-v2-feedback', { detail: 'Auf diesem Gerät gespeichert ✓' })); }
    else if (modifier && key === 'd') {
      const selection = v2.store.get().selection;
      if (selection?.elementId) v2.actions.duplicateElement(selection.elementId);
      else if (selection?.sectionId) v2.actions.duplicateSection(selection.sectionId);
      else handled = false;
    } else if (key === 'delete' || key === 'backspace') {
      const selection = v2.store.get().selection;
      if (selection?.elementId) v2.actions.deleteElement(selection.elementId);
      else if (selection?.sectionId) v2.actions.deleteSection(selection.sectionId);
      else handled = false;
    } else if (key === 'escape') {
      if (!closeTopSheet()) v2.store.setSelection(null);
    } else handled = false;
    if (handled) { event.preventDefault(); event.stopPropagation(); }
    return handled;
  };
  document.addEventListener('keydown', handle, true);
  window.KPEditorV2Keyboard = Object.freeze({ handle, isTyping });
})();
