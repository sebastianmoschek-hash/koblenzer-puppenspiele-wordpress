(() => {
  'use strict';

  const editor = window.KPFrontendEditorV2;
  if (!editor?.editMode) return;

  const clone = value => JSON.parse(JSON.stringify(value || {}));
  const upstreamFetch = window.fetch.bind(window);
  const committed = {
    kp_touch_gesture_save: {
      global: clone(window.KPTouchGestures?.global),
      page: clone(window.KPTouchGestures?.page)
    },
    kp_touch_free_layout_save: {
      global: clone(window.KPFreeLayout?.global),
      page: clone(window.KPFreeLayout?.page)
    }
  };

  let explicitSaveUntil = 0;

  function actionFrom(init) {
    const body = init?.body;
    return body instanceof FormData ? String(body.get('action') || '') : '';
  }

  function snapshotFrom(body, fallback) {
    const parse = (name, value) => {
      try { return JSON.parse(String(body.get(name) || '{}')); }
      catch (_) { return clone(value); }
    };
    return {
      global: parse('global', fallback?.global || {}),
      page: parse('page', fallback?.page || {})
    };
  }

  function writeVerifiedMirror(action, snapshot) {
    if (action !== 'kp_touch_free_layout_save') return;
    const pageKey = String(window.KPFreeLayout?.pageKey || '');
    if (!pageKey) return;
    try {
      localStorage.setItem(`kpFreeLayoutMirror:${pageKey}`, JSON.stringify({
        global: clone(snapshot.global),
        page: clone(snapshot.page),
        pageKey,
        revision: '',
        savedAt: Date.now()
      }));
    } catch (_) {}
    if (window.KPFreeLayout) {
      window.KPFreeLayout.global = clone(snapshot.global);
      window.KPFreeLayout.page = clone(snapshot.page);
    }
  }

  function fakeDraftResponse(action) {
    const stable = committed[action] || {global:{}, page:{}};
    let cloneCount = 0;
    const successPayload = {
      success: true,
      data: {
        message: 'Änderung als Entwurf vorgemerkt.',
        draft: true,
        global: clone(stable.global),
        page: clone(stable.page)
      }
    };
    const ignorePayload = {
      success: false,
      data: {message: 'Entwurf – noch nicht dauerhaft gespeichert.', draft: true}
    };
    return {
      ok: true,
      status: 200,
      headers: new Headers({'content-type':'application/json'}),
      json: async () => clone(successPayload),
      text: async () => JSON.stringify(successPayload),
      clone: () => {
        cloneCount += 1;
        const payload = cloneCount === 1 ? successPayload : ignorePayload;
        return {
          ok: true,
          status: 200,
          headers: new Headers({'content-type':'application/json'}),
          json: async () => clone(payload),
          text: async () => JSON.stringify(payload)
        };
      }
    };
  }

  function markDraftUi() {
    document.body.classList.add('kp-touch-layout-dirty');
    const save = document.querySelector('.kp-fe2-save');
    if (save) save.classList.add('is-dirty');
    setTimeout(() => {
      const hud = document.querySelector('.kp-gesture-hud');
      if (!hud) return;
      if (/gespeichert|sichern/i.test(hud.textContent || '')) {
        hud.textContent = 'Geändert – zum Übernehmen „Speichern“ antippen';
      }
    }, 0);
  }

  window.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('.kp-fe2-save')) return;
    explicitSaveUntil = Date.now() + 12000;
  }, true);

  window.fetch = function(input, init = {}) {
    const action = actionFrom(init);
    if (!(action in committed)) return upstreamFetch(input, init);

    const body = init.body;
    if (Date.now() < explicitSaveUntil) {
      const snapshot = snapshotFrom(body, committed[action]);
      const request = upstreamFetch(input, init);
      request.then(async response => {
        const json = await response.clone().json().catch(() => null);
        if (!response.ok || !json?.success) return;
        const saved = {
          global: clone(json.data?.global || snapshot.global),
          page: clone(json.data?.page || snapshot.page)
        };
        committed[action] = saved;
        writeVerifiedMirror(action, saved);
        document.body.classList.remove('kp-touch-layout-dirty');
      }).catch(() => null);
      return request;
    }

    markDraftUi();
    return Promise.resolve(fakeDraftResponse(action));
  };
})();
