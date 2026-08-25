#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOST = process.env.KP_AGENT_HOST || '127.0.0.1';
const PORT = Number(process.env.KP_AGENT_PORT || 8765);
const OLLAMA = (process.env.KP_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const MODEL = process.env.KP_GEMMA_MODEL || 'gemma3:4b';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(process.env.KP_REPO_ROOT || path.join(HERE, '..', '..'));
const MAX_BODY = 7 * 1024 * 1024;
const MAX_FILE = 180 * 1024;
const MAX_FILES = 5;
const MAX_CHANGES = 5;
const MAX_OPS = 10;

const allowedOrigins = new Set(
  (process.env.KP_ALLOWED_ORIGINS || 'https://neu.koblenzer-puppenspiele.de,http://localhost,http://127.0.0.1')
    .split(',').map(v => v.trim()).filter(Boolean)
);

const allowedRoots = [
  'wp-content/mu-plugins/',
  'wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/',
  'wp-content/themes/koblenzer-puppenspiele-block-theme-phase1-7/',
  'qa/',
];

const deniedPatterns = [
  /^android\//i,
  /^\.github\/workflows\/android-/i,
  /^qa\/.*android/i,
  /^qa\/mobile-/i,
  /^wp-content\/mu-plugins\/kp-mobile-/i,
];

function json(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (origin && !allowedOrigins.has(origin)) return false;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-KP-Desktop-Agent');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
  return true;
}

async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Anfrage ist zu groß.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Ungültiges JSON.'), { status: 400 }); }
}

function cleanRelative(input) {
  const value = String(input || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!value || value.includes('\0') || value.split('/').includes('..')) throw new Error('Ungültiger Dateipfad.');
  if (deniedPatterns.some(re => re.test(value))) throw new Error(`Laptop-Agent darf diesen Pfad nicht anfassen: ${value}`);
  if (!allowedRoots.some(root => value.startsWith(root))) throw new Error(`Pfad liegt außerhalb des Website-Scopes: ${value}`);
  const absolute = path.resolve(REPO, value);
  const prefix = REPO.endsWith(path.sep) ? REPO : REPO + path.sep;
  if (!absolute.startsWith(prefix)) throw new Error('Pfad verlässt das Repository.');
  return { relative: value, absolute };
}

function listAllowedFiles() {
  const out = [];
  const extensions = new Set(['.php', '.js', '.mjs', '.css', '.json', '.sh', '.md', '.html']);
  const visit = relativeDir => {
    if (out.length >= 1200) return;
    const absoluteDir = path.join(REPO, relativeDir);
    if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) return;
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      if (out.length >= 1200) break;
      const relative = path.posix.join(relativeDir.replace(/\\/g, '/'), entry.name);
      if (deniedPatterns.some(re => re.test(relative))) continue;
      if (entry.isDirectory()) { visit(relative); continue; }
      if (!entry.isFile() || !extensions.has(path.extname(entry.name).toLowerCase())) continue;
      try {
        const safe = cleanRelative(relative);
        if (fs.statSync(safe.absolute).size <= MAX_FILE) out.push(safe.relative);
      } catch {}
    }
  };
  for (const root of allowedRoots) visit(root.replace(/\/$/, ''));
  return [...new Set(out)].sort();
}

function git(args) {
  const result = spawnSync('git', ['-C', REPO, ...args], { encoding: 'utf8', timeout: 20000 });
  return { ok: result.status === 0, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function readAllowedFile(candidate) {
  const { relative, absolute } = cleanRelative(candidate);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`Datei nicht gefunden: ${relative}`);
  const bytes = fs.statSync(absolute).size;
  if (bytes > MAX_FILE) throw new Error(`Datei ist für den lokalen Agenten zu groß: ${relative}`);
  return { path: relative, bytes, content: fs.readFileSync(absolute, 'utf8') };
}

async function ollamaChat(payload) {
  const messages = Array.isArray(payload.messages) ? payload.messages.slice(-16) : [];
  if (!messages.length) throw new Error('Keine Nachricht für Gemma erhalten.');
  const normalized = messages.map(message => ({
    role: ['system', 'assistant', 'user'].includes(message?.role) ? message.role : 'user',
    content: String(message?.content || '').slice(0, 50000),
    ...(Array.isArray(message?.images) ? { images: message.images.slice(0, 2).map(v => String(v).replace(/^data:image\/[^;]+;base64,/, '')) } : {}),
  }));
  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, stream: false, messages: normalized, options: { temperature: 0.2 } }),
  });
  if (!response.ok) throw new Error(`Ollama antwortet mit HTTP ${response.status}. Läuft Ollama und ist ${MODEL} installiert?`);
  const data = await response.json();
  return { model: data.model || MODEL, content: String(data?.message?.content || ''), done: data.done !== false };
}

