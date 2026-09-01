import { chromium } from 'playwright';

const base = (process.env.KP_E2E_BASE || 'https://neu.koblenzer-puppenspiele.de').replace(/\/$/, '');
const token = process.env.KP_E2E_TOKEN || '';
if (!token) throw new Error('KP_E2E_TOKEN fehlt.');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await context.newPage();
const watchdog = setTimeout(async () => {
  console.error('FAIL: Owner-E2E watchdog nach 9 Minuten ausgelöst.');
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  process.exit(124);
}, 9 * 60 * 1000);
const fail = message => { throw new Error(message); };
let originalState = null;
const automaticReloads = [];

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
  const navigation = page.waitForNavigation({ waitUntil:'domcontentloaded', timeout:18000 }).then(()=>true).catch(()=>false);
  await click();
  const changed = await navigation;
  await page.waitForTimeout(600);
  return changed;
}

// Oeffnungs-Pfad (Lauf 26): Seit der Web-Agent-Bar ist .kp-oa-tools per CSS
// auf left:-9999px geschoben (ausserhalb Viewport, owner-web-agent.css
// .kp-web-agent-active). Primaer-UI ist die Agent-Bar: "✎ Bearbeiten"
// ([data-kp-wa-edit]) oeffnet dasselbe Tool-Sheet.
async function openTools() {
  const agentEdit = page.locator('.kp-wa-bar [data-kp-wa-edit]').first();
  if (await agentEdit.count().catch(() => 0)) {
    await agentEdit.click({ force: true });
  } else {
    const tools = page.locator('.kp-oa-tools').first();
    await tools.waitFor({ state:'visible', timeout:10000 });
    await tools.click({ force:true });
  }
}

