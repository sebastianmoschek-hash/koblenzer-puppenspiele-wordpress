(() => {
  'use strict';
  const cfg = window.KPFrontendCardControls;
  if (!cfg) return;

  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const pathKey = (url) => {
    try {
      const path = new URL(url, window.location.href).pathname.replace(/^\/+|\/+$/g, '');
      return '/' + path + '/';
    } catch (e) { return ''; }
  };

  function cardPermalink(card) {
    return card?.querySelector('h3 a')?.href || card?.querySelector('.kp-repertoire-image')?.href || '';
  }

  function applyButtonOverrides() {
    document.querySelectorAll('.kp-repertoire-card').forEach(card => {
      const ov = cfg.overrides?.[pathKey(cardPermalink(card))];
      if (!ov) return;
      const more = card.querySelector('.kp-repertoire-card-actions .kp-termine-button-outline');
      const book = [...card.querySelectorAll('.kp-repertoire-card-actions .kp-termine-button')].find(a => !a.classList.contains('kp-termine-button-outline'));
      if (more) {
        if (ov.more_label) more.textContent = ov.more_label;
        if (ov.more_url) more.href = ov.more_url;
      }
      if (book) {
        if (ov.book_label) book.textContent = ov.book_label;
        if (ov.book_url) book.href = ov.book_url;
      }
    });
  }
  applyButtonOverrides();

  if (!cfg.editMode) return;

  const base = window.KPFrontendEditor || {};
  let sheet = null;

  function notice(text, type = '') {
    let el = document.querySelector('.kp-fe-card-notice');
    if (!el) {
      el = document.createElement('div');
      el.className = 'kp-fe-card-notice';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.className = 'kp-fe-card-notice is-visible' + (type ? ' is-' + type : '');
    clearTimeout(notice.t);
    notice.t = setTimeout(() => el.classList.remove('is-visible'), 2400);
  }

  async function post(action, fields = {}) {
    const fd = new FormData();
    fd.append('action', action);
    fd.append('nonce', cfg.nonce || base.nonce || '');
    Object.entries(fields).forEach(([key, value]) => fd.append(key, typeof value === 'string' ? value : JSON.stringify(value)));
    const res = await fetch(cfg.ajaxUrl || base.ajaxUrl, {method:'POST', credentials:'same-origin', body:fd});
    const json = await res.json();
    if (!json.success) throw new Error(json.data?.message || 'Aktion fehlgeschlagen');
    return json.data;
  }

  function recordSignature(card) {
    return {
      title: card.querySelector('h3')?.textContent.trim() || '',
      href: cardPermalink(card)
    };
  }

  async function resolveRecord(card) {
    return post('kp_frontend_editor_record', {type:'repertoire', signature:recordSignature(card)});
  }

  function closeSheet() {
    if (sheet) sheet.remove();
    sheet = null;
  }

  async function editButton(card, anchor, role) {
    notice('Button wird geöffnet …');
    try {
      const record = await resolveRecord(card);
      closeSheet();
      sheet = document.createElement('div');
      sheet.className = 'kp-fe-card-sheet-backdrop';
      sheet.innerHTML = `<div class="kp-fe-card-sheet" role="dialog" aria-modal="true" aria-label="Button bearbeiten">
        <div class="kp-fe-card-sheet-head"><div><strong>Button bearbeiten</strong><small>${role === 'more' ? '„Mehr erfahren“-Button' : '„Buchen“-Button'} von ${esc(record.title)}</small></div><button type="button" class="kp-fe-card-sheet-close" aria-label="Schließen">×</button></div>
        <label>Beschriftung<input type="text" class="kp-fe-card-label" value="${esc(anchor.textContent.trim())}"></label>
        <label>Link-Ziel<input type="url" class="kp-fe-card-url" value="${esc(anchor.getAttribute('href') || '')}"></label>
        <p class="kp-fe-card-help">Im Bearbeitungsmodus öffnet der Button keine Seite. Hier änderst du Text und Ziel direkt.</p>
        <div class="kp-fe-card-sheet-actions"><button type="button" class="kp-fe-card-cancel">Abbrechen</button><button type="button" class="kp-fe-card-save">Speichern</button></div>
      </div>`;
      document.body.appendChild(sheet);
      const close = () => closeSheet();
      sheet.querySelector('.kp-fe-card-sheet-close').onclick = close;
      sheet.querySelector('.kp-fe-card-cancel').onclick = close;
      sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
      sheet.querySelector('.kp-fe-card-save').onclick = async () => {
        const btn = sheet.querySelector('.kp-fe-card-save');
        const label = sheet.querySelector('.kp-fe-card-label').value.trim();
        const url = sheet.querySelector('.kp-fe-card-url').value.trim();
        btn.disabled = true; btn.textContent = 'Speichert …';
        try {
          const data = await post('kp_frontend_card_button_save', {id:String(record.id), role, label, url});
          anchor.textContent = data.label;
          anchor.href = data.url;
          const key = pathKey(cardPermalink(card));
          cfg.overrides[key] = cfg.overrides[key] || {};
          cfg.overrides[key][role + '_label'] = data.label;
          cfg.overrides[key][role + '_url'] = data.url;
          closeSheet(); notice('Button gespeichert ✓', 'ok');
        } catch (err) {
          notice(err.message || 'Button konnte nicht gespeichert werden.', 'error');
          btn.disabled = false; btn.textContent = 'Speichern';
        }
      };
      setTimeout(() => sheet.querySelector('.kp-fe-card-label')?.focus(), 60);
    } catch (err) { notice(err.message || 'Stück konnte nicht gefunden werden.', 'error'); }
  }

  async function replaceImage(card) {
    if (!window.wp || !wp.media) { notice('Mediathek konnte nicht geöffnet werden.', 'error'); return; }
    notice('Bildauswahl wird geöffnet …');
    try {
      const record = await resolveRecord(card);
      const frame = wp.media({title:'Titelbild auswählen', button:{text:'Dieses Bild verwenden'}, multiple:false, library:{type:'image'}});
      frame.on('select', async () => {
        const attachment = frame.state().get('selection').first().toJSON();
        try {
          const data = await post('kp_frontend_card_image_save', {id:String(record.id), attachment_id:String(attachment.id)});
          const img = card.querySelector('.kp-repertoire-image img');
          if (img) {
            img.src = data.src || attachment.url;
            img.alt = attachment.alt || attachment.title || record.title || '';
            img.removeAttribute('srcset'); img.removeAttribute('sizes');
          }
          notice('Bild gespeichert ✓', 'ok');
        } catch (err) { notice(err.message || 'Bild konnte nicht gespeichert werden.', 'error'); }
      });
      frame.open();
    } catch (err) { notice(err.message || 'Stück konnte nicht gefunden werden.', 'error'); }
  }

  /* Run before the older document-level editor listener. On repertoire cards,
     links never navigate while editing. Image/button taps get their own direct
     controls; title/text/facts continue to the existing full record editor. */
  window.addEventListener('click', (e) => {
    if (e.target.closest('.kp-fe-toolbar,.kp-fe-panel,.kp-fe-modal-backdrop,.kp-fe-quick,.kp-fe-card-sheet-backdrop,#wpadminbar')) return;
    const card = e.target.closest('.kp-repertoire-card');
    if (!card) return;

    const link = e.target.closest('a');
    if (link) e.preventDefault();

    const image = e.target.closest('.kp-repertoire-image');
    if (image) {
      e.preventDefault(); e.stopPropagation();
      replaceImage(card);
      return;
    }

    const action = e.target.closest('.kp-repertoire-card-actions .kp-termine-button');
    if (action) {
      e.preventDefault(); e.stopPropagation();
      editButton(card, action, action.classList.contains('kp-termine-button-outline') ? 'more' : 'book');
    }
  }, true);

  /* A small usability hint that matches the fine-grained card behavior. */
  const hint = document.querySelector('.kp-fe-hint');
  if (hint) hint.textContent = 'Text antippen = bearbeiten · Bild antippen = austauschen · Button antippen = Button ändern';

  /* Compatibility: preserve the two appointment statuses that existed before
     the first direct-editor modal was introduced. */
  function ensureTerminStatuses(root = document) {
    root.querySelectorAll?.('.kp-fe-modal select[data-f="status"]').forEach(select => {
      if (!select.querySelector('option[value="planned"]')) select.insertAdjacentHTML('beforeend', '<option value="planned">In Planung</option>');
      if (!select.querySelector('option[value="box_office"]')) select.insertAdjacentHTML('beforeend', '<option value="box_office">Eintritt Tageskasse</option>');
    });
  }
  const observer = new MutationObserver(() => ensureTerminStatuses());
  observer.observe(document.body, {childList:true, subtree:true});
  ensureTerminStatuses();
})();
