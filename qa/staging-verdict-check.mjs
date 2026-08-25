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
  // The homepage lab currently publishes the editor browser and session-undo
  // result together as editorMobileTabletDesktop. Keep verdict names stable,
  // but consume the actual report schema instead of synthetic/missing keys.
  editor: ['editorMobileTabletDesktop'],
  'editor-browser': ['editorMobileTabletDesktop'],
  'session-undo': ['editorMobileTabletDesktop'],
  // Persistence must prove both the broad Save→Reload→DB/48h browser round and
  // the isolated real text Save→Reload→DB readback appended by the publisher.
  persistence: ['saveReloadDbUndo48h', 'realTextSave'],
  'persistence-browser': ['saveReloadDbUndo48h'],
  'text-save': ['realTextSave'],
  touch: ['nativeTouchSliderSaveReset', 'touchRuntime'],
  visual: ['visual50Views'],
};

if (group === 'overall') {
  if (report.success === true) {
    console.log(`PASS overall staging verdict for ${report.commit || 'unknown commit'}.`);
    process.exit(0);
  }
  console.error(`FAIL overall staging verdict: ${JSON.stringify(checks)}`);
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
  process.exit(1);
}

console.log(`PASS ${group}: ${names.join(', ')}.`);
