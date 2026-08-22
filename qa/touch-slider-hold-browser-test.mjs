import { chromium } from 'playwright';
import path from 'node:path';

const safetyJs = process.env.KP_TOUCH_SAFETY || path.resolve('wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/touch-gesture-safety.js');
const safetyCss = process.env.KP_TOUCH_SAFETY_CSS || path.resolve('wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/touch-gesture-safety.css');
const ownerCss = process.env.KP_OWNER_WEB_CSS || path.resolve('wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/owner-web-app.css');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const fail = message => { throw new Error(message); };

async function touch(type, x, y, id = 1) {
  const touchPoints = type === 'touchEnd' || type === 'touchCancel' ? [] : [{x, y, id, radiusX: 2, radiusY: 2, force: 0.7}];
  await cdp.send('Input.dispatchTouchEvent', {type, touchPoints});
}

async function tap(selector, id) {
  const box = await page.locator(selector).boundingBox();
  if (!box) fail(`Button ${selector} ist nicht sichtbar.`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const hit = await page.evaluate(({x,y,selector}) => document.elementFromPoint(x,y)?.closest(selector) !== null, {x,y,selector});
  if (!hit) fail(`Tap auf ${selector} trifft nicht den sichtbaren Button.`);
  await touch('touchStart', x, y, id);
  await page.waitForTimeout(45);
  await touch('touchEnd', x, y, id);
  await page.waitForTimeout(80);
}

try {
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0}
    .kp-oa-sheet{height:420px;overflow:auto;margin:40px 10px;border:1px solid #999;padding:12px;position:relative}
    .kp-oa-tab{display:none}.kp-oa-tab.is-active{display:block}
    .kp-oa-control{display:block;position:relative;margin:18px 10px;padding:12px}
    .kp-oa-control input[type=range]{width:300px}
    .kp-oa-sticky-actions{bottom:-12px;margin:18px -12px -12px;padding:12px}
    .kp-oa-sticky-actions button{min-height:44px;padding:8px 12px}
  </style></head><body class="kp-touch-gestures-enabled">
    <div class="kp-oa-sheet is-design">
      <div class="kp-oa-tabs"><button id="show-design" data-tab="menu">Menü</button></div>
      <div style="height:240px"></div>
      <div id="design-pane" class="kp-oa-tab" data-pane="menu">
        <div style="height:90px"></div>
        <label class="kp-oa-control"><span>Breite</span><input id="range" data-design="menu_width" type="range" min="0" max="100" step="1" value="50" /></label>
        <div style="height:700px"></div>
      </div>
      <div class="kp-oa-sticky-actions"><button type="button" class="kp-oa-secondary kp-oa-design-reset">Standardwerte</button><button type="button" class="kp-oa-primary kp-oa-design-save">Design speichern</button></div>
    </div>
  </body></html>`);

  await page.addStyleTag({ path: ownerCss });
  await page.addStyleTag({ path: safetyCss });
  await page.evaluate(() => {
    window.KPTouchGestures = { editMode: true, canEdit: true, holdMs: 320 };
    window.KPOwnerWebApp = { designDefaults: { menu_width: 62 } };
    window.__sliderInputEvents = 0;
    window.__sliderChangeEvents = 0;
    window.__saveClicks = 0;
    window.__resetClicks = 0;
    document.querySelector('#range')?.addEventListener('input', () => window.__sliderInputEvents += 1);
    document.querySelector('#range')?.addEventListener('change', () => window.__sliderChangeEvents += 1);
    document.querySelector('#show-design')?.addEventListener('click', () => document.querySelector('#design-pane')?.classList.add('is-active'));
    document.querySelector('.kp-oa-design-save')?.addEventListener('click', () => window.__saveClicks += 1);
    document.querySelector('.kp-oa-design-reset')?.addEventListener('click', () => window.__resetClicks += 1);
  });

  await page.addScriptTag({ path: safetyJs });
  await page.waitForTimeout(80);

  const guard = page.locator('.kp-touch-range-hardlock');
  if (await guard.count() !== 1) fail('Slider-Schutzschicht wurde nicht erzeugt.');
  const hardlock = await page.locator('#range').getAttribute('data-kp-touch-hardlocked');
  if (hardlock !== '4') fail(`Unerwartete Hardlock-Version: ${hardlock}`);

  await page.locator('#show-design').click();
  await page.waitForTimeout(120);
  await page.locator('#range').scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);

  let inputBox = await page.locator('#range').boundingBox();
  let guardBox = await guard.boundingBox();
  if (!inputBox || !guardBox) fail('Design-Regler oder Schutzschicht nach Tab-Öffnung nicht sichtbar.');
  const overlapX = Math.max(0, Math.min(inputBox.x + inputBox.width, guardBox.x + guardBox.width) - Math.max(inputBox.x, guardBox.x));
  const inputCenterY = inputBox.y + inputBox.height / 2;
  if (overlapX < inputBox.width * 0.9 || inputCenterY < guardBox.y || inputCenterY > guardBox.y + guardBox.height) {
    fail(`Schutzschicht liegt nicht über dem sichtbaren Design-Regler: input=${JSON.stringify(inputBox)} guard=${JSON.stringify(guardBox)}`);
  }

  const cx = inputBox.x + inputBox.width / 2;
  const cy = inputCenterY;
  const hit = await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.classList?.contains('kp-touch-range-hardlock') || false, {x:cx,y:cy});
  if (!hit) fail('Echter Touch auf der sichtbaren Sliderposition trifft die Schutzschicht nicht.');

  const initial = Number(await page.locator('#range').inputValue());
  const sheet = page.locator('.kp-oa-sheet');
  const scrollBefore = await sheet.evaluate(el => el.scrollTop);
  await touch('touchStart', cx, cy, 21);
  await page.waitForTimeout(35);
  await touch('touchMove', cx, cy - 70, 21);
  await page.waitForTimeout(35);
  await touch('touchEnd', cx, cy - 70, 21);
  await page.waitForTimeout(70);
  const quick = await page.evaluate(() => ({
    value: Number(document.querySelector('#range')?.value || 0),
    sheetScroll: document.querySelector('.kp-oa-sheet')?.scrollTop || 0,
    inputs: window.__sliderInputEvents,
    changes: window.__sliderChangeEvents,
  }));
  if (quick.value !== initial) fail(`Normales Wischen verändert den Design-Regler: ${JSON.stringify(quick)}`);
  if (quick.sheetScroll <= scrollBefore) fail(`Normales Wischen scrollt das Design-Menü nicht: ${JSON.stringify(quick)}`);
  if (quick.inputs !== 0 || quick.changes !== 0) fail(`Normales Wischen feuert Slider-Events: ${JSON.stringify(quick)}`);

  await page.locator('#range').scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  inputBox = await page.locator('#range').boundingBox();
  guardBox = await guard.boundingBox();
  if (!inputBox || !guardBox) fail('Design-Regler nach internem Scroll nicht sichtbar.');
  const startX = inputBox.x + inputBox.width * 0.35;
  const targetX = inputBox.x + inputBox.width * 0.86;
  const y = inputBox.y + inputBox.height / 2;
  const holdHit = await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.classList?.contains('kp-touch-range-hardlock') || false, {x:startX,y});
  if (!holdHit) fail('Long-press startet nicht auf der Schutzschicht des sichtbaren Design-Reglers.');

  await touch('touchStart', startX, y, 31);
  await page.waitForTimeout(370);
  const armed = await guard.evaluate(el => el.classList.contains('is-armed'));
  if (!armed) fail('Echter Design-Regler wird nach langem Halten nicht entsperrt.');
  await touch('touchMove', targetX, y, 31);
  await page.waitForTimeout(35);
  await touch('touchEnd', targetX, y, 31);
  await page.waitForTimeout(70);

  const held = await page.evaluate(() => ({
    value: Number(document.querySelector('#range')?.value || 0),
    inputs: window.__sliderInputEvents,
    changes: window.__sliderChangeEvents,
    armed: document.querySelector('.kp-touch-range-hardlock')?.classList.contains('is-armed') || false,
  }));
  if (held.value < 75) fail(`Halten + derselbe Finger bewegt den sichtbaren Design-Regler nicht ausreichend: ${JSON.stringify(held)}`);
  if (held.inputs < 1 || held.changes !== 1) fail(`Slider-Events nach Halten/Ziehen fehlerhaft: ${JSON.stringify(held)}`);
  if (held.armed) fail('Design-Regler bleibt nach Loslassen entsperrt.');

  // Regression from the real phone: while the sticky footer is visible, slider
  // guards below it must never steal taps from Standardwerte / Design speichern.
  // The real reset semantics are intentionally tested in homepage-editor-lab.mjs
  // against live staging; this isolated runtime test only proves native tap reach.
  await sheet.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(120);
  await tap('.kp-oa-design-reset', 41);
  await tap('.kp-oa-design-save', 42);
  const clicks = await page.evaluate(() => ({ reset: window.__resetClicks, save: window.__saveClicks }));
  if (clicks.reset !== 1) fail(`Standardwerte reagiert nicht auf echten Touch: ${JSON.stringify(clicks)}`);
  if (clicks.save !== 1) fail(`Design speichern reagiert nicht auf echten Touch: ${JSON.stringify(clicks)}`);

  console.log(`PASS: echter versteckter Design-Tab → Regler Touch/Scroll/Halten funktioniert; Standardwerte und Design speichern erhalten echte Touch-Taps.`);
} finally {
  await browser.close();
}
