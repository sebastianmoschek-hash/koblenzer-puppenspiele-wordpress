#!/usr/bin/env node
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOST = process.env.KP_AGENT_HOST || '127.0.0.1';
const PORT = Number(process.env.KP_AGENT_PORT || 8765);
const OLLAMA = (process.env.KP_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const MODEL = process.env.KP_GEMMA_MODEL || 'gemma3:4b';
const TARGET_BRANCH = process.env.KP_AGENT_BRANCH || 'desktop-ai-fast';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(process.env.KP_REPO_ROOT || path.join(HERE, '..', '..'));
const MAX_BODY = 7 * 1024 * 1024;
const MAX_FILE = 180 * 1024;
const MAX_FILES = 5;
const MAX_CHANGES = 5;
const MAX_OPS = 10;

const allowedOrigins = new Set(
  (process.env.KP_ALLOWED_ORIGINS || 'https://neu.koblenzer-puppenspiele.de,http://localhost,http://127.0.0.1')
    .split(',').map(value => value.trim()).filter(Boolean)
);

const readableRoots = [
  'wp-content/mu-plugins/',
  'wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/',
  'wp-content/themes/koblenzer-puppenspiele-block-theme-phase1-7/',
  'qa/',
];

const writableRoots = [
  'wp-content/mu-plugins/',
  'wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/',
  'wp-content/themes/koblenzer-puppenspiele-block-theme-phase1-7/',
];

const deniedPatterns = [
  /^android(?:\/|$)/i,
  /^\.github(?:\/|$)/i,
  /^\.circleci(?:\/|$)/i,
  /^qa\/.*android/i,
  /^qa\/mobile-/i,
  /^wp-content\/mu-plugins\/kp-mobile-/i,
  /(?:^|\/)(?:\.env|id_rsa|id_ed25519|credentials?|secrets?|auth\.json)(?:$|[.\/-])/i,
];

const tokenDirectory = path.resolve(process.env.KP_AGENT_STATE_DIR || path.join(os.homedir(), '.kp-homepage-agent'));
const tokenFile = path.join(tokenDirectory, 'token.json');
const pairingCode = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
let failedPairings = 0;
let pairingBlockedUntil = 0;
let pending = null;

function loadOrCreateToken() {
  fs.mkdirSync(tokenDirectory, { recursive: true, mode: 0o700 });
  try {
    const saved = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    if (/^[a-f0-9]{64}$/i.test(String(saved.token || ''))) return String(saved.token);
  } catch (_) {}
  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(tokenFile, JSON.stringify({ token }, null, 2), { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(tokenFile, 0o600); } catch (_) {}
  return token;
}

const accessToken = loadOrCreateToken();

function json(res, status, payload) {
  const output = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(output),
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(output);
}

function cors(req, res) {
  const origin = String(req.headers.origin || '');
  if (origin && !allowedOrigins.has(origin)) return false;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-KP-Desktop-Agent');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
  return true;
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Anfrage ist zu groß.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (_) { throw Object.assign(new Error('Ungültiges JSON.'), { status: 400 }); }
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authenticated(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') && safeEqual(value.slice(7), accessToken);
}

function normalizeRelative(input, mode = 'read') {
  const value = String(input || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!value || value.includes('\0') || value.split('/').includes('..')) throw new Error('Ungültiger Dateipfad.');
  if (deniedPatterns.some(pattern => pattern.test(value))) throw new Error(`Laptop-Agent darf diesen Pfad nicht anfassen: ${value}`);
  const roots = mode === 'write' ? writableRoots : readableRoots;
  if (!roots.some(root => value.startsWith(root))) throw new Error(`Pfad liegt außerhalb des ${mode === 'write' ? 'Schreib' : 'Lese'}-Scopes: ${value}`);
  const absolute = path.resolve(REPO, value);
  const prefix = REPO.endsWith(path.sep) ? REPO : `${REPO}${path.sep}`;
  if (!absolute.startsWith(prefix)) throw new Error('Pfad verlässt das Repository.');
  return { relative: value, absolute };
}

function readAllowedFile(candidate) {
  const safe = normalizeRelative(candidate, 'read');
  if (!fs.existsSync(safe.absolute) || !fs.statSync(safe.absolute).isFile()) throw new Error(`Datei nicht gefunden: ${safe.relative}`);
  const real = fs.realpathSync(safe.absolute);
  const repoReal = `${fs.realpathSync(REPO)}${path.sep}`;
  if (!real.startsWith(repoReal)) throw new Error(`Symlink verlässt das Repository: ${safe.relative}`);
  const bytes = fs.statSync(real).size;
  if (bytes > MAX_FILE) throw new Error(`Datei ist für den lokalen Agenten zu groß: ${safe.relative}`);
  return { path: safe.relative, bytes, content: fs.readFileSync(real, 'utf8') };
}

function listAllowedFiles() {
  const output = [];
  const extensions = new Set(['.php', '.js', '.mjs', '.css', '.json', '.sh', '.md', '.html']);
  const visit = relativeDirectory => {
    if (output.length >= 1200) return;
    const absoluteDirectory = path.join(REPO, relativeDirectory);
    if (!fs.existsSync(absoluteDirectory) || !fs.statSync(absoluteDirectory).isDirectory()) return;
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      if (output.length >= 1200) break;
      const relative = path.posix.join(relativeDirectory.replace(/\\/g, '/'), entry.name);
      if (deniedPatterns.some(pattern => pattern.test(relative))) continue;
      if (entry.isDirectory()) { visit(relative); continue; }
      if (!entry.isFile() || !extensions.has(path.extname(entry.name).toLowerCase())) continue;
      try {
        const file = readAllowedFile(relative);
        if (file.bytes <= MAX_FILE) output.push(file.path);
      } catch (_) {}
    }
  };
  for (const root of readableRoots) visit(root.replace(/\/$/, ''));
  return [...new Set(output)].sort();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPO,
    encoding: 'utf8',
    timeout: options.timeout || 30000,
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    output: String(result.stdout || result.stderr || result.error?.message || '').trim(),
  };
}

function git(args, options = {}) {
  return run('git', ['-C', REPO, ...args], options);
}

function branchName() {
  return git(['branch', '--show-current']).output;
}

function worktreeStatus() {
  return git(['status', '--porcelain=v1', '--untracked-files=all']).output;
}

function assertReadyForWrite() {
  const branch = branchName();
  if (branch !== TARGET_BRANCH) throw new Error(`Codeänderungen sind nur auf Branch ${TARGET_BRANCH} erlaubt. Aktuell: ${branch || 'detached HEAD'}.`);
  const dirty = worktreeStatus();
  if (dirty) throw new Error(`Das Repository enthält bereits lokale Änderungen. Erst sichern oder verwerfen:\n${dirty.slice(0, 4000)}`);
  if (pending) throw new Error('Es gibt bereits einen geprüften Patch. Bitte zuerst veröffentlichen oder verwerfen.');
}

async function ollamaStatus() {
  try {
    const response = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1800) });
    if (!response.ok) return { ollama: false, modelInstalled: false };
    const data = await response.json();
    const names = (Array.isArray(data.models) ? data.models : []).map(item => String(item.name || item.model || ''));
    const base = MODEL.replace(/:latest$/, '');
    return { ollama: true, modelInstalled: names.some(name => name === MODEL || name.replace(/:latest$/, '') === base) };
  } catch (_) { return { ollama: false, modelInstalled: false }; }
}

