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

  function sameJson(a, b) {
    return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
  }

  function liveDesignSettings() {
    const cfg = window.KPOwnerWebApp;
    const controls = [...document.querySelectorAll('[data-design]')];
    if (!cfg || !controls.length) return null;
    const settings = { ...(cfg.design || {}) };
    controls.forEach(input => {
      const key = input?.dataset?.design;
      if (!key) return;
      settings[key] = input.type === 'checkbox'
        ? (input.checked ? 1 : 0)
        : (input.type === 'range' ? Number(input.value) : input.value);
    });
    return settings;
  }

  async function persistLiveDesignFallback() {
    const cfg = window.KPOwnerWebApp;
    const settings = liveDesignSettings();
    if (!cfg?.ajaxUrl || !cfg?.nonce || !settings || sameJson(settings, cfg.design || {})) return { draft:false };

    const fd = new FormData();
    fd.append('action', 'kp_owner_design_save');
    fd.append('nonce', cfg.nonce);
    fd.append('settings', JSON.stringify(settings));
    const response = await fetch(cfg.ajaxUrl, { method:'POST', credentials:'same-origin', cache:'no-store', body:fd });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) {
      throw new Error(json?.data?.message || 'Design konnte nicht dauerhaft gespeichert werden.');
    }
    cfg.design = { ...(json.data?.settings || settings) };
    return json.data || {};
  }

  async function flushTouchDrafts() {
    // First persist every specialist editor. Then independently compare the live
    // design controls against WordPress and save them as a fallback. This makes
    // the orange main Save resilient even if the owner coordinator was skipped.
    const owner = window.KPOwnerSaveRegistry;
    if (owner?.flushAll) await owner.flushAll();
    await persistLiveDesignFallback();

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