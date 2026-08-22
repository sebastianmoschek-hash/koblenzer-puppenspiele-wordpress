import { chromium } from 'playwright';
import path from 'node:path';

const safetyJs = process.env.KP_TOUCH_SAFETY || path.resolve('wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/touch-gesture-safety.js');
const safetyCss = process.env.KP_TOUCH_SAFETY_CSS || path.resolve('wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/touch-gesture-safety.css');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const fail = message => { throw new Error(message); };

async function pointerAt(type, x, y, pointerId = 17) {
  return page.evaluate(args => {
    const el = document.elementFromPoint(args.x, args.y);
    if (!el) throw new Error(`Kein Element an ${args.x}/${args.y}`);
    const target = el.className || el.id || el.tagName;
    el.dispatchEvent(new PointerEvent(args.type, {
      bubbles: true,
      cancelable: true,
      pointerId: args.pointerId,
      pointerType: 'touch',
      isPrimary: true,
      clientX: args.x,
      clientY: args.y,
      buttons: args.type === 'pointerup' ? 0 : 1,
      pressure: args.type === 'pointerup' ? 0 : 0.5,
    }));
    return String(target);
  }, { type, x, y, pointerId });
}

try {
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0}
    .kp-oa-sheet{height:420px;overflow:auto;margin:40px 10px;border:1px solid #999;padding:12px;position:relative}
    .kp-oa-tab{display:none}.kp-oa-tab.is-active{display:block}
    .kp-oa-control{display:block;position:relative;margin:18px 10px;padding:12px}
    .kp-oa-control input[type=range]{width:300px}
  </style></head><body class="kp-touch-gestures-enabled">
    <div class="kp-oa-sheet">
      <div class="kp-oa-tabs"><button id="show-design" data-tab="menu">Menü</button></div>
      <div style="height:240px"></div>
      <div id="design-pane" class="kp-oa-tab" data-pane="menu">
        <div style="height:90px"></div>
        <label class="kp-oa-control"><span>Breite</span><input id="range" data-design="menu_width" type="range" min="0" max="100" step="1" value="50" /></label>
        <div style="height:700px"></div>
      </div>
    </div>
  </body></html>`);

  await page.addStyleTag({ path: safetyCss });
  await page.evaluate(() => {
    window.KPTouchGestures = { editMode: true, canEdit: true, holdMs: 320 };
    window.__sliderInputEvents = 0;
    window.__sliderChangeEvents = 0;
    document.querySelector('#range')?.addEventListener('input', () => window.__sliderInputEvents += 1);
    document.querySelector('#range')?.addEventListener('change', () => window.__sliderChangeEvents += 1);
    document.querySelector('#show-design')?.addEventListener('click', () => document.querySelector('#design-pane')?.classList.add('is-active'));
  });

  await page.addScriptTag({ path: safetyJs });
  await page.waitForTimeout(80);

  const guard = page.locator('.kp-touch-range-hardlock');
  if (await guard.count() !== 1) fail('Slider-Schutzschicht wurde nicht erzeugt.');
  const hardlock = await page.locator('#range').getAttribute('data-kp-touch-hardlocked');
  if (hardlock !== '4') fail(`Unerwartete Hardlock-Version: ${hardlock}`);

  // Critical regression: the range is created inside a hidden Design tab. Opening
  // that tab must reposition the guard over the now-visible real range.
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

  // Touch the VISUAL slider coordinates. Hit-testing must land on the guard.
  const cx = inputBox.x + inputBox.width / 2;
  const cy = inputCenterY;
  const hit = await page.evaluate(({x,y}) => {
    const el = document.elementFromPoint(x,y);
    return el?.classList?.contains('kp-touch-range-hardlock') || false;
  }, {x:cx,y:cy});
  if (!hit) fail('Echter Touch auf der sichtbaren Sliderposition trifft die Schutzschicht nicht.');

  // A normal swipe on the slider must scroll the Design sheet, not change value.
  const initial = Number(await page.locator('#range').inputValue());
  const sheet = page.locator('.kp-oa-sheet');
  const scrollBefore = await sheet.evaluate(el => el.scrollTop);
  await pointerAt('pointerdown', cx, cy, 21);
  await page.waitForTimeout(35);
  await pointerAt('pointermove', cx, cy - 70, 21);
  await pointerAt('pointerup', cx, cy - 70, 21);
  await page.waitForTimeout(50);
  const quick = await page.evaluate(() => ({
    value: Number(document.querySelector('#range')?.value || 0),
    sheetScroll: document.querySelector('.kp-oa-sheet')?.scrollTop || 0,
    inputs: window.__sliderInputEvents,
    changes: window.__sliderChangeEvents,
  }));
  if (quick.value !== initial) fail(`Normales Wischen verändert den Design-Regler: ${JSON.stringify(quick)}`);
  if (quick.sheetScroll <= scrollBefore) fail(`Normales Wischen scrollt das Design-Menü nicht: ${JSON.stringify(quick)}`);
  if (quick.inputs !== 0 || quick.changes !== 0) fail(`Normales Wischen feuert Slider-Events: ${JSON.stringify(quick)}`);

  // Scroll the real range back into view and hold directly on its visible track.
  await page.locator('#range').scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  inputBox = await page.locator('#range').boundingBox();
  guardBox = await guard.boundingBox();
  if (!inputBox || !guardBox) fail('Design-Regler nach internem Scroll nicht sichtbar.');
  const startX = inputBox.x + inputBox.width * 0.35;
  const targetX = inputBox.x + inputBox.width * 0.86;
  const y = inputBox.y + inputBox.height / 2;

  const downTarget = await pointerAt('pointerdown', startX, y, 31);
  if (!downTarget.includes('kp-touch-range-hardlock')) fail(`Pointerdown trifft nicht den Guard: ${downTarget}`);
  await page.waitForTimeout(370);
  const armed = await guard.evaluate(el => el.classList.contains('is-armed'));
  if (!armed) fail('Echter Design-Regler wird nach langem Halten nicht entsperrt.');
  await pointerAt('pointermove', targetX, y, 31);
  await pointerAt('pointerup', targetX, y, 31);
  await page.waitForTimeout(50);

  const held = await page.evaluate(() => ({
    value: Number(document.querySelector('#range')?.value || 0),
    inputs: window.__sliderInputEvents,
    changes: window.__sliderChangeEvents,
    armed: document.querySelector('.kp-touch-range-hardlock')?.classList.contains('is-armed') || false,
  }));
  if (held.value < 75) fail(`Halten + derselbe Finger bewegt den sichtbaren Design-Regler nicht ausreichend: ${JSON.stringify(held)}`);
  if (held.inputs < 1 || held.changes !== 1) fail(`Slider-Events nach Halten/Ziehen fehlerhaft: ${JSON.stringify(held)}`);
  if (held.armed) fail('Design-Regler bleibt nach Loslassen entsperrt.');

  console.log(`PASS: echter versteckter Design-Tab → sichtbarer Regler überlagert; Menü scrollt; Halten + derselbe Pointer zieht von ${initial} auf ${held.value}.`);
} finally {
  await browser.close();
}
