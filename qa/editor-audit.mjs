import { spawn } from 'node:child_process';

function run(command, args, label) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: process.cwd(), stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('close', (code) => resolve({ label, code }));
  });
}

async function main() {
  const staging = await run('npx', ['playwright', 'test', 'tests/e2e/editor-visual.spec.js', '--project=editor-visual'], 'staging');
  if (staging.code === 0) {
    process.exit(0);
  }
  console.log('\n[editor-audit] staging failed; running local fallback...\n');
  const fallback = await run('npx', ['playwright', 'test', 'tests/e2e/editor-local-fallback.spec.js', '--project=editor-visual', '--no-deps'], 'fallback');
  process.exit(fallback.code);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