async function ollamaChat(payload) {
  const messages = Array.isArray(payload.messages) ? payload.messages.slice(-16) : [];
  if (!messages.length) throw new Error('Keine Nachricht für Gemma erhalten.');
  const normalized = messages.map(message => ({
    role: ['system', 'assistant', 'user'].includes(message?.role) ? message.role : 'user',
    content: String(message?.content || '').slice(0, 50000),
    ...(Array.isArray(message?.images) ? {
      images: message.images.slice(0, 2).map(value => String(value).replace(/^data:image\/[^;]+;base64,/, '')),
    } : {}),
  }));
  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, stream: false, messages: normalized, options: { temperature: 0.2 } }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`Ollama antwortet mit HTTP ${response.status}. Läuft Ollama und ist ${MODEL} installiert?`);
  const data = await response.json();
  return { model: data.model || MODEL, content: String(data?.message?.content || ''), done: data.done !== false };
}

function restoreSnapshots(items) {
  for (const item of items) fs.writeFileSync(item.absolute, item.before, 'utf8');
}

function checkPlan(plan) {
  const risk = String(plan?.risk || 'medium').toLowerCase();
  if (!['low', 'medium'].includes(risk)) throw new Error('Gemma bewertet diesen Patch als hohes Risiko. Er wird nicht automatisch angewendet.');
  const changes = Array.isArray(plan?.changes) ? plan.changes : [];
  if (!changes.length || changes.length > MAX_CHANGES) throw new Error(`Ein Patch muss 1 bis ${MAX_CHANGES} Dateien enthalten.`);
  const paths = changes.map(change => String(change?.path || ''));
  if (new Set(paths).size !== paths.length) throw new Error('Jede Datei darf nur einmal im Patch vorkommen.');
  return changes;
}

