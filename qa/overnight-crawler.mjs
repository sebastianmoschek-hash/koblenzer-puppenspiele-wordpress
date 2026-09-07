import { chromium } from 'playwright';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BASE = 'https://neu.koblenzer-puppenspiele.de';
const baseUrl = (process.env.OVERNIGHT_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
const origin = new URL(baseUrl).origin;
const authStatePath = path.resolve('tests/e2e/.auth/admin.json');
const reportPath = path.resolve(process.env.OVERNIGHT_REPORT_PATH || 'OVERNIGHT_REPORT.md');
const bugDir = path.resolve(process.env.OVERNIGHT_BUG_DIR || 'test-results/overnight-bugs');
const screenshotDir = path.join(bugDir, 'screenshots');
const jsonPath = path.join(bugDir, 'overnight-run.json');
const slowMo = 3000;
const postNavWaitMs = 3000;
const pauseEvery = 5;
const pauseMs = 30_000;
const maxPublicPages = Number(process.env.OVERNIGHT_MAX_PUBLIC_PAGES || 30);
const maxDiscoveryDepth = Number(process.env.OVERNIGHT_MAX_DISCOVERY_DEPTH || 2);
const dryRun = process.argv.includes('--dry-run');

const ASSET_EXTENSIONS = /\.(?:avif|bmp|css|cur|eot|gif|ico|jpe?g|js|json|map|mp3|mp4|mpeg|mov|pdf|png|svg|webm|webp|woff2?|zip)(?:[?#].*)?$/i;

await fsp.mkdir(screenshotDir, { recursive: true });

function stamp() {
  return new Date().toISOString();
}

function appendReport(line = '') {
  fs.appendFileSync(reportPath, `${line}\n`);
}

function reportHeading(title) {
  appendReport(`\n## ${title}`);
}

function reportBullet(text) {
  appendReport(`- ${text}`);
}

function normalizeUrl(raw, base = baseUrl) {
  if (!raw) return null;
  try {
    const url = raw instanceof URL ? new URL(raw.toString()) : new URL(raw, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = '';
    if (url.searchParams.size > 0) {
      const entries = [...url.searchParams.entries()].sort((a, b) => {
        const keyCmp = a[0].localeCompare(b[0]);
        return keyCmp || a[1].localeCompare(b[1]);
      });
      url.search = '';
      for (const [key, value] of entries) url.searchParams.append(key, value);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function shouldVisitUrl(raw, originUrl = origin) {
  const normalized = normalizeUrl(raw);
  if (!normalized) return false;
  try {
    const url = new URL(normalized);
    if (url.origin !== originUrl) return false;
    const pathName = url.pathname.toLowerCase();
    if (pathName.startsWith('/wp-admin/')) return false;
    if (pathName === '/wp-login.php') return false;
    if (pathName.startsWith('/wp-json/')) return false;
    if (pathName.startsWith('/wp-content/') || pathName.startsWith('/wp-includes/')) return false;
    if (pathName.includes('/feed')) return false;
    if (pathName.includes('/xmlrpc.php')) return false;
    if (ASSET_EXTENSIONS.test(pathName)) return false;
    return true;
  } catch {
    return false;
  }
}

function editorUrl(raw) {
  const url = new URL(normalizeUrl(raw) || raw, baseUrl);
  if (url.searchParams.get('kp_edit') !== '1') url.searchParams.append('kp_edit', '1');
  url.hash = '';
  return url.toString();
}

function dedupeAndSort(urls, base = baseUrl) {
  const seen = new Set();
  const result = [];
  for (const raw of urls) {
    const normalized = normalizeUrl(raw, base);
    if (!normalized || seen.has(normalized) || !shouldVisitUrl(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function slugFromUrl(raw) {
  const normalized = normalizeUrl(raw) || raw || 'page';
  const url = new URL(normalized, baseUrl);
  const parts = [url.hostname, ...url.pathname.split('/').filter(Boolean)];
  const query = url.search ? url.search.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') : '';
  const slug = [...parts, query].filter(Boolean).join('-')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
  return slug || 'page';
}

function progressLine({ kind = 'page', label = '', url = '', view = 'public', index = 0, total = 0, issues = [] }) {
  const prefix = total > 0 ? `${index + 1}/${total}` : kind;
  const target = label || url;
  const issueText = issues.length ? ` — ${issues.join('; ')}` : '';
  return `[${stamp()}] ${prefix} ${target} [${view}]${issueText}`;
}

function escapeMarkdown(text) {
  return String(text || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function issueSummary(snapshot) {
  const issues = [];
  if ((snapshot.horizontalOverflowPx || 0) > 0) issues.push(`Horizontaler Overflow ${snapshot.horizontalOverflowPx}px`);
  if ((snapshot.brokenImages || []).length) issues.push(`${snapshot.brokenImages.length} defekte Bilder`);
  if ((snapshot.fixedOverlaps || []).length) issues.push(`${snapshot.fixedOverlaps.length} mögliche Überdeckungen`);
  if ((snapshot.editorActive === false)) issues.push('Editor-Ansicht nicht aktiv');
  if ((snapshot.pageErrors || []).length) issues.push(`${snapshot.pageErrors.length} Page-Errors`);
  return issues;
}

function buildQueue(seedUrls) {
  const queue = [];
  const seenPublic = new Set();
  const seenEditor = new Set();

  function enqueuePublic(rawUrl, depth, source) {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized || !shouldVisitUrl(normalized) || seenPublic.has(normalized)) return false;
    if (seenPublic.size >= maxPublicPages) return false;
    seenPublic.add(normalized);
    queue.push({ url: normalized, view: 'public', depth, source });
    return true;
  }

  function enqueueEditor(rawUrl, depth, source) {
    const normalized = normalizeUrl(editorUrl(rawUrl));
    if (!normalized || seenEditor.has(normalized)) return false;
    seenEditor.add(normalized);
    queue.push({ url: normalized, view: 'editor', depth, source });
    return true;
  }

  function enqueuePage(rawUrl, depth, source) {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized || !shouldVisitUrl(normalized)) return false;
    const added = enqueuePublic(normalized, depth, source);
    if (added) enqueueEditor(normalized, depth, source);
    return added;
  }

  for (const seed of seedUrls) enqueuePage(seed, 0, 'seed');
  return { queue, enqueuePage };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), 12_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'cache-control': 'no-cache' } });
    if (!response.ok) return '';
    return await response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverSeedUrls() {
  const seeds = new Set([`${baseUrl}/`]);
  const robots = await fetchText(`${baseUrl}/robots.txt`);
  for (const line of robots.split(/\r?\n/)) {
    const match = line.match(/^sitemap:\s*(.+)$/i);
    if (match?.[1]) seeds.add(match[1].trim());
  }
  for (const fallback of ['wp-sitemap.xml', 'sitemap_index.xml', 'sitemap.xml']) {
    seeds.add(`${baseUrl}/${fallback}`);
  }

  const visitedXml = new Set();
  const pages = new Set();

  async function crawlSitemap(url, depth = 0) {
    const normalized = normalizeUrl(url);
    if (!normalized || visitedXml.has(normalized) || depth > 2) return;
    visitedXml.add(normalized);
    const xml = await fetchText(normalized);
    if (!xml) return;
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
      const loc = match[1].trim();
      if (!loc) continue;
      const normalizedLoc = normalizeUrl(loc);
      if (!normalizedLoc) continue;
      if (normalizedLoc.endsWith('.xml')) await crawlSitemap(normalizedLoc, depth + 1);
      else if (shouldVisitUrl(normalizedLoc)) pages.add(normalizedLoc);
    }
  }

  for (const seed of seeds) {
    if (seed.endsWith('.xml')) await crawlSitemap(seed);
    else if (shouldVisitUrl(seed)) pages.add(normalizeUrl(seed));
  }

  return dedupeAndSort([...pages], baseUrl);
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const viewportWidth = window.innerWidth;
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    };
    const rectData = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const horizontalOverflowPx = Math.max(0, Math.round(Math.max(doc.scrollWidth, body?.scrollWidth || 0) - viewportWidth));

    const overflowOffenders = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.right - viewportWidth > 3 || -rect.left > 3) {
        overflowOffenders.push({
          tag: el.tagName.toLowerCase(),
          className: String(el.className || '').slice(0, 120),
          text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100),
          ...rectData(el),
        });
      }
      if (overflowOffenders.length >= 20) break;
    }

    const fixedNodes = [...document.querySelectorAll('body *')].filter((el) => visible(el) && getComputedStyle(el).position === 'fixed');
    const important = [...document.querySelectorAll('main h1, main h2, main h3, main img, main a, main button')].filter(visible);
    const fixedOverlaps = [];
    const intersection = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    for (const fixedEl of fixedNodes) {
      const fr = fixedEl.getBoundingClientRect();
      for (const el of important) {
        if (fixedEl.contains(el) || el.contains(fixedEl)) continue;
        const er = el.getBoundingClientRect();
        const area = er.width * er.height;
        const overlap = intersection(fr, er);
        if (area > 0 && overlap > 300 && overlap / area > 0.18) {
          fixedOverlaps.push({
            fixed: (fixedEl.innerText || fixedEl.className || fixedEl.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 100),
            target: (el.innerText || el.alt || el.className || el.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 100),
            overlapRatio: Math.round((overlap / area) * 100) / 100,
          });
        }
        if (fixedOverlaps.length >= 10) break;
      }
      if (fixedOverlaps.length >= 10) break;
    }

    const brokenImages = [...document.images].filter((img) => {
      const style = getComputedStyle(img);
      const rect = img.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 1
        && rect.height > 1
        && img.complete
        && (!img.naturalWidth || !img.naturalHeight);
    }).map((img) => ({
      alt: img.alt || '',
      src: img.currentSrc || img.src || '',
      ...rectData(img),
    }));

    return {
      horizontalOverflowPx,
      overflowOffenders,
      fixedOverlaps,
      brokenImages,
    };
  });
}

function screenshotName(task, index) {
  return path.join(screenshotDir, `${String(index + 1).padStart(3, '0')}-${task.view}-${slugFromUrl(task.url)}.png`);
}

async function inspectTask(context, task, index, total, enqueuePage) {
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push({ url: page.url(), text: message.text(), location: message.location() });
    }
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      error: request.failure()?.errorText || 'unknown',
    });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  let status = null;
  let title = '';
  let editorActive = true;
  let layoutIssues = [];
  let screenshotPath = '';
  let layoutDetails = [];

  try {
    const response = await page.goto(task.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    status = response?.status() ?? null;
    await page.waitForTimeout(postNavWaitMs);

    title = await page.title().catch(() => '');
    const layout = await inspectLayout(page);
    layoutDetails = layout.fixedOverlaps || [];
    layoutIssues = issueSummary({ ...layout, editorActive: true, pageErrors });

    if (task.view === 'editor') {
      editorActive = await page.locator('body').evaluate((body) => body.classList.contains('kp-fe2-editing')).catch(() => false);
      if (!editorActive) layoutIssues.push('Editor-Ansicht nicht aktiv');
    }

    if (layoutIssues.length > 0 || !response?.ok()) {
      screenshotPath = screenshotName(task, index);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    if (task.view === 'public' && task.depth < maxDiscoveryDepth) {
      const discovered = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
        .map((anchor) => anchor.href || anchor.getAttribute('href'))
        .filter(Boolean));
      const normalized = dedupeAndSort(discovered, baseUrl).filter((url) => shouldVisitUrl(url));
      for (const url of normalized) enqueuePage(url, task.depth + 1, task.url);
    }
  } catch (error) {
    layoutIssues.push(`Navigation/Inspektion fehlgeschlagen: ${String(error).slice(0, 240)}`);
    screenshotPath = screenshotPath || screenshotName(task, index);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  } finally {
    await page.close().catch(() => {});
  }

  const summaryIssues = [
    ...layoutIssues,
    ...(consoleErrors.length ? [`console.error=${consoleErrors.length}`] : []),
    ...(failedRequests.length ? [`failedRequests=${failedRequests.length}`] : []),
    ...(pageErrors.length ? [`pageErrors=${pageErrors.length}`] : []),
    ...(screenshotPath ? [`screenshot=${path.relative(process.cwd(), screenshotPath)}`] : []),
  ];

  appendReport(progressLine({
    kind: 'visit',
    label: task.label,
    url: task.url,
    view: task.view,
    index,
    total,
    issues: summaryIssues,
  }));

  for (const item of consoleErrors.slice(0, 5)) {
    appendReport(`  - console.error: ${escapeMarkdown(item.text)}`);
  }
  for (const item of failedRequests.slice(0, 5)) {
    appendReport(`  - requestfailed: ${item.method} ${item.url} :: ${item.error}`);
  }
  for (const item of pageErrors.slice(0, 5)) {
    appendReport(`  - pageerror: ${escapeMarkdown(item)}`);
  }
  for (const item of layoutIssues.slice(0, 5)) {
    appendReport(`  - layout: ${escapeMarkdown(item)}`);
  }
  for (const item of layoutDetails.slice(0, 5)) {
    appendReport(`  - overlap: ${escapeMarkdown(`${item.fixed} ↔ ${item.target} (${item.overlapRatio})`)}`);
  }

  console.log(progressLine({
    kind: 'visit',
    label: task.label,
    url: task.url,
    view: task.view,
    index,
    total,
    issues: summaryIssues,
  }));

  return {
    url: task.url,
    view: task.view,
    source: task.source,
    depth: task.depth,
    status,
    title,
    consoleErrors,
    failedRequests,
    pageErrors,
    layoutIssues,
    layoutDetails,
    screenshotPath,
    editorActive,
  };
}

