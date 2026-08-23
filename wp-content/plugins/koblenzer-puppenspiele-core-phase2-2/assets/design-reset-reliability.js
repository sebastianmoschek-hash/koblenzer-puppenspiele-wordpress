(() => {
  'use strict';

  const isReset = target => target instanceof Element ? target.closest('.kp-oa-design-reset') : null;

  function resetHorizontalMenuPosition(sheet) {
    const input = sheet?.querySelector('[data-kp-menu-x] input');
    if (!input) return;
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function applyDefaults(button) {
    if (!button || button.dataset.kpResetApplying === '1') return false;
    const sheet = button.closest('.kp-oa-sheet.is-design');
    const defaults = window.KPOwnerWebApp?.designDefaults;
    if (!sheet || !defaults || typeof defaults !== 'object') return false;

    button.dataset.kpResetApplying = '1';
    try {
      sheet.querySelectorAll('[data-design]').forEach(input => {
        const key = input.dataset.design;
        if (!key || !Object.prototype.hasOwnProperty.call(defaults, key)) return;
        const value = defaults[key];

        if (input instanceof HTMLInputElement && input.type === 'checkbox') {
          input.checked = Number(value) !== 0 && value !== false;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }

        if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement) {
          input.value = String(value ?? '');
          const eventType = input instanceof HTMLSelectElement ? 'change' : 'input';
          input.dispatchEvent(new Event(eventType, { bubbles: true }));
        }
      });
      resetHorizontalMenuPosition(sheet);
      return true;
    } finally {
      delete button.dataset.kpResetApplying;
    }
  }

  // Some mobile browsers suppress the synthetic click immediately after the
  // Design sheet has scrolled. Apply the preview on the real touch/pen release
  // so the first tap always works. No AJAX request is made here.
  document.addEventListener('pointerup', event => {
    if (!['touch', 'pen'].includes(event.pointerType)) return;
    const button = isReset(event.target);
    if (!button) return;
    if (applyDefaults(button)) event.preventDefault();
  }, true);

  // Legacy iOS/WebViews without PointerEvent support.
  if (!('PointerEvent' in window)) {
    document.addEventListener('touchend', event => {
      const button = isReset(event.target);
      if (!button) return;
      if (applyDefaults(button)) event.preventDefault();
    }, { capture: true, passive: false });
  }

  // Desktop/mouse and normal browser click path. Stop the historical owner
  // handler from reopening the sheet and restoring the old stored values.
  document.addEventListener('click', event => {
    const button = isReset(event.target);
    if (!button) return;
    if (!applyDefaults(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
