(() => {
  'use strict';

  const cfg = window.KPTouchPersistence;
  if (!cfg?.ajaxUrl || !cfg?.pageKey) return;

  const clone = value => JSON.parse(JSON.stringify(value || {}));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const mirrorKey = `kpFreeLayoutMirror:${cfg.pageKey}`;
  const headerSelector = '.kp-header-stage img,.kp-header-photo img';
  const menuButtonSelector = '.kp-site-nav .wp-block-navigation__responsive-container-open';
  const menuPanelSelector = '.kp-site-nav .wp-block-navigation__responsive-close';
  let authoritative = null;
  let mutationFrame = 0;

  function device() {
    const width = window.innerWidth;
    if (width <= 640) return 'mobile';
    if (width <= 900) return 'tablet';
    if (width <= 1400) return 'laptop';
    return 'desktop';
  }

  function editorHasLocalTouchState() {
    if (!cfg.canEdit) return false;
    if (document.body?.classList.contains('kp-touch-layout-dirty')) return true;
    if (document.body?.classList.contains('kp-gesture-in-progress')) return true;
    if (document.querySelector('.kp-free-layout-active,.kp-gesture-active')) return true;
    if (window.KPFreeLayoutRuntime?.isDirty?.()) return true;
    if (window.KPTouchGestureRuntime?.isDirty?.()) return true;
    return false;
  }

  function normalized(payload) {
    return {
      global: clone(payload?.global),
      page: clone(payload?.page),
      pageKey: String(payload?.pageKey || cfg.pageKey),
      revision: String(payload?.revision || '')
    };
  }

  function saveMirror(payload) {
    const data = normalized(payload);
    try {
      localStorage.setItem(mirrorKey, JSON.stringify({
        global: data.global,
        page: data.page,
        pageKey: data.pageKey,
        revision: data.revision,
        savedAt: Date.now()
      }));
    } catch (_) {}
    return data;
  }

  function dataForElement(key, scope) {
    const currentDevice = device();
    const bucket = scope === 'global' ? authoritative?.global : authoritative?.page;
    return bucket?.[key]?.[currentDevice] || {x:0, y:0, scale:1};
  }

  function applyElement(el, key, scope, kind = 'normal') {
    if (!el || !key || !authoritative) return;
    const value = dataForElement(key, scope);
    const x = Number(value.x) || 0;
    const y = Number(value.y) || 0;
    const scale = clamp(Number(value.scale) || 1, .45, 2.5);
    const transform = kind === 'menu-panel'
      ? `translate3d(${x}px,calc(-50% + ${y}px),0) scale(${scale})`
      : `translate3d(${x}px,${y}px,0) scale(${scale})`;
    el.style.setProperty('transform', transform, 'important');
    el.style.setProperty('transform-origin', 'center center', 'important');
  }

  function ensureKnownKeys() {
    const button = document.querySelector(menuButtonSelector);
    if (button) button.dataset.kpFreeLayoutKey = 'menu-button';
    const panel = document.querySelector(menuPanelSelector);
    if (panel) panel.dataset.kpFreeLayoutKey = 'menu-panel';
    document.querySelectorAll(headerSelector).forEach((image, index) => {
      image.dataset.kpFreeLayoutKey = `header-image-${index + 1}`;
    });
  }

  function applyAuthoritative(force = false) {
    if (!authoritative) return;
    if (!force && editorHasLocalTouchState()) return;
    ensureKnownKeys();
    document.querySelectorAll('[data-kp-free-layout-key]').forEach(el => {
      const key = el.dataset.kpFreeLayoutKey;
      if (!key) return;
      let kind = 'normal';
      if (key === 'menu-button') kind = 'menu-button';
      else if (key === 'menu-panel') kind = 'menu-panel';
      else if (key.startsWith('header-image-')) kind = 'header-image';
      const scope = kind !== 'normal' || el.closest('header,footer') ? 'global' : 'page';
      applyElement(el, key, scope, kind);
    });
  }

  function scheduleApply() {
    if (mutationFrame) return;
    mutationFrame = requestAnimationFrame(() => {
      mutationFrame = 0;
      applyAuthoritative();
    });
  }

  function hydrateEditorInPlace(payload) {
    if (!cfg.canEdit || !window.KPFreeLayout || editorHasLocalTouchState()) return false;
    const live = normalized(payload);
    const runtime = window.KPFreeLayoutRuntime;
    if (runtime?.hydrate) {
      return runtime.hydrate(live);
    }
    window.KPFreeLayout.global = clone(live.global);
    window.KPFreeLayout.page = clone(live.page);
    return true;
  }

  async function loadLive() {
      if (editorHasLocalTouchState()) return;
      const fd = new FormData();
      fd.append('action', 'kp_touch_free_layout_load');
      fd.append('page_key', cfg.pageKey);
      // Watchdog (Lauf 21/22, CI-Staging nachgewiesen): Ein haengender
      // Layout-Load-POST durfte den Seiteneinstieg blockieren - der Renderer
      // wedged, domcontentloaded feuert nie. Abort nach 12s gibt die Verbindung
      // frei; bis dahin bleibt der letzte spiegelbildliche Stand aus
      // localStorage aktiv (siehe Mirror-Restore unten). Server gesund = Antwort
      // in ~150ms, das Timeout greift nie. Reversibel und rein defensiv.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await upstreamFetch(cfg.ajaxUrl, {method:'POST', credentials:'same-origin', cache:'no-store', body:fd, signal:controller.signal});
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success || editorHasLocalTouchState()) return;
        const live = saveMirror(json.data || {});
        authoritative = live;
        hydrateEditorInPlace(live);
        applyAuthoritative();
      } catch (_) {
        // Layout-Load fehlgeschlagen oder abgebrochen: gespiegelten Stand weiter
        // verwenden; der naechste loadLive()-Aufruf (focus/pageshow) versucht es
        // erneut. Kein Fehler-Toast noetig, das Layout ist progressiv.
      } finally {
        clearTimeout(timer);
      }
    }

  const upstreamFetch = window.fetch.bind(window);
  window.fetch = function(input, init = {}) {
    const body = init?.body;
    const action = body instanceof FormData ? String(body.get('action') || '') : '';
    const responsePromise = upstreamFetch(input, init);

    if (action === 'kp_touch_free_layout_save') {
      responsePromise.then(async response => {
        const json = await response.clone().json().catch(() => null);
        if (!response.ok || !json?.success || json?.data?.draft) return;
        const saved = saveMirror({
          global: json.data?.global || window.KPFreeLayout?.global || {},
          page: json.data?.page || window.KPFreeLayout?.page || {},
          pageKey: cfg.pageKey,
          revision: ''
        });
        authoritative = saved;
        if (window.KPFreeLayout) {
          window.KPFreeLayout.global = clone(saved.global);
          window.KPFreeLayout.page = clone(saved.page);
        }
        applyAuthoritative(true);
      }).catch(() => null);
    }

    return responsePromise;
  };

  try {
    const mirror = JSON.parse(localStorage.getItem(mirrorKey) || 'null');
    if (mirror && mirror.pageKey === cfg.pageKey) {
      authoritative = normalized(mirror);
      applyAuthoritative();
    }
  } catch (_) {}

  new MutationObserver(scheduleApply).observe(document.documentElement, {childList:true, subtree:true});
  window.addEventListener('pageshow', () => loadLive().catch(() => null));
  window.addEventListener('focus', () => loadLive().catch(() => null), {passive:true});
  loadLive().catch(() => null);
})();