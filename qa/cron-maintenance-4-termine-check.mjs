// Cron-Wartung Lauf 4: Lesender Browser-Smoke-Test auf Staging /termine/ + Startseite
// Nur lesend, kein Login, kein Schreiben. Headless Chromium via Playwright.
import { chromium } from 'file:///C:/hermes-agent/node_modules/playwright/index.mjs';

const BASE = 'https://neu.koblenzer-puppenspiele.de';
const pages = ['/termine/', '/', '/repertoire/', '/kontakt/'];

const results = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

for (const route of pages) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  const t0 = Date.now();
  let status = null;
  try {
    const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 40000 });
    status = resp ? resp.status() : null;
    await page.waitForTimeout(1200);
  } catch (e) {
    results.push({ route, status: 'TIMEOUT/ERROR', error: String(e).slice(0, 200), ms: Date.now() - t0 });
    await page.close();
    continue;
  }
  const data = await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent?.trim() || null;
    const title = document.title;
    const cards = document.querySelectorAll('.kp-termine-card, .termine-card, [class*="termine"] article, article').length;
    const scrollW = document.documentElement.scrollWidth;
    const clientW = document.documentElement.clientWidth;
    return { h1, title, cards, overflow: scrollW - clientW };
  });
  results.push({ route, status, ms: Date.now() - t0, ...data, consoleErrors: consoleErrors.slice(0, 5), pageErrors: pageErrors.slice(0, 3) });
  await page.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
const failures = results.filter(r => r.status !== 200 || r.pageErrors?.length || r.overflow > 0);
console.log(`\n=== ERGEBNIS: ${results.length - failures.length}/${results.length} Seiten OK ===`);
if (failures.length) { console.log('FAILURES:', JSON.stringify(failures, null, 2)); process.exit(1); }