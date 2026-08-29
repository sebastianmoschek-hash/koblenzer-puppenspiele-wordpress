import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = (process.env.KP_E2E_BASE || 'https://neu.koblenzer-puppenspiele.de').replace(/\/$/, '');
const token = process.env.KP_E2E_TOKEN || '';
const outDir = path.resolve(process.env.KP_LAB_OUT || 'qa-artifacts/homepage-lab');
if (!token) throw new Error('KP_E2E_TOKEN fehlt.');

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

let browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });

// Lauf 24: Ein gecrashter Renderer haelt Playwrights goto trotz 45s-Timeout +
// 75s-Wand bis zum Teardown fest (12-min-Stall, Node-Timer laufen in den
// Session-Cleanup). Der Watchdog schliesst nach 60s den GANZEN Browser und
// entriegelt damit jede haengende Playwright-Operation; ensureBrowser() startet
// ihn fuer das naechste Geraet neu. Nur CI-Diagnose, kein Produktcode.
const BROWSER_ARGS = ['--disable-dev-shm-usage'];
async function ensureBrowser() {
  if (!browser.isConnected()) {
    mark('BROWSER NEU GESTARTET (Watchdog hatte ihn geschlossen)');
    browser = await chromium.launch({ headless: true, args: BROWSER_ARGS });
  }
  return browser;
}
const report = {
  generatedAt: new Date().toISOString(),
  base,
  commit: process.env.GITHUB_SHA || '',
  devices: [],
  failures: [],
};

const deviceSpecs = [
  { name: 'mobile-390', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  { name: 'tablet-820', viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false },
  { name: 'desktop-1440', viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false },
];

function addFailure(device, message) {
  const text = `${device}: ${message}`;
  report.failures.push(text);
  console.error(`FAIL: ${text}`);
}

async function e2eAjax(page, action, extra = {}) {
  return page.evaluate(async ({ action, extra, token }) => {
    const fd = new FormData();
    fd.append('action', action);
    fd.append('token', token);
    for (const [key, value] of Object.entries(extra || {})) {
      fd.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
    const response = await fetch('/wp-admin/admin-ajax.php', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', body: fd,
    });
    return { ok: response.ok, status: response.status, json: await response.json().catch(() => null) };
  }, { action, extra, token });
}

async function readState(page) {
  const result = await e2eAjax(page, 'kp_e2e_owner_state');
  if (!result.ok || !result.json?.success) throw new Error(`E2E state read failed: ${JSON.stringify(result)}`);
  return result.json.data;
}

async function restoreState(page, snapshot) {
  const result = await e2eAjax(page, 'kp_e2e_owner_restore', { snapshot });
  if (!result.ok || !result.json?.success) throw new Error(`E2E restore failed: ${JSON.stringify(result)}`);
}

async function pageSnippet(page) {
  try {
    // Kurze explizite Timeouts: Bei einer haengenden (z.B. CPU-pinned) Seite darf
    // das Snippet selbst nicht 30s+ blockieren, sonst fehlt nach einem Goto-
    // Timeout jede weitere Diagnosezeile (stilles 12m-SIGKILL im 1-vCPU-Sandbox).
    const title = await page.title({ timeout: 5000 }).catch(() => '?');
    const text = await page.evaluate(() => (document.body ? document.body.innerText : ''), { timeout: 5000 }).catch(() => '');
    return `URL=${page.url()} Titel=${title} Body=${String(text).replace(/\s+/g, ' ').slice(0, 300)}`;
  } catch (error) {
    return `URL=${page.url()} (Snippet nicht lesbar: ${String(error).slice(0, 120)})`;
  }
}

// Progress-Marker: Jede Zeile sofort ausgeben (console.warn flusht) UND an eine
// Datei appenden (fs.appendFileSync flusht), damit ein spaeteres SIGKILL nie den
// Befund verschluckt. Der Datei-Pfad landet via qa-artifacts im CI-Artefakt.
const PROGRESS_FILE = path.join(outDir, 'login-progress.log');
function mark(...parts) {
  const line = `${new Date().toISOString()} ${parts.join(' ')}`;
  console.warn(line);
  try { fs.appendFileSync(PROGRESS_FILE, line + '\n'); } catch (_) {}
}

// HOTSTACK: CPU-Profil in kompakte "heisse Funktionen" verdichten. Wenn der
// Main-Thread haengt (synchroner Loop in Daten-/DOM-Verarbeitung), zeigt jedes
// Sample den Call-Stack; die hotesten Funktionen verraten die Endlosschleife.
function printHotStack(profile) {
  try {
    const samples = profile.samples || [];
    const timeDeltas = profile.timeDeltas || [];
    const nodes = new Map((profile.nodes || []).map(n => [n.id, n]));
    const selfWeight = new Map();
    for (let i = 0; i < samples.length; i += 1) {
      const id = samples[i];
      const w = timeDeltas[i] != null ? timeDeltas[i] : 1;
      selfWeight.set(id, (selfWeight.get(id) || 0) + w);
    }
    const byFunc = new Map();
    for (const [id, w] of selfWeight) {
      let n = nodes.get(id);
      for (let depth = 0; n && depth < 60; depth += 1) {
        const cf = n.callFrame || {};
        const src = String(cf.url || '?').split('/').pop();
        const key = `${src} :: ${cf.functionName || '(anon)'}`;
        byFunc.set(key, (byFunc.get(key) || 0) + w);
        n = nodes.get(n.parent);
      }
    }
    const total = [...byFunc.values()].reduce((a, b) => a + b, 0) || 1;
    const top = [...byFunc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
    mark(`HOTSTACK samples=${samples.length} ms=${(profile.endTime || 0) - (profile.startTime || 0)} gesamt=${total}`);
    top.forEach(([k, v]) => mark(`  HOT ${(100 * v / total).toFixed(1).padStart(5)}% ${k}`));
  } catch (e) {
      mark(`HOTSTACK AUSWERTUNG FEHLER: ${String(e).slice(0, 200)}`);
    }
  }

  // HUNGSTACK: Den haengenden Main-Thread per CDP-Debugger unterbrechen und den
  // aktuellen Call-Stack lesen. Mutation-Observer-Kaskaden und nicht-endende
  // Boot-Loops laufen ueber breakable points; Debugger.pause greift dort und
  // zeigt die exakte Stelle — unabhaengig davon, dass domcontentloaded nie feuert.
  async function stackWhileHung(cdp) {
    try {
      if (!cdp) return;
      await cdp.send('Debugger.enable').catch(() => {});
      await Promise.race([
        cdp.send('Debugger.pause'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('pause timeout 3s')), 3000)),
      ]).catch(() => {});
      await new Promise(r => setTimeout(r, 400));
      const { result } = await Promise.race([
        cdp.send('Runtime.evaluate', { expression: 'new Error().stack', returnByValue: true }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('eval timeout 3s')), 3000)),
      ]);
      mark(`HUNGSTACK ${String(result?.value || '').replace(/\n+/g, ' | ').slice(0, 1600)}`);
      await cdp.send('Debugger.resume').catch(() => {});
    } catch (e) {
      mark(`HUNGSTACK FEHLER: ${String(e).slice(0, 120)}`);
    }
  }

