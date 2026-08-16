(() => {
  'use strict';
  const cfg = window.KPFrontendEditor;
  if (!cfg || !cfg.editMode) return;

  let currentTerminStatus = '';
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    try {
      const options = args[1] || {};
      const body = options.body;
      if (body instanceof FormData && body.get('action') === 'kp_frontend_editor_save') {
        if (!body.has('page_key')) body.append('page_key', cfg.pageKey || '');
        if (!body.has('page_path')) body.append('page_path', window.location.pathname || '/');
      }
    } catch (e) {}

    const response = await originalFetch(...args);
    try {
      const options = args[1] || {};
      const body = options.body;
      if (body instanceof FormData && body.get('action') === 'kp_frontend_editor_record' && body.get('type') === 'termin') {
        const copy = response.clone();
        const json = await copy.json();
        if (json && json.success && json.data && json.data.status) currentTerminStatus = String(json.data.status);
      }
    } catch (e) {}
    return response;
  };

  const completeStatusSelect = (select) => {
    if (!select || select.dataset.kpStatusComplete === '1') return;
    const additions = [
      ['planned', 'In Planung'],
      ['box_office', 'Eintritt Tageskasse'],
    ];
    additions.forEach(([value, label]) => {
      if (![...select.options].some(o => o.value === value)) {
        const option = document.createElement('option');
        option.value = value; option.textContent = label;
        const sold = [...select.options].find(o => o.value === 'sold_out');
        if (sold) select.insertBefore(option, sold); else select.appendChild(option);
      }
    });
    if (currentTerminStatus && [...select.options].some(o => o.value === currentTerminStatus)) select.value = currentTerminStatus;
    select.dataset.kpStatusComplete = '1';
  };

  const scan = () => document.querySelectorAll('.kp-fe-modal [data-f="status"]').forEach(completeStatusSelect);
  new MutationObserver(scan).observe(document.documentElement, {childList:true,subtree:true});
  scan();
})();
