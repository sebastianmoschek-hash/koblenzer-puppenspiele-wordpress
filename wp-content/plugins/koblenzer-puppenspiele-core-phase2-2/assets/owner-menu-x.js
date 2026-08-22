(() => {
  'use strict';
  const cfg = window.KPOwnerMenuX;
  if (!cfg) return;

  let draft = Number(cfg.value) || 0;
  let dirty = false;
  let designFlush = null;

  function apply(value) {
    document.documentElement.style.setProperty('--kp-owner-menu-offset-x', `${value}px`);
  }

  function markDirty() {
    dirty = true;
    document.querySelector('.kp-fe2-save')?.classList.add('is-dirty');
  }

  function liveInput() {
    return document.querySelector('[data-kp-menu-x] input[type="range"]');
  }

  function syncLiveValue() {
    const input = liveInput();
    if (input) draft = Number(input.value) || 0;
    return draft;
  }

  function hasChanges() {
    return dirty || Number(syncLiveValue()) !== Number(cfg.value || 0);
  }

  function inject() {
    const pane = document.querySelector('.kp-oa-tab[data-pane="menu"]');
    if (!pane || pane.querySelector('[data-kp-menu-x]')) return;

    const verticalInput = pane.querySelector('[data-design="menu_offset_y"]');
    const verticalLabel = verticalInput?.closest('label');
    if (!verticalLabel) return;

    if (!pane.querySelector('[data-kp-menu-position-title]')) {
      const title = document.createElement('h4');
      title.dataset.kpMenuPositionTitle = '1';
      title.textContent = 'Position des Menüs';
      verticalLabel.insertAdjacentElement('beforebegin', title);
      const hint = document.createElement('p');
      hint.className = 'kp-oa-size-note';
      hint.textContent = 'Vertikal = hoch/runter · Horizontal = links/rechts';
      title.insertAdjacentElement('afterend', hint);
    }

    const label = document.createElement('label');
    label.className = 'kp-oa-control';
    label.dataset.kpMenuX = '1';
    label.innerHTML = `<span><strong>Horizontale Position</strong><output>${draft} px</output></span><input type="range" min="-180" max="180" step="2" value="${draft}" data-unit="px"><small>Links ↔ rechts verschieben</small>`;
    verticalLabel.insertAdjacentElement('afterend', label);

    const range = label.querySelector('input');
    const output = label.querySelector('output');
    range.addEventListener('input', () => {
      draft = Number(range.value) || 0;
      output.textContent = `${draft} px`;
      apply(draft);
      markDirty();
    });
  }

  async function flush() {
    syncLiveValue();
    if (!hasChanges()) return {draft:false, value:draft};
    const fd = new FormData();
    fd.append('action', 'kp_owner_menu_x_save');
    fd.append('nonce', cfg.nonce || '');
    fd.append('value', String(draft));
    const response = await fetch(cfg.ajaxUrl, {method:'POST', credentials:'same-origin', cache:'no-store', body:fd});
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) throw new Error(json?.data?.message || 'Horizontale Menüposition konnte nicht gespeichert werden.');
    cfg.value = Number(json.data?.value ?? draft);
    draft = cfg.value;
    dirty = false;
    apply(draft);
    return json.data || {};
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-action="design"]')) setTimeout(inject, 0);
    if (target?.closest('[data-tab="menu"]')) setTimeout(inject, 0);
    if (target?.closest('.kp-oa-design-reset')) {
      draft = 0;
      apply(0);
      markDirty();
      setTimeout(inject, 0);
    }
    if (target?.closest('.kp-oa-design-save') && hasChanges()) {
      // The design dialog has its own explicit save button. Persist the
      // horizontal menu position from the same user action before the dialog
      // reloads the page. Reuse one in-flight request to prevent duplicates.
      if (!designFlush) {
        designFlush = flush().catch(err => {
          console.error('[KP] Menü-X konnte beim Design-Speichern nicht gespeichert werden.', err);
          throw err;
        }).finally(() => { designFlush = null; });
      }
    }
  }, true);

  new MutationObserver(inject).observe(document.documentElement, {childList:true, subtree:true});
  window.KPOwnerMenuXRuntime = {
    flush,
    isDirty: () => hasChanges(),
    value: () => syncLiveValue()
  };
  apply(draft);
})();