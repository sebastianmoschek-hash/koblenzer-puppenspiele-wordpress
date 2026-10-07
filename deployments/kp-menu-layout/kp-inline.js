/* KP Studio – Inline-Modus (29.09.2026)
   Bearbeiten sieht exakt aus wie die Vorschau: keine Leisten, kein Body-Padding, keine Rahmen.
   · Tippen auf Text = direkt im Text schreiben (contenteditable), Links/Buttons navigieren nicht.
   · Tippen auf Bild = wählen (+ Mini-Popover „Austauschen“), erneutes Tippen = Bild austauschen
     (Web-Optimierung + api/image-upload.php aus kp-studio-plus.js; Repertoire: vorhandener Upload).
   · Gedrückt halten (~400 ms) und ziehen = frei verschieben (vorhandene Drag-/Raster-Logik aus modern.js),
     zwei Finger = Zoom/Drehen (mobile-studio.js). Normales Scrollen bleibt, weil erst der Long-Press zieht.
   · Ein schwebender Knopf unten rechts öffnet ein kompaktes Bottom-Sheet; Entwurf wird automatisch gespeichert.
   Veröffentlicht nie von selbst. „Klassische Werkzeuge“ schaltet die alten Leisten wieder ein. */
/* ☰-Menü offen → html.kp-menu-open (Fallback zu :has() in kp-inline.css: Buchungsleiste/✎ ausblenden, damit die untersten Einträge frei sind) */
(() => {
  const m = document.querySelector('[data-mobile-menu]'); if (!m) return;
  const sync = () => document.documentElement.classList.toggle('kp-menu-open', m.classList.contains('open'));
  new MutationObserver(sync).observe(m, { attributes: true, attributeFilter: ['class'] }); sync();
})();
(() => {
  'use strict';
  const S = () => window.KPStudio;
  if (!S()) return;
  const body = document.body, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const isPhone = () => matchMedia('(max-width: 900px)').matches;
  const editing = () => body.classList.contains('editing');
  const ss = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch {} return null; };
  let classic = false; ss('kp-classic', '0'); // sammel3 (W7): kein zweiter, alter Editor mehr über das Menü („🧰 Werkzeuge“ entfernt)
  const inline = () => editing() && !classic && body.classList.contains('kp-inline');
  body.classList.toggle('kp-inline', !classic);
  const CONTENT = 'main,.masthead,.footer,.desktop-nav,.mobile-menu nav,.mobile-conversion-bar,[data-detail-body]';
  const SKIP = '.kp-il-ui,dialog,.studio-bar,.builder-tools,.mobile-editor-bar,.kp-phone-ui,.resize-handle,.move-handle,[data-piece-close],[data-menu-button],.search-dialog,input,select,textarea,option,label,.contrast-toggle,.site-search,.hero-controls,.settings-modal,.studio-link-dialog,.studio-responsive-preview,[data-transient]';
  const el = (tag, cls, html = '') => { const n = document.createElement(tag); n.className = cls; n.innerHTML = html; n.dataset.transient = ''; return n; };
  const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const inContent = n => !!n?.closest?.(CONTENT) && !n.closest('[data-transient]');
  const pieceLinkOf = n => (n && !n.closest('.piece') && n.closest('a[data-piece-name]')) || null;
  function editableOf(t) {
    const img = t.closest('img[data-editable-image]'); if (img && inContent(img)) return img;
    // sammel10: Tipp auf Bildrahmen/Zier-Span (Figur, Video-Vorschau, Poster, Spielleiste) wählt das Bild darin
    const fr = t.closest('.kp-fig-pic,.kp-vid-th-im,.kp-vid-poster,.kp-bs-step-im'); if (fr) { const im = fr.querySelector('img[data-editable-image]'); if (im && inContent(im)) return im; }
    const tx = t.closest('[data-editable-text]'); if (tx && inContent(tx)) return tx;
    return null;
  }
  // sammel2 (UX 4): Teile einer Kachel/eines Knopfs (span in a.button, z. B. „Uns buchen“ + Unterzeile) – Verschieben/Ebene/Kopieren/Löschen gelten dem ganzen Knopf
  // sammel3: Knöpfe „Uns buchen“/„Vorstellung anfragen“ öffnen im Studio über „Öffnen“ das Anfrage-Fenster (Texte bearbeitbar)
  const bookingLink = n => { const l = n?.closest?.('a[data-booking]'); return !!(l && !l.closest('[data-detail-body]') && /#buchen$/.test(l.getAttribute('href') || '') && typeof window.KPShowBooking === 'function'); };
  function unitOf(n) { return n?.matches?.('span') && n.parentElement?.matches('a.button') && inContent(n.parentElement) ? n.parentElement : n; }
  function dragTargetOf(t) {
    if (t.closest('.site-header,.mobile-menu')) return null; // Kopfzeile/Menü nicht verschieben (Menüknopf hat eigenen Long-Press)
    const n = unitOf(t.closest('.poster-user-text,.poster-user-image') || t.closest('img[data-editable-image]') || t.closest('[data-editable-text]') || t.closest('.hero-image,.story-image,.offer,.booking-band,.final-cta'));
    return n && n.closest('main,.masthead,.footer,[data-detail-body]') && !n.matches('main,section') ? n : null;
  }

  /* ---------- Kerne aus modern.js/mobile-studio.js entschärfen (keine Griffe, keine Klassen mit Layoutwirkung) ---------- */
  const origCreate = window.createResizeHandles;
  if (typeof origCreate === 'function') window.createResizeHandles = function (element, ...rest) {
    if (!inline()) return origCreate.call(this, element, ...rest);
    if (!element || element.matches?.('[data-builder-tools]')) return;
    try { resizeTarget = element; } catch {} // Strg+Mausrad-Größe am Desktop bleibt nutzbar
  };
  const origPhoneHandles = window.KPPhoneHandles;
  window.KPPhoneHandles = function (element) { if (inline()) return true; return origPhoneHandles ? origPhoneHandles(element) : false; };
  const origCtx = window.KPCtx;
  window.KPCtx = { show(n) { if (!inline()) return origCtx?.show(n); showPop(n); }, hide(k) { if (!inline()) return origCtx?.hide(k); if (!k) hidePop(); }, get element() { return inline() ? popEl : origCtx?.element; } };
  // viewport-fit=cover (nur für die alten Leisten nötig) würde auf Notch-Geräten env()-Abstände und damit das Layout ändern
  const vp = $('meta[name=viewport]'), vpBase = (vp?.content || '').replace(/,\s*viewport-fit=cover/, '');
  const fixVp = () => { if (vp && inline()) vp.content = vpBase; };

  /* ---------- UI: schwebender Knopf, Bottom-Sheet, Popover, Toast ---------- */
  const fab = el('button', 'kp-il-fab kp-il-ui', icon('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13 7 4 4"/>') + '<i aria-hidden="true"></i>');
  fab.type = 'button'; fab.setAttribute('aria-label', 'KP Studio-Menü öffnen'); // sammel12 (NB-6): ohne Aufzählung fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-haspopup', 'dialog');
  // sammel9: sichtbarer Knopf „Bearbeiten beenden“ (44×44, über dem ✎)
  const exitBtn = el('button', 'kp-il-exit kp-il-ui', icon('<path d="M5 12.5l4.5 4.5L19 7.5"/>'));
  exitBtn.type = 'button'; exitBtn.setAttribute('aria-label', 'Bearbeiten beenden'); exitBtn.title = 'Bearbeiten beenden';
  // sammel10: wie Abmelden erst den Entwurf speichern (KPSaveAndWait), bei Fehler NICHT beenden
  let exiting = false;
  exitBtn.addEventListener('click', async () => {
    if (exiting) return;
    if (document.activeElement?.isContentEditable) document.activeElement.blur();
    try { deselect(); } catch {}
    exiting = true;
    try {
      await new Promise(r => setTimeout(r, 0)); // blur/input-Verlauf erst verbuchen lassen
      if (window.KPPhoneState?.dirty && S().backend && typeof window.KPSaveAndWait === 'function') {
        toast('Entwurf wird gespeichert …');
        const ok = await window.KPSaveAndWait('draft');
        if (!ok) { toast('Entwurf konnte nicht gespeichert werden. Bitte erneut versuchen.'); return; }
      }
      document.querySelector('[data-edit-toggle]')?.click();
      toast('Bearbeiten beendet. Der Entwurf ist gespeichert; Besucher sehen Änderungen erst nach „Veröffentlichen“.');
    } finally { exiting = false; }
  });
  const scrim = el('div', 'kp-il-scrim kp-il-ui');
  const sheet = el('section', 'kp-il-sheet kp-il-ui'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'KP Studio');
  const pop = el('div', 'kp-il-pop kp-il-ui'); pop.setAttribute('role', 'toolbar'); pop.setAttribute('aria-label', 'Element');
  const toastEl = el('div', 'kp-il-toast kp-il-ui'); toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
  const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/jpeg,image/png,image/webp,image/gif'; picker.hidden = true; picker.className = 'kp-il-ui'; picker.dataset.transient = '';
  // Speicherstatus (klein, fixed über dem ✎): „Speichert …“ / „Gespeichert ✓“ / „Fehler – erneut versuchen“ (Tippen = neu speichern)
  const statusEl = el('button', 'kp-il-status kp-il-ui'); statusEl.type = 'button'; statusEl.setAttribute('aria-live', 'polite');
  // Desktop: Verschieben nur über diesen Griff (erscheint bei Hover/Auswahl links neben dem Element)
  const grip = el('button', 'kp-il-grip kp-il-ui', '<svg viewBox="0 0 12 18" aria-hidden="true" fill="currentColor"><circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/><circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/></svg>');
  grip.type = 'button'; grip.setAttribute('aria-label', 'Verschieben: gedrückt halten und ziehen'); grip.title = 'Ziehen = verschieben';
  body.append(scrim, sheet, pop, toastEl, statusEl, grip, picker);
  const skip = $('.skip-link'); if (skip) skip.after(fab); else body.prepend(fab); fab.after(exitBtn); // ✎ früh in der Tab-Reihenfolge

  function toast(text, action) {
    if (isPhone() && typeof window.KPToast === 'function') { window.KPToast(text, '', action); return; }
    toastEl.textContent = text;
    if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.onclick = () => { toastEl.classList.remove('show'); action.run(); }; toastEl.append(b); }
    toastEl.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('show'), action ? 6000 : 3500);
  }
  const undo = () => $('[data-history="undo"]')?.click();

  // Status (Punkt am Knopf): gespeichert / ungespeichert / speichert / Fehler
  let saveState = 'clean', lastSaved = null, lastError = '';
  const hhmm = t => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const statusText = () => saveState === 'saving' ? 'Speichert …' : saveState === 'error' ? 'Fehler beim Speichern: ' + lastError : saveState === 'dirty' ? 'Nicht gespeichert – wird gleich automatisch als Entwurf gesichert' : lastSaved ? 'Entwurf gespeichert ' + hhmm(lastSaved) + ' Uhr' : 'Unverändert';
  function renderState() { fab.dataset.state = saveState; const s = $('[data-il-status]', sheet); if (s) s.textContent = statusText(); renderStatusPill(); }
  function renderStatusPill() {
    clearTimeout(renderStatusPill.t);
    const st = saveState, show = on => statusEl.classList.toggle('show', on);
    statusEl.dataset.state = st; statusEl.disabled = st !== 'error'; statusEl.title = st === 'error' ? 'Fehler beim Speichern: ' + lastError + ' – tippen, um erneut zu speichern' : '';
    if (st === 'saving') { statusEl.textContent = 'Speichert …'; show(true); }
    else if (st === 'saved') { statusEl.textContent = 'Gespeichert ✓'; show(true); renderStatusPill.t = setTimeout(() => show(false), 2500); }
    else if (st === 'error') { statusEl.textContent = 'Fehler – erneut versuchen'; show(true); }
    else show(false);
  }
  statusEl.addEventListener('click', () => { if (saveState !== 'error') return; if (document.activeElement?.isContentEditable) document.activeElement.blur(); S().save('draft'); });
  // Verlassen mit ungespeicherten Änderungen: Browser-Rückfrage (Entwurf liegt sonst nur lokal im Browser)
  addEventListener('beforeunload', e => {
    if (!editing() || window.KPLeaving) return;
    if (saveState === 'dirty' || saveState === 'error' || saveState === 'saving' || window.KPPhoneState?.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('kp-dirty', e => { if (e.detail) { saveState = 'dirty'; lastChange = Date.now(); } else if (saveState === 'dirty') saveState = 'clean'; renderState(); });
  document.addEventListener('studio-save', e => { const d = e.detail || {}; if (d.state === 'saving') saveState = 'saving'; if (d.state === 'saved') { saveState = 'saved'; lastSaved = d.time || Date.now(); } if (d.state === 'error') { saveState = 'error'; lastError = d.error || 'unbekannt'; } renderState(); });

  // Fab-Position: über der Buchungsleiste (falls sichtbar), sonst unten rechts
  function placeFab() {
    const bar = $('.mobile-conversion-bar'); let b = 14;
    if (bar && getComputedStyle(bar).display !== 'none' && !bar.classList.contains('kp-mcb-hide')) { const r = bar.getBoundingClientRect(); if (r.height && r.top < innerHeight) b = Math.max(14, Math.round(innerHeight - r.top + 10)); }
    // 03.10.2026 (Nachtest 3, F-A): liegt das Element-Menü dort, wo der ✎ säße (z. B. „Jetzt buchen“ in der Buchungsleiste), rückt der ✎ über das Menü
    if (pop.classList.contains('open') && popEl?.isConnected) {
      const pr = pop.getBoundingClientRect(), fw = fab.offsetWidth || 44, fh = fab.offsetHeight || 44, fr = fab.getBoundingClientRect();
      let fl = fr.width ? fr.left : innerWidth - 12 - fw; const top = innerHeight - b - fh;
      if (document.querySelector('.piece-modal.open')) fl -= 100; // ↶/↷ im Fenster sitzen links neben dem ✎
      if (pr.height && pr.left < fl + fw && fl < pr.right && pr.top < top + fh && top < pr.bottom) b = Math.round(innerHeight - pr.top + 8);
    }
    body.style.setProperty('--kp-il-fab-bottom', b + 'px');
  }

  /* ---------- Bottom-Sheet ---------- */
  const B = (act, label, extra = '') => `<button type="button" data-il="${act}" ${extra}>${label}</button>`;
  let sheetMore = false, sheetView = 'main', pubInfo = null;
  // sammel3 (W7/Optik 6): Studio-Menü als Blatt mit großen Zeilen; Einstellungen getrennt; „Veröffentlichen …“ abgesetzt und umrandet,
  // davor eine Zusammenfassung der Änderungen. „🧰 Werkzeuge“ (zweiter, alter Editor) und „Entwurf speichern“ (Autosave) entfallen.
  const R = (act, ico, word, extra = '') => `<button type="button" class="kp-il-row" data-il="${act}" ${extra}><span class="kp-il-rico" aria-hidden="true">${ico}</span><span>${word}</span></button>`;
  // sammel13: Seitendesign Dunkel/Hell direkt im Einstellungsblatt (Klick-Logik: mobile-studio.js setSiteDesign, [data-site-design])
  const designRow = () => { const v = document.documentElement.getAttribute('data-site-theme') === 'light' ? 'light' : 'dark';
    return `<div class="kp-il-design"><span class="kp-il-design-l"><span class="kp-il-rico" aria-hidden="true">◐</span>Seitendesign</span><div class="kp-design-seg kp-il-seg" role="radiogroup" aria-label="Seitendesign für Besucher"><button type="button" role="radio" data-site-design="dark" aria-checked="${v === 'dark'}">Dunkel</button><button type="button" role="radio" data-site-design="light" aria-checked="${v === 'light'}">Hell</button></div></div>`; };
  // Menügröße: rein lokale Browser-Einstellung; funktioniert mit Maus, Touch und Tastatur.
  const SHEET_SIZE_KEY = 'kp-studio-sheet-size-v1', SHEET_POS_KEY = 'kp-studio-sheet-position-v1';
  const clampSheetSize = (width, height) => ({
    width: Math.max(Math.min(240, innerWidth - 24), Math.min(Math.round(width), innerWidth - 24, 720)),
    height: Math.max(Math.min(160, innerHeight - 24), Math.min(Math.round(height), innerHeight - 24, Math.round(innerHeight * .9)))
  });
  const clampSheetPosition = (left, top, width, height) => ({
    left: Math.max(12, Math.min(Math.round(left), innerWidth - width - 12)),
    top: Math.max(12, Math.min(Math.round(top), innerHeight - height - 12))
  });
  function applySheetPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(SHEET_POS_KEY) || 'null');
      if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return;
      const r = sheet.getBoundingClientRect(), pos = clampSheetPosition(saved.left, saved.top, r.width, r.height);
      sheet.style.left = pos.left + 'px'; sheet.style.top = pos.top + 'px'; sheet.style.bottom = 'auto'; sheet.style.transform = 'none';
    } catch {}
  }
  function ensureSheetMoveHandle() {
    const head = $('.kp-il-head', sheet); if (!head || head.dataset.kpMoveBound) return;
    head.dataset.kpMoveBound = '1';
    head.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('button,a,input,select')) return;
      const startX = e.clientX, startY = e.clientY, pointerId = e.pointerId;
      let dragging = false, start = null;
      const move = ev => {
        if (ev.pointerId !== pointerId) return;
        if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10) clearTimeout(timer);
        if (!dragging) return;
        ev.preventDefault();
        const pos = clampSheetPosition(start.left + ev.clientX - startX, start.top + ev.clientY - startY, start.width, start.height);
        sheet.style.left = pos.left + 'px'; sheet.style.top = pos.top + 'px';
      };
      const finish = ev => {
        if (ev && ev.pointerId !== pointerId) return;
        clearTimeout(timer); head.classList.remove('dragging');
        head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', finish); head.removeEventListener('pointercancel', finish);
        if (dragging) {
          const r = sheet.getBoundingClientRect(), pos = clampSheetPosition(r.left, r.top, r.width, r.height);
          try { localStorage.setItem(SHEET_POS_KEY, JSON.stringify(pos)); } catch {}
        }
      };
      const timer = setTimeout(() => {
        if (!head.isConnected) return;
        dragging = true; head.classList.add('dragging'); head.setPointerCapture(pointerId);
        const r = sheet.getBoundingClientRect(); start = { left:r.left, top:r.top, width:r.width, height:r.height };
        sheet.style.left = start.left + 'px'; sheet.style.top = start.top + 'px'; sheet.style.bottom = 'auto'; sheet.style.transform = 'none';
      }, 320);
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', finish); head.addEventListener('pointercancel', finish);
    });
  }
  function applySheetSize() {
    try {
      const saved = JSON.parse(localStorage.getItem(SHEET_SIZE_KEY) || 'null');
      if (!saved || !Number.isFinite(saved.width) || !Number.isFinite(saved.height)) return;
      const size = clampSheetSize(saved.width, saved.height);
      sheet.style.width = size.width + 'px'; sheet.style.height = size.height + 'px';
    } catch {}
  }
  function ensureSheetResizeHandle() {
    if ($('.kp-il-corner', sheet)) return;
    const corners = { nw: 'oben links', ne: 'oben rechts', sw: 'unten links', se: 'unten rechts' };
    const place = (left, top, width, height) => {
      sheet.style.left = Math.round(left) + 'px'; sheet.style.top = Math.round(top) + 'px';
      sheet.style.width = Math.round(width) + 'px'; sheet.style.height = Math.round(height) + 'px';
      sheet.style.bottom = 'auto'; sheet.style.transform = 'none';
    };
    const persist = () => {
      const r = sheet.getBoundingClientRect();
      try {
        localStorage.setItem(SHEET_SIZE_KEY, JSON.stringify({ width: Math.round(r.width), height: Math.round(r.height) }));
        localStorage.setItem(SHEET_POS_KEY, JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) }));
      } catch {}
    };
    for (const [corner, name] of Object.entries(corners)) {
      const grip = document.createElement('button'); grip.type = 'button';
      grip.className = 'kp-il-corner kp-il-corner-' + corner; grip.dataset.transient = '';
      grip.setAttribute('aria-label', 'Menügröße ändern: Ecke ' + name);
      grip.title = 'Ecke gedrückt halten und ziehen · Pfeiltasten ändern die Größe';
      grip.textContent = '';
      grip.addEventListener('keydown', e => {
        const step = e.shiftKey ? 32 : 12, r = sheet.getBoundingClientRect();
        let dw = 0, dh = 0;
        if (e.key === 'ArrowRight') dw = step;
        else if (e.key === 'ArrowLeft') dw = -step;
        else if (e.key === 'ArrowUp') dh = step;
        else if (e.key === 'ArrowDown') dh = -step;
        else return;
        e.preventDefault();
        const size = clampSheetSize(r.width + dw, r.height + dh);
        const left = corner.includes('w') ? r.right - size.width : r.left;
        const top = corner.includes('n') ? r.bottom - size.height : r.top;
        const pos = clampSheetPosition(left, top, size.width, size.height);
        place(pos.left, pos.top, size.width, size.height); persist();
      });
      grip.addEventListener('pointerdown', e => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault(); e.stopPropagation(); grip.setPointerCapture(e.pointerId);
        const original = sheet.getBoundingClientRect(), size = clampSheetSize(original.width, original.height);
        const pos = clampSheetPosition(original.left, original.top, size.width, size.height);
        place(pos.left, pos.top, size.width, size.height);
        const start = sheet.getBoundingClientRect(), x = e.clientX, y = e.clientY, pointerId = e.pointerId;
        const minW = Math.min(240, innerWidth - 24), maxW = Math.min(720, innerWidth - 24);
        const minH = Math.min(160, innerHeight - 24), maxH = Math.min(Math.round(innerHeight * .9), innerHeight - 24);
        grip.classList.add('dragging');
        const move = ev => {
          if (ev.pointerId !== pointerId) return;
          const dx = ev.clientX - x, dy = ev.clientY - y;
          let left = start.left, right = start.right, top = start.top, bottom = start.bottom;
          if (corner.includes('w')) left = Math.max(12, Math.min(right - minW, Math.max(right - maxW, start.left + dx)));
          else right = Math.min(innerWidth - 12, Math.max(left + minW, Math.min(left + maxW, start.right + dx)));
          if (corner.includes('n')) top = Math.max(12, Math.min(bottom - minH, Math.max(bottom - maxH, start.top + dy)));
          else bottom = Math.min(innerHeight - 12, Math.max(top + minH, Math.min(top + maxH, start.bottom + dy)));
          place(left, top, right - left, bottom - top);
        };
        const finish = ev => {
          if (ev.pointerId !== pointerId) return;
          grip.classList.remove('dragging');
          grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', finish); grip.removeEventListener('pointercancel', finish);
          if (ev.type === 'pointercancel') place(start.left, start.top, start.width, start.height);
          else persist();
        };
        grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', finish); grip.addEventListener('pointercancel', finish);
      });
      sheet.append(grip);
    }
  }
  const FXROW = (k, label) => `<label class="kp-il-fxrow"><input type="checkbox" data-fx-${k}><span>${label}</span></label>`;
  function renderFx() {
    sheetView = 'fx';
    sheet.innerHTML = `<div class="kp-il-content"><div class="kp-il-head"><button type="button" class="kp-il-x" data-il="more" aria-label="Zurück zu den Einstellungen">‹</button><b>Bühnen-Effekte</b><button type="button" class="kp-il-x" data-il="close" aria-label="Schließen">✕</button></div>
      <div class="kp-fx-settings kp-il-fx">
        <p class="kp-il-fxnote">Gilt für Besucher nach dem Veröffentlichen.</p>
        <button type="button" class="kp-il-fxplay" data-il="fx-preview">▶ Vorhang ansehen</button>
        ${FXROW('curtain', 'Vorhang-Intro (Vollbild beim Öffnen)')}
        <div class="kp-il-fxfield"><label for="kp-ilfx-ms">Dauer: <output data-fx-curtain-ms-value for="kp-ilfx-ms">0,9</output> s</label><input id="kp-ilfx-ms" type="range" min="400" max="10000" step="100" value="900" data-fx-curtain-ms></div>
        <div class="kp-il-fxfield kp-il-fxinline"><label for="kp-ilfx-mode">Wann zeigen</label><select id="kp-ilfx-mode" data-fx-curtain-mode><option value="session">Einmal pro Besuch</option><option value="always">Bei jedem Laden</option></select></div>
        <div class="kp-il-fxfield kp-il-fxinline"><label for="kp-ilfx-color">Vorhangfarbe</label><input id="kp-ilfx-color" type="color" value="#7a1a1a" data-fx-curtain-color></div>
        ${FXROW('oink', 'OINK! OINK! am Kontakt')}
        ${FXROW('spotlight', 'Scheinwerfer am Repertoire')}
        ${FXROW('video', 'Video-Bühne – Bewegung')}
        ${FXROW('figures', 'Wer spielt mit? – Bewegung')}
        ${FXROW('backstage', 'Hinter der Spielleiste – Bewegung')}
        ${FXROW('firstvisit', 'Mein erster Theaterbesuch – Bewegung')}
      </div></div>`;
    ensureSheetResizeHandle(); ensureSheetMoveHandle();
    if (sheet.classList.contains('open')) { applySheetSize(); applySheetPosition(); }
    window.KPFx?.sync?.(); window.KPFxSyncMotion?.();
    renderState();
  }
  function renderSheet() {
    const snap = window.KPSnapEnabled ? window.KPSnapEnabled() : true;
    const desk = !isPhone();
    if (sheetMore) sheetView = 'settings'; else if (sheetView === 'settings') sheetView = 'main';
    const main = `<div class="kp-il-rows">
        ${R('versions', '🕘', 'Frühere Fassungen')}${R('tourplan', '📅', 'Termin eintragen')}
        ${R('more', '⚙️', 'Einstellungen', 'aria-label="Einstellungen"')}${R('help', '?', 'Hilfe')}${R('exit', '✓', 'Bearbeiten beenden')}
      </div><hr class="kp-il-sep">
      <button type="button" class="kp-il-publish" data-il="publish">⇪ Veröffentlichen …</button>`;
    const settings = `<div class="kp-il-rows">
        ${R('back', '‹', 'Zurück', 'aria-label="Zurück zum Hauptmenü"')}
        ${R('snap', '⌗', snap ? 'Raster: an' : 'Raster: aus (frei verschieben)', `aria-pressed="${snap}" title="Raster = Einrasten an Hilfslinien, aus = frei verschieben"`)}
        ${window.KPDelete ? R('delanim', '🗑', 'Lösch-Animation: ' + window.KPDelete.nameOf(window.KPDelete.kind) + (window.KPDelete.speed !== 1 ? ' · ' + window.KPDelete.fmtSpeed(window.KPDelete.speed) + '×' : '') + ' ›', 'data-il-delanim') : ''}
        ${R('fx', '🎭', 'Bühnen-Effekte ›', 'aria-label="Bühnen-Effekte: Vorhang, OINK, Scheinwerfer …"')}
        ${designRow()}
        ${desk ? `<div class="kp-il-devs" role="group" aria-label="Geräteansicht">${B('dev-1280', '🖥 Desktop')}${B('dev-768', 'Tablet')}${B('dev-360', '📱 Mobil 360')}</div>` : ''}
        ${R('logout', '⎋', 'Abmelden')}
      </div>`;
    const publish = `<div class="kp-il-pub"><p class="kp-il-pubtitle">Vor dem Veröffentlichen</p><div class="kp-il-publist" data-il-publist>${pubInfo ? pubInfo : '<p>Änderungen werden ermittelt …</p>'}</div>
        <p class="kp-il-pubnote">Danach sehen alle Besucher diesen Stand.</p>
        <div class="kp-il-pubbtns"><button type="button" class="kp-il-pubcancel" data-il="publish-cancel">Abbrechen</button><button type="button" class="kp-il-pubgo" data-il="publish-go">Veröffentlichen</button></div></div>`;
    const title = sheetView === 'settings' ? 'Einstellungen' : sheetView === 'publish' ? 'Veröffentlichen' : 'KP Studio';
    sheet.innerHTML = `<div class="kp-il-content"><div class="kp-il-head"><b>${title}</b><small data-il-status></small><button type="button" class="kp-il-x" data-il="close" aria-label="Schließen">✕</button></div>` + (sheetView === 'settings' ? settings : sheetView === 'publish' ? publish : main) + '</div>';
    ensureSheetResizeHandle(); ensureSheetMoveHandle();
    if (sheet.classList.contains('open')) { applySheetSize(); applySheetPosition(); }
    renderState();
  }
  // Änderungen gegenüber dem veröffentlichten Stand (bzw. der Originalseite, solange nichts veröffentlicht ist) – nur zählen, nichts senden
  const norm = t => (t || '').replace(/\u00AD/g, '').replace(/\s+/g, ' ').trim();
  function bag(list) { const m = new Map(); for (const x of list) if (x) m.set(x, (m.get(x) || 0) + 1); return m; }
  function bagDiff(a, b) { let only = 0; for (const [k, v] of a) only += Math.max(0, v - (b.get(k) || 0)); return only; }
  function harvest(root) {
    const texts = [], imgs = [], links = [];
    root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,figcaption,cite,summary,a,button,.piece-summary,strong').forEach(e => { if (e.closest('[data-transient]')) return; if (e.querySelector('h1,h2,h3,h4,h5,h6,p,li,figcaption,summary')) return; const t = norm(e.textContent); if (t) texts.push(e.tagName + ':' + t); });
    root.querySelectorAll('img').forEach(e => { if (!e.closest('[data-transient]')) imgs.push((e.getAttribute('src') || '').replace(/[?#].*$/, '') + '|' + norm(e.getAttribute('alt'))); });
    root.querySelectorAll('a[href]').forEach(e => { if (!e.closest('[data-transient]')) links.push(e.getAttribute('href')); });
    return { texts: bag(texts), imgs: bag(imgs), links: bag(links) };
  }
  // Vergleichsstand: die Seite so, wie Besucher sie jetzt sehen (unsichtbarer Rahmen ohne Bearbeiten) – damit zählen nur echte Änderungen,
  // nicht die Teile, die die Seite selbst per Skript ergänzt. Rückfall: veröffentlichter Stand aus api/studio.php bzw. modern.html.
  function visitorBase() {
    return new Promise(res => {
      const f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.dataset.transient = '';
      f.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + innerWidth + 'px;height:' + innerHeight + 'px;border:0;visibility:hidden';
      let fin = false; const end = v => { if (fin) return; fin = true; clearTimeout(to); setTimeout(() => f.remove(), 0); res(v); };
      const to = setTimeout(() => end(null), 9000);
      f.onload = () => setTimeout(() => {
        try {
          const d = f.contentDocument, m = d?.querySelector('main'); if (!m || d.body.classList.contains('editing')) return end(null);
          const c = m.cloneNode(true); c.querySelectorAll('[data-transient]').forEach(x => x.remove());
          end({ main: c.innerHTML, details: JSON.parse(JSON.stringify(f.contentWindow.theaterDetailEdits || {})), siteTheme: d.documentElement.dataset.siteTheme || '' });
        } catch { end(null); }
      }, 2200);
      f.src = 'modern.html?kp-vergleich=' + Date.now(); body.append(f);
    });
  }
  async function computeChanges() {
    let base = null, pub = false;
    try { const r = await fetch('api/studio.php?nocache=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' }); if (r.ok) { const d = await r.json(); if (d?.published?.version === window.MODERN_CONTENT_VERSION) { base = d.published; pub = true; } } } catch {}
    const vb = await visitorBase();
    if (vb) base = { ...vb, details: pub ? (base.details || vb.details) : vb.details };
    let baseMain = base?.main;
    if (!baseMain) { try { const html = await (await fetch('modern.html?nocache=' + Date.now(), { cache: 'no-store' })).text(); baseMain = new DOMParser().parseFromString(html, 'text/html').querySelector('main')?.innerHTML || ''; } catch { baseMain = ''; } }
    const cur = typeof currentSnapshot === 'function' ? currentSnapshot() : { main: $('main').innerHTML };
    const A = document.createElement('div'); A.innerHTML = baseMain; const Bd = document.createElement('div'); Bd.innerHTML = cur.main || '';
    const a = harvest(A), b = harvest(Bd);
    const tNew = bagDiff(b.texts, a.texts), tGone = bagDiff(a.texts, b.texts), tChg = Math.min(tNew, tGone);
    const iChg = Math.max(bagDiff(b.imgs, a.imgs), bagDiff(a.imgs, b.imgs));
    const lChg = Math.max(bagDiff(b.links, a.links), bagDiff(a.links, b.links));
    const curD = window.theaterDetailEdits || {}, baseD = base?.details || {};
    const wins = [...new Set([...Object.keys(curD), ...Object.keys(baseD)])].filter(k => (curD[k] || '') !== (baseD[k] || '')).length;
    const design = !!base && !!base.siteTheme && !!cur.siteTheme && base.siteTheme !== cur.siteTheme;
    const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const rows = [];
    if (tChg) rows.push(pl(tChg, 'Text geändert', 'Texte geändert'));
    if (tNew - tChg) rows.push(pl(tNew - tChg, 'Text neu', 'Texte neu'));
    if (tGone - tChg) rows.push(pl(tGone - tChg, 'Text entfernt', 'Texte entfernt'));
    if (iChg) rows.push(pl(iChg, 'Bild', 'Bilder') + ' (getauscht, neu oder Beschreibung)');
    if (lChg > 0) rows.push(pl(lChg, 'Link-Ziel', 'Link-Ziele'));
    if (wins) rows.push(pl(wins, 'Fenster/Unterseite', 'Fenster/Unterseiten'));
    if (design) rows.push('Design (hell/dunkel)');
    const head = pub ? 'Geändert gegenüber dem veröffentlichten Stand:' : 'Geändert gegenüber der Originalseite (noch nichts veröffentlicht):';
    const result = { rows, base: pub };
    pubInfo = rows.length ? `<p>${head}</p><ul>${rows.map(r => `<li>${r}</li>`).join('')}</ul>` : '<p>Keine Änderungen gefunden. Veröffentlichen ist trotzdem möglich.</p>';
    return result;
  }
  window.KPChangeSummary = computeChanges;
  let sheetReturn = null;
  function openSheet(open) {
    const was = sheet.classList.contains('open');
    if (open) { hidePop(); sheetMore = false; sheetView = 'main'; renderSheet(); if (!was) sheetReturn = document.activeElement !== body ? document.activeElement : fab; }
    sheet.classList.toggle('open', open); scrim.classList.toggle('open', open); fab.setAttribute('aria-expanded', String(open));
    if (open) { applySheetSize(); applySheetPosition(); }
    if (open) $('[data-il=versions]', sheet)?.focus({ preventScroll: true });
    else if (was && sheet.contains(document.activeElement) || was && document.activeElement === body) { const t = sheetReturn?.isConnected && sheetReturn.getClientRects().length ? sheetReturn : fab; t.focus({ preventScroll: true }); }
  }
  fab.addEventListener('click', () => openSheet(!sheet.classList.contains('open')));
  scrim.addEventListener('click', () => openSheet(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('open')) openSheet(false); });
  // Esc: offene Menüs/Dialoge schließen, sonst die Bearbeitung beenden (modale <dialog> schließen sich selbst)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !inline() || e.defaultPrevented) return;
    if ([...document.querySelectorAll('dialog[open]')].length) return;
    if (sheet.classList.contains('open') || isx) return;
    if (layerPop?.classList.contains('open')) { e.preventDefault(); const back = layerPop.anchor; hideLayerPop(); back?.isConnected && back.focus({ preventScroll: true }); return; }
    const menu = $('[data-mobile-menu]'); if (menu?.classList.contains('open')) { e.preventDefault(); $('[data-menu-button]')?.click(); $('[data-menu-button]')?.focus({ preventScroll: true }); return; }
    if (popEl || activeEl || document.activeElement?.isContentEditable) { e.preventDefault(); const ae = document.activeElement; if (ae?.isContentEditable) ae.blur(); deselect(); }
  }, true);
  // Fokus im ✎-Menü halten (Tab/Shift+Tab kreisen)
  const focusables = root => $$('button:not([disabled]),[href],input:not([type=hidden]):not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', root).filter(x => x.getClientRects().length);
  sheet.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !sheet.classList.contains('open')) return;
    const f = focusables(sheet); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
  });
  // Dialoge: Fokus beim Schließen dorthin zurück, wo er vorher war
  let lastOutside = null;
  document.addEventListener('focusin', e => { const t = e.target; if (t instanceof Element && !t.closest('dialog,.kp-il-sheet')) lastOutside = t; }, true);
  new MutationObserver(ms => { for (const m of ms) { const d = m.target; if (d.tagName === 'DIALOG' && m.oldValue !== null && !d.open && (document.activeElement === body || d.contains(document.activeElement)) && lastOutside?.isConnected) lastOutside.focus({ preventScroll: true }); } })
    .observe(body, { subtree: true, attributes: true, attributeFilter: ['open'], attributeOldValue: true });
  const studioBtn = a => $(`[data-studio="${a}"]`, S().bar);
  sheet.addEventListener('click', async e => {
    const a = e.target.closest('[data-il]')?.dataset.il; if (!a) return;
    if (a === 'close') { openSheet(false); return; }
    if (a === 'fx') { renderFx(); $('[data-il=fx-preview]', sheet)?.focus({ preventScroll: true }); return; }
    if (a === 'fx-preview') { openSheet(false); setTimeout(() => window.KPFx?.preview?.(), 120); return; }
    if (a === 'more' || a === 'back') { sheetMore = a === 'more'; renderSheet(); $('[data-il]:not([data-il=close])', sheet)?.focus({ preventScroll: true }); return; }
    if (a === 'help') { resetHints(); openSheet(false); toast(isPhone() ? 'Antippen = auswählen · nochmal tippen = schreiben · gedrückt halten = verschieben (oder auf den Papierkorb ziehen) · ✎ = dieses Menü (Bühnen-Effekte und Seitendesign: ✎ → ⚙️ Einstellungen). Hinweise erscheinen wieder.' : 'Klicken = schreiben · ⠿ ziehen = verschieben (auch auf den Papierkorb) · ✎ = dieses Menü (Bühnen-Effekte und Seitendesign: ✎ → ⚙️ Einstellungen). Hinweise erscheinen wieder.'); return; }
    if (a === 'publish') { if (document.activeElement?.isContentEditable) document.activeElement.blur(); sheetView = 'publish'; sheetMore = false; pubInfo = null; renderSheet(); await computeChanges(); if (sheetView === 'publish' && sheet.classList.contains('open')) { renderSheet(); $('[data-il=publish-cancel]', sheet)?.focus({ preventScroll: true }); } return; }
    if (a === 'publish-cancel') { sheetView = 'main'; renderSheet(); $('[data-il=publish]', sheet)?.focus({ preventScroll: true }); return; }
    if (a === 'undo' || a === 'redo') { $(`[data-history="${a}"]`)?.click(); renderState(); return; }
    if (a === 'delanim') { window.KPDelete?.settings(sheet, renderSheet); return; }
    if (a === 'snap') { window.KPToggleSnap ? window.KPToggleSnap() : window.KPSetSnap?.(!window.KPSnapEnabled()); setTimeout(renderSheet, 10); return; }
    openSheet(false);
    if (a === 'save') { if (document.activeElement?.isContentEditable) document.activeElement.blur(); S().save('draft'); return; }
    if (a === 'exit') { openSheet(false); exitBtn.click(); return; }
    if (a === 'versions') { studioBtn('versions')?.click(); return; }
    if (a === 'tourplan') { studioBtn('tourplan')?.click(); return; }
    if (a === 'classic') { setClassic(true); return; }
    if (a === 'logout') { logout(); return; }
    if (a.startsWith('dev-')) { $(`[data-kp-device="${a.slice(4)}"]`)?.click(); return; }
    if (a === 'publish-go') { S().save('publish'); } // nur auf ausdrücklichen Wunsch: Menü → „Veröffentlichen …“ → Zusammenfassung → „Veröffentlichen“
  });
  async function logout() {
    if (document.activeElement?.isContentEditable) document.activeElement.blur();
    if (window.KPPhoneState?.dirty && S().backend && typeof window.KPSaveAndWait === 'function') { toast('Entwurf wird gespeichert …'); await window.KPSaveAndWait('draft'); }
    ss('kp-pure', '0'); ss('kp-preview', '0'); window.KPLeaving = true; location.href = 'logout.php';
  }
  function setClassic(on) {
    classic = on; ss('kp-classic', on ? '1' : '0');
    deselect(); openSheet(false);
    body.classList.toggle('kp-inline', !on);
    if (on) toast('Klassische Werkzeuge an. Zurück: „✨ Einfacher Modus“ in der Leiste bzw. im ☰-Menü.');
    else { fixVp(); placeFab(); setTimeout(placeHdrUndo, 20); }
  }
  // Rückweg aus dem klassischen Modus: Knopf in der alten Leiste (Desktop) und im Handy-☰-Menü
  const back = document.createElement('button'); back.type = 'button'; back.dataset.kpIlBack = ''; back.textContent = '✨ Einfacher Modus'; back.title = 'Leisten ausblenden, direkt auf der Seite bearbeiten';
  S().bar.insertBefore(back, $('output', S().bar));
  const pm = $('.kp-page-menu [data-kp-menu="done"]'); if (pm) { const b2 = document.createElement('button'); b2.type = 'button'; b2.dataset.kpIlBack = ''; b2.textContent = '✨ Einfacher Modus (ohne Leisten)'; pm.before(b2); }
  document.addEventListener('click', e => { if (e.target.closest?.('[data-kp-il-back]')) { e.preventDefault(); $('.kp-page-menu')?.close?.(); setClassic(false); } }, true);

  /* ---------- aktives Element + Popover ---------- */
  let activeEl = null, popEl = null, raf = 0, layerPop = null;
  const canUndo = () => !!window.KPHistoryState?.canUndo?.();
  const canRedo = () => !!window.KPHistoryState?.canRedo?.();
  function hideLayerPop() { if (layerPop) { layerPop.classList.remove('open'); layerPop.style.display = 'none'; } }
  const MINI = {
    layer: { label: 'Ebenenposition', html: '<button type="button" data-layer="up" role="menuitem" aria-label="Nach vorne" title="Nach vorne">Nach vorne</button><button type="button" data-layer="down" role="menuitem" aria-label="Nach hinten" title="Nach hinten">Nach hinten</button>' },
    add: { label: 'Hinzufügen', html: '<button type="button" data-add-il="text" role="menuitem">¶ Text</button><button type="button" data-add-il="button" role="menuitem">▭ Button</button><button type="button" data-add-il="image" role="menuitem">🖼 Bild</button>' }
  };
  function showLayerPop(n, anchor, kind = 'layer') {
    if (!n?.isConnected) return;
    if (!layerPop) {
      layerPop = el('div', 'kp-il-layer-pop kp-il-ui');
      layerPop.setAttribute('role', 'menu');
      body.append(layerPop);
      layerPop.addEventListener('pointerdown', e => e.preventDefault());
      layerPop.addEventListener('click', e => {
        const b = e.target.closest('[data-layer],[data-add-il]'); if (!b || !popEl?.isConnected) return;
        e.preventDefault(); e.stopPropagation();
        const target = unitOf(popEl); hideLayerPop();
        if (b.dataset.addIl) { addAfter(target, b.dataset.addIl); return; }
        S().select(target);
        $(`[data-element="${b.dataset.layer}"]`, S().inspector)?.click();
        requestAnimationFrame(() => { if (target.isConnected) showPop(target); });
      });
    }
    layerPop.innerHTML = MINI[kind].html; layerPop.setAttribute('aria-label', MINI[kind].label); layerPop.dataset.kind = kind;
    layerPop.style.display = ''; layerPop.classList.add('open'); layerPop.anchor = anchor;
    const r = anchor.getBoundingClientRect(), w = layerPop.offsetWidth, h = layerPop.offsetHeight;
    const top = r.bottom + 6 + h > innerHeight - 6 ? Math.max(6, r.top - h - 6) : r.bottom + 6;
    const left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2));
    layerPop.style.left = Math.round(left) + 'px'; layerPop.style.top = Math.round(top) + 'px';
    $('button', layerPop)?.focus({ preventScroll: true });
  }
  /* „＋ Hinzufügen“ im einfachen Modus: Text/Button/Bild direkt nach dem gewählten Element (Inhalte wie in den klassischen Werkzeugen) */
  function addAfter(n, type) {
    const blk = n.matches('img') ? (n.closest('figure') || n) : (type === 'button' && n.closest('a.button')) || n.closest('p,h1,h2,h3,h4,h5,h6,ul,ol,figure,blockquote,.hero-actions') || n;
    let node;
    if (type === 'text') { node = document.createElement('p'); node.textContent = 'Hier schreiben …'; } // sammel12 (NB-7): gerätneutral
    else if (type === 'button') { node = document.createElement('a'); node.className = 'button primary'; node.href = '#buchen'; node.textContent = 'Neuer Button'; }
    else { pickNewImage(blk); return; } // sammel12 (NB-8): kein Ersatzfoto – erst die Bildauswahl, der Bildrahmen entsteht erst mit dem gewählten Foto
    if (document.activeElement?.isContentEditable) document.activeElement.blur();
    blk.after(node);
    if (type === 'image') node.setAttribute('data-editable-image', 'true'); else node.setAttribute('data-editable-text', 'true');
    try { saveDraft(); recordHistory(); } catch {}
    deselect(); S().select(node);
    startTyping(node);
    try { const r = document.createRange(); r.selectNodeContents(node); getSelection().removeAllRanges(); getSelection().addRange(r); } catch {}
    showPop(node);
  }
  // sammel12 (NB-8): „＋ Bild“ öffnet direkt die Dateiauswahl (Handy: Galerie/Kamera). Abbruch = nichts ändert sich.
  let pendingAdd = null;
  function pickNewImage(blk) {
    if (document.activeElement?.isContentEditable) document.activeElement.blur();
    pendingAdd = { blk }; picker.value = ''; picker.click();
  }
  async function insertNewImage(file) {
    const blk = pendingAdd?.blk; pendingAdd = null;
    if (!file || !blk?.isConnected) return;
    try {
      let src, info = '';
      if (typeof window.KPOptimizeUpload === 'function') {
        toast('Bild wird optimiert und hochgeladen …');
        const res = await window.KPOptimizeUpload(file); src = res.src;
        info = ` (${res.width} × ${res.height} px, ${res.kb} KB${res.uploaded ? '' : ', im Entwurf eingebettet: ' + res.error})`;
      } else src = await new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(file); });
      if (!blk.isConnected) return;
      const node = document.createElement('img'); node.src = src; node.alt = ''; node.decoding = 'async'; node.style.maxWidth = '320px';
      blk.after(node); node.setAttribute('data-editable-image', 'true');
      try { S().captureDetail?.(); saveDraft(); recordHistory(); } catch {}
      deselect(); S().select(node); showPop(node);
      toast('Bild eingefügt' + info + '. Unter „Text“ beschreiben, was zu sehen ist. Noch nicht veröffentlicht.', { label: 'Rückgängig', run: undo });
    } catch (err) { toast(err.message || 'Das Bild konnte nicht eingefügt werden.'); }
  }
  function setActive(n) {
    if (activeEl && activeEl !== n) activeEl.classList.remove('kp-il-active');
    activeEl = n; n?.classList.add('kp-il-active');
  }
  function deselect() {
    hidePop(); setActive(null);
    if (S().selected) S().select(null);
  }
  // sammel3 (Editor-Runde, W1/Optik 3): Element-Leiste mit höchstens 5 Knöpfen (Symbol + Wort, ≥ 48 px). Handy: fest unten (ersetzt solange
  // die Buchungsleiste), Laptop: schwebend am Element. Selteneres unter „⋯ Mehr“ (Blatt), Löschen rot und abgesetzt am Ende.
  const BI = (act, ico, word, extra = '') => `<button type="button" data-il="${act}" ${extra}><span class="kp-il-ico" aria-hidden="true">${ico}</span><span class="kp-il-word">${word}</span></button>`;
  const ICO = {
    edit: icon('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13 7 4 4"/>'),
    link: icon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    open: icon('<path d="M7 5v14l11-7Z"/>'),
    more: icon('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    done: icon('<path d="m5 12 5 5L20 7"/>'),
    img: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>'),
    crop: icon('<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>'),
    alt: icon('<path d="M4 5h16v11H9l-5 4Z"/>'),
    bold: '<b>F</b>', italic: '<i>K</i>',
    add: icon('<path d="M12 5v14M5 12h14"/>'),
    copy: icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    up: icon('<path d="M12 19V5M6 11l6-6 6 6"/>'), down: icon('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    layer: icon('<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>'),
    remove: icon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')
  };
  const TYPE_LABEL = n => n.matches('img') ? 'Bild' : n.closest('.piece') ? 'Stückkarte' : n.matches('h1,h2,h3,h4,h5,h6') ? 'Überschrift' : n.closest('a.button,button,.button') ? 'Knopf' : n.closest('a') ? 'Link' : n.matches('summary') || n.closest('summary') ? 'Frage' : 'Text';
  const tag = el('div', 'kp-il-tag kp-il-ui'); tag.setAttribute('aria-hidden', 'true'); body.append(tag);
  let moreOpen = false;
  function moveSibling(u, dir) { // nächstes/voriges sichtbares Geschwister-Element (nicht flüchtig)
    let s = dir < 0 ? u.previousElementSibling : u.nextElementSibling;
    while (s && (s.matches('[data-transient],script,style,.resize-handle,.move-handle') || s.closest('.kp-il-ui'))) s = dir < 0 ? s.previousElementSibling : s.nextElementSibling;
    return s;
  }
  function moreHtml(n) {
    const img = n.matches('img'), u = unitOf(n), card = n.closest('.piece');
    let h = '';
    if (card && img) h += BI('piece', ICO.open, 'Stückseite bearbeiten');
    if (!img) h += BI('bold', ICO.bold, 'Fett') + BI('italic', ICO.italic, 'Kursiv');
    h += BI('add', ICO.add, 'Hinzufügen …', 'aria-haspopup="menu"') + BI('copy', ICO.copy, 'Duplizieren');
    h += BI('up', ICO.up, 'Nach oben', moveSibling(u, -1) ? '' : 'disabled') + BI('down', ICO.down, 'Nach unten', moveSibling(u, 1) ? '' : 'disabled');
    h += BI('layer', ICO.layer, 'Ebene (vorne/hinten)', 'class="kp-il-layer" aria-haspopup="menu"');
    return `<div class="kp-il-more-sheet" role="menu" aria-label="Weitere Aktionen"><div class="kp-il-more-head"><b>${TYPE_LABEL(n)}</b><button type="button" class="kp-il-x" data-il="more-close" aria-label="Schließen">✕</button></div>${h}<hr>${BI('remove', ICO.remove, 'Löschen', 'class="kp-il-danger"')}</div>`;
  }
  function showPop(n) {
    if (!inline() || !n?.isConnected || n.matches('main,section,.hero,.footer')) { hidePop(); return; }
    if (popEl !== n) moreOpen = false;
    setActive(n); popEl = n;
    try { assignIds(); } catch {}
    const img = n.matches('img'), card = n.closest('.piece'), link = !img && n.closest('a'), fixedBar = !!n.closest('.mobile-conversion-bar');
    // 03.10.2026 (Nachtest 3, F-E): „Zur Stückseite“ (Spielplan-Fenster) ist kein Text zum Bearbeiten, sondern führt zur Stückansicht
    let h = '';
    if (pieceLinkOf(n)) h = BI('piece', ICO.open, 'Stückseite', 'aria-label="Stückseite bearbeiten"') + BI('done', ICO.done, 'Fertig');
    else if (img) h = BI('img', ICO.img, 'Tauschen') + BI('crop', ICO.crop, 'Zuschnitt') + BI('alt', ICO.alt, 'Text') + BI('more', ICO.more, 'Mehr', 'aria-haspopup="menu"') + BI('done', ICO.done, 'Fertig');
    else {
      h = BI('edit', ICO.edit, 'Text ändern');
      if (link) h += BI('link', ICO.link, 'Link', 'aria-label="Link-Ziel festlegen"');
      if (card) h += BI('piece', ICO.open, 'Stückseite', 'aria-label="Stückseite bearbeiten"');
      // sammel2: Inhaltslinks mit eigenem Fenster (z. B. „Alle Fragen“) – Fenster direkt öffnen und dort bearbeiten
      else if (n.closest('a[data-source]') && !n.closest('[data-detail-body]')) h += BI('open', ICO.open, 'Öffnen', 'aria-label="Fenster öffnen und bearbeiten"');
      else if (bookingLink(n)) h += BI('open', ICO.open, 'Öffnen', 'aria-label="Anfrage-Fenster öffnen und bearbeiten"');
      if (!fixedBar) h += BI('more', ICO.more, 'Mehr', 'aria-haspopup="menu"'); // feste Buchungsleiste: nur Text/Link
      h += BI('done', ICO.done, 'Fertig');
    }
    pop.innerHTML = `<div class="kp-il-bar">${h}</div>` + (moreOpen && !fixedBar && !pieceLinkOf(n) ? moreHtml(n) : '');
    pop.classList.toggle('kp-il-more-open', moreOpen);
    tag.textContent = TYPE_LABEL(n);
    pop.classList.add('open'); placePop();
  }
  // Wisch-Hinweis (Liste Nr. 4): Verlauf rechts, solange weitere Werkzeuge folgen; nach dem Wischen auch links
  function pscrollHint(ps) { if (!ps) return; const max = ps.scrollWidth - ps.clientWidth; ps.classList.toggle('kp-il-at-end', max <= 1 || ps.scrollLeft >= max - 1); ps.classList.toggle('kp-il-scrolled', ps.scrollLeft > 1); }
  pop.addEventListener('scroll', e => { if (e.target.classList?.contains('kp-il-pscroll')) pscrollHint(e.target); }, { capture: true, passive: true });
  function hidePop() { pop.classList.remove('open', 'kp-il-more-open'); moreOpen = false; tag.classList.remove('show'); document.querySelector('.kp-il-bubble.show')?.classList.remove('show'); hideLayerPop(); popEl = null; document.documentElement.classList.remove('kp-il-docked', 'kp-il-barmode'); placeFab(); }
  // Popover nie über anderen bearbeitbaren Elementen (oder dem Element selbst, der Kopfzeile, der Buchungsleiste):
  // Handy zuerst unterhalb, Desktop zuerst oberhalb; sonst in 8-px-Schritten ausweichen; notfalls geringste Überdeckung.
  function popObstacles(n, vTop, vBottom) {
    const out = [], nr = n.getBoundingClientRect(), cx = nr.left + nr.width / 2, cy = nr.top + nr.height / 2; out.push(nr);
    const hd = $('.site-header'); if (hd) { const r = hd.getBoundingClientRect(); if (r.height && r.bottom > vTop) out.push(r); }
    for (const e of $$('[data-editable-text],img[data-editable-image]')) {
      if (e === n || e.contains(n) || n.contains(e) || !inContent(e) || e.closest('.kp-il-ui')) continue;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < vTop || r.top > vBottom || r.right < 0 || r.left > innerWidth) continue;
      if (e.matches('img') && cx > r.left && cx < r.right && cy > r.top && cy < r.bottom) continue; // Hintergrundbild hinter dem Element
      if (e.matches('.piece-summary') && e.closest('.piece') && e.closest('.piece') === n.closest('.piece')) continue; // sammel1: Kurztext der eigenen Karte darf (wie vor sammel1) verdeckt werden – Nachbarkarten bleiben frei
      if (getComputedStyle(e).visibility === 'hidden' || e.closest('.mobile-menu:not(.open)')) continue;
      out.push(r);
    }
    return out;
  }
  function placeTag(r, busy) {
    if (busy || !r.width) { tag.classList.remove('show'); return; }
    tag.classList.add('show');
    const tw = tag.offsetWidth || 50, th = tag.offsetHeight || 18;
    const hd = $('.site-header'), hb = hd && /fixed|sticky/.test(getComputedStyle(hd).position) ? hd.getBoundingClientRect().bottom : 0;
    let top = r.top - 6 - th; if (top < hb + 2) top = r.bottom + 6;
    tag.style.left = Math.round(Math.min(Math.max(4, r.left - 4), innerWidth - tw - 4)) + 'px'; tag.style.top = Math.round(top) + 'px';
  }
  function placePop() {
    if (!popEl) return;
    if (!popEl.isConnected || !inline()) { hidePop(); return; }
    const busy = window.KPGesture?.active || drag?.active;
    pop.style.visibility = busy ? 'hidden' : '';
    const pr0 = popEl.getBoundingClientRect();
    placeTag(pr0, busy);
    // sammel3 (W1): Handy – Leiste fest unten (über der Tastatur), Buchungsleiste solange ausgeblendet (außer man bearbeitet gerade sie)
    if (isPhone()) {
      const vv0 = window.visualViewport, vb = vv0 ? vv0.offsetTop + vv0.height : innerHeight;
      const inBar = !!popEl.closest('.mobile-conversion-bar'), cb = $('.mobile-conversion-bar');
      document.documentElement.classList.toggle('kp-il-barmode', !inBar);
      document.documentElement.classList.remove('kp-il-docked');
      pop.classList.add('kp-il-docked-bottom'); pop.style.maxWidth = ''; pop.style.left = '0px';
      let bottomEdge = vb;
      if (inBar && cb) { const r = cb.getBoundingClientRect(); if (r.height) bottomEdge = Math.min(vb, r.top); }
      pop.style.top = Math.round(bottomEdge - pop.offsetHeight) + 'px';
      placeFab(); return;
    }
    pop.classList.remove('kp-il-docked-bottom'); document.documentElement.classList.remove('kp-il-barmode');
    // 03.10.2026 (Nachtest 3, klein): am Laptop höchstens so breit wie die eigene Stückkarte – sonst ragt es in die Nachbarkarten (Rest wischbar).
    const ownCard = !isPhone() && popEl.closest('.piece');
    pop.style.maxWidth = ownCard ? Math.max(260, Math.floor(ownCard.getBoundingClientRect().width)) + 'px' : '';
    const ps = $('.kp-il-pscroll', pop); ps?.classList.toggle('ovf', ps.scrollWidth > ps.clientWidth + 1); pscrollHint(ps);
    const r = popEl.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const vv = window.visualViewport, vTop = vv ? vv.offsetTop : 0, vBottom = vv ? vv.offsetTop + vv.height : innerHeight;
    let left = Math.min(Math.max(6, r.left + r.width / 2 - w / 2), innerWidth - w - 6);
    // 03.10.2026 sammel1 (Nachtest 5, K-1): am Laptop nie über die (feste) Kopfzeile – Untergrenze = Unterkante Kopfzeile
    const hdrEl = $('.site-header'), hb = !isPhone() && hdrEl && /fixed|sticky/.test(getComputedStyle(hdrEl).position) ? Math.round(hdrEl.getBoundingClientRect().bottom) : 0;
    const lo = Math.max(vTop + 6, hb + 6), hi = Math.max(lo, vBottom - h - 6), clamp = t => Math.max(lo, Math.min(hi, t));
    const obs = popObstacles(popEl, vTop, vBottom);
    const area = (rs, t, l) => { let a = 0; for (const o of rs) { const x = Math.min(l + w, o.right) - Math.max(l, o.left), y = Math.min(t + h, o.bottom) - Math.max(t, o.top); if (x > 0 && y > 0) a += x * y; } return a; };
    const cover = (t, l = left) => area(obs, t, l);
    const below = [], above = [];
    for (let d = 0; d <= 240; d += 4) { below.push(r.bottom + 8 + d); above.push(r.top - h - 8 - d); } // 4-px-Raster: findet auch knappe Lücken zwischen Kurztext und Nachbarkarte
    const order = (isPhone() ? [below[0], above[0], ...below.slice(1), ...above.slice(1)] : [above[0], below[0], ...above.slice(1), ...below.slice(1)]).filter(t => t >= lo && t <= hi);
    // Desktop (Liste Nr. 6): freie Stelle bevorzugen, die auch keine Nachbarkarte (Stückkarte) anschneidet. Dafür darf das Menü
    // waagrecht an die eigene Karte bzw. den Fensterrand rücken; geht es nirgends ganz frei, die geringste Überdeckung der Nachbarkarten.
    const cards = isPhone() ? [] : $$('.piece').filter(c => !c.contains(popEl)).map(c => c.getBoundingClientRect()).filter(c => c.bottom > vTop && c.top < vBottom);
    const clampL = l => Math.min(Math.max(6, l), innerWidth - w - 6);
    const own = popEl.closest('.piece')?.getBoundingClientRect();
    const lefts = cards.length ? [...new Set([left, ...(own ? [clampL(own.left), clampL(own.right - w), clampL(own.left + own.width / 2 - w / 2)] : []), clampL(6), clampL(innerWidth - w - 6)].map(Math.round))].filter(l => l < r.right && l + w > r.left) : [left];
    let top, best = null, dock = false;
    search: for (const t of order) for (const l of lefts) {
      if (cover(t, l) !== 0) continue;
      const c = area(cards, t, l); if (!best || c < best.c) best = { t, l, c };
      if (c === 0) break search;
    }
    if (best) { top = best.t; left = best.l; }
    if (top === undefined) {
      // kein freier Platz (dichte Raster am Handy): an die Stelle der Buchungsleiste andocken (Leiste solange ausgeblendet)
      const bar = $('.mobile-conversion-bar'), br = bar && getComputedStyle(bar).display !== 'none' && !bar.classList.contains('kp-mcb-hide') ? bar.getBoundingClientRect() : null;
      if (isPhone() && br?.height && !bar.contains(popEl)) { dock = true; top = Math.round(br.bottom - h); }
      else { const cands = [...order, clamp(r.bottom + 8), clamp(r.top - h - 8)]; let bb = null; for (const t of cands) for (const l of lefts) { const c = cover(t, l) + 2 * area(cards, t, l); if (!bb || c < bb.c) bb = { t, l, c }; } top = bb.t; left = bb.l; } // Nachbarkarten zählen stärker
    }
    document.documentElement.classList.toggle('kp-il-docked', dock);
    pop.style.left = Math.round(dock ? 6 : left) + 'px'; pop.style.top = Math.round(top) + 'px';
    placeFab();
  }
  /* ---------- ↶/↷ in der Kopfzeile, links neben der Lupe (nur im Editor, ohne Elementauswahl nutzbar) ----------
     Absolut im Header positioniert (kein Flex-Element) → Header/Hero/Nav bleiben pixelgleich zur Vorschau.
     Reicht der Platz links der Lupe nicht (Desktop: Navigation + „Jetzt buchen“ füllen die Zeile), sitzen sie kompakt darunter. */
  const hdr = $('.site-header');
  const hu = el('div', 'kp-hdr-undo kp-il-ui',
    B('undo', icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'), 'aria-label="Rückgängig" title="Rückgängig"') +
    B('redo', icon('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'), 'aria-label="Wiederholen" title="Wiederholen"'));
  hu.setAttribute('role', 'group'); hu.setAttribute('aria-label', 'Verlauf');
  hdr?.append(hu);
  function syncHdrUndo() { $('[data-il=undo]', hu).disabled = !canUndo(); $('[data-il=redo]', hu).disabled = !canRedo(); }
  function placeHdrUndo() {
    if (!hdr || !inline() || getComputedStyle(hu).display === 'none') return;
    const anchor = $('.site-search', hdr), ar = anchor?.getBoundingClientRect();
    const hr = hdr.getBoundingClientRect();
    const visible = n => { if (!n) return null; const r = n.getBoundingClientRect(), cs = getComputedStyle(n); return r.width && cs.display !== 'none' && cs.visibility !== 'hidden' ? r : null; };
    if (!ar?.width) { hu.dataset.pos = 'off'; return; }
    let limit = hr.left; // rechter Rand des nächsten sichtbaren Nachbarn links der Lupe (Logo, Navigation, „Jetzt buchen“)
    for (const c of hdr.children) { if (c === hu || c === anchor) continue; const r = visible(c.matches('.brand') && visible($('.brand-logo', c)) && !visible($('span,strong', c)) ? $('.brand-logo', c) : c); if (r && r.right <= ar.left + 1) limit = Math.max(limit, r.right); }
    hu.dataset.pos = 'side';
    let w = hu.offsetWidth, h = hu.offsetHeight, left = ar.left - 6 - w, top = ar.top + (ar.height - h) / 2;
    if (left < limit + 8) {
      hu.dataset.pos = 'below'; w = hu.offsetWidth; h = hu.offsetHeight;
      left = (ar.left + ar.right) / 2 - w / 2; top = ar.bottom + 1; // sammel4 (a3): kein Vorschau-Stift mehr neben der Lupe
    }
    hu.style.left = Math.round(left - hr.left - hdr.clientLeft) + 'px'; hu.style.top = Math.round(top - hr.top - hdr.clientTop) + 'px';
  }
  hu.addEventListener('pointerdown', e => e.preventDefault()); hu.addEventListener('mousedown', e => e.preventDefault()); // Cursor/Tastatur bleiben
  hu.addEventListener('click', e => {
    const a = e.target.closest('[data-il]')?.dataset.il; if (!a) return;
    e.preventDefault(); hideLayerPop(); $(`[data-history="${a}"]`)?.click(); syncHdrUndo();
  });
  // 03.10.2026 (Nachtest 3, F-D): Im offenen Stück-/Termin-Fenster ist die Kopfzeile verdeckt → eigenes ↶/↷ neben dem ✎.
  const mu = el('div', 'kp-modal-undo kp-il-ui', hu.innerHTML);
  mu.setAttribute('role', 'group'); mu.setAttribute('aria-label', 'Verlauf');
  body.append(mu);
  const syncModalUndo = () => { $('[data-il=undo]', mu).disabled = !canUndo(); $('[data-il=redo]', mu).disabled = !canRedo(); };
  mu.addEventListener('pointerdown', e => e.preventDefault()); mu.addEventListener('mousedown', e => e.preventDefault());
  mu.addEventListener('click', e => {
    const a = e.target.closest('[data-il]')?.dataset.il; if (!a || e.target.closest('[data-il]').disabled) return;
    e.preventDefault(); e.stopPropagation(); hideLayerPop(); $(`[data-history="${a}"]`)?.click(); syncHdrUndo(); syncModalUndo();
  });
  document.addEventListener('kp-history-change', syncModalUndo); syncModalUndo();
  if (hdr && window.ResizeObserver) new ResizeObserver(() => placeHdrUndo()).observe(hdr);
  hdr?.addEventListener('transitionend', () => placeHdrUndo());
  document.fonts?.ready?.then(() => placeHdrUndo());
  const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; placePop(); placeFab(); placeHdrUndo(); try { placeGrip(); } catch {} }); };
  document.addEventListener('kp-history-change', () => { syncHdrUndo(); if (popEl?.isConnected) showPop(popEl); });
  syncHdrUndo();
  addEventListener('scroll', schedule, { passive: true, capture: true }); addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
  pop.addEventListener('pointerdown', e => e.preventDefault()); pop.addEventListener('mousedown', e => e.preventDefault()); // Cursor/Tastatur bleiben
  pop.addEventListener('click', e => {
    const a = e.target.closest('[data-il]')?.dataset.il, n = popEl; if (!a || !n?.isConnected) return;
    if (a === 'done') { if (document.activeElement?.isContentEditable) document.activeElement.blur(); deselect(); return; }
    if (a === 'more' || a === 'more-close') { moreOpen = a === 'more' && !moreOpen; hideLayerPop(); showPop(n); if (moreOpen) $('.kp-il-more-sheet [data-il]:not([disabled]):not([data-il=more-close])', pop)?.focus({ preventScroll: true }); return; }
    if (a === 'edit') { if (S().selected !== n) S().select(n); startTyping(n); placeCaretEnd(n); moreOpen = false; showPop(n); return; }
    if (a === 'up' || a === 'down') {
      const u = unitOf(n), sib = moveSibling(u, a === 'up' ? -1 : 1); if (!sib) return;
      if (document.activeElement?.isContentEditable) document.activeElement.blur();
      if (a === 'up') sib.before(u); else sib.after(u);
      try { S().captureDetail?.(); saveDraft(); recordHistory(); } catch {}
      u.scrollIntoView({ block: 'nearest', behavior: 'instant' }); showPop(n); toast(a === 'up' ? 'Nach oben verschoben.' : 'Nach unten verschoben.'); return;
    }
    if (a === 'img' || a === 'crop' || a === 'alt') { openImageSheet(n, a); return; }
    if (a === 'layer' || a === 'add') { e.stopPropagation(); showLayerPop(unitOf(n), e.target.closest(`[data-il=${a}]`), a); return; }
    if (a === 'copy') { // Kopie bleibt danach ausgewählt (vorher: Auswahl weg, Fokus im Original)
      if (document.activeElement?.isContentEditable) document.activeElement.blur();
      const u = unitOf(n); S().select(u); $('[data-element="copy"]', S().inspector)?.click();
      const copy = u.nextElementSibling;
      setTimeout(() => { const c = copy?.isConnected && copy !== n ? copy : S().selected; if (!c?.isConnected) return; if (S().selected !== c) S().select(c); setActive(c); showPop(c); }, 80);
      return;
    }
    if (a === 'bold' || a === 'italic') {
      if (!n.isContentEditable) { startTyping(n); const r = document.createRange(); r.selectNodeContents(n); getSelection().removeAllRanges(); getSelection().addRange(r); }
      document.execCommand(a); return;
    }
    if (a === 'link') { S().select(n.closest('a')); S().linkToolbar?.querySelector('[data-open-link-dialog]')?.click(); return; }
    // sammel12 (NB-3): Rücksprungziel fürs Schließen des Fensters (der Knopf der Leiste ist danach weg) = Karte bzw. Link/Knopf des gewählten Elements
    if (a === 'open' && !n.closest('a[data-source]') && bookingLink(n)) { if (document.activeElement?.isContentEditable) document.activeElement.blur(); window.KPDetailReturnHint = n.closest('a[data-booking]') || n; deselect(); window.KPShowBooking?.(); return; }
    if (a === 'open') { const l = n.closest('a[data-source]'); if (document.activeElement?.isContentEditable) document.activeElement.blur(); window.KPDetailReturnHint = l || n; deselect(); if (l) S().openSource?.(l); return; }
    if (a === 'piece') { const card = n.closest('.piece') || pieceLinkOf(n); if (document.activeElement?.isContentEditable) document.activeElement.blur(); window.KPDetailReturnHint = card; deselect(); S().openPiece(card); return; }
    if (a === 'remove') { removeEl(unitOf(n)); return; }
    S().select(n);
    $(`[data-element="${a}"]`, S().inspector)?.click();
    requestAnimationFrame(() => { const sel = S().selected; if (sel) showPop(sel); else schedule(); });
  });

  // Löschen OHNE Rückfrage (Runde 11): kp-delanim.js löscht über den Inspector, spielt die Animation und zeigt danach
  // „Gelöscht – Rückgängig“ (5 s). opts.target = Papierkorb beim Ziehen (Ziel der Animation).
  function removeEl(n, opts = {}) {
    const D = window.KPDelete;
    if (D?.remove) { D.remove(n, { target: !!opts.target, after: deselect, fail: opts.fail }); return; }
    if (!confirm('Dieses Element löschen? (Mit Rückgängig wieder herstellbar)')) { opts.fail?.(); return; }
    S().select(n);
    $('[data-element="remove"]', S().inspector)?.click();
    deselect();
    toast('Element gelöscht.', { label: 'Rückgängig', run: undo });
  }

  /* ---------- Text direkt bearbeiten ---------- */
  // sammel3 (Nachtest 7, Befund 3): am Laptop sind Eltern wie a.hero-entry oder p.sp-note selbst contenteditable – dann bekäme der ganze Knopf/Absatz
  // den Fokus und Rücktaste könnte Titel und Unterzeile verschmelzen. Beim Schreiben werden diese Eltern kurz auf „false“ gesetzt, so ist nur das Element selbst bearbeitbar.
  let lockedHosts = [];
  function restoreHosts() { lockedHosts.forEach(h => { if (h.isConnected && h.getAttribute('contenteditable') === 'false') h.setAttribute('contenteditable', 'true'); }); lockedHosts = []; }
  function isolateHost(n) {
    restoreHosts();
    for (let p = n.parentElement; p && p !== body && p.closest(CONTENT); p = p.parentElement) if (p.getAttribute('contenteditable') === 'true') { p.setAttribute('contenteditable', 'false'); lockedHosts.push(p); }
  }
  document.addEventListener('focusout', () => setTimeout(() => { if (lockedHosts.length && !lockedHosts.some(h => h.contains(document.activeElement))) restoreHosts(); }, 0));
  // sammel12 (NB-3): Fokus nach dem Schließen eines Fensters zurückgeben. Ist das Ziel selbst bearbeitbar (Laptop: a.piece ist contenteditable),
  // wird es kurz gesperrt (wie beim Schreiben), damit es den Fokus als Link/Karte bekommt und Tippen nichts verschmilzt.
  window.KPFocusReturn = t => {
    if (!t?.isConnected) return;
    if (inline() && t.getAttribute('contenteditable') === 'true') { restoreHosts(); t.setAttribute('contenteditable', 'false'); lockedHosts.push(t); }
    t.focus({ preventScroll: true });
  };
  function startTyping(n, x, y) {
    document.querySelector('.kp-il-bubble.show')?.classList.remove('show'); // sammel3: Hinweis ist erledigt, sobald geschrieben wird
    if (typeof window.KPStartTyping === 'function' && isPhone()) { window.KPStartTyping(n, x, y); return; }
    isolateHost(n);
    if (n.getAttribute('contenteditable') !== 'true') n.contentEditable = 'true';
    if (document.activeElement !== n && !n.contains(document.activeElement)) {
      n.focus({ preventScroll: true });
      const range = x != null && document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null, sel = getSelection();
      if (range && n.contains(range.startContainer)) { sel.removeAllRanges(); sel.addRange(range); }
      else { const r = document.createRange(); r.selectNodeContents(n); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
    }
  }
  // Enter: in Überschriften/Buttons/Links = Bearbeiten beenden, sonst Zeilenumbruch (<br>) statt verschachtelter <div>
  const SINGLE_LINE = 'h1,h2,h3,h4,h5,h6,a,button,.button,figcaption,summary,label,cite,.eyebrow,.bf-l';
  document.addEventListener('beforeinput', e => {
    if (!inline() || (e.inputType !== 'insertParagraph' && e.inputType !== 'insertLineBreak')) return;
    const n = e.target instanceof Element ? e.target.closest('[contenteditable=true]') : null; if (!n || !n.closest(CONTENT)) return;
    if (n.matches(SINGLE_LINE)) { e.preventDefault(); n.blur(); deselect(); return; }
    if (e.inputType === 'insertParagraph') { e.preventDefault(); document.execCommand('insertLineBreak'); }
  }, true);
  document.addEventListener('focusout', e => { const n = e.target; if (!inline() || !n?.isContentEditable || !n.closest?.(CONTENT)) return; setTimeout(() => { try { S().captureDetail?.(); } catch {} }, 0); });

  /* ---------- Bild austauschen (Web-Optimierung + Upload) ---------- */
  let imgTarget = null;
  function replaceImage(n) { openImageSheet(n, 'img'); } // sammel3: immer über das eine Bild-Blatt
  async function legacyReplace(file) {
    const target = imgTarget; imgTarget = null;
    if (!file || !target?.isConnected) return;
    try {
      if (target.closest('.piece') || typeof window.KPOptimizeUpload !== 'function') { await window.KPReplaceImage(file, target, {}); }
      else {
        toast('Bild wird optimiert und hochgeladen …');
        const res = await window.KPOptimizeUpload(file);
        target.src = res.src; target.removeAttribute('srcset');
        saveDraft(); recordHistory();
        toast(`Bild ausgetauscht (${res.width} × ${res.height} px, ${res.kb} KB${res.uploaded ? '' : ', im Entwurf eingebettet: ' + res.error}). Noch nicht veröffentlicht.`, { label: 'Rückgängig', run: undo });
      }
      if (target.isConnected) showPop(target);
    } catch (err) { toast(err.message || 'Das Bild konnte nicht ausgetauscht werden.'); }
  }

  /* ---------- sammel3 (W5/Optik 5): ein Bild-Blatt – Tauschen (Kamera/Galerie), Zuschneiden (4:3 · 1:1 · 16:9), Beschreibung ----------
     Handy: Blatt von unten (≤ 85 % Höhe), Laptop: Seitenpanel rechts (380 px). Erst „Übernehmen“ ändert die Seite (ein Verlaufsschritt). */
  const imgSheet = el('section', 'kp-il-imgsheet kp-il-ui'); imgSheet.setAttribute('role', 'dialog'); imgSheet.setAttribute('aria-modal', 'true'); imgSheet.setAttribute('aria-label', 'Bild');
  const imgScrim = el('div', 'kp-il-scrim kp-il-imgscrim kp-il-ui');
  const camPick = document.createElement('input'); camPick.type = 'file'; camPick.accept = 'image/*'; camPick.setAttribute('capture', 'environment'); camPick.hidden = true; camPick.className = 'kp-il-ui'; camPick.dataset.transient = '';
  body.append(imgScrim, imgSheet, camPick);
  const RATIOS = [['orig', 'Original', 0], ['4:3', '4:3', 4 / 3], ['1:1', '1:1', 1], ['16:9', '16:9', 16 / 9]];
  let isx = null; // Zustand des Bild-Blatts
  function openImageSheet(n, focus = 'img') {
    if (!n?.isConnected) return;
    if (document.activeElement?.isContentEditable) document.activeElement.blur();
    const r = n.getBoundingClientRect(), ar = r.width && r.height ? r.width / r.height : 0;
    // sammel4 (a4): Stückbilder (Karten) sind immer 4:3 – nur diese Wahl anbieten; der Ausschnitt entsteht aus dem Original (KPReplaceImage)
    const piece = !!n.closest('.piece'), ratios = piece ? RATIOS.filter(x => x[0] === '4:3') : RATIOS;
    let pre = piece ? '4:3' : 'orig'; if (!piece) for (const [k, , v] of RATIOS) if (v && ar && Math.abs(ar / v - 1) < 0.08) pre = k;
    isx = { n, file: null, url: '', ratio: pre, ratioTouched: false, preset: pre, piece }; pendingAdd = null;
    imgSheet.innerHTML = `<div class="kp-il-grab" aria-hidden="true"></div>
      <div class="kp-il-ishead"><b>Bild</b><button type="button" class="kp-il-x" data-is="close" aria-label="Schließen">✕</button></div>
      <div class="kp-il-isbody">
        <div class="kp-il-isprev"><img alt="" data-is-prev></div>
        <div class="kp-il-isrow"><button type="button" data-is="camera">📷 Foto aufnehmen</button><button type="button" data-is="gallery">🖼 Aus Galerie</button></div>
        <div class="kp-il-iscrop" role="group" aria-label="Zuschneiden"><span>✂️ Zuschneiden</span><div>${ratios.map(([k, l]) => `<button type="button" data-is-ratio="${k}" aria-pressed="${k === pre}">${l}</button>`).join('')}</div>${piece ? '<small class="kp-il-isnote" data-is-note>Stückbilder werden immer im Format 4:3 gezeigt.</small>' : ''}</div>
        <label class="kp-il-isalt"><span>Was ist auf dem Bild?</span><textarea rows="2" data-is-alt maxlength="300"></textarea></label>
      </div>
      <div class="kp-il-isfoot"><button type="button" class="kp-il-isok" data-is="apply">Übernehmen</button></div>`;
    $('[data-is-alt]', imgSheet).value = n.getAttribute('alt') || '';
    renderImgPreview();
    hidePop(); imgSheet.classList.add('open'); imgScrim.classList.add('open');
    const f = focus === 'alt' ? $('[data-is-alt]', imgSheet) : focus === 'crop' ? $(`[data-is-ratio="${pre}"]`, imgSheet) : $('[data-is=gallery]', imgSheet);
    setTimeout(() => f?.focus({ preventScroll: true }), 30);
  }
  function renderImgPreview() {
    if (!isx) return; const im = $('[data-is-prev]', imgSheet); if (!im) return;
    im.src = isx.url || isx.n.currentSrc || isx.n.src;
    const v = RATIOS.find(x => x[0] === isx.ratio)?.[2] || 0;
    im.parentElement.style.aspectRatio = v ? String(v) : ''; im.classList.toggle('kp-il-cropped', !!v);
    $$('[data-is-ratio]', imgSheet).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.isRatio === isx.ratio)));
  }
  function closeImageSheet(keep = true) {
    const n = isx?.n; if (isx?.url) URL.revokeObjectURL(isx.url); isx = null;
    imgSheet.classList.remove('open'); imgScrim.classList.remove('open'); imgSheet.innerHTML = '';
    if (keep && n?.isConnected) { S().select(n); showPop(n); }
  }
  function pickFor(input) { input.value = ''; input.click(); }
  picker.addEventListener('cancel', () => { pendingAdd = null; });
  [picker, camPick].forEach(inp => inp.addEventListener('change', () => {
    const file = inp.files?.[0]; inp.value = '';
    if (pendingAdd && inp === picker && !isx) { if (file) insertNewImage(file); else pendingAdd = null; return; }
    if (!file) return;
    if (isx) { if (isx.url) URL.revokeObjectURL(isx.url); isx.file = file; isx.url = URL.createObjectURL(file); renderImgPreview(); return; }
    legacyReplace(file);
  }));
  imgScrim.addEventListener('click', () => closeImageSheet());
  // sammel12 (NB-2): solange das Bild-Blatt offen ist, bleibt Tab/Umschalt+Tab im Blatt und Esc schließt es immer (auch wenn der Fokus außerhalb liegt)
  addEventListener('keydown', e => {
    if (!isx || !imgSheet.classList.contains('open')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeImageSheet(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(imgSheet); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  }, true);
  async function cropToFile(src, ratio, name) { // Mitte zuschneiden (gleiche Herkunft bzw. Datei/Objekt-URL)
    const im = new Image(); im.decoding = 'async'; im.src = src; await im.decode();
    let sw = im.naturalWidth, sh = im.naturalHeight, sx = 0, sy = 0;
    if (ratio) { if (sw / sh > ratio) { const w = Math.round(sh * ratio); sx = Math.round((sw - w) / 2); sw = w; } else { const h = Math.round(sw / ratio); sy = Math.round((sh - h) / 2); sh = h; } }
    const c = document.createElement('canvas'); c.width = sw; c.height = sh; c.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    if (!blob) throw new Error('Das Bild konnte nicht zugeschnitten werden.');
    return new File([blob], (name || 'bild') + '.png', { type: 'image/png' });
  }
  async function applyImageSheet() {
    if (!isx) return; const { n, file, ratio, ratioTouched } = isx, alt = $('[data-is-alt]', imgSheet).value.replace(/\s+/g, ' ').trim();
    const v = RATIOS.find(x => x[0] === ratio)?.[2] || 0, okBtn = $('[data-is=apply]', imgSheet);
    const piece = !!isx.piece, altChanged = alt !== (n.getAttribute('alt') || ''), crop = !piece && !!v && (ratioTouched || !!file); // sammel4 (a4): Stückbild – Original hochladen, 4:3 schneidet saveRepertoireImage
    if (!file && !crop && !altChanged) { closeImageSheet(); return; }
    okBtn.disabled = true; okBtn.textContent = 'Wird übernommen …';
    try {
      let out = file;
      if (crop) out = await cropToFile(isx.url || n.currentSrc || n.src, v, 'zugeschnitten');
      let msg = 'Bildbeschreibung geändert.';
      if (out) {
        if (n.closest('.piece') || typeof window.KPOptimizeUpload !== 'function') { await window.KPReplaceImage(out, n, { noHistory: true }); msg = piece ? 'Stückbild übernommen (4:3-Ausschnitt). Noch nicht veröffentlicht.' : 'Bild übernommen. Noch nicht veröffentlicht.'; }
        else { toast('Bild wird optimiert und hochgeladen …'); const res = await window.KPOptimizeUpload(out); n.src = res.src; n.removeAttribute('srcset'); msg = `Bild übernommen (${res.width} × ${res.height} px, ${res.kb} KB${res.uploaded ? '' : ', im Entwurf eingebettet: ' + res.error}). Noch nicht veröffentlicht.`; }
      }
      if (altChanged || out) n.setAttribute('alt', alt);
      saveDraft(); recordHistory(); try { S().captureDetail?.(); } catch {}
      closeImageSheet(); toast(msg, { label: 'Rückgängig', run: undo });
    } catch (err) { okBtn.disabled = false; okBtn.textContent = 'Übernehmen'; toast(err.message || 'Das Bild konnte nicht übernommen werden.'); }
  }
  imgSheet.addEventListener('click', e => {
    const b = e.target.closest('[data-is],[data-is-ratio]'); if (!b || !isx) return;
    if (b.dataset.isRatio) { isx.ratio = b.dataset.isRatio; isx.ratioTouched = true; renderImgPreview(); return; }
    const a = b.dataset.is;
    if (a === 'close') closeImageSheet();
    else if (a === 'camera') pickFor(camPick);
    else if (a === 'gallery') pickFor(picker);
    else if (a === 'apply') applyImageSheet();
  });
  window.KPImageSheet = { open: (n, f) => openImageSheet(n, f), close: () => closeImageSheet(false), get open_() { return !!isx; } };

  /* ---------- sammel3 (K1): feste ID und Typ je bearbeitbarem Element (einmal vergeben, mitgespeichert, Kopien bekommen eine neue) ---------- */
  const KTYPE = n => n.matches('img') ? 'bild' : n.matches('h1,h2,h3,h4,h5,h6') ? 'ueberschrift' : n.closest('.piece') ? (n.matches('.piece-summary') ? 'stueckkarte-text' : 'stueckkarte') : n.matches('a.button,button,.button') ? 'button' : n.matches('a') ? 'link' : n.matches('li') ? 'listenpunkt' : n.matches('figcaption') ? 'bildunterschrift' : n.closest('summary') ? 'frage' : n.matches('cite') ? 'zitat' : 'text';
  const KAREA = n => { const d = n.closest('[data-detail-body]'); if (d) return 'fenster-' + (($('#piece-modal-content,[data-detail-source]')?.dataset.detailSource || 'x').replace(/^piece:/, '').replace(/\.html.*$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 30)); if (n.closest('.mobile-conversion-bar')) return 'leiste'; if (n.closest('.footer')) return 'fuss'; if (n.closest('.desktop-nav,.mobile-menu,.site-header')) return 'menue'; return n.closest('section[id]')?.id || 'seite'; };
  function assignIds() {
    if (!editing()) return;
    const all = $$('[data-editable-text],img[data-editable-image]').filter(n => inContent(n) && !n.closest('.kp-il-ui'));
    const used = new Set(), max = {};
    const bump = id => { const m = /^(.*)-(\d+)$/.exec(id); if (m) max[m[1]] = Math.max(max[m[1]] || 0, +m[2]); };
    for (const n of all) { const id = n.dataset.kpId; if (!id) continue; if (used.has(id)) { delete n.dataset.kpId; continue; } used.add(id); bump(id); } // doppelt (Kopie) → neu vergeben
    let fresh = false;
    for (const n of all) {
      const type = KTYPE(n); if (n.dataset.kpType !== type) n.dataset.kpType = type;
      if (n.dataset.kpId) continue;
      const pre = KAREA(n) + '-' + type, k = (max[pre] || 0) + 1; max[pre] = k;
      n.dataset.kpId = pre + '-' + k; fresh = true;
    }
    if (fresh) try { window.KPAdoptIds?.(); } catch {} // sammel12 (NB-10): neue IDs in den aktuellen Verlaufsschritt, damit ↶ sie nicht neu vergibt
  }
  window.KPAssignIds = assignIds;
  document.addEventListener('theater-restored', () => setTimeout(() => { try { assignIds(); } catch {} }, 0));

  /* ---------- sammel3 (S1): Hilfe im richtigen Moment – kleine Blase am Element, je Hinweis nur einmal ---------- */
  const bubble = el('div', 'kp-il-bubble kp-il-ui'); bubble.setAttribute('role', 'status'); body.append(bubble);
  const HINTS = { text: () => isPhone() ? 'Tippe nochmal, um zu schreiben.' : 'Klicke in den Text und schreibe einfach los.', img: () => 'Hier kannst du das Bild tauschen.' };
  const hintSeen = k => { try { return localStorage.getItem('kp-hint-' + k) === '1'; } catch { return true; } };
  function hint(n, k) {
    if (!HINTS[k] || hintSeen(k)) return;
    try { localStorage.setItem('kp-hint-' + k, '1'); } catch {}
    bubble.innerHTML = `<span>${HINTS[k]()}</span><button type="button">OK</button>`;
    const r = n.getBoundingClientRect(); bubble.classList.add('show');
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    let top = r.top - bh - 30; if (top < 70) top = Math.min(innerHeight - bh - 90, r.bottom + 30);
    bubble.style.left = Math.round(Math.min(Math.max(8, r.left), innerWidth - bw - 8)) + 'px'; bubble.style.top = Math.round(top) + 'px';
    clearTimeout(hint.t); hint.t = setTimeout(() => bubble.classList.remove('show'), 6000);
  }
  bubble.addEventListener('click', e => { if (e.target.closest('button')) bubble.classList.remove('show'); });
  function resetHints() { try { Object.keys(HINTS).forEach(k => localStorage.removeItem('kp-hint-' + k)); } catch {} }

  /* ---------- Tippen: Text schreiben / Bild wählen; Links navigieren nicht ---------- */
  let suppressUntil = 0;
  addEventListener('click', e => {
    if (!inline()) return;
    const t = e.target instanceof Element ? e.target : e.target?.parentElement; if (!t) return;
    if (t.closest('.kp-il-ui')) { try { suppressClickUntil = 0; } catch {} return; } // eigene Knöpfe nie durch die Drag-Sperre schlucken
    if (Date.now() < suppressUntil) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (t.closest('[data-kp-acc="logout"]')) { e.preventDefault(); e.stopImmediatePropagation(); logout(); return; }
    if (t.closest(SKIP) && !t.closest('.booking-form .bf-l')) return; // sammel3: Feldnamen der Anfrage sind bearbeitbarer Text
    let n = editableOf(t);
    // sammel3 (Nachtest 7, Befund 1): Klick in die Frage-Zeile neben dem Text (Laptop: Zeile ist breit) wählt die Frage; nur das +/− rechts (48 px) klappt auf/zu
    if (!n) { const sm = t.closest('details>summary'); if (sm && inContent(sm) && e.clientX < sm.getBoundingClientRect().right - 48) n = sm.querySelector('[data-editable-text]'); }
    if (!n) { if (activeEl && !t.closest('.piece-modal-card')) deselect(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    const again = activeEl === n;
    if (n.matches('img')) { if (again && popEl === n) { openImageSheet(n, 'img'); return; } S().select(n); showPop(n); hint(n, 'img'); return; }
    if (pieceLinkOf(n)) { if (again && popEl === n) { window.KPDetailReturnHint = pieceLinkOf(n); deselect(); S().openPiece(pieceLinkOf(n)); return; } if (n.isContentEditable) n.removeAttribute('contenteditable'); showPop(n); return; }
    if (S().selected !== n) S().select(n);
    // sammel3 (W2): Handy – 1. Tipp wählt aus (Rahmen + Leiste, keine Tastatur), 2. Tipp auf dasselbe Element oder „Text ändern“ = schreiben.
    // Laptop: Klick = direkt schreiben (Maus setzt keinen Cursor aus Versehen).
    if (isPhone() && !(again && popEl === n) && !n.isContentEditable) { showPop(n); hint(n, 'text'); return; }
    startTyping(n, e.clientX, e.clientY);
    showPop(n);
    if (!isPhone()) hint(n, 'text'); // sammel12 (NB-9): erster Hinweis auch am Laptop
  }, true);
  function placeCaretEnd(n) { try { if (n.contains(getSelection().anchorNode) && !getSelection().isCollapsed) return; const r = document.createRange(); r.selectNodeContents(n); r.collapse(false); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); } catch {} }

  /* ---------- Long-Press + Ziehen (Maus und Finger) ---------- */
  let drag = null;
  function clearDragGhost(d) {
    if (!d) return;
    try { d.ghost?.remove?.(); } catch {}
    if (d.n?.isConnected && d.visibility !== undefined) d.n.style.visibility = d.visibility;
    d.ghost = null;
  }
  const LP_MS = { mouse: 350, pen: 400, touch: 420 };
  addEventListener('pointerdown', e => {
    if (!inline() || !e.isPrimary || e.button > 0) return;
    const t = e.target instanceof Element ? e.target : null; if (!t || t.closest(SKIP) || t.closest('.kp-il-ui')) return;
    const n = dragTargetOf(t); if (!n) return;
    window.KPBlockCanvasDrag = true; // kein Sofort-Ziehen aus modern.js: erst der Long-Press zieht
    if (e.pointerType === 'mouse') return; // Maus: Verschieben nur über den Griff ⠿ (normales Markieren bleibt)
    if (n.isContentEditable && (document.activeElement === n || n.contains(document.activeElement))) return; // beim Schreiben: normale Textauswahl
    clearTimeout(drag?.timer);
    drag = { n, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, id: e.pointerId, type: e.pointerType, active: false };
    drag.timer = setTimeout(activateDrag, LP_MS[e.pointerType] || 400);
  }, true);
  function activateDrag() {
    const d = drag; if (!d || !d.n.isConnected || window.KPGesture?.active) { drag = null; return; }
    d.active = true;
    const ae = document.activeElement; if (ae?.isContentEditable) ae.blur();
    getSelection()?.removeAllRanges(); body.classList.add('kp-il-nosel');
    if (S().selected !== d.n) S().select(d.n);
    setActive(d.n); d.n.classList.add('kp-il-dragging'); hidePop();
    d.tr0 = d.n.style.translate; d.over = false; d.visibility = d.n.style.visibility;
    d.ghost = window.KPDelete?.dragGhost?.(d.n) || null;
    if (d.ghost) { d.n.style.visibility = 'hidden'; d.ghost.sync(); }
    window.KPDelete?.zone?.show(); // Papierkorb unten mittig (Buchungsleiste/✎ solange ausgeblendet)
    try { navigator.vibrate?.(12); } catch {}
    try { beginElementMove(d.n, { button: 0, clientX: d.lx, clientY: d.ly, pointerId: d.id, target: d.n, preventDefault() {} }, { preserveClick: false }); } catch {}
  }
  /* ---------- Desktop-Griff ⠿ ---------- */
  const finePointer = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
  let gripEl = null, gripWant = null, gripT = 0;
  function placeGrip() {
    const n = gripEl;
    if (!n?.isConnected || !inline() || !finePointer() || drag?.active || sheet.classList.contains('open')) { grip.classList.remove('show'); return; }
    const r = n.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) { grip.classList.remove('show'); return; }
    let left = r.left - 30; if (left < 4) left = Math.min(r.left + 4, innerWidth - 30);
    grip.style.left = Math.round(left) + 'px'; grip.style.top = Math.round(Math.max(4, Math.min(innerHeight - 30, r.top))) + 'px';
    grip.classList.add('show');
  }
  function wantGrip(n) {
    if (n === gripWant) return; gripWant = n; clearTimeout(gripT);
    // kurze Verzögerung, damit der Weg vom Element zum Griff ihn nicht umspringen lässt
    gripT = setTimeout(() => { gripEl = gripWant || (activeEl?.isConnected ? dragTargetOf(activeEl) : null); placeGrip(); }, n ? (gripEl ? 180 : 0) : 450);
  }
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || !inline() || drag || e.buttons) return;
    const t = e.target instanceof Element ? e.target : null; if (!t || t.closest('.kp-il-ui')) { if (t?.closest('.kp-il-grip')) { clearTimeout(gripT); gripWant = gripEl; } return; }
    wantGrip(t.closest(SKIP) ? null : dragTargetOf(t));
  }, { passive: true });
  grip.addEventListener('pointerdown', e => {
    const n = gripEl; if (!n?.isConnected || e.button > 0 || !inline()) return;
    e.preventDefault(); e.stopPropagation();
    const ae = document.activeElement; if (ae?.isContentEditable) ae.blur();
    clearTimeout(drag?.timer); window.KPBlockCanvasDrag = true;
    drag = { n, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, id: e.pointerId, type: e.pointerType, active: false };
    grip.classList.remove('show'); activateDrag();
  });
  addEventListener('pointermove', e => {
    const d = drag; if (!d || e.pointerId !== d.id) return;
    d.lx = e.clientX; d.ly = e.clientY;
    if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 9) { clearTimeout(d.timer); drag = null; }
    else if (d.active) {
      e.preventDefault();
      const ov = !!window.KPDelete?.zone?.over(e.clientX, e.clientY);
      if (ov !== d.over) { d.over = ov; d.n.classList.toggle('kp-il-overtrash', ov); }
      try { d.ghost?.sync?.(); requestAnimationFrame(() => { if (drag === d) d.ghost?.sync?.(); }); } catch {}
    }
  }, true);
  const endDrag = e => {
    const d = drag; if (!d || (e.pointerId !== undefined && e.pointerId !== d.id)) return;
    clearTimeout(d.timer); drag = null;
    if (!d.active) return;
    d.n.classList.remove('kp-il-dragging', 'kp-il-overtrash'); body.classList.remove('kp-il-nosel');
    clearDragGhost(d);
    suppressUntil = Date.now() + 450; // der Klick nach dem Loslassen soll nicht schreiben/navigieren
    if (d.over && e.type === 'pointerup' && window.KPDelete?.remove) {
      // über dem Papierkorb losgelassen: Verschieben verwerfen (nicht in den Verlauf) und sofort löschen
      try { if (typeof moveState !== 'undefined' && moveState) { moveState.moved = false; finishElementMove(); } } catch {}
      const n = d.n, tr0 = d.tr0 || '';
      suppressUntil = 0; // der interne Inspector-Klick darf nicht von der Klick-Sperre geschluckt werden
      removeEl(n, { target: true, fail: () => { if (n.isConnected) { n.style.translate = tr0; showPop(n); } } });
      suppressUntil = Date.now() + 450;
      return;
    }
    window.KPDelete?.zone?.hide();
    try { if (typeof moveState !== 'undefined' && moveState) finishElementMove(); } catch {}
    setTimeout(() => { if (d.n.isConnected) showPop(d.n); placeGrip(); }, 40);
  };
  addEventListener('pointerup', endDrag, true); addEventListener('pointercancel', endDrag, true);
  // Während des Ziehens darf die Seite nicht scrollen; vorher schon (Long-Press unterscheidet Scroll von Drag)
  addEventListener('touchmove', e => { if (drag?.active && e.cancelable) e.preventDefault(); if (window.KPGesture?.active) schedule(); }, { capture: true, passive: false });
  addEventListener('touchstart', e => { if (e.touches.length > 1 && drag) { clearTimeout(drag.timer); drag.n.classList.remove('kp-il-dragging', 'kp-il-overtrash'); body.classList.remove('kp-il-nosel'); clearDragGhost(drag); if (drag.active) window.KPDelete?.zone?.hide(); drag = null; } }, { capture: true, passive: true });
  addEventListener('contextmenu', e => { if (!inline()) return; const t = e.target instanceof Element ? e.target : null; if (drag || (t && matchMedia('(pointer: coarse)').matches && inContent(t) && !t.closest('[contenteditable=true]'))) e.preventDefault(); }, true);
  addEventListener('dragstart', e => { if (inline() && drag) e.preventDefault(); }, true);

  /* ---------- Autosave als Entwurf (Handy macht das mobile-studio.js bereits; hier Desktop) ---------- */
  let lastChange = 0, lastAttempt = 0;
  function autosave(reason) {
    if (!inline() || isPhone() || !window.KPPhoneState?.dirty || window.KPPhoneState.saving || S().busy || !S().backend) return;
    if (reason === 'timer' && (Date.now() - lastChange < 2500 || Date.now() - lastAttempt < 20000)) return;
    lastAttempt = Date.now(); S().save('draft');
  }
  setInterval(() => autosave('timer'), 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autosave('hidden'); });

  /* ---------- Moduswechsel ---------- */
  document.addEventListener('editor-mode', e => {
    if (!e.detail) { deselect(); openSheet(false); return; }
    setTimeout(() => { fixVp(); placeFab(); syncHdrUndo(); placeHdrUndo(); }, 20);
    if (!inline()) return;
    let seen = null; try { seen = localStorage.getItem('kp-il-hint'); localStorage.setItem('kp-il-hint', '1'); } catch {}
    if (!seen) setTimeout(() => toast(isPhone() ? 'Antippen = auswählen · nochmal tippen = schreiben · ✎ unten rechts = Menü' : 'Klicken = schreiben · ✎ unten rechts = Menü'), 1200); // sammel3 (S1): weitere Hilfe kommt am Element
    setTimeout(() => { try { assignIds(); } catch {} }, 60);
  });
  document.addEventListener('studio-select', e => { if (inline() && !e.detail) { hidePop(); setActive(null); } });
  document.addEventListener('theater-restored', () => { if (activeEl && !activeEl.isConnected) { activeEl = null; hidePop(); } else schedule(); });
  if (editing()) { fixVp(); placeFab(); placeHdrUndo(); setTimeout(() => { try { assignIds(); } catch {} }, 60); }
  window.KPInline = { get on() { return inline(); }, setClassic, openSheet, showPop, deselect, openImageSheet, assignIds, computeChanges };
})();
