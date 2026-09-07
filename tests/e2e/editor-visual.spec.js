const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const EDITOR_URL = process.env.PLAYWRIGHT_EDITOR_URL
  || 'https://neu.koblenzer-puppenspiele.de/?kp_edit=1';
const SCREENSHOT_DIR = path.join(process.cwd(), 'tests/screenshots');

const controls = [
  { name: '01-vorschau', label: 'Vorschau', selector: '.kp-fe2-exit' },
  { name: '02-laptop', label: 'Laptop', selector: '.kp-fe2-device' },
  { name: '03-undo', label: 'Undo', selector: '.kp-fe2-undo,[data-kp-word-history-new="undo"]' },
  { name: '04-redo', label: 'Redo', selector: '.kp-fe2-redo,[data-kp-word-history-new="redo"]' },
  { name: '05-speichern', label: 'Speichern', selector: '.kp-fe2-save' },
  { name: '06-ki', label: 'KI', selector: '.kp-ai-trigger' },
  { name: '07-lokale-ki', label: 'Lokale KI', selector: '.kp-lat-launch,.kp-local-ai-launch' },
];

const fixedControlSelector = [
  '.kp-fe2-toolbar button',
  '.kp-fe2-toolbar a',
  '.kp-fe2-toolbar .kp-fe2-device-wrap',
  '.kp-ai-trigger',
  '.kp-lat-launch',
  '.kp-local-ai-launch',
  '.kp-mobile-live-trigger',
  '.kp-oa-tools',
  '.kp-wa-bar button',
].join(',');

async function visibleLocator(page, selector) {
  const candidates = page.locator(selector);
  const count = await candidates.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function assertNoOverlaps(page, step) {
  const overlaps = await page.locator(fixedControlSelector).evaluateAll((elements) => {
    const visible = elements
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) !== 0
          && rect.width > 0
          && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: (element.getAttribute('aria-label') || element.textContent || element.className)
            .replace(/\s+/g, ' ').trim().slice(0, 100),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      });

    const result = [];
    for (let first = 0; first < visible.length; first += 1) {
      for (let second = first + 1; second < visible.length; second += 1) {
        const a = visible[first];
        const b = visible[second];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          result.push({ first: a, second: b });
        }
      }
    }
    return result;
  });

  expect(overlaps, `Überlappende Editor-Controls nach ${step}; URL=${await page.url()}; body=${await page.locator('body').getAttribute('class')}`).toEqual([]);
}

async function gotoEditor(page) {
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(3000);
}

test('Editor-Leiste bleibt nach jedem Control-Klick fehler- und überlappungsfrei', async ({ page }, testInfo) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const consoleErrors = [];
  const failedRequests = [];
  const disabledControls = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push({ text: message.text(), location: message.location() });
    }
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText || 'unknown',
    });
  });

  try {
    await gotoEditor(page);
    expect(
      await page.locator('body').evaluate((body) => body.classList.contains('kp-fe2-editing')),
      'Keine aktive Admin-Editor-Session. Das Setup-Projekt konnte keinen gültigen WordPress-Storage-State erzeugen.',
    ).toBe(true);

    const editableSnapshot = await page.evaluate(() => {
      const helper = window.KPCanvaEditor?.exportEditableRegionSnapshot
        || window.KPCanvaKeys?.exportEditableRegionSnapshot
        || window.KPCanvaSnapshot;
      return typeof helper === 'function' ? helper() : null;
    });
    expect(editableSnapshot?.v, 'Editable snapshot helper must return the compact v1 payload').toBe(1);
    expect(Array.isArray(editableSnapshot?.els), 'Editable snapshot must expose compact element data').toBe(true);
    expect(editableSnapshot.els.length, 'Editable snapshot should include visible editor-managed elements').toBeGreaterThan(0);
    expect(editableSnapshot.els.some((entry) => entry.id && entry.type), 'Snapshot entries need stable ids and types').toBe(true);
    expect(
      await page.locator('[data-kp-element-id][data-kp-editable-type]').count(),
      'Editor-managed hooks should be stamped into the DOM',
    ).toBeGreaterThan(0);

    for (const control of controls) {
      const locator = await visibleLocator(page, control.selector);
      expect(locator, `Control nicht sichtbar: ${control.label}`).not.toBeNull();

      const disabled = await locator.isDisabled().catch(() => false)
        || (await locator.getAttribute('aria-disabled')) === 'true';
      if (disabled) {
        disabledControls.push(control.label);
      } else if (control.label === 'Laptop') {
        await page.waitForTimeout(3000);
        await locator.click();
        await page.waitForTimeout(3000);
        await locator.selectOption('laptop');
      } else {
        await page.waitForTimeout(3000);
        await locator.click();
      }
      await page.waitForTimeout(3000);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${control.name}.png`),
        fullPage: true,
      });
      await assertNoOverlaps(page, control.label);

      if (control !== controls[controls.length - 1]) {
        await gotoEditor(page);
        expect(
          await page.locator('body').evaluate((body) => body.classList.contains('kp-fe2-editing')),
          `Admin-Editor-Session ging nach ${control.label} verloren.`,
        ).toBe(true);
      }
    }
  } finally {
    await fs.promises.writeFile(
      path.join(SCREENSHOT_DIR, 'browser-errors.json'),
      JSON.stringify({ consoleErrors, failedRequests, disabledControls }, null, 2),
    );
  }

  expect(consoleErrors, 'Keine console.error/page console errors erwartet').toEqual([]);
  expect(failedRequests, 'Keine fehlgeschlagenen Netzwerk-Requests erwartet').toEqual([]);
});
