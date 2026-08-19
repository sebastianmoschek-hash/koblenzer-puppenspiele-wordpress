(() => {
  'use strict';
  const cfg = window.KPOwnerWebApp;
  if (!cfg || !cfg.canEdit) return;

  const q = (s, r=document) => r.querySelector(s);
  const qa = (s, r=document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const statuses = {standard:'Normal / Tickets über Veranstalter',free:'Eintritt frei',planned:'In Planung',box_office:'Eintritt Tageskasse',sold_out:'Ausverkauft',closed:'Geschlossene Vorstellung',cancelled:'Abgesagt'};
  let state = null;

  async function api(action, fields={}) {
    const fd = new FormData();
    fd.append('action', action);
    fd.append('nonce', cfg.nonce);
    Object.entries(fields).forEach(([k,v]) => fd.append(k, typeof v === 'string' ? v : JSON.stringify(v)));
    const response = await fetch(cfg.ajaxUrl, {method:'POST', credentials:'same-origin', body:fd});
    let json;
    try { json = await response.json(); } catch (_) { throw new Error('WordPress hat keine gültige Antwort geliefert.'); }
    if (!json.success) throw new Error(json.data?.message || 'Aktion fehlgeschlagen.');
    return json.data;
  }

  function toast(text, type='') {
    let el = q('.kp-oa-toast');
    if (!el) { el = document.createElement('div'); el.className = 'kp-oa-toast'; document.body.appendChild(el); }
    el.textContent = text;
    el.className = 'kp-oa-toast is-visible' + (type ? ' is-' + type : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('is-visible'), 3000);
  }

  function closeSheet() {
    q('.kp-oa-backdrop')?.classList.remove('is-open');
    document.body.classList.remove('kp-oa-open');
  }

  function sheet() { return q('.kp-oa-sheet'); }

  function draftCard(d) {
    return `<article class="kp-cal-draft" data-id="${d.id}">
      <div class="kp-cal-draft-head"><div><b>${esc(d.title)}</b><small>${esc(d.date)}${d.time ? ' · '+esc(d.time)+' Uhr' : ''}${d.city ? ' · '+esc(d.city) : ''}</small></div><span>Entwurf</span></div>
      <div class="kp-cal-grid">
        <label class="wide">Stück / Titel<input data-kp-cal="title" value="${esc(d.title)}"></label>
        <label>Datum<input data-kp-cal="date" type="date" value="${esc(d.date)}"></label>
        <label>Beginn<input data-kp-cal="time" type="time" value="${esc(d.time)}"></label>
        <label>Ort / Stadt<input data-kp-cal="city" value="${esc(d.city)}"></label>
        <label>Spielstätte<input data-kp-cal="venue" value="${esc(d.venue)}"></label>
        <label class="wide">Adresse<input data-kp-cal="address" value="${esc(d.address)}"></label>
        <label class="wide">Status<select data-kp-cal="status">${Object.entries(statuses).map(([v,l])=>`<option value="${v}" ${d.status===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
        <label>Ticket-Link<input data-kp-cal="ticket_url" type="url" value="${esc(d.ticket_url)}" placeholder="https://…"></label>
        <label>Info-Link<input data-kp-cal="info_url" type="url" value="${esc(d.info_url)}" placeholder="https://…"></label>
      </div>
      <div class="kp-cal-actions"><button class="kp-oa-secondary" data-cal-save>Entwurf speichern</button><button class="kp-oa-primary" data-cal-publish>Veröffentlichen</button></div>
    </article>`;
  }

  function lastSyncText() {
    const at = state?.last_sync?.at;
    const s = state?.last_sync?.stats;
    if (!at) return 'Noch keine Synchronisierung durchgeführt.';
    const bits = [];
    if (s) { bits.push(`${s.created||0} neu`, `${s.updated||0} aktualisiert`, `${s.skipped||0} übersprungen`); }
    return `Letzte Synchronisierung: ${esc(at)}${bits.length ? ' · '+bits.join(', ') : ''}`;
  }

  function render() {
    const box = sheet(); if (!box || !state) return;
    box.className = 'kp-oa-sheet kp-cal-sheet';
    box.innerHTML = `<div class="kp-oa-head"><div><span class="kp-oa-kicker">Termine</span><h2>Google-Kalender „Auftritte“</h2><p>Nur-Lese-Verbindung: Google wird niemals verändert. Neue Vorstellungen landen zuerst als Entwurf auf der Website.</p></div><button class="kp-oa-close">×</button></div>
      <div class="kp-cal-status ${state.configured?'is-ok':'is-warn'}"><strong>${state.configured?'Verbunden':'Noch nicht verbunden'}</strong><small>${lastSyncText()}</small></div>
      ${state.configured ? `<div class="kp-cal-toolbar"><button class="kp-oa-primary" data-cal-sync>Jetzt synchronisieren</button><small>Der automatische Abgleich läuft zusätzlich im Hintergrund. Veröffentlichte Website-Termine werden nicht überschrieben.</small></div>` : `<div class="kp-cal-connect"><label><span>Geheime iCal-Adresse des Kalenders „Auftritte“</span><input data-cal-feed type="url" autocomplete="off" placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics"></label><p>Die Adresse wird nur in WordPress gespeichert und nicht öffentlich ausgegeben.</p><button class="kp-oa-primary" data-cal-connect>Nur-Lese-Kalender verbinden</button></div>`}
      <section class="kp-cal-drafts"><div class="kp-cal-section-head"><h3>Importierte Entwürfe</h3><span>${state.drafts?.length||0}</span></div>${state.drafts?.length ? state.drafts.map(draftCard).join('') : '<div class="kp-cal-empty">Aktuell warten keine importierten Vorstellungen auf Freigabe.</div>'}</section>`;
    q('.kp-oa-close', box)?.addEventListener('click', closeSheet);
    q('[data-cal-connect]', box)?.addEventListener('click', connect);
    q('[data-cal-sync]', box)?.addEventListener('click', sync);
    qa('[data-cal-save]', box).forEach(btn => btn.addEventListener('click', () => saveDraft(btn.closest('.kp-cal-draft'))));
    qa('[data-cal-publish]', box).forEach(btn => btn.addEventListener('click', () => publishDraft(btn.closest('.kp-cal-draft'))));
  }

  async function refresh() {
    const data = await api('kp_calendar_owner_state'); state = data; render();
  }

  async function connect() {
    const btn = q('[data-cal-connect]', sheet()); const input = q('[data-cal-feed]', sheet());
    btn.disabled = true; btn.textContent = 'Verbindet…';
    try { const data = await api('kp_calendar_owner_save_feed', {url:input.value}); state = data.state; toast(data.message,'ok'); render(); }
    catch(e) { toast(e.message,'error'); btn.disabled=false; btn.textContent='Nur-Lese-Kalender verbinden'; }
  }

  async function sync() {
    const btn = q('[data-cal-sync]', sheet()); btn.disabled=true; btn.textContent='Synchronisiert…';
    try { const data = await api('kp_calendar_owner_sync'); state = data.state; toast(data.message,'ok'); render(); }
    catch(e) { toast(e.message,'error'); btn.disabled=false; btn.textContent='Jetzt synchronisieren'; }
  }

  function collect(card) {
    const out={}; qa('[data-kp-cal]', card).forEach(el => out[el.dataset.kpCal]=el.value); return out;
  }

  async function saveDraft(card) {
    const btn=q('[data-cal-save]',card); btn.disabled=true; btn.textContent='Speichert…';
    try { const data=await api('kp_calendar_owner_update_draft',{id:card.dataset.id,fields:collect(card)}); state=data.state; toast(data.message,'ok'); render(); }
    catch(e){ toast(e.message,'error'); btn.disabled=false; btn.textContent='Entwurf speichern'; }
  }

  async function publishDraft(card) {
    const btn=q('[data-cal-publish]',card); btn.disabled=true; btn.textContent='Veröffentlicht…';
    try { const data=await api('kp_calendar_owner_publish',{id:card.dataset.id}); state=data.state; toast(data.message,'ok'); render(); }
    catch(e){ toast(e.message,'error'); btn.disabled=false; btn.textContent='Veröffentlichen'; }
  }

  async function openCalendar() {
    const box=sheet(); if(!box) return;
    box.className='kp-oa-sheet kp-cal-sheet'; box.innerHTML='<div class="kp-cal-loading">Google-Kalender wird geladen…</div>';
    try { await refresh(); } catch(e) { box.innerHTML=`<div class="kp-oa-head"><div><h2>Google-Kalender</h2><p>${esc(e.message)}</p></div><button class="kp-oa-close">×</button></div>`; q('.kp-oa-close',box)?.addEventListener('click',closeSheet); }
  }

  function injectHubButton() {
    const grid=q('.kp-oa-action-grid'); if(!grid || q('[data-action="calendar"]',grid)) return;
    const btn=document.createElement('button'); btn.type='button'; btn.dataset.action='calendar'; btn.innerHTML='<span>🗓</span><strong>Google-Kalender</strong><small>Auftritte abgleichen und Entwürfe freigeben</small>'; btn.addEventListener('click',openCalendar); grid.appendChild(btn);
  }

  const observer=new MutationObserver(injectHubButton); observer.observe(document.documentElement,{childList:true,subtree:true}); injectHubButton();
})();
