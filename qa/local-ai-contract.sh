#!/usr/bin/env bash
set -euo pipefail

TAKEOVER='wp-content/mu-plugins/kp-local-ai-desktop-takeover.php'
ASSET='wp-content/mu-plugins/kp-local-ai-desktop-assets/takeover-v8.js'
AGENT='desktop/homepage-agent/server.mjs'

php -l "$TAKEOVER" >/dev/null
for file in "$ASSET" "$AGENT"; do node --check "$file" >/dev/null; done

# Desktop-only browser UI, local Gemma, robust local voice and screen observation.
grep -Fq 'http://127.0.0.1:8765' "$TAKEOVER"
grep -Fq 'gemma3:4b' "$TAKEOVER" "$AGENT"
grep -Fq 'getDisplayMedia' "$ASSET"
grep -Fq 'processLocally = true' "$ASSET"
grep -Fq 'Recognition.available' "$ASSET"
grep -Fq 'Recognition.install' "$ASSET"
grep -Fq 'speechSynthesis.getVoices' "$ASSET"
grep -Fq 'localService === true' "$ASSET"
grep -Fq 'Stimme testen' "$TAKEOVER"
grep -Fq 'Beobachten' "$TAKEOVER"
grep -Fq 'observationTick' "$ASSET"
grep -Fq 'KPRepairMobile' "$ASSET"
grep -Fq 'editElement' "$ASSET"
grep -Fq 'setDesign' "$ASSET"
grep -Fq 'saveChanges' "$ASSET"
grep -Fq 'explicitSave' "$ASSET"

# Pairing, immutable tests, rollback, commit and staging push.
grep -Fq "req.url === '/v1/pair'" "$AGENT"
grep -Fq "req.url === '/v1/health'" "$AGENT"
grep -Fq "req.url === '/v1/catalog'" "$AGENT"
grep -Fq "req.url === '/v1/files'" "$AGENT"
grep -Fq "req.url === '/v1/apply'" "$AGENT"
grep -Fq "req.url === '/v1/pending'" "$AGENT"
grep -Fq "req.url === '/v1/revert'" "$AGENT"
grep -Fq "req.url === '/v1/publish'" "$AGENT"
grep -Fq "TARGET_BRANCH = process.env.KP_AGENT_BRANCH || 'desktop-ai-fast'" "$AGENT"
grep -Fq "git(['diff', '--check'" "$AGENT"
grep -Fq "run('php', ['-l'" "$AGENT"
grep -Fq "run('node', ['--check'" "$AGENT"
grep -Fq "run('bash', ['qa/local-ai-contract.sh']" "$AGENT"
grep -Fq 'restoreSnapshots' "$AGENT"
grep -Fq "git(['push', 'origin'" "$AGENT"
grep -Fq 'Authorization, Content-Type, X-KP-Desktop-Agent' "$AGENT"
grep -Fq 'Android-Schreibzugriff: AUS' "$AGENT"
grep -Fq 'androidWrites: false' "$AGENT"
grep -Fq 'Access-Control-Allow-Private-Network' "$AGENT"

# qa/ may be read for contracts, but may never be changed by Gemma.
if awk '/const writableRoots = \[/,/^\];/' "$AGENT" | grep -Fq "'qa/'"; then
  echo 'FAIL local-ai: qa/ appeared in the laptop agent write allowlist.' >&2
  exit 1
fi
grep -Fq "'qa/'," "$AGENT"
grep -Fq 'Keine Android-, qa/-, Workflow-' "$ASSET"

# Android is deny-only and never a root. No cloud LLM fallback is permitted.
if awk '/const readableRoots = \[/,/^\];/; /const writableRoots = \[/,/^\];/' "$AGENT" | grep -qi 'android'; then
  echo 'FAIL local-ai: Android appeared in a laptop-agent allowlist.' >&2
  exit 1
fi
if grep -Eqi 'gemini\.google\.com|generativelanguage\.googleapis\.com|api\.openai\.com|@litert-lm/core' "$TAKEOVER" "$ASSET" "$AGENT"; then
  echo 'FAIL local-ai: desktop flow contains a cloud LLM/API route.' >&2
  exit 1
fi

echo 'PASS local-ai: local German speech, conversation, vision, observation and guarded staging-only code changes are present; Android writes are blocked.'