async function login(page, probeGuest = false) {
  const loginUrl = `${base}/?kp_e2e_login=${encodeURIComponent(token)}`;
  // Preflight-Diagnostik: Serverantwortzeit des Login-Endpunkts OHNE Browser
  // messen (Node-fetch, redirect:'manual' => Set-Cookie/302 werden nur gelesen).
  // Trennt beim naechsten CI-Lauf eindeutig: "Server haengt" vs. "Browser-Render
  // haengt" (z.B. schwere authentifizierte kp_edit-Seite nach dem 302).
  let pf0 = Date.now();
  let loginCookie = '';
  let authEditMs = -1;
  let authEditStatus = 0;
  let authEditBytes = 0;
  let authEditHtml = false;
  try {
    const preflight = await fetch(loginUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(25000),
      headers: { 'user-agent': 'kp-lab-preflight' },
    });
    // Set-Cookie aus der 302 mitnehmen (getSetCookie ist ab Node 19.7/undici).
    const setCookies = typeof preflight.headers.getSetCookie === 'function'
      ? preflight.headers.getSetCookie()
      : (preflight.headers.get('set-cookie') ? [preflight.headers.get('set-cookie')] : []);
    loginCookie = setCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');
    const location = preflight.headers.get('location') || '';
    mark(`PREFLIGHT kp_e2e_login -> status=${preflight.status} location=${location} cookies=${setCookies.length} ms=${Date.now() - pf0}`);

    // AUTHRENDER: Der Browser-Goto wartet auf domcontentloaded und kann daher
    // einen Server-Render-Hang NICHT von einem Client-JS-Hang unterscheiden.
    // Hier wird der authentifizierte kp_edit-Render (302->/?kp_edit=1&kp_e2e=1
    // mit dem Login-Cookie) ZUSAETZLICH serverseitig vermessen. Schneller
    // Server-Render => Client-JS-Hang ist belegt; hängender Fetch => PHP-Render.
    if (loginCookie && location) {
      const target = new URL(location, loginUrl).toString();
      const t0 = Date.now();
      const authResp = await fetch(target, {
        redirect: 'follow',
        signal: AbortSignal.timeout(60000),
        headers: { 'user-agent': 'kp-lab-auth-render', cookie: loginCookie },
      });
      const body = await authResp.text().catch(() => '');
      authEditMs = Date.now() - t0;
      authEditStatus = authResp.status;
      authEditBytes = body.length;
      authEditHtml = body ? /<html|<!doctype/i.test(body) : false;
      mark(`AUTHRENDER kp_edit -> status=${authEditStatus} bytes=${authEditBytes} html=${authEditHtml} ms=${authEditMs} target=${target}`);
    } else {
          mark('AUTHRENDER UEBERSPRUNGEN (kein Location/kein Set-Cookie aus dem Login).');
        }

        // AUTHPOST: Der einzige pending Request aller Editor-Laeufe ist der
        // Boot-POST kp_touch_free_layout_load (action=..., page_key=...) an
        // admin-ajax.php — haengt im CI-Browser >12min, antwortet von aussen aber
        // in ~150ms. Hier wird GENAU dieser POST mit dem Login-Cookie serverseitig
        // vermessen: schnell => Server-Pfad ist gesund, Hang ist Browser-JS-seitig
        // (z.B. fetch-Wrapper-Kette/CPU); haengend => authentifizierter
        // admin-ajax-Pfad ist der Root-Cause.
        if (loginCookie) {
          const t0 = Date.now();
          try {
            const fd = new FormData();
            fd.append('action', 'kp_touch_free_layout_load');
            fd.append('page_key', 'post-12');
            const authPostResp = await fetch(`${base}/wp-admin/admin-ajax.php`, {
              method: 'POST',
              credentials: 'omit',
              redirect: 'follow',
              signal: AbortSignal.timeout(60000),
              headers: { 'user-agent': 'kp-lab-auth-post', cookie: loginCookie },
              body: fd,
            });
            const body = await authPostResp.text().catch(() => '');
            mark(`AUTHPOST kp_touch_free_layout_load -> status=${authPostResp.status} bytes=${body.length} ms=${Date.now() - t0}`);
          } catch (error) {
            mark(`AUTHPOST kp_touch_free_layout_load FEHLGESCHLAGEN (${Date.now() - t0}ms): ${String(error).slice(0, 220)}`);
          }
        }
  } catch (error) {
    mark(`PREFLIGHT kp_e2e_login FEHLGESCHLAGEN (${Date.now() - pf0}ms): ${String(error).slice(0, 240)}`);
  }
  // Volles Same-Origin-Netzwerk-Trace: zeichnet ALLE Assets (Stile/Scripts/Ajax)
  // waehrend der Editor-Navigation auf. Feuert domcontentloaded nie, zeigt der
  // Dump danach exakt, welches Asset pending/haengend ist (Blocking-Kandidat).
  const netTrace = [];
  const tNow = () => Date.now();
  const onRequest = (req) => {
      try {
        const u = new URL(req.url());
        if (u.origin !== new URL(base).origin) return;
        const kind = (u.pathname.match(/\.(css|js|png|jpe?g|webp|gif|svg|woff2?|json|php)$/i) || [])[1] || 'other';
        let postData = '';
        if (u.pathname.endsWith('admin-ajax.php')) {
          postData = String(req.postData() || '').slice(0, 300);
        }
        netTrace.push({ url: req.url(), kind, postData, t0: tNow(), status: 0, done: false, failed: false, ms: -1 });
      } catch (_) {}
    };
  const onResponse = (response) => {
    try {
      const u = new URL(response.url());
      if (u.origin !== new URL(base).origin) return;
      const rec = netTrace.find(r => !r.done && r.url === response.url());
      if (rec) { rec.done = true; rec.status = response.status(); rec.ms = tNow() - rec.t0; }
    } catch (_) {}
  };
  const onReqFailed = (req) => {
    try {
      const u = new URL(req.url());
      if (u.origin !== new URL(base).origin) return;
      const rec = netTrace.find(r => !r.done && r.url === req.url());
      if (rec) { rec.done = true; rec.failed = true; rec.ms = tNow() - rec.t0; }
    } catch (_) {}
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onReqFailed);

  // CPU-Profil waehrend der Navigation mitsampeln: haengt der Main-Thread in
    // einer synchronen Schleife, zeigt HOTSTACK die heisse Funktion — unabhaengig
    // davon, ob domcontentloaded je feuert.
    // (Profil entfernt: lieferte in 2 Laeufen nichts, erhoeht nur die CPU-Last
    // im 1-vCPU-Sandbox.)

    // Event-Zaehler: Dialog-/Crash-/Console-Flood identifizieren. Wenn die
    // authentifizierte Boot-Seite in einem Fehler- oder Dialog-Loop steckt,
    // explodieren diese Zaehler und die ersten Meldungen nennen die Quelle.
    const evCounters = { dialogs: 0, crashes: 0, consoleErrors: 0, pageErrors: 0 };
    const evFirst = { dialogs: [], crashes: [], consoleErrors: [], pageErrors: [], consoleAll: [] };
    const evPush = (kind, msg) => { if (evFirst[kind].length < 3) evFirst[kind].push(String(msg || '').slice(0, 900)); };
        page.on('dialog', d => {
          evCounters.dialogs += 1;
          evPush('dialogs', `${d.type()}: ${d.message()}`);
          d.dismiss().catch(() => {});
        });
        page.on('crash', () => {
          evCounters.crashes += 1;
          mark(`RENDERER-CRASH zu ${new Date().toISOString()} (page.on('crash'))`);
        });
        page.on('console', msg => {
          if (evFirst.consoleAll.length < 5) evFirst.consoleAll.push(`${new Date().toISOString()} [${msg.type()}] ${msg.text().slice(0, 400)}`);
          if (msg.type() !== 'error') return;
          evCounters.consoleErrors += 1;
          evPush('consoleErrors', msg.text());
        });
        page.on('pageerror', err => {
          evCounters.pageErrors += 1;
          evPush('pageErrors', String(err));
        });

  const dumpNetAndProfile = async () => {
      await dumpXhrTrace(page).catch(() => {});
      const pending = netTrace.filter(r => !r.done && tNow() - r.t0 > 8000);
    const slow = netTrace.filter(r => r.done && r.ms > 3000).sort((a, b) => b.ms - a.ms).slice(0, 15);
    const pendingKinds = {};
    for (const r of pending) pendingKinds[r.kind] = (pendingKinds[r.kind] || 0) + 1;
    mark(`NETTRACE gesamt=${netTrace.length} fertig=${netTrace.length - pending.length} PENDING=${pending.length} pendingKinds=${JSON.stringify(pendingKinds)}`);
    if (pending.length) {
              mark('NETTRACE PENDING (>8s ohne Antwort -> BLOCKER-KANDIDAT):');
              pending.slice(0, 30).forEach(r => mark(`  PEND ${r.kind} ${r.url.slice(-130)}${r.postData ? ` POST[${r.postData.slice(0, 200)}]` : ''}`));
            }
        const lastReqs = netTrace.slice(-14).map(r => `${r.kind}${r.done ? '' : '*PEND'} ${r.url.slice(-70)}`);
        mark(`NETTRACE LAST-REQS (Reihenfolge = Ausfuehrungsnaehe des Freeze): ${lastReqs.join(' | ')}`);
    if (slow.length) {
      mark('NETTRACE SLOWEST (>3s):');
      slow.forEach(r => mark(`  ${r.status || 'FAIL'} ${r.ms}ms ${r.kind} ${r.url.slice(-130)}`));
    }
    mark(`EVENTS dialogs=${evCounters.dialogs} crashes=${evCounters.crashes} consoleErrors=${evCounters.consoleErrors} pageErrors=${evCounters.pageErrors}`);
            for (const kind of ['dialogs', 'crashes', 'consoleErrors', 'pageErrors']) {
              if (evFirst[kind].length) evFirst[kind].forEach(m => mark(`  FIRST-${kind.toUpperCase()}: ${m}`));
            }
            if (evFirst.consoleAll.length) evFirst.consoleAll.forEach(m => mark(`  CONSOLE-ALL: ${m}`));
          };

  let response = null;
      let lastError = null;
      // GUEST-CTL VOR dem ersten Goto: Derselbe Blocker-POST aus einem frischen
      // Guest-Renderer. Antwortet er (Server ~150ms), ist der Netzwerkpfad
      // Browser->Staging gesund und der Wedge ist an den kp_edit-Boot gebunden.
      if (probeGuest) {
        const ctl = await guestFetchProbe().catch(e => ({ error: String(e).slice(0, 120) }));
        mark(`GUEST-CTL ${JSON.stringify(ctl).slice(0, 600)}`);
      }
      // Hard-Cap 75s: Nach einem Renderer-Crash/Wedge haengt page.goto trotz
      // 45s-Timeout im toten CDP-Target bis zum Context-Schliessen (Lauf 21/22:
      // 12-min-Stall). Diese Wand begrenzt den Versuch hart.
      const gotoBounded = () => new Promise((resolve, reject) => {
        const wall = setTimeout(() => reject(new Error('GOTO-HARDCAP 75s (totes CDP-Target?)')), 75000);
        page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
          .then(r => { clearTimeout(wall); resolve(r); }, e => { clearTimeout(wall); reject(e); });
      });
      // Browser-Watchdog (Lauf 24): In der Crash-Variante haelt Playwrights goto
          // trotz 45s-Timeout + 75s-Wand bis zum Teardown fest (12-min-Stall, alle
          // Node-Timer laufen in den Session-Cleanup). Der Watchdog schliesst nach
          // 60s den GANZEN Browser -> jede haengende Operation rejected sofort;
          // ensureBrowser() relauncht fuer das naechste Geraet.
          const watchdog = setTimeout(() => {
            mark('BROWSER-WATCHDOG 60s: goto haengt im toten Target -> Browser schliessen (entriegelt Playwright)');
            browser.close().catch(() => {});
          }, 60000);
          mark('LOGIN-GOTO start');
          try {
            response = await gotoBounded();
            clearTimeout(watchdog);
            lastError = null;
            mark(`LOGIN-GOTO ok status=${response?.status?.() ?? '?'} reqs=${netTrace.length}`);
            await dumpNetAndProfile();
          } catch (error) {
            clearTimeout(watchdog);
            lastError = error;
            mark(`LOGIN-GOTO FEHLGESCHLAGEN (${String(error).slice(0, 160)})`);
            // HUNGSTACK VOR dem Close: Ein NICHT gecrashter Renderer im Busy-Loop
            // (Lauf 23: alle Requests fertig, crashes=0, dcl feuert nie, Timer+eval
            // tot) kann per Debugger.pause unterbrochen werden -> exakter Loop-Ort
            // (Datei:Zeile im Call-Stack). Nur wenn der Renderer tot ist, schlaegt
            // das fehl - dann liefert der Rest des Dumps trotzdem die NETTRACE-Basis.
            const cdp = await page.context().newCDPSession(page).catch(() => null);
            await stackWhileHung(cdp).catch(() => {});
            // Lauf-22/23-Befund: Die CDP-Session zum gewedgten Renderer blockiert
            // ALLE weiteren Kommandos (haengen bis Context-Close = Budgetverlust).
            // page.close() mit Zeitbegrenzung entriegelt den Node-Fluss sofort; die
            // Diagnose-Daten stehen bereits in Node (netTrace, EVENTS, Signaturen).
            await Promise.race([
              page.close().catch(() => {}),
              new Promise(r => setTimeout(r, 5000)),
            ]).catch(() => {});
        await dumpNetAndProfile().catch(() => {});
        // FRESH-AUTH-CTL: Wiederhole den Login in einem frischen Kontext mit
        // frischer Netzwerk-Partition. Gelingt er, ist der Wedge an den ersten
        // Verbindungsaufbau gebunden; haengt er identisch, ist es seitenweit.
        if (probeGuest) {
          const ctl = await freshLoginProbe().catch(e => ({ error: String(e).slice(0, 120) }));
          mark(`FRESH-AUTH-CTL ${JSON.stringify(ctl).slice(0, 800)}`);
        }
      }
      page.off('request', onRequest);
  page.off('response', onResponse);
  page.off('requestfailed', onReqFailed);
  if (lastError) {
    throw new Error(`Login-Goto fehlgeschlagen: ${String(lastError).slice(0, 300)} | ${await pageSnippet(page)} | reqs=${netTrace.length}`);
  }
  try {
    await page.waitForSelector('.kp-fe2-save', { timeout: 20000 });
  } catch (error) {
    throw new Error(`Login: .kp-fe2-save fehlt nach Login | ${await pageSnippet(page)}`);
  }
  try {
    await page.waitForSelector('.kp-oa-tools', { timeout: 20000 });
  } catch (error) {
    throw new Error(`Login: .kp-oa-tools fehlt nach Login | ${await pageSnippet(page)}`);
  }
  return response?.status() || 0;
}

