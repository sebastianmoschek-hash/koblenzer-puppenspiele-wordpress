(() => {
  'use strict';

  const cfg = window.KPOwnerWebApp;
  if (!cfg || !cfg.canEdit || !cfg.canDesign) return;

  const q = (s, r=document) => r.querySelector(s);
  const qa = (s, r=document) => [...r.querySelectorAll(s)];

  function toast(text, type='') {
    let el = q('.kp-oa-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'kp-oa-toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.className = 'kp-oa-toast is-visible' + (type ? ' is-' + type : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('is-visible'), 2800);
  }

  async function api(action, fields={}) {
    const fd = new FormData();
    fd.append('action', action);
    fd.append('nonce', cfg.nonce);
    Object.entries(fields).forEach(([k,v]) => fd.append(k, typeof v === 'string' ? v : JSON.stringify(v)));
    const response = await fetch(cfg.ajaxUrl, {method:'POST', credentials:'same-origin', body:fd});
    let json;
    try { json = await response.json(); } catch (e) { throw new Error('WordPress hat keine gültige Antwort geliefert.'); }
    if (!json.success) throw new Error(json.data?.message || 'Aktion fehlgeschlagen.');
    return json.data;
  }

  function designBox() {
    return q('.kp-oa-sheet.is-design');
  }

  function collectVisibleDesign() {
    const out = {...(cfg.design || {})};
    const box = designBox();
    if (!box) return out;
    qa('[data-design]', box).forEach(input => {
      const key = input.dataset.design;
      out[key] = input.type === 'checkbox' ? (input.checked ? 1 : 0) : (input.type === 'range' ? Number(input.value) : input.value);
    });
    return out;
  }

  function applyValues(values) {
    const box = designBox();
    if (!box || !values || typeof values !== 'object') return;
    qa('[data-design]', box).forEach(input => {
      const key = input.dataset.design;
      if (!Object.prototype.hasOwnProperty.call(values, key)) return;
      const value = values[key];
      if (input.type === 'checkbox') {
        input.checked = !!Number(value);
        input.dispatchEvent(new Event('change', {bubbles:true}));
      } else {
        input.value = value;
        input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true}));
      }
    });
  }

  function resetHorizontalMenuPosition() {
    const input = q('[data-kp-menu-x] input');
    if (!input) return;
    input.value = '0';
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
  }

  function installPresetUi() {
    const box = designBox();
    if (!box || q('.kp-oa-preset-panel', box)) return;
    const actions = q('.kp-oa-sticky-actions', box);
    if (!actions) return;

    const panel = document.createElement('div');
    panel.className = 'kp-oa-preset-panel';
    panel.innerHTML = `
      <div class="kp-oa-preset-head">
        <strong>Eigene Design-Presets</strong>
        <small>Drei Varianten speichern und später als Vorschau laden.</small>
      </div>
      <div class="kp-oa-preset-grid">
        ${[1,2,3].map(slot => `<div class="kp-oa-preset-slot"><b>Preset ${slot}</b><div><button type="button" class="kp-oa-secondary" data-preset-load="${slot}">Laden</button><button type="button" class="kp-oa-secondary" data-preset-save="${slot}">Speichern</button></div></div>`).join('')}
      </div>`;
    actions.parentNode.insertBefore(panel, actions);

    qa('[data-preset-save]', panel).forEach(btn => btn.addEventListener('click', async () => {
      const slot = Number(btn.dataset.presetSave);
      btn.disabled = true;
      try {
        const data = await api('kp_design_preset_save', {slot, settings:collectVisibleDesign()});
        toast(data.message || `Preset ${slot} gespeichert ✓`, 'ok');
      } catch (e) {
        toast(e.message, 'error');
      } finally { btn.disabled = false; }
    }));

    qa('[data-preset-load]', panel).forEach(btn => btn.addEventListener('click', async () => {
      const slot = Number(btn.dataset.presetLoad);
      btn.disabled = true;
      try {
        const data = await api('kp_design_preset_load', {slot});
        applyValues(data.settings || {});
        toast(data.message || `Preset ${slot} geladen`, 'ok');
      } catch (e) {
        toast(e.message, 'error');
      } finally { btn.disabled = false; }
    }));
  }

  // Factory reset is a draft action. It must reset every visible design
  // coordinate, including the separately persisted horizontal menu offset.
  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('.kp-oa-design-reset');
    if (!btn) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    btn.disabled = true;
    try {
      const data = await api('kp_design_factory_defaults');
      applyValues(data.settings || {});
      resetHorizontalMenuPosition();
      toast(data.message || 'Werkseinstellungen geladen', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    } finally { btn.disabled = false; }
  }, true);

  const observer = new MutationObserver(() => installPresetUi());
  observer.observe(document.documentElement, {childList:true, subtree:true});
  installPresetUi();
})();
