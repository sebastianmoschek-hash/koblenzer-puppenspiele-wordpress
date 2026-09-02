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
const saveNetwork = [];

page.on('response', async response => {
  try {
    if (!response.url().includes('/wp-admin/admin-ajax.php')) return;
    const request = response.request();
    const post = request.postData() || '';
    if (!/kp_touch_(?:free_layout|gesture)_save|kp_fe_v2_save/.test(post)) return;
    const action = (post.match(/name="action"\r?\n\r?\n([^\r\n]+)/) || [])[1] || 'unknown';
    const body = await response.text().catch(() => '');
    saveNetwork.push({ action, status: response.status(), body: body.slice(0, 1200) });
  } catch (error) {
    saveNetwork.push({ action: 'network-log-error', status: 0, body: String(error?.message || error) });
  }
});

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
  const reloaded = await page.waitForFunction(previous => performance.timeOrigin !== previous, before, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  await page.waitForTimeout(500);
  return reloaded;
}

async function saveDiagnostics() {
  const browserState = await page.evaluate(() => ({
    freeDirty: Boolean(window.KPFreeLayoutRuntime?.isDirty?.()),
    genericDirty: Boolean(window.KPTouchGestureRuntime?.isDirty?.()),
    editorMode: Boolean(window.KPFrontendEditorV2?.editMode),
    toast: document.querySelector('.kp-fe2-toast')?.textContent?.trim() || '',
    saveText: document.querySelector('.kp-fe2-save')?.textContent?.trim() || '',
    saveDisabled: Boolean(document.querySelector('.kp-fe2-save')?.disabled),
    href: location.href,
  })).catch(() => ({}));
  return { browserState, saveNetwork };
}

try {
  // The temporary staging-only MU plugin sets a real WordPress auth cookie and redirects.
  await page.goto(`${base}/?kp_e2e_login=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.kp-fe2-save', { timeout: 15000 });
  await page.waitForSelector(headerSelector, { timeout: 15000 });

  originalState = await state();
  // Edit mode now intentionally uses the unified Canva runtime; keep legacy
  // names as fallbacks for older staging deployments during rollout.
  const pageKey = await page.evaluate(() => window.KPCanvaEditor?.pageKey || window.KPFreeLayout?.pageKey || window.KPTouchPersistence?.pageKey || '');
  if (!pageKey) fail('Kein echter Touch-pageKey auf Staging gefunden.');

  const beforeTransform = await page.locator(headerSelector).first().evaluate(el => getComputedStyle(el).transform);
  await drag(headerSelector, 43, 21);

  const dirtyAfterDrag = await page.evaluate(() => Boolean(window.KPFreeLayoutRuntime?.isDirty?.()));
  const draftTransform = await page.locator(headerSelector).first().evaluate(el => getComputedStyle(el).transform);
  if (!dirtyAfterDrag || draftTransform === beforeTransform) fail('Echter Header-Drag auf Staging hat keinen lokalen Entwurf erzeugt.');

  // Critical contract: drag/pinch may not write to WordPress before orange Save.
  const serverBeforeSave = await state();
  if (!same(serverBeforeSave, originalState)) fail('Touch-Änderung wurde vor dem orangefarbenen Speichern automatisch in WordPress geschrieben.');

  saveNetwork.length = 0;
  const reloaded = await waitForRealReload(() => page.locator('.kp-fe2-save').click());
  await page.waitForSelector(headerSelector, { timeout: 15000 });

  const serverAfterSave = await state();
  if (same(serverAfterSave, originalState)) {
    const diag = await saveDiagnostics();
    fail(`Orange Speichern hat den Touch-Entwurf NICHT dauerhaft in WordPress geschrieben. reload=${reloaded}; diagnostics=${JSON.stringify(diag)}`);
  }

  const persistedTransform = await page.locator(headerSelector).first().evaluate(el => getComputedStyle(el).transform);
  if (persistedTransform === beforeTransform) fail('Nach echtem Reload ist die gespeicherte Header-Position/Größe nicht sichtbar.');

  // A second unsaved drag must remain local after persistence was proven.
  await drag(headerSelector, -27, 13);
  const afterSecondDraft = await state();
  if (!same(afterSecondDraft, serverAfterSave)) fail('Zweiter Drag wurde wieder automatisch gespeichert.');

  // Undo must revert the local draft without touching WordPress.
  const undoButton = page.locator('[data-kp-word-history-new="undo"], .kp-fe2-undo').first();
  await undoButton.waitFor({ state: 'visible', timeout: 10000 });
  await undoButton.click();
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