async function main() {
  const seeds = await discoverSeedUrls();
  const { queue, enqueuePage } = buildQueue(seeds);

  appendReport('\n---');
  reportHeading(`Overnight crawler run ${stamp()}`);
  reportBullet(`Target: ${baseUrl}`);
  reportBullet(`Mode: ${dryRun ? 'dry-run' : 'live'} | workers=1 | slowMo=${slowMo} | waits=${postNavWaitMs}ms | pause after every ${pauseEvery} pages for ${pauseMs / 1000}s`);
  reportBullet(`Auth state: ${fs.existsSync(authStatePath) ? 'tests/e2e/.auth/admin.json' : 'missing'}`);
  reportBullet(`Seed pages: ${seeds.length}`);
  reportBullet(`Initial queue: ${queue.length}`);

  if (dryRun) {
    for (let index = 0; index < queue.length; index += 1) {
      const task = queue[index];
      console.log(progressLine({ kind: 'queue', label: task.label, url: task.url, view: task.view, index, total: queue.length }));
      appendReport(progressLine({ kind: 'queue', label: task.label, url: task.url, view: task.view, index, total: queue.length }));
    }
    reportBullet('Dry-run completed without browser execution.');
    await fsp.writeFile(jsonPath, JSON.stringify({ generatedAt: stamp(), baseUrl, seeds, queue }, null, 2));
    return;
  }

  const browser = await chromium.launch({ headless: true, slowMo });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
    storageState: fs.existsSync(authStatePath) ? authStatePath : undefined,
  });

  const results = [];
  try {
    for (let index = 0; index < queue.length; index += 1) {
      const task = queue[index];
      task.label = `${new URL(task.url).pathname || '/'} ${task.view}`;
      appendReport(progressLine({ kind: 'start', label: task.label, url: task.url, view: task.view, index, total: queue.length }));
      const result = await inspectTask(context, task, index, queue.length, enqueuePage);
      results.push(result);

      if ((index + 1) % pauseEvery === 0 && index + 1 < queue.length) {
        appendReport(`- Pause after ${index + 1} pages for ${pauseMs / 1000}s`);
        await new Promise((resolve) => setTimeout(resolve, pauseMs));
      }
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const totalConsoleErrors = results.reduce((sum, item) => sum + item.consoleErrors.length, 0);
  const totalFailedRequests = results.reduce((sum, item) => sum + item.failedRequests.length, 0);
  const issueTasks = results.filter((item) => item.layoutIssues.length || item.consoleErrors.length || item.failedRequests.length || item.pageErrors.length || (item.view === 'editor' && !item.editorActive)).length;
  const screenshotCount = results.filter((item) => item.screenshotPath).length;

  reportHeading('Summary');
  reportBullet(`Completed tasks: ${results.length}`);
  reportBullet(`Issue-bearing tasks: ${issueTasks}`);
  reportBullet(`Screenshots written: ${screenshotCount}`);
  reportBullet(`Console errors captured: ${totalConsoleErrors}`);
  reportBullet(`Failed requests captured: ${totalFailedRequests}`);

  await fsp.writeFile(jsonPath, JSON.stringify({
    generatedAt: stamp(),
    baseUrl,
    seeds,
    queue,
    results,
  }, null, 2));
}

await main().catch(async (error) => {
  appendReport(`Crawler failed: ${error.message}`);
  console.error(error);
  process.exitCode = 1;
});
