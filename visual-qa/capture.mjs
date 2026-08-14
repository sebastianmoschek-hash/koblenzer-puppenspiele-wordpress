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
  ['impressum', '/impressum/'],
  ['datenschutz', '/datenschutz/'],
];

const viewports = [
  ['desktop-1600', { width: 1600, height: 900 }],
  ['laptop-1366', { width: 1366, height: 768 }],
  ['tablet-820', { width: 820, height: 1180 }],
  ['mobile-390', { width: 390, height: 844 }],
  ['mobile-412', { width: 412, height: 915 }],
];

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = { generatedAt: new Date().toISOString(), baseUrl, results: [], interactions: [] };

async function settlePage(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
  await page.evaluate(() => document.querySelectorAll('img').forEach(img => img.loading = 'eager'));
  await page.evaluate(async () => {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const maxY = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    for (let y = 0; y < maxY; y += Math.max(500, window.innerHeight * 0.75)) {
      window.scrollTo(0, y);
      await delay(45);
    }
    window.scrollTo(0, maxY);
    await delay(120);
    window.scrollTo(0, 0);
  }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.evaluate(async () => {
    const images = [...document.images].filter(img => {
      const r = img.getBoundingClientRect();
      const s = getComputedStyle(img);
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1 && r.height > 1;
    });
    await Promise.race([
      Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      })),
      new Promise(resolve => setTimeout(resolve, 8000)),
    ]);
  }).catch(() => {});
  await page.waitForTimeout(250);
}