async function screenshot(page, name, fullPage = false) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage });
}

// Oeffnungs-Pfad (Lauf 26): Seit Einfuehrung der Web-Agent-Bar
// (owner-web-agent.js install/ensureUi) ist .kp-oa-tools Legacy und wird per
// CSS (owner-web-agent.css .kp-web-agent-active) auf left:-9999px geschoben -
// ausserhalb des Viewports, Klick ohne force schlaegt fehl. Primaer-UI ist die
// Agent-Bar: deren "✎ Bearbeiten" ([data-kp-wa-edit]) klickt .kp-oa-tools
// programmatisch und oeffnet dasselbe Tool-Sheet.
async function openOwnerTools(page) {
  const agentEdit = page.locator('.kp-wa-bar [data-kp-wa-edit]').first();
  if (await agentEdit.count().catch(() => 0)) {
    await agentEdit.click();
  } else {
    await page.locator('.kp-oa-tools').first().click({ force: true });
  }
}

async function openDesign(page) {
  await openOwnerTools(page);
  await page.locator('[data-action="design"]').click();
  await page.locator('.kp-oa-sheet.is-design .kp-oa-design-save').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(180);
}

async function centerHit(page, selector) {
  const loc = page.locator(selector).first();
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  if (!box) return { ok: false, reason: 'no bounding box' };
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const hit = await page.evaluate(({ x, y, selector }) => {
    const el = document.elementFromPoint(x, y);
    return {
      tag: el?.tagName || '',
      cls: String(el?.className || ''),
      ok: !!el?.closest(selector),
      pointerEvents: el ? getComputedStyle(el).pointerEvents : '',
    };
  }, { x, y, selector });
  return { ...hit, x, y, box };
}

