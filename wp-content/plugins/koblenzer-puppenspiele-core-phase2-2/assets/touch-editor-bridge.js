(() => {
  'use strict';

  const editor = window.KPFrontendEditorV2;
  if (!editor?.editMode) return;

  // The real-save staging contract accepts the complete Save -> reload roundtrip
  // up to 14.5 s. Keep the native FE2 request watchdog below that ceiling, but
  // leave enough headroom for a healthy staging request that takes >12 s plus
  // FE2's 500 ms post-save reload delay.
  const SAVE_TIMEOUT_MS = 13500;
  let replayingMainSave = false;
  let waitingForMainSave = false;
  let frontendDirty = false;
  let inlineHeaderRadius = null;

  // A failed/slow admin-ajax request must never leave the orange Save button in
  // an endless spinner. FE2 text persistence is the final request in the save
  // chain, so give it a deterministic watchdog and let the native editor show
  // the resulting error/re-enable the button.
  const inheritedFetch = window.fetch.bind(window);
  function requestAction(body) {
    try {
      if (body instanceof FormData) return String(body.get('action') || '');
      if (body instanceof URLSearchParams) return String(body.get('action') || '');
      if (typeof body === 'string') return String(new URLSearchParams(body).get('action') || '');
    } catch (_) {}
    return '';
  }
  window.fetch = (input, init = {}) => {
    if (requestAction(init?.body) !== 'kp_fe_v2_save' || init?.signal) return inheritedFetch(input, init);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    return inheritedFetch(input, {...init, signal: controller.signal})
      .catch(error => {
        if (controller.signal.aborted) throw new Error('Textspeichern hat zu lange gedauert. Bitte erneut versuchen.');
        throw error;
      })
      .finally(() => clearTimeout(timer));
  };

  function withTimeout(promise, message, ms = SAVE_TIMEOUT_MS) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
  }

  function editorToast(message, type = 'ok') {
    const toast = document.querySelector('.kp-fe2-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `kp-fe2-toast is-visible is-${type}`;
    clearTimeout(editorToast.timer);
    editorToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function selectedHeaderStage() {
    const selected = document.querySelector('.kp-fe2-selected');
    if (!selected) return null;
    if (selected.matches('.kp-header-stage,.kp-header-photo,.kp-header-stage img,.kp-header-photo img')) {
      return selected.closest('.kp-header-stage') || selected.closest('.kp-header-photo') || document.querySelector('.kp-header-stage');
    }
    if (selected.querySelector?.('.kp-header-stage img,.kp-header-photo img')) {
      return selected.querySelector('.kp-header-stage') || selected.querySelector('.kp-header-photo') || document.querySelector('.kp-header-stage');
    }
    return selected.closest('header')?.querySelector('.kp-header-stage,.kp-header-photo') || null;
  }

  function syncInlineHeaderRadius(event) {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input || input.dataset.style !== 'radius' || !input.closest('.kp-fe2-inspector')) return;
    const stage = selectedHeaderStage();
    if (!stage) return;
    const radius = Math.max(0, Math.min(80, Number(input.value) || 0));
    inlineHeaderRadius = radius;
    stage.style.setProperty('border-radius', `${radius}px`, 'important');
    stage.querySelectorAll('img').forEach(img => img.style.setProperty('border-radius', `${radius}px`, 'important'));
  }

  function markFrontendDirty(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('.kp-fe2-inspector,[contenteditable="true"]') || target.closest('.kp-fe2-image-pick,.kp-fe2-up,.kp-fe2-down,.kp-fe2-reset')) {
      frontendDirty = true;
    }
  }
  document.addEventListener('input', markFrontendDirty, true);
  document.addEventListener('change', markFrontendDirty, true);
  document.addEventListener('click', markFrontendDirty, true);
  document.addEventListener('input', syncInlineHeaderRadius, true);
  document.addEventListener('change', syncInlineHeaderRadius, true);

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
    if (!cfg) return null;
    const controls = [...document.querySelectorAll('[data-design]')];
    const settings = { ...(cfg.design || {}) };
    controls.forEach(input => {
      const key = input?.dataset?.design;
      if (!key) return;
      settings[key] = input.type === 'checkbox'
        ? (input.checked ? 1 : 0)
        : (input.type === 'range' ? Number(input.value) : input.value);
    });
    if (inlineHeaderRadius !== null) settings.header_radius = inlineHeaderRadius;
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
    inlineHeaderRadius = null;
    return json.data || {};
  }

  function liveResponsiveSettings() {
    const cfg = window.KPOwnerResponsiveWeb;
    if (!cfg) return null;
    let settings = { ...(cfg.settings || {}) };
    try {
      const runtimeSettings = window.KPOwnerResponsiveRuntime?.settings?.();
      if (runtimeSettings && typeof runtimeSettings === 'object') settings = { ...settings, ...runtimeSettings };
    } catch (_) {}
    document.querySelectorAll('[data-kp-size]').forEach(input => {
      const key = input?.dataset?.kpSize;
      if (key) settings[key] = Number(input.value);
    });
    return settings;
  }

  async function persistResponsiveFallback() {
    const cfg = window.KPOwnerResponsiveWeb;
    const settings = liveResponsiveSettings();
    if (!cfg?.ajaxUrl || !cfg?.nonce || !settings || sameJson(settings, cfg.settings || {})) return { draft:false };
    const fd = new FormData();
    fd.append('action', 'kp_owner_sizes_save');
    fd.append('nonce', cfg.nonce);
    fd.append('settings', JSON.stringify(settings));
    const response = await fetch(cfg.ajaxUrl, { method:'POST', credentials:'same-origin', cache:'no-store', body:fd });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) throw new Error(json?.data?.message || 'Anzeigegrößen konnten nicht dauerhaft gespeichert werden.');
    cfg.settings = { ...(json.data?.settings || settings) };
    return json.data || {};
  }

  function liveMenuX() {
    const cfg = window.KPOwnerMenuX;
    if (!cfg) return null;
    try {
      if (window.KPOwnerMenuXRuntime?.value) return Number(window.KPOwnerMenuXRuntime.value()) || 0;
    } catch (_) {}
    const input = document.querySelector('[data-kp-menu-x] input[type="range"]');
    return input ? (Number(input.value) || 0) : (Number(cfg.value) || 0);
  }

  async function persistMenuXFallback() {
    const cfg = window.KPOwnerMenuX;
    const value = liveMenuX();
    if (!cfg?.ajaxUrl || !cfg?.nonce || value === null || Number(value) === Number(cfg.value || 0)) return { draft:false };
    const fd = new FormData();
    fd.append('action', 'kp_owner_menu_x_save');
    fd.append('nonce', cfg.nonce);
    fd.append('value', String(value));
    const response = await fetch(cfg.ajaxUrl, { method:'POST', credentials:'same-origin', cache:'no-store', body:fd });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) throw new Error(json?.data?.message || 'Horizontale Menüposition konnte nicht dauerhaft gespeichert werden.');
    cfg.value = Number(json.data?.value ?? value);
    return json.data || {};
  }

  async function flushTouchDrafts() {
    const owner = window.KPOwnerSaveRegistry;
    // The unified registry already covers design, responsive/menu positioning,
    // Canva layout/image, navigation, social, cards, records, header image and
    // AI. Do not immediately run the same fallbacks a second/third time.
    if (owner?.flushAll) {
      await owner.flushAll();
      return;
    }

    // Compatibility fallback for a partially loaded/older editor bundle.
    await persistLiveDesignFallback();
    await persistResponsiveFallback();
    await persistMenuXFallback();
    const generic = window.KPTouchGestureRuntime;
    const free = window.KPFreeLayoutRuntime;
    if (generic?.flush) await generic.flush();
    if (free?.flush && free !== generic) await free.flush();
  }

  function canUsePureFrontendFastPath() {
    if (!frontendDirty || typeof window.KPFrontendEditorNativeSave !== 'function') return false;
    const registry = window.KPOwnerSaveRegistry;
    if (!registry || typeof registry.isDirty !== 'function') return false;
    try {
      return registry.isDirty() === false;
    } catch (_) {
      return false;
    }
  }

  function beginUnifiedHistoryGroup() {
    try {
      window.KPUnifiedSaveCoverage?.beginGroup?.();
    } catch (_) {}
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
      // Pure FE2 text/content edits do not need the specialist owner/design/
      // touch registry. Keep this optimization inside the one authoritative
      // Save capture listener so registration order cannot create two competing
      // owners. Start the normal unified history group explicitly because the
      // document-level coverage listener is intentionally stopped here.
      const pureFrontendFastPath = canUsePureFrontendFastPath();
      if (pureFrontendFastPath) {
        beginUnifiedHistoryGroup();
      } else {
        await withTimeout(
          flushTouchDrafts(),
          'Das vorbereitende Speichern dauert ungewöhnlich lange. Bitte erneut versuchen.'
        );
      }

      // Owner/design/size/menu/touch-only edits are already durably persisted by
      // the unified registry. Reload directly when FE2 page content is untouched.
      if (!frontendDirty) {
        saveButton.innerHTML = '<span class="dashicons dashicons-saved"></span><span>Gespeichert ✓</span>';
        window.location.reload();
        return;
      }

      // Actual page text/image/style lives in FE2's private draft. The small head
      // bridge captured FE2's real listener when the editor built this button.
      // Call that function directly instead of dispatching another DOM click
      // through every capture listener a second time.
      const nativeSave = window.KPFrontendEditorNativeSave;
      if (typeof nativeSave !== 'function') throw new Error('Textspeichern ist noch nicht bereit. Bitte Seite neu laden.');
      replayingMainSave = true;
      saveButton.disabled = false;
      saveButton.innerHTML = originalHtml;
      await withTimeout(
        nativeSave(),
        'Textspeichern dauert ungewöhnlich lange. Bitte erneut versuchen.',
        SAVE_TIMEOUT_MS + 1000
      );
    } catch (error) {
      saveButton.disabled = false;
      saveButton.classList.remove('is-saving');
      saveButton.innerHTML = originalHtml;
      editorToast(error?.message || 'Eine Änderung konnte nicht dauerhaft gespeichert werden.', 'error');
    } finally {
      replayingMainSave = false;
      waitingForMainSave = false;
    }
  }, true);
})();
