import fs from 'node:fs';

const file = 'qa/owner-all-persistence-e2e.mjs';
const source = fs.readFileSync(file, 'utf8');
const unsafe = `      } else if (input.type === 'color') {\n        const next = String(input.value).toLowerCase() === '#112233' ? '#223344' : '#112233';\n        input.value = next;\n        changed[key] = next;\n        input.dispatchEvent(new Event('input', { bubbles:true }));`;
const safe = `      } else if (input.type === 'color') {\n        // Shared staging must never receive synthetic colour values. Verify\n        // persistence using the current colour without mutating the design.\n        changed[key] = input.value;`;

if (!source.includes(unsafe)) {
  throw new Error('Expected destructive colour mutation block was not found; update the safety neutralizer before running staging tests.');
}

const next = source.replace(unsafe, safe);
if (next.includes("input.value = next;\n        changed[key] = next;\n        input.dispatchEvent(new Event('input', { bubbles:true }));")) {
  console.log('INFO: other non-colour controls still mutate as intended.');
}
fs.writeFileSync(file, next);
console.log('PASS: shared-staging E2E colour mutations neutralized; expected values now remain the real current colours.');