async function nativeTouch(cdp, type, x, y, id) {
  const touchPoints = type === 'touchEnd' || type === 'touchCancel'
    ? []
    : [{ x, y, id, radiusX: 2, radiusY: 2, force: 0.7 }];
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
}

async function nativeTap(page, cdp, selector, id) {
  const hit = await centerHit(page, selector);
  if (!hit.ok) throw new Error(`Tap target ${selector} is covered: ${JSON.stringify(hit)}`);
  await nativeTouch(cdp, 'touchStart', hit.x, hit.y, id);
  await page.waitForTimeout(45);
  await nativeTouch(cdp, 'touchEnd', hit.x, hit.y, id);
  await page.waitForTimeout(120);
  return hit;
}

async function nativeHoldDragRange(page, cdp, selector, id) {
  const range = page.locator(selector).first();
  await range.scrollIntoViewIfNeeded();
  await page.waitForTimeout(160);
  const box = await range.boundingBox();
  if (!box) throw new Error(`Range ${selector} not visible.`);
  const oldValue = Number(await range.inputValue());
  const min = Number(await range.getAttribute('min') || 0);
  const max = Number(await range.getAttribute('max') || 100);
  const midpoint = (min + max) / 2;
  const targetRatio = oldValue >= midpoint ? 0.24 : 0.82;
  const startX = box.x + box.width * 0.50;
  const targetX = box.x + box.width * targetRatio;
  const y = box.y + box.height / 2;
  const hit = await page.evaluate(({ x, y }) => ({
    className: String(document.elementFromPoint(x, y)?.className || ''),
    isGuard: document.elementFromPoint(x, y)?.classList?.contains('kp-touch-range-hardlock') || false,
  }), { x: startX, y });
  if (!hit.isGuard) throw new Error(`Visible range is not covered by its touch guard: ${JSON.stringify(hit)}`);
  await nativeTouch(cdp, 'touchStart', startX, y, id);
  await page.waitForTimeout(560);
  await nativeTouch(cdp, 'touchMove', targetX, y, id);
  await page.waitForTimeout(55);
  await nativeTouch(cdp, 'touchEnd', targetX, y, id);
  await page.waitForTimeout(140);
  const newValue = Number(await range.inputValue());
  if (newValue === oldValue) throw new Error(`Hold+drag did not change ${selector} (${oldValue}).`);
  return { oldValue, newValue, min, max };
}