function applyPlan(plan) {
  assertReadyForWrite();
  const changes = checkPlan(plan);
  const prepared = [];
  let operationCount = 0;
  for (const change of changes) {
    const writable = normalizeRelative(change?.path, 'write');
    const file = readAllowedFile(writable.relative);
    const operations = Array.isArray(change?.operations) ? change.operations : [];
    operationCount += operations.length;
    if (!operations.length || operationCount > MAX_OPS) throw new Error(`Der Patch darf insgesamt höchstens ${MAX_OPS} Operationen enthalten.`);
    let next = file.content;
    for (const operation of operations) {
      const search = String(operation?.search ?? '');
      const replace = String(operation?.replace ?? '');
      if (!search) throw new Error(`Leerer Suchblock in ${file.path}.`);
      const first = next.indexOf(search);
      if (first < 0) throw new Error(`Suchblock wurde in ${file.path} nicht gefunden.`);
      if (next.indexOf(search, first + search.length) >= 0) throw new Error(`Suchblock ist in ${file.path} nicht eindeutig.`);
      next = `${next.slice(0, first)}${replace}${next.slice(first + search.length)}`;
    }
    if (next === file.content) throw new Error(`Patch würde ${file.path} nicht verändern.`);
    prepared.push({ ...writable, before: file.content, after: next });
  }

  try {
    for (const item of prepared) fs.writeFileSync(item.absolute, item.after, 'utf8');
    const tests = [];
    for (const item of prepared) {
      if (item.relative.endsWith('.php')) {
        const result = run('php', ['-l', item.absolute], { timeout: 15000 });
        tests.push({ name: `php -l ${item.relative}`, ok: result.ok, output: result.output.slice(0, 2000) });
      }
      if (/\.(?:js|mjs)$/i.test(item.relative)) {
        const result = run('node', ['--check', item.absolute], { timeout: 15000 });
        tests.push({ name: `node --check ${item.relative}`, ok: result.ok, output: result.output.slice(0, 2000) });
      }
    }
    const diffCheck = git(['diff', '--check', '--', ...prepared.map(item => item.relative)]);
    tests.push({ name: 'git diff --check', ok: diffCheck.ok, output: diffCheck.output.slice(0, 2000) });
    const contractPath = path.join(REPO, 'qa', 'local-ai-contract.sh');
    if (!fs.existsSync(contractPath)) throw new Error('Der unveränderbare Vertragstest qa/local-ai-contract.sh fehlt.');
    const contract = run('bash', ['qa/local-ai-contract.sh'], { timeout: 120000 });
    tests.push({ name: 'qa/local-ai-contract.sh', ok: contract.ok, output: contract.output.slice(0, 5000) });
    const failed = tests.filter(test => !test.ok);
    if (failed.length) throw new Error(`Prüfung fehlgeschlagen: ${failed.map(test => test.name).join(', ')}`);
    const changed = prepared.map(item => item.relative);
    const diff = git(['diff', '--', ...changed]).output.slice(0, 60000);
    pending = {
      changed,
      summary: String(plan?.summary || 'Lokaler Homepage-Fix').slice(0, 160),
      tests,
      diff,
      snapshots: prepared.map(item => ({ relative: item.relative, absolute: item.absolute, before: item.before })),
      commit: '',
    };
    return { changed, tests, diff, pending: publicPending() };
  } catch (error) {
    restoreSnapshots(prepared);
    throw new Error(`Patch wurde vollständig zurückgerollt. ${error.message || error}`);
  }
}

