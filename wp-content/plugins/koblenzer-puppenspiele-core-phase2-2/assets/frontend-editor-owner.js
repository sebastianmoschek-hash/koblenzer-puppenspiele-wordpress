(() => {
  'use strict';
  const cfg = window.KPFrontendEditorV2;
  if (!cfg || !cfg.canEdit) return;

  function addLauncher() {
    if (document.querySelector('.kp-owner-edit-launcher')) return;
    const a = document.createElement('a');
    a.className = 'kp-owner-edit-launcher';
    a.href = cfg.editUrl;
    a.setAttribute('aria-label', 'Website bearbeiten');
    a.innerHTML = '<span class="dashicons dashicons-edit"></span><strong>Website bearbeiten</strong>';
    document.body.appendChild(a);
  }

  function simplifyEditor() {
    const toolbar = document.querySelector('.kp-fe2-toolbar');
    if (!toolbar) return;

    document.querySelectorAll('#wp-admin-bar-kp-frontend-edit-v2,#wp-admin-bar-kp-quick-edit').forEach((node) => node.remove());
    document.querySelector('.kp-fe2-device-wrap')?.remove();

    const exit = toolbar.querySelector('.kp-fe2-exit');
    if (exit) {
      exit.title = 'Bearbeitung beenden';
      const label = exit.querySelector('span:not(.dashicons)');
      if (label) label.textContent = 'Fertig';
    }

    if (!toolbar.querySelector('.kp-fe2-preview')) {
      const preview = document.createElement('a');
      preview.className = 'kp-fe2-preview';
      preview.href = cfg.exitUrl;
      preview.target = '_blank';
      preview.rel = 'noopener';
      preview.title = 'Besucheransicht öffnen';
      preview.innerHTML = '<span class="dashicons dashicons-visibility"></span><span>Vorschau</span>';
      const save = toolbar.querySelector('.kp-fe2-save');
      toolbar.insertBefore(preview, save || null);
    }

    const hint = document.querySelector('.kp-fe2-hint');
    if (hint) hint.textContent = 'Inhalt antippen = bearbeiten · Menü und Stücktitel = öffnen';
  }

  if (!cfg.editMode) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addLauncher, {once:true});
    else addLauncher();
    return;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', simplifyEditor, {once:true});
  else simplifyEditor();
})();