async function mobileSaveAndResetRoundTrip(page, cdp, deviceResult) {
  const original = await readState(page);
  try {
    await openDesign(page);
    await page.locator('.kp-oa-sheet.is-design [data-tab="menu"]').click();
    await page.waitForTimeout(180);
    const move = await nativeHoldDragRange(page, cdp, '.kp-oa-sheet.is-design [data-design="menu_width"]', 71);
    deviceResult.touchSlider = move;
    await screenshot(page, 'mobile-390-design-menu-after-touch');

    const saveHit = await centerHit(page, '.kp-oa-sheet.is-design .kp-oa-design-save');
    deviceResult.saveHit = saveHit;
    if (!saveHit.ok) throw new Error(`Design speichern is covered: ${JSON.stringify(saveHit)}`);

    const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 22000 }).then(() => true).catch(() => false);
    await nativeTap(page, cdp, '.kp-oa-sheet.is-design .kp-oa-design-save', 72);
    const reloaded = await navigation;
    if (!reloaded) throw new Error('Design speichern received a touch but did not reload the page.');
    await page.waitForSelector('.kp-fe2-save', { timeout: 15000 });
    const saved = await readState(page);
    if (Number(saved.studio?.menu_width) !== Number(move.newValue)) {
      throw new Error(`Touched menu_width did not persist. expected=${move.newValue} actual=${saved.studio?.menu_width}`);
    }
    deviceResult.saveRoundTrip = { success: true, persistedMenuWidth: saved.studio?.menu_width };

    await restoreState(page, original);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.kp-fe2-save', { timeout: 15000 });

    await openDesign(page);
    await page.locator('.kp-oa-sheet.is-design [data-tab="menu"]').click();
    await page.waitForTimeout(160);
    const resetInfo = await page.evaluate(() => {
      const input = document.querySelector('.kp-oa-sheet.is-design [data-design="menu_width"]');
      const def = Number(window.KPOwnerWebApp?.designDefaults?.menu_width);
      if (!input || !Number.isFinite(def)) return { ok: false, def, before: null, mutated: null };
      const min = Number(input.min), max = Number(input.max), step = Number(input.step || 1) || 1;
      let mutated = def + step * 5 <= max ? def + step * 5 : def - step * 5;
      mutated = Math.max(min, Math.min(max, mutated));
      if (mutated === def) mutated = def === min ? Math.min(max, def + step) : Math.max(min, def - step);
      input.value = String(mutated);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true, def, before: Number(input.value), mutated };
    });
    if (!resetInfo.ok) throw new Error(`Could not prepare reset test: ${JSON.stringify(resetInfo)}`);

    const resetHit = await centerHit(page, '.kp-oa-sheet.is-design .kp-oa-design-reset');
    deviceResult.resetHit = resetHit;
    if (!resetHit.ok) throw new Error(`Standardwerte is covered: ${JSON.stringify(resetHit)}`);
    await nativeTap(page, cdp, '.kp-oa-sheet.is-design .kp-oa-design-reset', 73);
    const afterReset = Number(await page.locator('.kp-oa-sheet.is-design [data-design="menu_width"]').inputValue());
    if (afterReset !== Number(resetInfo.def)) {
      throw new Error(`Standardwerte did not visibly restore menu_width. expected=${resetInfo.def} actual=${afterReset}`);
    }
    const stateAfterReset = await readState(page);
    if (Number(stateAfterReset.studio?.menu_width) !== Number(original.studio?.menu_width)) {
      throw new Error('Standardwerte auto-saved although no Save was pressed.');
    }
    deviceResult.resetRoundTrip = { success: true, defaultMenuWidth: resetInfo.def, storedUnchanged: true };
    await screenshot(page, 'mobile-390-design-after-reset');

    await page.locator('.kp-oa-sheet.is-design .kp-oa-close').click();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  } finally {
    await restoreState(page, original).catch(() => {});
  }
}