function publicPending() {
  if (!pending) return null;
  return {
    changed: pending.changed,
    summary: pending.summary,
    tests: pending.tests,
    diff: pending.diff,
    committed: !!pending.commit,
    commit: pending.commit || '',
  };
}

function revertPending() {
  if (!pending) throw new Error('Es gibt keinen offenen lokalen Patch.');
  if (pending.commit) throw new Error('Der Patch ist bereits committed. Bitte den Push erneut versuchen oder den Commit manuell prüfen.');
  restoreSnapshots(pending.snapshots);
  const remaining = worktreeStatus();
  if (remaining) throw new Error(`Dateien wurden restauriert, aber das Repository ist nicht sauber:\n${remaining.slice(0, 4000)}`);
  pending = null;
}

function sanitizedSummary(value) {
  const clean = String(value || 'Lokaler Homepage-Fix').replace(/[\r\n]+/g, ' ').replace(/[^\p{L}\p{N} .,:;!?()_-]/gu, '').trim();
  return clean.slice(0, 120) || 'Lokaler Homepage-Fix';
}

function publishPending(summary) {
  if (!pending) throw new Error('Es gibt keinen geprüften Patch zum Veröffentlichen.');
  if (branchName() !== TARGET_BRANCH) throw new Error(`Veröffentlichen ist nur von ${TARGET_BRANCH} erlaubt.`);
  if (!pending.commit) {
    const status = worktreeStatus();
    const expected = new Set(pending.changed);
    const unexpected = status.split(/\r?\n/).filter(Boolean).filter(line => !expected.has(line.slice(3).replace(/\\/g, '/')));
    if (unexpected.length) throw new Error(`Unerwartete zusätzliche Änderungen gefunden:\n${unexpected.join('\n')}`);
    const add = git(['add', '--', ...pending.changed]);
    if (!add.ok) throw new Error(`Git add fehlgeschlagen: ${add.output}`);
    const commit = git(['commit', '-m', `fix(local-ai): ${sanitizedSummary(summary || pending.summary)}`], { timeout: 120000 });
    if (!commit.ok) throw new Error(`Git commit fehlgeschlagen: ${commit.output}`);
    pending.commit = git(['rev-parse', 'HEAD']).output;
  }
  const push = git(['push', 'origin', `HEAD:${TARGET_BRANCH}`], { timeout: 180000 });
  const result = { pushed: push.ok, commit: pending.commit, pushError: push.ok ? '' : push.output.slice(0, 4000) };
  if (push.ok) pending = null;
  return result;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      const p = path.join(HERE, 'public', 'index.html');
      if (fs.existsSync(p)) {
        const body = fs.readFileSync(p, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
        return res.end(body);
      }
    }
    if (req.method === 'GET' && req.url === '/app.js') {
      const p = path.join(HERE, 'public', 'app.js');
      if (fs.existsSync(p)) {
        const body = fs.readFileSync(p, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
        return res.end(body);
      }
    }

    if (!cors(req, res)) return json(res, 403, { ok: false, error: 'Origin ist für den lokalen Laptop-Agenten nicht freigegeben.' });
    if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
    if (req.headers['x-kp-desktop-agent'] !== '1') return json(res, 403, { ok: false, error: 'Lokaler Agent-Header fehlt.' });

    if (req.method === 'POST' && req.url === '/v1/pair') {
      if (Date.now() < pairingBlockedUntil) return json(res, 429, { ok: false, error: 'Zu viele falsche Kopplungsversuche. Bitte 30 Sekunden warten.' });
      const input = await readBody(req);
      if (!safeEqual(String(input.code || ''), pairingCode)) {
        failedPairings += 1;
        if (failedPairings >= 5) { pairingBlockedUntil = Date.now() + 30000; failedPairings = 0; }
        return json(res, 401, { ok: false, code: 'PAIRING_CODE_INVALID', error: 'Kopplungscode ist falsch.' });
      }
      failedPairings = 0;
      return json(res, 200, { ok: true, token: accessToken });
    }

    if (!authenticated(req)) return json(res, 401, { ok: false, code: 'PAIRING_REQUIRED', error: 'Browser und Laptop-Agent müssen gekoppelt werden.' });

    if (req.method === 'GET' && req.url === '/v1/health') {
      const repoOk = fs.existsSync(path.join(REPO, '.git'));
      const ollama = await ollamaStatus();
      const branch = repoOk ? branchName() : '';
      const dirty = repoOk ? !!worktreeStatus() : false;
      return json(res, 200, {
        ok: true, service: 'kp-homepage-agent', repo: REPO, repoOk, ...ollama, model: MODEL,
        branch, targetBranch: TARGET_BRANCH, branchReady: branch === TARGET_BRANCH, dirty,
        androidWrites: false,
        capabilities: ['pairing', 'chat', 'vision', 'catalog', 'read-files', 'apply-safe-patch', 'tests', 'revert', 'commit', 'staging-push'],
      });
    }

    if (req.method === 'GET' && req.url === '/v1/catalog') return json(res, 200, { ok: true, files: listAllowedFiles(), androidWrites: false });
    if (req.method === 'POST' && req.url === '/v1/chat') return json(res, 200, { ok: true, ...(await ollamaChat(await readBody(req))) });
    if (req.method === 'POST' && req.url === '/v1/files') {
      const input = await readBody(req);
      const paths = Array.isArray(input.paths) ? input.paths : [];
      if (!paths.length || paths.length > MAX_FILES) throw new Error(`Es dürfen 1 bis ${MAX_FILES} Dateien gelesen werden.`);
      return json(res, 200, { ok: true, files: paths.map(readAllowedFile) });
    }
    if (req.method === 'POST' && req.url === '/v1/apply') {
      const input = await readBody(req);
      return json(res, 200, { ok: true, result: applyPlan(input.plan || input) });
    }
    if (req.method === 'GET' && req.url === '/v1/pending') return json(res, 200, { ok: true, pending: publicPending() });
    if (req.method === 'POST' && req.url === '/v1/revert') { revertPending(); return json(res, 200, { ok: true }); }
    if (req.method === 'POST' && req.url === '/v1/publish') {
      const input = await readBody(req);
      return json(res, 200, { ok: true, ...publishPending(input.summary) });
    }
    return json(res, 404, { ok: false, error: 'Unbekannter lokaler Agent-Endpunkt.' });
  } catch (error) {
    return json(res, Number(error?.status || 400), { ok: false, error: String(error?.message || error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('Koblenzer Puppenspiele – lokaler Laptop-Agent');
  console.log(`Adresse:       http://${HOST}:${PORT}`);
  console.log(`Repository:    ${REPO}`);
  console.log(`Staging-Branch:${TARGET_BRANCH}`);
  console.log(`Gemma/Ollama:  ${MODEL}`);
  console.log('Android-Schreibzugriff: AUS');
  console.log('');
  console.log(`KOPPLUNGSCODE: ${pairingCode}`);
  console.log('Diesen Code nur in das Browserfenster der Homepage-KI eingeben.');
  console.log('Dieses Fenster offen lassen. Beenden mit Strg+C.');
  console.log('');
});