async function openDesign() {
  await openTools();
  const designAction = page.locator('[data-action="design"]').first();
  await designAction.waitFor({ state:'visible', timeout:10000 });
  await designAction.click({ force:true });
  await page.locator('.kp-oa-sheet.is-design [data-design="header_radius"]').waitFor({ state:'attached', timeout:10000 });
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
  automaticReloads.push(reloaded);
  if (!reloaded) {
    const diag = await page.evaluate(() => ({
      toast: document.querySelector('.kp-fe2-toast')?.textContent || document.querySelector('.kp-oa-toast')?.textContent || '',
      toastClass: document.querySelector('.kp-fe2-toast')?.className || document.querySelector('.kp-oa-toast')?.className || '',
      responsive: !!window.KPOwnerResponsiveWeb,
      responsiveRuntime: !!window.KPOwnerResponsiveRuntime,
      responsiveDirty: window.KPOwnerResponsiveRuntime?.isDirty?.() ?? null,
      responsiveSample: window.KPOwnerResponsiveRuntime?.settings?.()?.all_mobile ?? null,
      responsiveCfgSample: window.KPOwnerResponsiveWeb?.settings?.all_mobile ?? null,
      menuX: window.KPOwnerMenuXRuntime?.value?.() ?? null,
      menuXCfg: window.KPOwnerMenuX?.value ?? null
    }));
    fail(`Orange Speichern löste keinen Reload aus. Diagnose=${JSON.stringify(diag)}`);
  }
  await page.waitForSelector('.kp-fe2-save', { timeout:15000 });
  return reloaded;
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

async function editorStartDiagnostic(response) {
  return page.evaluate((status) => ({
    status,
    url: location.href,
    title: document.title,
    body: (document.body?.innerText || '').replace(/\s+/g,' ').slice(0,1200),
    globals: {
      fe2: !!window.KPFrontendEditorV2,
      owner: !!window.KPOwnerWebApp,
      responsive: !!window.KPOwnerResponsiveWeb,
      registry: !!window.KPOwnerSaveRegistry
    },
    scripts: [...document.scripts].map(s => s.src).filter(Boolean).filter(src => /koblenzer-puppenspiele|frontend-editor|owner-/i.test(src)).slice(-20)
  }), response?.status?.() ?? 0);
}

try {
  const loginResponse = await page.goto(`${base}/?kp_e2e_login=${encodeURIComponent(token)}`, { waitUntil:'domcontentloaded', timeout:30000 });
  try {
    await page.waitForSelector('.kp-fe2-save', { timeout:15000 });
  } catch (error) {
    const diag = await editorStartDiagnostic(loginResponse);
    fail(`Frontend-Editor wurde nicht initialisiert. Diagnose=${JSON.stringify(diag)}`);
  }
  // The legacy .kp-oa-tools control is intentionally hidden once the visible
  // owner agent bar is active. Exercise the same click path as the owner.
  await page.locator('.kp-wa-bar [data-kp-wa-edit], .kp-oa-tools').first().waitFor({ state:'visible', timeout:15000 });
  originalState = await state();

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

  const historyAfterSave = await ownerAjax('kp_owner_history_list');
  if (!historyAfterSave.ok || !historyAfterSave.json?.success) fail(`Versionsliste fehlt nach Speicherung: ${JSON.stringify(historyAfterSave)}`);
  if (Number(historyAfterSave.json.data?.retention_hours) !== 48) fail('Versionshistorie hat nicht 48 Stunden Aufbewahrung.');
  if (!historyAfterSave.json.data?.items?.length) fail('Nach Speicherung wurde kein Versions-Snapshot angelegt.');
  const originalVersionId = historyAfterSave.json.data.items[0]?.id;
  if (!originalVersionId) fail('Der Wiederherstellungspunkt vor der Speicherung fehlt.');

  await page.waitForSelector('[data-kp-word-history-new="undo"]', { state:'visible', timeout:10000 });
  await page.waitForSelector('[data-kp-word-history-new="redo"]', { state:'visible', timeout:10000 });
  if (await page.locator('[data-kp-history-undo]').count()) fail('Der alte Rückgängig-Textbutton ist noch vorhanden.');

  await openDesign();
  const arrowRadius = page.locator('.kp-oa-sheet.is-design [data-design="header_radius"]');
  const radiusBeforeArrow = Number(await arrowRadius.inputValue());
  const radiusMax = Number(await arrowRadius.getAttribute('max') || 50);
  await arrowRadius.focus();
  await arrowRadius.press(radiusBeforeArrow < radiusMax ? 'ArrowRight' : 'ArrowLeft');
  await page.waitForTimeout(180);
  const radiusAfterEdit = Number(await arrowRadius.inputValue());
  if (radiusAfterEdit === radiusBeforeArrow) fail('Der echte Test-Reglerschritt hat keinen Wert verändert.');
  const countsAfterEdit = await page.evaluate(() => window.KPWordHistory?.counts?.() || null);
  if (!countsAfterEdit || Number(countsAfterEdit.undo || 0) < 1) fail('Der neue Rückgängig-Pfeil hat den Bearbeitungsschritt nicht erfasst.');

  let unexpectedDialog = '';
  let unexpectedNavigation = false;
  const onDialog = async dialog => { unexpectedDialog = dialog.message(); await dialog.dismiss(); };
  const onFrame = frame => { if (frame === page.mainFrame()) unexpectedNavigation = true; };
  page.on('dialog', onDialog);
  page.on('framenavigated', onFrame);
  const urlBeforeUndo = page.url();
  await page.locator('[data-kp-word-history-new="undo"]').click();
  await page.waitForTimeout(260);
  page.off('dialog', onDialog);
  page.off('framenavigated', onFrame);
  if (unexpectedDialog) fail(`Rückgängig öffnete unerwartet einen Browserdialog: ${unexpectedDialog}`);
  if (unexpectedNavigation || page.url() !== urlBeforeUndo) fail('Rückgängig hat die Seite neu geladen oder navigiert.');
  if (Number(await arrowRadius.inputValue()) !== radiusBeforeArrow) fail('Rückgängig hat den Reglerwert nicht sofort wiederhergestellt.');

  await page.locator('[data-kp-word-history-new="redo"]').click();
  await page.waitForTimeout(180);
  if (Number(await arrowRadius.inputValue()) !== radiusAfterEdit) fail('Wiederholen hat den Reglerwert nicht sofort erneut angewendet.');
  const countsAfterRedo = await page.evaluate(() => window.KPWordHistory?.counts?.() || null);
  if (!countsAfterRedo || Number(countsAfterRedo.undo || 0) < 1) fail('Wiederholen hat die Historie nicht korrekt fortgeführt.');

  await page.locator('[data-kp-word-history-new="undo"]').click();
  await page.waitForTimeout(120);
  await page.locator('.kp-oa-sheet.is-design .kp-oa-close').click();

  await page.waitForTimeout(3300);
  const changedRadius = await mutateHeaderRadiusOnly();
  const changedState = await state();
  if (Number(changedState.studio?.header_radius) !== Number(changedRadius)) fail('Zweiter Header-Rundungs-Test wurde nicht gespeichert.');
  const versions = await ownerAjax('kp_owner_history_list');
  if (!versions.ok || !versions.json?.success) fail(`48-Stunden-Versionsliste konnte nicht gelesen werden: ${JSON.stringify(versions)}`);
  const restoredVersion = await ownerAjax('kp_owner_history_restore', { version_id:originalVersionId });
  if (!restoredVersion.ok || !restoredVersion.json?.success) fail(`48-Stunden-Version konnte nicht wiederhergestellt werden: ${JSON.stringify(restoredVersion)}`);
  await page.reload({ waitUntil:'domcontentloaded', timeout:30000 });
  const afterVersionRestore = await state();
  if (!same(afterVersionRestore.studio, originalState.studio) || !same(afterVersionRestore.sizes, originalState.sizes)) {
    fail('Versions-Wiederherstellung hat den Ausgangsstand nicht korrekt zurückgebracht.');
  }

  await page.waitForSelector('[data-kp-word-history-new="undo"]', { state:'visible', timeout:10000 });
    await page.waitForSelector('[data-kp-word-history-new="redo"]', { state:'visible', timeout:10000 });
    if (await page.locator('[data-kp-history-undo]').count()) fail('Der alte Rückgängig-Textbutton ist noch sichtbar/registriert.');
    await openTools();
    await page.waitForSelector('[data-kp-history-versions]', { timeout:10000 });

  if (automaticReloads.some(value => !value)) {
    fail(`Persistenz/Undo/48h-Versionen wurden vollständig geprüft, aber ${automaticReloads.filter(value => !value).length} von ${automaticReloads.length} orangefarbenen Speichervorgängen lösten keinen automatisch erkannten Reload aus.`);
  }

  console.log(`PASS: ${Object.keys(expectedDesign).length} Design-Regler + ${Object.keys(expectedSizes).length} Größenregler + Menü-X über orange Speichern dauerhaft; Header-Rundung nach Reload sichtbar; ↶/↷ wirken sofort ohne Reload/Dialog; 48-Stunden-Versionen funktionieren getrennt davon.`);
} finally {
  clearTimeout(watchdog);
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