// XHR-ISSUER-INSTRUMENTIERUNG (Lauf 21): Kein weiteres Blind-Stubbing. Lauf 19
// (Marker-ONLY-Commit fad7af0, Modus FULL) hat v2+owner-web-app zu 100%
// exculpiert; der dcl-Hang bleibt mit exakt demselben Fehlerbild (LOGIN-GOTO
// Timeout 45s, 0 Events, NETTRACE 1 Pending = POST admin-ajax.php
// action=kp_touch_free_layout_load, Server sonst 145-154ms).
// Lauf-21-Befund (442bdea): KEIN synchroner XHR - der Blocker ist ein
// window.fetch (async=true) auf kp_touch_free_layout_load, aufgerufen aus dem
// Boot-Stapel touch-editor-bridge.js/touch-persistence.js. Der Renderer
// CRASHT danach (crashes=1 via page.on('crash')), dcl feuert nie, der Request
// bleibt als Zombie pending, page.goto haengt trotz 45s-Timeot bis zum
// Context-Schliessen (12-min-Stall).
// Lauf 22 misst deshalb hier:
//   - fetch-ANTWORT pro Eintrag (status/ms) => kam die Response im Renderer an
//     (Verarbeitungs-Crash) oder kam sie nie (Netzwerk-Wedge)?
//   - GUEST-CTL-Kontrollexperiment: derselbe POST aus frischem Guest-Renderer
//   - page.on('crash') mit Zeitstempel, erste Console-Meldungen aller Typen
//   - Hard-Cap 75s pro Goto (kein 12-Minuten-Stall mehr pro Geraet)
//   - Caller-Stack ohne Wrapper-Rauschen (echte ausloesende .js:Zeile zuerst)
// Reversibel: qa-only, addInitScript im CI-Browser, kein Theme/Plugin-Eingriff.
const KP_XHR_TRACE = `(() => {
  const trace = (window.__kpXhrTrace = []);
  const readAction = (body) => {
    try {
      if (typeof FormData !== 'undefined' && body instanceof FormData) return String(body.get('action') || '');
      if (typeof body === 'string' && body.includes('action=')) {
        const m = body.match(/(?:^|&)action=([^&]*)/);
        return m ? decodeURIComponent(m[1]) : '';
      }
    } catch (_) {}
    return '';
  };
  const callerFrames = (raw) => {
    const frames = String(raw || '').split(String.fromCharCode(10)).slice(2)
      .map(s => s.trim().replace(/^at /, ''))
      .filter(f => f && !f.includes('<anonymous>') && !f.startsWith('window.fetch') &&
        !f.startsWith('XMLHttpRequest') && !f.includes('ModuleJob') &&
        !f.includes('node:internal') && !f.includes('eval at'));
    return frames.slice(0, 5);
  };
  const record = (kind, method, url, isAsync, body, origin) => {
    if (trace.length >= 800) return null;
    const u = String(url || '');
    const entry = {
      kind, method, url: u.slice(0, 200),
      action: u.includes('admin-ajax.php') ? readAction(body) : '',
      async: isAsync !== false, t: Date.now(), origin: origin || '',
      stack: callerFrames(new Error().stack),
      status: 0, doneAt: 0, failed: '',
    };
    trace.push(entry);
    if (entry.action === 'kp_touch_free_layout_load' || entry.async === false) {
      // Sofortige Signatur per console.error, damit der Issuer auch dann
      // ankommt, wenn die Seite nach dem Hang nicht mehr lesbar ist
      // (Playwright liefert Console-Events ueber CDP, unabhaengig vom Thread).
      console.error('[KP-XHR-TRACE] ' + entry.kind + ' ' + entry.method + ' ' + u.slice(-90) +
        ' async=' + entry.async + ' action=' + (entry.action || '-') +
        ' caller=' + entry.stack.join(' | '));
    }
    return entry;
      };
      // CLASS-STORM-Detektor (Lauf 25): Edit-Mode-Observer/rAF-Pumpen erzeugen
      // einen classList-Mutations-Sturm auf dem Hauptthread (dcl feuert nie).
      // Ab 200 Toggles innerhalb 1s wird der Aufrufer-Stack der ausloesenden
      // Aenderung gemeldet (max 3 Stuerme) - funktioniert auch in der Crash-
      // Variante, weil Playwright Console-Events bis zum Crash zustellt.
      let classToggles = 0;
      let classWindowStart = Date.now();
      let classStorms = 0;
      const wrapClassList = (proto, method) => {
        const orig = proto[method];
        proto[method] = function (...args) {
          try {
            const now = Date.now();
            if (now - classWindowStart > 1000) { classToggles = 0; classWindowStart = now; }
            classToggles += 1;
            if (classToggles === 200 && classStorms < 3) {
              classStorms += 1;
              const frames = String(new Error().stack || '').split(String.fromCharCode(10)).slice(2)
                .map(s => s.trim().replace(/^at /, ''))
                .filter(f => f && !f.includes('wrapClassList') && !f.includes('<anonymous>'));
              console.error('[KP-CLASS-STORM] 200 classList-' + method + '-Toggles in 1s; caller=' + frames.slice(0, 6).join(' | '));
            }
          } catch (_) {}
          return orig.apply(this, args);
        };
      };
      try {
        wrapClassList(DOMTokenList.prototype, 'add');
        wrapClassList(DOMTokenList.prototype, 'remove');
        wrapClassList(DOMTokenList.prototype, 'toggle');
      } catch (_) {}
      try {
    const xhrMeta = new WeakMap();
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, isAsync) {
      xhrMeta.set(this, { method: String(method || ''), url: String(url || ''), async: isAsync !== false });
      return origOpen.apply(this, arguments);
    };
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      try {
        const meta = xhrMeta.get(this) || { method: '?', url: '?', async: true };
        record('xhr', meta.method, meta.url, meta.async, body, 'xhr.send');
      } catch (_) {}
      return origSend.apply(this, arguments);
    };
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function (input, init) {
        let entry = null;
        try {
          const url = typeof input === 'string' ? input : (input && (input.url || '')) || String(input);
          const method = (init && init.method) || (typeof input === 'string' ? 'GET' : 'POST');
          entry = record('fetch', method, url, true, (init && init.body) || null, 'window.fetch');
        } catch (_) {}
        const responsePromise = origFetch.apply(this, arguments);
        if (entry) {
          responsePromise.then(
            (response) => { entry.status = typeof response?.status === 'number' ? response.status : -1; entry.doneAt = Date.now(); },
            (error) => { entry.failed = String(error).slice(0, 160); entry.doneAt = Date.now(); }
          );
        }
        return responsePromise;
      };
    }
    console.info('[KP-XHR-TRACE] Instrumentierung aktiv');
  } catch (err) {
    console.warn('[KP-XHR-TRACE] Install-Fehler: ' + String(err));
  }
})();`;

