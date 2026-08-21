import { chromium } from 'playwright';

const base = (process.env.KP_E2E_BASE || 'https://neu.koblenzer-puppenspiele.de').replace(/\/$/, '');
const token = process.env.KP_E2E_TOKEN || '';
if (!token) throw new Error('KP_E2E_TOKEN fehlt.');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await context.newPage();
const fail = message => { throw new Error(message); };
const headerSelector = '.kp-header-stage img,.kp-header-photo img';
let originalState = null;

async function ajax(action, extra = {}) {
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

async function state() {
  const result = await ajax('kp_e2e_touch_state');
  if (!result.ok || !result.json?.success) fail(`E2E-Status konnte nicht gelesen werden: ${JSON.stringify(result)}`);
  return result.json.data;
}

async function restore(snapshot) {
  const result = await ajax('kp_e2e_touch_restore', { snapshot });
  if (!result.ok || !result.json?.success) fail(`E2E-Ausgangszustand konnte nicht wiederhergestellt werden: ${JSON.stringify(result)}`);
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

async function drag(selector, dx, dy, hold = 560) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) fail(`Kein sichtbares Element für ${selector}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(hold);
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
}

async function waitForRealReload(click) {
  const before = await page.evaluate(() => performance.timeOrigin);
  await click();
  await page.waitForFunction(previous => performance.timeOrigin !== previous, before, { timeout: 15000 }).catch(() => null);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
}

try {
  // The temporary staging-only MU plugin sets a real WordPress auth cookie and redirects.
  await page.goto(`${base}/?kp_e2e_login=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.kp-fe2-save', { timeout: 15000 });
  await page.waitForSelector(headerSelector, { timeout: 15000 });

  originalState = await state();
  const pageKey = await page.evaluate(() => window.KPFreeLayout?.pageKey || window.KPTouchPersistence?.pageKey || '');
  if (!pageKey) fail('Kein echter Touch-pageKey auf Staging gefunden.');

  const beforeTransform = await page.locator(headerSelector).first().evaluate(el => getComputedStyle(el).transform);
  await drag(headerSelector, 43, 21);

  const dirtyAfterDrag = await page.evaluate(() => Boolean(window.KPFreeLayoutRuntime?.isDirty?.()));
  const draftTransform = await page.locator(headerSelector).first().evaluate(el => getComputedStyle(el).transform);
  if (!dirtyAfterDrag || draftTransform === beforeTransform) fail('Echter Header-Drag auf Staging hat keinen lokalen Entwurf erzeugt.');

  // Critical contract: drag/pinch may not write to WordPress before orange Save.
  const serverBeforeSave = await state();
  if (!same(serverBeforeSave, originalState)) fail('Touch-Änderung wurde vor dem orangefarbenen Speichern automatisch in WordPress geschrieben.');

  await waitForRealReload(() => page.locator('.kp-fe2-save').click());
  await page.waitForSelector(headerSelector, { timeout: 15000 });

  const serverAfterSave = await state();
  if (same(serverAfterSave, originalState)) fail('Orange Speichern hat den Touch-Entwurf NICHT dauerhaft in WordPress geschrieben.');

  const persistedTransform = await page.locator(headerSelector).first().evaluate(el => getComputedStyle(el).transform);
  if (persistedTransform === beforeTransform) fail('Nach echtem Reload ist die gespeicherte Header-Position/Größe nicht sichtbar.');

  // A second unsaved drag must remain local after persistence was proven.
  await drag(headerSelector, -27, 13);
  const afterSecondDraft = await state();
  if (!same(afterSecondDraft, serverAfterSave)) fail('Zweiter Drag wurde wieder automatisch gespeichert.');

  // Undo must revert the local draft without touching WordPress.
  await page.locator('.kp-fe2-undo').click();
  await page.waitForTimeout(120);
  const afterUndo = await state();
  if (!same(afterUndo, serverAfterSave)) fail('Rückgängig hat unerwartet WordPress beschrieben.');

  console.log(`PASS: echter Staging-End-to-End-Speichertest für ${pageKey}: Entwurf lokal, orange Speichern schreibt DB, Reload behält Zustand, Undo bleibt lokal.`);
} finally {
  if (originalState) {
    try {
      await restore(originalState);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      const restored = await state().catch(() => null);
      if (restored && !same(restored, originalState)) console.error('WARNUNG: E2E-Ausgangszustand stimmt nach Restore nicht exakt überein.');
    } catch (error) {
      console.error('WARNUNG: Restore des E2E-Ausgangszustands fehlgeschlagen:', error?.message || error);
    }
  }
  await context.close();
  await browser.close();
}
