(() => {
  'use strict';
  const cfg = window.KPOwnerMenuX;
  if (!cfg) return;

  let draft = Number(cfg.value) || 0;

  function apply(value) {
    document.documentElement.style.setProperty('--kp-owner-menu-offset-x', `${value}px`);
  }

  function inject() {
    const pane = document.querySelector('.kp-oa-tab[data-pane="menu"]');
    if (!pane || pane.querySelector('[data-kp-menu-x]')) return;
    const heading = [...pane.querySelectorAll('h3')].find(h => /Handy\s*\/\s*Tablet/i.test(h.textContent || ''));
    if (!heading) return;

    const label = document.createElement('label');
    label.className = 'kp-oa-control';
    label.dataset.kpMenuX = '1';
    label.innerHTML = `<span><strong>Horizontale Position</strong><output>${draft} px</output></span><input type="range" min="-180" max="180" step="2" value="${draft}" data-unit="px"><small>Links ↔ rechts verschieben</small>`;
    heading.insertAdjacentElement('afterend', label);

    const range = label.querySelector('input');
    const output = label.querySelector('output');
    range.addEventListener('input', () => {
      draft = Number(range.value) || 0;
      output.textContent = `${draft} px`;
      apply(draft);
    });
  }

  async function save() {
    const fd = new FormData();
    fd.append('action', 'kp_owner_menu_x_save');
    fd.append('nonce', cfg.nonce || '');
    fd.append('value', String(draft));
    const response = await fetch(cfg.ajaxUrl, {method:'POST', credentials:'same-origin', body:fd});
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) throw new Error(json?.data?.message || 'Horizontale Menüposition konnte nicht gespeichert werden.');
    cfg.value = Number(json.data?.value ?? draft);
    draft = cfg.value;
    apply(draft);
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-action="design"]')) setTimeout(inject, 0);
    if (target?.closest('.kp-oa-design-reset')) {
      draft = 0;
      apply(0);
      setTimeout(inject, 0);
    }
    if (target?.closest('.kp-oa-design-save')) {
      save().catch(error => console.error('[KP menu x]', error));
    }
  }, true);

  new MutationObserver(inject).observe(document.documentElement, {childList:true, subtree:true});
  apply(draft);
})();