async function dumpXhrTrace(page) {
  try {
    const data = await page.evaluate(() => {
      const t = window.__kpXhrTrace || [];
      return {
        total: t.length,
        sync: t.filter(e => e.kind === 'xhr' && e.async === false),
        adminAjax: t.filter(e => e.action),
        touchLoad: t.filter(e => e.action === 'kp_touch_free_layout_load'),
        noResponse: t.filter(e => (e.kind === 'fetch' || e.kind === 'xhr') && e.action && !e.status && !e.failed),
      };
    }, { timeout: 5000 }).catch(() => null);
    if (!data) { mark('XHRTRACE nicht lesbar (Renderer tot / Script nicht gelaufen)'); return; }
    mark(`XHRTRACE total=${data.total} syncXhr=${data.sync.length} adminAjax=${data.adminAjax.length} touchLoad=${data.touchLoad.length} ohneAntwort=${data.noResponse.length}`);
    for (const e of data.noResponse.slice(0, 15)) {
      mark(`  NO-RESPONSE ${e.kind} ${e.method} action=${e.action} async=${e.async} t=${e.t} caller=${(e.stack || []).join(' | ').slice(0, 400)}`);
    }
    for (const e of data.touchLoad.slice(0, 15)) {
      mark(`  TOUCHLOAD ${e.kind} ${e.method} async=${e.async} status=${e.status || '-'} ${e.failed ? 'failed=' + e.failed : ''} ms=${e.doneAt ? e.doneAt - e.t : '?'} caller=${(e.stack || []).join(' | ').slice(0, 500)}`);
    }
    for (const e of data.sync.slice(0, 12)) {
      mark(`  SYNC-XHR ${e.method} ${e.url.slice(-110)} action=${e.action || '-'} caller=${(e.stack || []).join(' | ').slice(0, 400)}`);
    }
    if (!data.sync.length && !data.touchLoad.length && !data.noResponse.length) {
      for (const e of data.adminAjax.slice(0, 10)) {
        mark(`  AJAX ${e.kind} ${e.method} action=${e.action} async=${e.async} caller=${(e.stack || []).join(' | ').slice(0, 400)}`);
      }
    }
  } catch (e) {
    mark(`XHRTRACE FEHLER: ${String(e).slice(0, 120)}`);
  }
}

