import { chromium } from 'playwright';

const base = (process.env.KP_E2E_BASE || 'https://neu.koblenzer-puppenspiele.de').replace(/\/$/, '');
const token = process.env.KP_E2E_TOKEN || '';
if (!token) throw new Error('KP_E2E_TOKEN fehlt.');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await context.newPage();
const fail = message => { throw new Error(message); };
let originalState = null;

async function e2eAjax(action, extra = {}) {
  return page.evaluate(async ({ action, extra, token }) => {
    const fd = new FormData();
    fd.append('action', action);
    fd.append('token', token);
    for (const [key, value] of Object.entries(extra || {})) fd.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    const response = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', credentials: 'same-origin', cache: 'no-store', body: fd });
    const json = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, json };
  }, { action, extra, token });
}

async function ownerAjax(action, extra = {}) {
  return page.evaluate(async ({ action, extra }) => {
    const cfg = window.KPOwnerWebApp;
    if (!cfg?.nonce) return { ok:false, status:0, json:null, error:'owner nonce missing' };
    const fd = new FormData();
    fd.append('action', action);
    fd.append('nonce', cfg.nonce);
    for (const [key, value] of Object.entries(extra || {})) fd.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    const response = await fetch(cfg.ajaxUrl, { method:'POST', credentials:'same-origin', cache:'no-store', body:fd });
    const json = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, json };
  }, { action, extra });
}

async function state() {
  const result = await e2eAjax('kp_e2e_owner_state');
  if (!result.ok || !result.json?.success) fail(`E2E-Zustand konnte nicht gelesen werden: ${JSON.stringify(result)}`);
  return result.json.data;
}

async function restore(snapshot) {
  const result = await e2eAjax('kp_e2e_owner_restore', { snapshot });
  if (!result.ok || !result.json?.success) fail(`E2E-Ausgangszustand konnte nicht wiederhergestellt werden: ${JSON.stringify(result)}`);
}

