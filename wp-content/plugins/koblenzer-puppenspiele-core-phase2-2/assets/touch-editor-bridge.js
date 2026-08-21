(() => {
  'use strict';

  const editor = window.KPFrontendEditorV2;
  if (!editor?.editMode) return;

  let replayingMainSave = false;
  let waitingForMainSave = false;

  function editorToast(message, type = 'ok') {
    const toast = document.querySelector('.kp-fe2-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `kp-fe2-toast is-visible is-${type}`;
    clearTimeout(editorToast.timer);
    editorToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function setMenuOpen(nav, shouldOpen) {
    const container = nav?.querySelector('.wp-block-navigation__responsive-container');
    if (!container) return;
    const openButton = nav.querySelector('.wp-block-navigation__responsive-container-open');
    container.classList.toggle('is-menu-open', shouldOpen);
    container.classList.toggle('has-modal-open', shouldOpen);
    container.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    openButton?.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    document.documentElement.classList.toggle('has-modal-open', shouldOpen);
    document.body.classList.toggle('kp-menu-open', shouldOpen);
    if (shouldOpen) {
      requestAnimationFrame(() => {
        const panel = nav.querySelector('.wp-block-navigation__responsive-close');
        if (panel) panel.setAttribute('tabindex', '-1');
      });
    }
  }

  function interceptMenuTap(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return false;
    const control = target.closest('.kp-site-nav .wp-block-navigation__responsive-container-open,.kp-site-nav .wp-block-navigation__responsive-container-close');
    if (!control) return false;

    event.preventDefault();
    event.stopImmediatePropagation();
    const nav = control.closest('.kp-site-nav');
    if (!nav) return true;
    setMenuOpen(nav, control.matches('.wp-block-navigation__responsive-container-open'));
    return true;
  }

  function runtimeWithNewestUndo() {
    const free = window.KPFreeLayoutRuntime;
    const generic = window.KPTouchGestureRuntime;
    const freeAt = Number(free?.lastActionAt?.() || 0);
    const genericAt = Number(generic?.lastActionAt?.() || 0);
    if (free?.hasHistory?.() && freeAt >= genericAt) return free;
    if (generic?.hasHistory?.()) return generic;
    if (free?.hasHistory?.()) return free;
    return null;
  }

  async function flushTouchDrafts() {
    // First persist every specialist editor (Design, responsive sizes, menu X,
    // image position). Then persist gesture/layout drafts. Only after all of
    // these succeed may the main editor write and reload the page.
    const owner = window.KPOwnerSaveRegistry;
    if (owner?.flushAll) await owner.flushAll();
    const generic = window.KPTouchGestureRuntime;
    const free = window.KPFreeLayoutRuntime;
    if (generic?.flush) await generic.flush();
    if (free?.flush) await free.flush();
  }

  window.addEventListener('click', async event => {
    if (interceptMenuTap(event)) return;

    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const undoButton = target.closest('.kp-fe2-undo');
    if (undoButton) {
      const runtime = runtimeWithNewestUndo();
      if (runtime?.undo) {
        event.preventDefault();
        event.stopImmediatePropagation();
        runtime.undo();
        return;
      }
    }

    const saveButton = target.closest('.kp-fe2-save');
    if (!saveButton || replayingMainSave || waitingForMainSave) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    waitingForMainSave = true;
    saveButton.disabled = true;
    const originalHtml = saveButton.innerHTML;
    saveButton.innerHTML = '<span class="dashicons dashicons-update"></span><span>Alles sichern…</span>';

    try {
      await flushTouchDrafts();
      replayingMainSave = true;
      saveButton.disabled = false;
      saveButton.innerHTML = originalHtml;
      saveButton.click();
    } catch (error) {
      saveButton.disabled = false;
      saveButton.innerHTML = originalHtml;
      editorToast(error?.message || 'Eine Änderung konnte nicht dauerhaft gespeichert werden.', 'error');
    } finally {
      replayingMainSave = false;
      waitingForMainSave = false;
    }
  }, true);
})();