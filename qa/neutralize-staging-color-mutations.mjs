import fs from 'node:fs';

const file = 'qa/owner-all-persistence-e2e.mjs';
const source = fs.readFileSync(file, 'utf8');
const unsafe = `      } else if (input.type === 'color') {\n        const next = String(input.value).toLowerCase() === '#112233' ? '#223344' : '#112233';\n        input.value = next;\n        changed[key] = next;\n        input.dispatchEvent(new Event('input', { bubbles:true }));`;
const safe = `      } else if (input.type === 'color') {\n        // Shared staging must never receive synthetic colour values. Verify\n        // persistence using the current colour without mutating the design.\n        changed[key] = input.value;`;

if (source.includes(safe)) {
  console.log('PASS: shared-staging E2E colour mutations are already neutralized.');
  process.exit(0);
}
if (!source.includes(unsafe)) {
  console.log('INFO: destructive colour mutation pattern is absent; no safety rewrite required.');
  process.exit(0);
}

const next = source.replace(unsafe, safe);
fs.writeFileSync(file, next);
console.log('PASS: shared-staging E2E colour mutations neutralized; expected values now remain the real current colours.');
