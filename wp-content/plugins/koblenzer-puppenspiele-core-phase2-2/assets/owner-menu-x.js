(() => {
  'use strict';
  const cfg = window.KPOwnerMenuX;
  if (!cfg) return;

  let draft = Number(cfg.value) || 0;
  let dirty = false;

  function apply(value) {
    document.documentElement.style.setProperty('--kp-owner-menu-offset-x', `${value}px`);
  }

  function markDirty() {
    dirty = true;
    document.querySelector('.kp-fe2-save')?.classList.add('is-dirty');
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
    if (!dirty) return {draft:false, value:draft};
    const fd = new FormData();
    fd.append('action', 'kp_owner_menu_x_save');
    fd.append('nonce', cfg.nonce || '');
    fd.append('value', String(draft));
    const response = await fetch(cfg.ajaxUrl, {method:'POST', credentials:'same-origin', body:fd});
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
  }, true);

  new MutationObserver(inject).observe(document.documentElement, {childList:true, subtree:true});
  window.KPOwnerMenuXRuntime = {
    flush,
    isDirty: () => dirty,
    value: () => draft
  };
  apply(draft);
})();