function applyPlan(plan) {
  const changes = Array.isArray(plan?.changes) ? plan.changes.slice(0, MAX_CHANGES) : [];
  if (!changes.length) throw new Error('Der Patch enthält keine Änderungen.');
  const prepared = [];
  for (const change of changes) {
    const file = readAllowedFile(change?.path);
    const operations = Array.isArray(change?.operations) ? change.operations.slice(0, MAX_OPS) : [];
    if (!operations.length) throw new Error(`Keine Operation für ${file.path}.`);
    let next = file.content;
    for (const op of operations) {
      const search = String(op?.search ?? '');
      const replace = String(op?.replace ?? '');
      if (!search) throw new Error(`Leerer Suchblock in ${file.path}.`);
      const first = next.indexOf(search);
      if (first < 0) throw new Error(`Suchblock wurde in ${file.path} nicht gefunden.`);
      if (next.indexOf(search, first + search.length) >= 0) throw new Error(`Suchblock ist in ${file.path} nicht eindeutig.`);
      next = next.slice(0, first) + replace + next.slice(first + search.length);
    }
    if (next === file.content) throw new Error(`Patch würde ${file.path} nicht verändern.`);
    prepared.push({ ...cleanRelative(file.path), before: file.content, after: next });
  }

  const beforeStatus = git(['status', '--short']).stdout;
  const written = [];
  try {
    for (const item of prepared) {
      fs.writeFileSync(item.absolute, item.after, 'utf8');
      written.push(item);
    }
  } catch (error) {
    for (const item of written) fs.writeFileSync(item.absolute, item.before, 'utf8');
    throw error;
  }

  const tests = [];
  for (const item of prepared.filter(v => v.relative.endsWith('.php'))) {
    const lint = spawnSync('php', ['-l', item.absolute], { encoding: 'utf8', timeout: 15000 });
    tests.push({ name: `php -l ${item.relative}`, ok: lint.status === 0, output: String(lint.stdout || lint.stderr || '').trim().slice(0, 2000) });
  }
  if (fs.existsSync(path.join(REPO, 'qa', 'local-ai-contract.sh'))) {
    const contract = spawnSync('bash', ['qa/local-ai-contract.sh'], { cwd: REPO, encoding: 'utf8', timeout: 120000 });
    tests.push({ name: 'qa/local-ai-contract.sh', ok: contract.status === 0, output: String(contract.stdout || contract.stderr || '').trim().slice(0, 4000) });
  }

  const failed = tests.filter(test => !test.ok);
  if (failed.length) {
    for (const item of prepared) fs.writeFileSync(item.absolute, item.before, 'utf8');
    throw new Error(`Patch zurückgerollt, weil ${failed.map(v => v.name).join(', ')} fehlgeschlagen ist.`);
  }

  const diff = git(['diff', '--', ...prepared.map(v => v.relative)]).stdout.slice(0, 60000);
  return { changed: prepared.map(v => v.relative), tests, diff, preexistingChanges: beforeStatus.slice(0, 12000) };
}

const server = http.createServer(async (req, res) => {
  try {
    if (!cors(req, res)) return json(res, 403, { ok: false, error: 'Origin ist für den lokalen Laptop-Agenten nicht freigegeben.' });
    if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
    if (req.headers['x-kp-desktop-agent'] !== '1') return json(res, 403, { ok: false, error: 'Lokaler Agent-Header fehlt.' });

    if (req.method === 'GET' && req.url === '/v1/health') {
      const repoOk = fs.existsSync(path.join(REPO, '.git'));
      let ollama = false;
      try { const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) }); ollama = r.ok; } catch {}
      return json(res, 200, { ok: true, service: 'kp-homepage-agent', repo: REPO, repoOk, ollama, model: MODEL, androidWrites: false, capabilities: ['chat', 'vision', 'catalog', 'read-files', 'apply-safe-patch', 'git-diff'] });
    }

    if (req.method === 'GET' && req.url === '/v1/catalog') {
      return json(res, 200, { ok: true, files: listAllowedFiles(), androidWrites: false });
    }

    if (req.method === 'POST' && req.url === '/v1/chat') {
      return json(res, 200, { ok: true, ...(await ollamaChat(await body(req))) });
    }

    if (req.method === 'POST' && req.url === '/v1/files') {
      const input = await body(req);
      const paths = Array.isArray(input.paths) ? input.paths.slice(0, MAX_FILES) : [];
      return json(res, 200, { ok: true, files: paths.map(readAllowedFile) });
    }

    if (req.method === 'POST' && req.url === '/v1/apply') {
      const input = await body(req);
      return json(res, 200, { ok: true, result: applyPlan(input.plan || input) });
    }

    json(res, 404, { ok: false, error: 'Unbekannter lokaler Agent-Endpunkt.' });
  } catch (error) {
    json(res, Number(error?.status || 400), { ok: false, error: String(error?.message || error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Koblenzer Puppenspiele Laptop-Agent: http://${HOST}:${PORT}`);
  console.log(`Repository: ${REPO}`);
  console.log(`Gemma via Ollama: ${MODEL}`);
  console.log('Android-Schreibzugriff: AUS');
});