for (const [viewportName, viewport] of viewports) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();

  for (const [pageName, route] of pages) {
    const url = new URL(route, baseUrl).href;
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await settlePage(page);

    const status = response?.status() ?? null;
    const title = await page.title();
    const bodyText = (await page.locator('body').innerText()).slice(0, 40000);

    const diagnostics = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const isVisible = el => {
        const style = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && r.width > 1 && r.height > 1;
      };
      const rectData = el => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
      };

      const overflowPx = Math.max(doc.scrollWidth, body?.scrollWidth || 0) - viewportWidth;
      const overflowOffenders = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!isVisible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right - viewportWidth > 3 || -r.left > 3) {
          overflowOffenders.push({ tag: el.tagName.toLowerCase(), className: String(el.className || '').slice(0, 160), text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100), ...rectData(el) });
        }
        if (overflowOffenders.length >= 20) break;
      }

      const allImages = [...document.images].filter(isVisible).map(img => ({ alt: img.alt || '', src: img.currentSrc || img.src || '', naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, complete: img.complete, ...rectData(img) }));
      const brokenImages = allImages.filter(img => img.complete && (!img.naturalWidth || !img.naturalHeight));
      const dominantImages = allImages.filter(img => img.height > viewportHeight * 0.78 || (img.height > viewportHeight * 0.62 && img.width > viewportWidth * 0.88)).slice(0, 10);

      const headings = [...document.querySelectorAll('h1,h2,h3')].filter(isVisible).map(el => {
        const style = getComputedStyle(el);
        return { tag: el.tagName.toLowerCase(), text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 180), fontSize: parseFloat(style.fontSize) || 0, ...rectData(el) };
      });
      const largeHeadings = headings.filter(h => h.fontSize > (viewportWidth <= 520 ? 50 : 78));

      const textBlocks = [...document.querySelectorAll('main p, main li')].filter(isVisible).map(el => {
        const style = getComputedStyle(el); const r = el.getBoundingClientRect();
        const text = (el.innerText || '').trim().replace(/\s+/g, ' '); const fontSize = parseFloat(style.fontSize) || 0;
        let lineHeight = parseFloat(style.lineHeight); if (!Number.isFinite(lineHeight)) lineHeight = fontSize * 1.35;
        return { text: text.slice(0, 160), textLength: text.length, fontSize, estimatedLines: lineHeight > 0 ? Math.max(1, Math.round(r.height / lineHeight)) : 1, ...rectData(el) };
      });
      const tinyText = textBlocks.filter(x => x.textLength && x.fontSize > 0 && x.fontSize < 12).slice(0, 15);
      const narrowTextColumns = textBlocks.filter(x => x.textLength >= 90 && x.width < (viewportWidth <= 520 ? 145 : 180) && x.estimatedLines >= 7).slice(0, 15);

      const main = document.querySelector('main');
      const mainChildren = main ? [...main.children].filter(isVisible).map(el => ({ text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100), ...rectData(el) })).sort((a,b) => a.top-b.top) : [];
      const excessiveGaps = [];
      for (let i=0;i<mainChildren.length-1;i++) {
        const gap = mainChildren[i+1].top - mainChildren[i].bottom;
        if (gap > (viewportWidth <= 520 ? 130 : 190)) excessiveGaps.push({ gap: Math.round(gap), after: mainChildren[i].text, before: mainChildren[i+1].text });
      }

      const fixedNodes = [...document.querySelectorAll('body *')].filter(el => isVisible(el) && getComputedStyle(el).position === 'fixed');
      const important = [...document.querySelectorAll('main h1, main h2, main h3, main img, main a, main button')].filter(isVisible);
      const fixedOverlaps = [];
      const intersection = (a,b) => Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
      for (const fixedEl of fixedNodes) {
        const fr = fixedEl.getBoundingClientRect();
        for (const el of important) {
          if (fixedEl.contains(el) || el.contains(fixedEl)) continue;
          const er = el.getBoundingClientRect(); const area = er.width*er.height; const overlap = intersection(fr,er);
          if (area > 0 && overlap > 300 && overlap/area > 0.18) fixedOverlaps.push({ fixed:(fixedEl.innerText||fixedEl.className||fixedEl.tagName).toString().trim().replace(/\s+/g,' ').slice(0,100), target:(el.innerText||el.alt||el.className||el.tagName).toString().trim().replace(/\s+/g,' ').slice(0,100), overlapRatio:Math.round((overlap/area)*100)/100 });
          if (fixedOverlaps.length >= 10) break;
        }
        if (fixedOverlaps.length >= 10) break;
      }

      return { viewportWidth, viewportHeight, pageHeight: Math.max(doc.scrollHeight, body?.scrollHeight || 0), scrollWidth: Math.max(doc.scrollWidth, body?.scrollWidth || 0), horizontalOverflowPx: Math.max(0, Math.round(overflowPx)), overflowOffenders, brokenImages, dominantImages, headings, largeHeadings, tinyText, narrowTextColumns, excessiveGaps, fixedOverlaps };
    });

    const errorTextDetected = /kritischen fehler|critical error|fatal error|parse error|seite nicht gefunden/i.test(bodyText);
    const screenshot = `${viewportName}-${pageName}.jpg`;
    await page.screenshot({ path: path.join(outDir, screenshot), type: 'jpeg', quality: 70, fullPage: true });

    const flags = [];
    if (status && status >= 400) flags.push(`HTTP ${status}`);
    if (errorTextDetected) flags.push('WordPress-/Fehlertext erkannt');
    if (diagnostics.horizontalOverflowPx > 0) flags.push(`Horizontaler Overflow ${diagnostics.horizontalOverflowPx}px`);
    if (diagnostics.brokenImages.length) flags.push(`${diagnostics.brokenImages.length} defekte Bilder`);
    if (diagnostics.narrowTextColumns.length) flags.push(`${diagnostics.narrowTextColumns.length} auffällig schmale Textspalten`);
    if (diagnostics.largeHeadings.length) flags.push(`${diagnostics.largeHeadings.length} sehr große Überschriften`);
    if (diagnostics.dominantImages.length) flags.push(`${diagnostics.dominantImages.length} sehr dominante Bilder`);
    if (diagnostics.excessiveGaps.length) flags.push(`${diagnostics.excessiveGaps.length} große vertikale Leerstellen`);
    if (diagnostics.fixedOverlaps.length) flags.push(`${diagnostics.fixedOverlaps.length} mögliche Fixed-Überdeckungen`);

    report.results.push({ viewport: viewportName, page: pageName, route, url, status, title, screenshot, errorTextDetected, flags, diagnostics });
  }

  if (viewportName === 'mobile-390') {
    await page.goto(new URL('/', baseUrl).href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await settlePage(page);
    const openButton = page.locator('.wp-block-navigation__responsive-container-open').first();
    let buttonVisible=false, menuOpened=false, error='';
    try {
      buttonVisible=await openButton.isVisible();
      if(buttonVisible){ await openButton.click(); await page.waitForTimeout(300); menuOpened=await page.locator('.wp-block-navigation__responsive-container.is-menu-open, .wp-block-navigation__responsive-container.has-modal-open').first().isVisible().catch(()=>false); await page.screenshot({path:path.join(outDir,'mobile-390-startseite-menu-open.jpg'),type:'jpeg',quality:72,fullPage:false}); }
    } catch(e){ error=String(e); }
    report.interactions.push({name:'mobile-menu',buttonVisible,menuOpened,...(error?{error}:{})});
  }
  await context.close();
}