function same(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
function subsetMatches(actual, expected) {
  return Object.entries(expected).every(([key,value]) => same(actual?.[key], value));
}

async function waitReload(click) {
  const before = await page.evaluate(() => performance.timeOrigin);
  await click();
  const changed = await page.waitForFunction(previous => performance.timeOrigin !== previous, before, { timeout:18000 }).then(()=>true).catch(()=>false);
  await page.waitForLoadState('domcontentloaded').catch(()=>null);
  await page.waitForTimeout(600);
  return changed;
}

async function openDesign() {
  await page.locator('.kp-oa-tools').click();
  await page.locator('[data-action="design"]').click();
  await page.waitForSelector('.kp-oa-sheet.is-design [data-design="header_radius"]', { timeout:10000 });
  await page.waitForTimeout(350);
}

async function mutateEveryDesignControl() {
  return page.evaluate(() => {
    const changed = {};
    const controls = [...document.querySelectorAll('.kp-oa-sheet.is-design [data-design]')];
    for (const input of controls) {
      const key = input.dataset.design;
      if (!key) continue;
      if (input.type === 'range') {
        const min = Number(input.min || 0), max = Number(input.max || 100), step = Number(input.step || 1) || 1;
        const current = Number(input.value);
        const next = current + step <= max ? current + step : Math.max(min, current - step);
        input.value = String(next);
        changed[key] = next;
        input.dispatchEvent(new Event('input', { bubbles:true }));
      } else if (input.type === 'checkbox') {
        input.checked = !input.checked;
        changed[key] = input.checked ? 1 : 0;
        input.dispatchEvent(new Event('change', { bubbles:true }));
      } else if (input.type === 'color') {
        const next = String(input.value).toLowerCase() === '#112233' ? '#223344' : '#112233';
        input.value = next;
        changed[key] = next;
        input.dispatchEvent(new Event('input', { bubbles:true }));
      } else if (input.tagName === 'SELECT') {
        const options = [...input.options];
        const idx = Math.max(0, options.findIndex(option => option.value === input.value));
        const next = options[(idx + 1) % options.length]?.value ?? input.value;
        input.value = next;
        changed[key] = next;
        input.dispatchEvent(new Event('change', { bubbles:true }));
      } else {
        const max = Number(input.maxLength > 0 ? input.maxLength : 80);
        let next = `${input.value || ''} QA`.slice(0, max);
        if (next === input.value) next = String(input.value || '').slice(0, Math.max(0, max - 1)) + 'Q';
        input.value = next;
        changed[key] = next;
        input.dispatchEvent(new Event('input', { bubbles:true }));
      }
    }
    return changed;
  });
}

async function mutateEverySizeControl() {
  await page.locator('.kp-oa-sheet.is-design [data-tab="sizes"]').click();
  await page.waitForSelector('[data-kp-size]', { timeout:10000 });
  return page.evaluate(() => {
    const changed = {};
    for (const input of document.querySelectorAll('[data-kp-size]')) {
      const key = input.dataset.kpSize;
      const min = Number(input.min), max = Number(input.max), current = Number(input.value);
      const next = current + 1 <= max ? current + 1 : Math.max(min, current - 1);
      input.value = String(next);
      changed[key] = next;
      input.dispatchEvent(new Event('input', { bubbles:true }));
    }
    return changed;
  });
}

async function mutateMenuX() {
  await page.locator('.kp-oa-sheet.is-design [data-tab="menu"]').click();
  await page.waitForSelector('[data-kp-menu-x] input[type="range"]', { timeout:10000 });
  return page.evaluate(() => {
    const input = document.querySelector('[data-kp-menu-x] input[type="range"]');
    const min=Number(input.min), max=Number(input.max), current=Number(input.value), step=Number(input.step||2);
    const next=current+step<=max?current+step:Math.max(min,current-step);
    input.value=String(next);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    return next;
  });
}

async function closeDesignAndSave() {
  await page.locator('.kp-oa-sheet.is-design .kp-oa-close').click();
  await page.waitForTimeout(100);
  const reloaded = await waitReload(() => page.locator('.kp-fe2-save').click());
  if (!reloaded) fail('Orange Speichern hat keinen echten Reload ausgelöst.');
  await page.waitForSelector('.kp-fe2-save', { timeout:15000 });
}

async function mutateHeaderRadiusOnly() {
  await openDesign();
  const expected = await page.evaluate(() => {
    const input=document.querySelector('[data-design="header_radius"]');
    const min=Number(input.min),max=Number(input.max),current=Number(input.value);
    const next=current+3<=max?current+3:Math.max(min,current-3);
    input.value=String(next);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    return next;
  });
  await closeDesignAndSave();
  return expected;
}

try {
  await page.goto(`${base}/?kp_e2e_login=${encodeURIComponent(token)}`, { waitUntil:'domcontentloaded', timeout:30000 });
  await page.waitForSelector('.kp-fe2-save', { timeout:15000 });
  await page.waitForSelector('.kp-oa-tools', { timeout:15000 });
  originalState = await state();

  // Full owner control matrix: all visible Design controls + all size controls + menu X.
  await openDesign();
  const expectedDesign = await mutateEveryDesignControl();
  if (!Object.prototype.hasOwnProperty.call(expectedDesign, 'header_radius')) fail('Header-Rundung ist nicht als persistierbarer Design-Regler vorhanden.');
  const expectedSizes = await mutateEverySizeControl();
  const expectedMenuX = await mutateMenuX();
  await closeDesignAndSave();

  const saved = await state();
  if (!subsetMatches(saved.studio, expectedDesign)) {
    fail(`Mindestens ein Design-Regler wurde nicht gespeichert. expected=${JSON.stringify(expectedDesign)} actual=${JSON.stringify(saved.studio)}`);
  }
  if (!subsetMatches(saved.sizes, expectedSizes)) {
    fail(`Mindestens ein Anzeigegrößen-Regler wurde nicht gespeichert. expected=${JSON.stringify(expectedSizes)} actual=${JSON.stringify(saved.sizes)}`);
  }
  if (Number(saved.studio?.menu_offset_x ?? 0) !== Number(expectedMenuX)) {
    fail(`Menü-X wurde nicht gespeichert. expected=${expectedMenuX} actual=${saved.studio?.menu_offset_x}`);
  }
  const radiusCss = await page.locator('.kp-header-stage').first().evaluate(el => getComputedStyle(el).borderTopLeftRadius).catch(()=> '');
  if (radiusCss !== `${Number(expectedDesign.header_radius)}px`) {
    fail(`Header-Rundung steht nach Reload nicht sichtbar auf ${expectedDesign.header_radius}px, sondern ${radiusCss}.`);
  }

  // Post-save Undo must restore the exact prior persisted owner settings.
  const historyAfterSave = await ownerAjax('kp_owner_history_list');
  if (!historyAfterSave.ok || !historyAfterSave.json?.success) fail(`Versionsliste fehlt nach Speicherung: ${JSON.stringify(historyAfterSave)}`);
  if (Number(historyAfterSave.json.data?.retention_hours) !== 48) fail('Versionshistorie hat nicht 48 Stunden Aufbewahrung.');
  if (!historyAfterSave.json.data?.items?.length) fail('Nach Speicherung wurde kein Versions-Snapshot angelegt.');
  if (Number(historyAfterSave.json.data?.undo_steps || 0) < 1 || Number(historyAfterSave.json.data?.undo_steps || 0) > 10) fail('Undo-Schrittzähler liegt nicht im erwarteten Bereich 1–10.');

  const undo = await ownerAjax('kp_owner_history_undo');
  if (!undo.ok || !undo.json?.success) fail(`Rückgängig nach Speicherung fehlgeschlagen: ${JSON.stringify(undo)}`);
  await page.reload({ waitUntil:'domcontentloaded', timeout:30000 });
  const afterUndo = await state();
  if (!same(afterUndo.studio, originalState.studio) || !same(afterUndo.sizes, originalState.sizes)) {
    fail('Rückgängig nach Speicherung hat Design/Größen nicht exakt auf den Ausgangsstand zurückgesetzt.');
  }

  // Version restore: make a fresh saved change, then restore its pre-save snapshot.
  await page.waitForTimeout(3300);
  const changedRadius = await mutateHeaderRadiusOnly();
  const changedState = await state();
  if (Number(changedState.studio?.header_radius) !== Number(changedRadius)) fail('Zweiter Header-Rundungs-Test wurde nicht gespeichert.');
  const versions = await ownerAjax('kp_owner_history_list');
  const version = versions.json?.data?.items?.[0];
  if (!version?.id) fail('Keine 48-Stunden-Version zum Wiederherstellen gefunden.');
  const restoredVersion = await ownerAjax('kp_owner_history_restore', { version_id:version.id });
  if (!restoredVersion.ok || !restoredVersion.json?.success) fail(`48-Stunden-Version konnte nicht wiederhergestellt werden: ${JSON.stringify(restoredVersion)}`);
  await page.reload({ waitUntil:'domcontentloaded', timeout:30000 });
  const afterVersionRestore = await state();
  if (!same(afterVersionRestore.studio, originalState.studio) || !same(afterVersionRestore.sizes, originalState.sizes)) {
    fail('Versions-Wiederherstellung hat den Ausgangsstand nicht korrekt zurückgebracht.');
  }

  // UI contract for the owner, not just backend endpoints.
  await page.locator('.kp-oa-tools').click();
  await page.waitForSelector('[data-kp-history-undo]', { timeout:10000 });
  await page.waitForSelector('[data-kp-history-versions]', { timeout:10000 });

  console.log(`PASS: ${Object.keys(expectedDesign).length} Design-Regler + ${Object.keys(expectedSizes).length} Größenregler + Menü-X über orange Speichern dauerhaft; Header-Rundung nach Reload sichtbar; Rückgängig nach Speichern funktioniert; 48-Stunden-Versionen funktionieren.`);
} finally {
  if (originalState) {
    try {
      await restore(originalState);
      await page.reload({ waitUntil:'domcontentloaded', timeout:30000 }).catch(()=>null);
      const restored=await state().catch(()=>null);
      if (restored && (!same(restored.studio, originalState.studio) || !same(restored.sizes, originalState.sizes) || !same(restored.history, originalState.history))) {
        console.error('WARNUNG: Owner-E2E-Ausgangszustand stimmt nach Restore nicht exakt überein.');
      }
    } catch (error) {
      console.error('WARNUNG: Restore des Owner-E2E-Ausgangszustands fehlgeschlagen:', error?.message || error);
    }
  }
  await context.close();
  await browser.close();
}
