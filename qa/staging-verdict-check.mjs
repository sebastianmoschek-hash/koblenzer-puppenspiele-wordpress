import fs from 'node:fs';

const group = process.argv[2] || 'overall';
const path = process.env.KP_CI_REPORT || 'qa-results/circleci/report.json';
if (!fs.existsSync(path)) {
  console.error(`Missing staging report: ${path}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(path, 'utf8'));
} catch (error) {
  console.error(`Invalid staging report JSON: ${error.message}`);
  process.exit(1);
}

const checks = report.checks || {};
const expect = (name) => checks[name] === 'success';
const groups = {
  infra: ['deploy', 'stagingReady', 'temporaryBridge'],
  // Keep public verdict names truthful while retaining the granular phase keys
  // added by run-full-lab-bounded.sh. The editor verdict covers both the
  // viewport/browser round and the independent session-Undo round.
  editor: ['editorBrowser', 'sessionUndo'],
  'editor-browser': ['editorBrowser'],
  'session-undo': ['sessionUndo'],
  // Persistence is only green when the broad Save→Reload→DB/48h suite and the
  // isolated real text Save→Reload→DB readback both pass.
  persistence: ['persistenceBrowser', 'realTextSave'],
  'persistence-browser': ['persistenceBrowser'],
  'text-save': ['realTextSave'],
  touch: ['nativeTouchSliderSaveReset', 'touchRuntime'],
  visual: ['visual50Views'],
};

async function printExactRemoteDiagnostics() {
  const commit = String(report.commit || '').trim();
  const staging = String(report.staging || 'https://neu.koblenzer-puppenspiele.de').trim();
  if (!commit || !/^https:\/\//i.test(staging)) return;
  try {
    const origin = new URL(staging).origin;
    const base = `${origin}/wp-content/uploads/kp-homepage-lab/latest`;
    const cacheBust = encodeURIComponent(`${commit}-${group}-${Date.now()}`);
    const remoteReportResponse = await fetch(`${base}/report.json?verdict=${cacheBust}`, {
      signal: AbortSignal.timeout(15000),
      headers: { 'cache-control': 'no-cache' },
    });
    if (!remoteReportResponse.ok) {
      console.error(`Remote staging diagnostics unavailable: report HTTP ${remoteReportResponse.status}.`);
      return;
    }
    const remoteReport = await remoteReportResponse.json();
    if (String(remoteReport.commit || '') !== commit) {
      console.error(`Remote staging diagnostics are stale: expected ${commit}, got ${remoteReport.commit || 'missing'}.`);
      return;
    }
    const diagnosticsResponse = await fetch(`${base}/diagnostics.txt?verdict=${cacheBust}`, {
      signal: AbortSignal.timeout(15000),
      headers: { 'cache-control': 'no-cache' },
    });
    if (!diagnosticsResponse.ok) {
      console.error(`Remote staging diagnostics unavailable: diagnostics HTTP ${diagnosticsResponse.status}.`);
      return;
    }
    const diagnostics = await diagnosticsResponse.text();
    const maxChars = 40000;
    const tail = diagnostics.length > maxChars ? diagnostics.slice(-maxChars) : diagnostics;
    console.error(`\n===== exact staging diagnostics for ${commit} =====\n${tail}`);
  } catch (error) {
    console.error(`Could not fetch exact staging diagnostics: ${error?.message || error}`);
  }
}

if (group === 'overall') {
  if (report.success === true) {
    console.log(`PASS overall staging verdict for ${report.commit || 'unknown commit'}.`);
    process.exit(0);
  }
  console.error(`FAIL overall staging verdict: ${JSON.stringify(checks)}`);
  await printExactRemoteDiagnostics();
  process.exit(1);
}

const names = groups[group];
if (!names) {
  console.error(`Unknown staging verdict group: ${group}`);
  process.exit(2);
}

const failed = names.filter((name) => !expect(name));
if (failed.length) {
  console.error(`FAIL ${group}: ${failed.map((name) => `${name}=${checks[name] ?? 'missing'}`).join(', ')}`);
  await printExactRemoteDiagnostics();
  process.exit(1);
}

console.log(`PASS ${group}: ${names.join(', ')}.`);