await browser.close();
await fs.writeFile(path.join(outDir,'report.json'),JSON.stringify(report,null,2));

const allFlagged=report.results.filter(item=>item.flags.length);
const summaryLines=['# Visual QA – letzter Lauf','',`Erzeugt: ${report.generatedAt}`,`Geprüfte Ansichten: ${report.results.length}`,`Auffällige Ansichten: ${allFlagged.length}`,''];
for(const item of report.results){
  summaryLines.push(`## ${item.viewport} / ${item.page}`);
  if(!item.flags.length) summaryLines.push('- Automatische Layoutchecks: OK'); else for(const flag of item.flags) summaryLines.push(`- ${flag}`);
  for(const x of item.diagnostics.fixedOverlaps.slice(0,4)) summaryLines.push(`  - Fixed-Überdeckung (${Math.round(x.overlapRatio*100)}%): „${x.fixed}“ über „${x.target}“`);
  for(const x of item.diagnostics.narrowTextColumns.slice(0,3)) summaryLines.push(`  - Schmale Spalte: ${x.width}px – „${x.text}“`);
  for(const x of item.diagnostics.largeHeadings.slice(0,3)) summaryLines.push(`  - Große Überschrift: ${Math.round(x.fontSize)}px – „${x.text}“`);
  summaryLines.push('');
}
if(report.interactions.length){ summaryLines.push('## Interaktionen',''); for(const i of report.interactions) summaryLines.push(`- ${i.name}: Button sichtbar=${i.buttonVisible}; Menü geöffnet=${i.menuOpened}${i.error?`; Fehler=${i.error}`:''}`); summaryLines.push(''); }
await fs.writeFile(path.join(outDir,'summary.md'),summaryLines.join('\n'));

const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const cards=report.results.map(item=>{const flagHtml=item.flags.length?`<div class="flags">${item.flags.map(escapeHtml).join(' · ')}</div>`:'<div class="ok">Automatische Checks: OK</div>';return `<article><h2>${escapeHtml(item.viewport)} · ${escapeHtml(item.page)}</h2>${flagHtml}<a href="${escapeHtml(item.screenshot)}"><img src="${escapeHtml(item.screenshot)}" loading="lazy" alt="Screenshot ${escapeHtml(item.page)} ${escapeHtml(item.viewport)}"></a></article>`;}).join('\n');
const html=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Koblenzer Puppenspiele – Visual QA</title><style>body{margin:0;background:#0b0908;color:#f7f1eb;font-family:system-ui,-apple-system,sans-serif}main{width:min(1500px,94vw);margin:0 auto;padding:32px 0 64px}h1{font-size:clamp(28px,4vw,52px);margin:0 0 8px}.meta{color:#c9bcb1;margin:0 0 32px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}article{background:#17110e;border:1px solid #3a2b24;border-radius:18px;padding:16px}h2{font-size:18px;margin:0 0 10px;text-transform:capitalize}.ok{color:#9ee493}.flags{color:#ffb26b;font-weight:700}img{display:block;width:100%;height:auto;margin-top:12px;border-radius:10px;background:#000}a{color:inherit}</style></head><body><main><h1>Visual QA</h1><p class="meta">Automatisch erzeugt: ${escapeHtml(report.generatedAt)} · Live-Staging</p><div class="grid">${cards}</div></main></body></html>`;
await fs.writeFile(path.join(outDir,'index.html'),html);

const hardFailures=report.results.filter(item=>(item.status&&item.status>=400)||item.errorTextDetected||item.diagnostics.brokenImages.length>0||item.diagnostics.horizontalOverflowPx>0);
if(hardFailures.length){console.error('Visual QA hard failures:',hardFailures.map(x=>`${x.viewport}/${x.page}`));process.exitCode=2;}
