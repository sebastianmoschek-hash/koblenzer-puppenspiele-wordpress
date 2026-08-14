import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.VISUAL_QA_BASE_URL || 'https://neu.koblenzer-puppenspiele.de';
const outDir = path.resolve('visual-qa/output');

const pages = [
  ['startseite', '/'],
  ['aktuelles', '/aktuelles/'],
  ['das-theater', '/das-theater/'],
  ['repertoire', '/repertoire/'],
  ['termine', '/termine/'],
  ['referenzen', '/referenzen/'],
  ['jetzt-buchen', '/jetzt-buchen/'],
  ['kontakt', '/kontakt/'],
];

const viewports = [
  ['desktop', { width: 1440, height: 1000 }],
  ['tablet', { width: 820, height: 1180 }],
  ['mobile', { width: 390, height: 844 }],
];

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  results: [],
};

for (const [viewportName, viewport] of viewports) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();

  for (const [pageName, route] of pages) {
    const url = new URL(route, baseUrl).href;
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);

    const status = response?.status() ?? null;
    const title = await page.title();
    const bodyText = (await page.locator('body').innerText()).slice(0, 20000);

    const diagnostics = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const overflow = Math.max(doc.scrollWidth, body?.scrollWidth || 0) - viewportWidth;

      const offenders = [];
      for (const el of document.querySelectorAll('body *')) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const rightOverflow = r.right - viewportWidth;
        const leftOverflow = -r.left;
        if (rightOverflow > 3 || leftOverflow > 3) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            className: String(el.className || '').slice(0, 160),
            id: el.id || '',
            left: Math.round(r.left),
            right: Math.round(r.right),
            width: Math.round(r.width),
          });
        }
        if (offenders.length >= 20) break;
      }

      const images = [...document.images].map(img => ({
        alt: img.alt || '',
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        clientWidth: Math.round(img.getBoundingClientRect().width),
        clientHeight: Math.round(img.getBoundingClientRect().height),
        complete: img.complete,
      })).filter(img => !img.complete || !img.naturalWidth || !img.naturalHeight);

      const tinyText = [...document.querySelectorAll('p,li,a,button,span')]
        .map(el => ({ el, size: parseFloat(getComputedStyle(el).fontSize) }))
        .filter(x => Number.isFinite(x.size) && x.size > 0 && x.size < 12 && x.el.innerText?.trim())
        .slice(0, 20)
        .map(x => ({ tag: x.el.tagName.toLowerCase(), text: x.el.innerText.trim().slice(0, 80), size: x.size }));

      const fixed = [...document.querySelectorAll('body *')]
        .filter(el => getComputedStyle(el).position === 'fixed')
        .map(el => {
          const r = el.getBoundingClientRect();
          return { tag: el.tagName.toLowerCase(), className: String(el.className || '').slice(0, 120), width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(viewportHeight - r.bottom) };
        })
        .slice(0, 20);

      return {
        viewportWidth,
        viewportHeight,
        scrollWidth: Math.max(doc.scrollWidth, body?.scrollWidth || 0),
        horizontalOverflowPx: Math.max(0, Math.round(overflow)),
        overflowOffenders: offenders,
        brokenImages: images,
        tinyText,
        fixedElements: fixed,
      };
    });

    const errorTextDetected = /kritischen fehler|critical error|fatal error|parse error|seite nicht gefunden/i.test(bodyText);
    const screenshot = `${viewportName}-${pageName}.png`;
    await page.screenshot({ path: path.join(outDir, screenshot), fullPage: true });

    report.results.push({
      viewport: viewportName,
      page: pageName,
      route,
      url,
      status,
      title,
      screenshot,
      errorTextDetected,
      diagnostics,
    });
  }

  await context.close();
}

await browser.close();

await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

const escapeHtml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const cards = report.results.map(item => {
  const flags = [];
  if (item.status && item.status >= 400) flags.push(`HTTP ${item.status}`);
  if (item.errorTextDetected) flags.push('Fehlertext erkannt');
  if (item.diagnostics.horizontalOverflowPx > 0) flags.push(`Overflow ${item.diagnostics.horizontalOverflowPx}px`);
  if (item.diagnostics.brokenImages.length) flags.push(`${item.diagnostics.brokenImages.length} defekte Bilder`);
  const flagHtml = flags.length ? `<div class="flags">${flags.map(escapeHtml).join(' · ')}</div>` : '<div class="ok">Automatische Checks: OK</div>';
  return `<article><h2>${escapeHtml(item.viewport)} · ${escapeHtml(item.page)}</h2>${flagHtml}<a href="${escapeHtml(item.screenshot)}"><img src="${escapeHtml(item.screenshot)}" loading="lazy" alt="Screenshot ${escapeHtml(item.page)} ${escapeHtml(item.viewport)}"></a></article>`;
}).join('\n');

const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Koblenzer Puppenspiele – Visual QA</title>
<style>
body{margin:0;background:#0b0908;color:#f7f1eb;font-family:system-ui,-apple-system,sans-serif}main{width:min(1500px,94vw);margin:0 auto;padding:32px 0 64px}h1{font-size:clamp(28px,4vw,52px);margin:0 0 8px}.meta{color:#c9bcb1;margin:0 0 32px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}article{background:#17110e;border:1px solid #3a2b24;border-radius:18px;padding:16px}h2{font-size:18px;margin:0 0 10px;text-transform:capitalize}.ok{color:#9ee493}.flags{color:#ffb26b;font-weight:700}img{display:block;width:100%;height:auto;margin-top:12px;border-radius:10px;background:#000}a{color:inherit}</style></head>
<body><main><h1>Visual QA</h1><p class="meta">Automatisch erzeugt: ${escapeHtml(report.generatedAt)} · Live-Staging</p><div class="grid">${cards}</div></main></body></html>`;
await fs.writeFile(path.join(outDir, 'index.html'), html);

const hardFailures = report.results.filter(item =>
  (item.status && item.status >= 400) || item.errorTextDetected || item.diagnostics.brokenImages.length > 0
);
if (hardFailures.length) {
  console.error('Visual QA hard failures:', hardFailures.map(x => `${x.viewport}/${x.page}`));
  process.exitCode = 2;
}