// GUEST-CTL: Derselbe Blocker-POST (kp_touch_free_layout_load) aus einem
// frischen Guest-Renderer ohne kp_edit-Boot - trennt eindeutig:
// "kp_edit-Boot-Kontext kaputt" vs. "Browser->Staging-Netzwerkpfad kaputt".
// Kein Login, kein Schreiben, kein kp_edit. Ergebnis landet als GUEST-CTL-Mark.
async function guestFetchProbe() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const p = await ctx.newPage();
    await p.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const result = await p.evaluate(async () => {
      const fd = new FormData();
      fd.append('action', 'kp_touch_free_layout_load');
      fd.append('page_key', 'post-12');
      const t0 = Date.now();
      try {
        const res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', credentials: 'same-origin', cache: 'no-store', body: fd, signal: AbortSignal.timeout(15000) });
        const txt = await res.text();
        return { status: res.status, bytes: txt.length, ms: Date.now() - t0, snippet: txt.slice(0, 80) };
      } catch (e) { return { error: String(e).slice(0, 120), ms: Date.now() - t0 }; }
    }, { timeout: 20000 }).catch(e => ({ error: 'evaluate: ' + String(e).slice(0, 120) }));
        return result;
      } finally {
        await ctx.close().catch(() => {});
      }
    }

    // FRESH-AUTH-CTL (Lauf 23): Nach einem Wedge im ersten Kontext wird der
    // authentifizierte Login in einem FRISCHEN Kontext wiederholt (frische
    // Netzwerk-Partition, gleiche URL/Token). Ergebnis sagt, ob der Wedge an den
    // ersten Verbindungsaufbau gebunden ist oder seitenweit auftritt. Kein Einfluss
    // auf den Hauptfluss; laeuft nur bei fehlgeschlagenem ersten Login (mobile-390).
    async function freshLoginProbe() {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
      try {
        await ctx.addInitScript(KP_XHR_TRACE);
        const p = await ctx.newPage();
        const body = (async () => {
          const resp = await p.goto(`${base}/?kp_e2e_login=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
          const result = { phase: 'ok', status: resp?.status?.() ?? '?' };
          await p.waitForTimeout(600);
          const trace = await p.evaluate(() => (window.__kpXhrTrace || [])
            .filter(e => e.action)
            .map(e => ({ action: e.action, status: e.status || 0, failed: !!e.failed, ms: e.doneAt ? e.doneAt - e.t : -1 })),
          { timeout: 4000 }).catch(() => null);
          if (trace) result.trace = trace;
          return result;
        })();
        const result = await Promise.race([
          body,
          new Promise(res => setTimeout(() => res({ phase: 'walltimeout-80s' }), 80000)),
        ]);
        if (result.phase === 'ok') {
          try { await p.close(); } catch (_) {}
        }
        return result;
      } finally {
        await Promise.race([
          ctx.close().catch(() => {}),
          new Promise(r => setTimeout(r, 5000)),
        ]).catch(() => {});
      }
    }

for (const spec of deviceSpecs) {
  await ensureBrowser();
  const context = await browser.newContext({
    viewport: spec.viewport,
    hasTouch: spec.hasTouch,
    isMobile: spec.isMobile,
    deviceScaleFactor: 1,
  });
  await context.addInitScript(KP_XHR_TRACE);
      const page = await context.newPage();
  const deviceResult = {
    name: spec.name,
    viewport: spec.viewport,
    consoleErrors: [],
    pageErrors: [],
    httpErrors: [],
  };
  report.devices.push(deviceResult);
  mark(`DEVICE ${spec.name} START`);

  page.on('console', msg => {
    if (msg.type() === 'error') deviceResult.consoleErrors.push(msg.text().slice(0, 600));
  });
  page.on('pageerror', error => deviceResult.pageErrors.push(String(error).slice(0, 900)));
  page.on('response', response => {
    try {
      const url = new URL(response.url());
      if (url.origin === new URL(base).origin && response.status() >= 400) {
        deviceResult.httpErrors.push({ status: response.status(), url: response.url().slice(0, 500) });
      }
    } catch (_) {}
  });

  try {
    deviceResult.loginStatus = await login(page, spec.name === 'mobile-390');
    mark(`DEVICE ${spec.name} loginStatus=${deviceResult.loginStatus}`);
    await page.waitForTimeout(350);
    const geometry = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
      bodyHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
      toolsVisible: !!document.querySelector('.kp-oa-tools') && getComputedStyle(document.querySelector('.kp-oa-tools')).display !== 'none',
      saveVisible: !!document.querySelector('.kp-fe2-save') && getComputedStyle(document.querySelector('.kp-fe2-save')).display !== 'none',
    }));
    deviceResult.geometry = geometry;
    if (geometry.scrollWidth > geometry.innerWidth + 3) addFailure(spec.name, `horizontal overflow ${geometry.scrollWidth - geometry.innerWidth}px`);
    if (!geometry.toolsVisible || !geometry.saveVisible) addFailure(spec.name, 'editor toolbar is not visible');
    await screenshot(page, `${spec.name}-homepage`, false);

    if (spec.name !== 'desktop-1440') {
      const menu = page.locator('.wp-block-navigation__responsive-container-open').first();
      if (!(await menu.isVisible().catch(() => false))) {
        addFailure(spec.name, 'mobile/tablet menu button is not visible');
      } else {
        await menu.click();
        await page.waitForTimeout(180);
        const opened = await page.locator('.wp-block-navigation__responsive-container.is-menu-open,.wp-block-navigation__responsive-container.has-modal-open').first().isVisible().catch(() => false);
        deviceResult.menuOpened = opened;
        if (!opened) addFailure(spec.name, 'menu button is visible but menu did not open');
        await screenshot(page, `${spec.name}-menu-open`, false);
        await page.keyboard.press('Escape').catch(() => {});
        await page.locator('.wp-block-navigation__responsive-container-close').first().click().catch(() => {});
      }
    }

    await openDesign(page);
    deviceResult.saveHit = await centerHit(page, '.kp-oa-sheet.is-design .kp-oa-design-save');
    deviceResult.resetHit = await centerHit(page, '.kp-oa-sheet.is-design .kp-oa-design-reset');
    if (!deviceResult.saveHit.ok) addFailure(spec.name, `Design speichern is covered: ${JSON.stringify(deviceResult.saveHit)}`);
    if (!deviceResult.resetHit.ok) addFailure(spec.name, `Standardwerte is covered: ${JSON.stringify(deviceResult.resetHit)}`);
    await screenshot(page, `${spec.name}-design`, false);

    for (const tab of ['colors', 'header', 'menu', 'layout', 'sizes']) {
      const tabButton = page.locator(`.kp-oa-sheet.is-design [data-tab="${tab}"]`).first();
      if (await tabButton.count()) {
        await tabButton.click();
        await page.waitForTimeout(100);
        await screenshot(page, `${spec.name}-design-${tab}`, false);
      }
    }
    await page.locator('.kp-oa-sheet.is-design .kp-oa-close').click();

    if (spec.name === 'mobile-390') {
      const cdp = await context.newCDPSession(page);
      await mobileSaveAndResetRoundTrip(page, cdp, deviceResult);
    }

    if (deviceResult.pageErrors.length) addFailure(spec.name, `page errors: ${deviceResult.pageErrors.join(' | ')}`);
    const serverErrors = deviceResult.httpErrors.filter(item => item.status >= 500);
    if (serverErrors.length) addFailure(spec.name, `same-origin HTTP 5xx: ${JSON.stringify(serverErrors)}`);
  } catch (error) {
    addFailure(spec.name, error?.stack || String(error));
    await screenshot(page, `${spec.name}-failure`, false).catch(() => {});
  } finally {
    await context.close();
  }
}

await browser.close();

report.success = report.failures.length === 0;
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
const lines = [
  '# Homepage-Labor – echter Staging-Browser',
  '',
  `Erzeugt: ${report.generatedAt}`,
  `Commit: ${report.commit || 'unbekannt'}`,
  `Gesamtstatus: ${report.success ? 'SUCCESS' : 'FAILURE'}`,
  '',
];
for (const device of report.devices) {
  lines.push(`## ${device.name}`);
  lines.push(`- Viewport: ${device.viewport.width}×${device.viewport.height}`);
  lines.push(`- Horizontaler Overflow: ${Math.max(0, Number(device.geometry?.scrollWidth || 0) - Number(device.geometry?.innerWidth || 0))}px`);
  lines.push(`- Menü geöffnet: ${device.menuOpened ?? 'n/a'}`);
  lines.push(`- Speichern antippbar: ${device.saveHit?.ok ?? false}`);
  lines.push(`- Standardwerte antippbar: ${device.resetHit?.ok ?? false}`);
  if (device.touchSlider) lines.push(`- Touch-Regler: ${device.touchSlider.oldValue} → ${device.touchSlider.newValue}`);
  if (device.saveRoundTrip) lines.push(`- Touch → Speichern → Reload → DB: ${device.saveRoundTrip.success ? 'OK' : 'FEHLER'}`);
  if (device.resetRoundTrip) lines.push(`- Standardwerte ohne Auto-Save: ${device.resetRoundTrip.success ? 'OK' : 'FEHLER'}`);
  lines.push(`- JS Page Errors: ${device.pageErrors.length}`);
  lines.push(`- Same-origin HTTP Fehler: ${device.httpErrors.length}`);
  lines.push('');
}
if (report.failures.length) {
  lines.push('## Fehler', '');
  for (const failure of report.failures) lines.push(`- ${failure.replace(/\s+/g, ' ').slice(0, 1800)}`);
} else {
  lines.push('## Ergebnis', '', '- Alle echten Browser-/Touch-/Speicherchecks grün.');
}
await fs.writeFile(path.join(outDir, 'summary.md'), lines.join('\n'));

console.log(lines.join('\n'));
if (!report.success) process.exitCode = 1;
