#!/usr/bin/env bash
set -euo pipefail

DESKTOP='wp-content/mu-plugins/kp-local-ai-desktop.php'
AGENT='desktop/homepage-agent/server.mjs'

php -l "$DESKTOP" >/dev/null
node --check "$AGENT" >/dev/null

# Desktop browser helper: local Gemma, live display capture and voice.
grep -q 'http://127.0.0.1:8765' "$DESKTOP"
grep -q 'gemma3:4b' "$DESKTOP"
grep -q 'getDisplayMedia' "$DESKTOP"
grep -q 'SpeechRecognition' "$DESKTOP"
grep -q 'speechSynthesis' "$DESKTOP"
grep -q "'/v1/health'" "$DESKTOP"
grep -q "'/v1/chat'" "$DESKTOP"
grep -q "'/v1/catalog'" "$DESKTOP"
grep -q "'/v1/files'" "$DESKTOP"
grep -q "'/v1/apply'" "$DESKTOP"
grep -q 'Android-Schreibzugriff: AUS' "$DESKTOP"
grep -q 'KPRepairMobile' "$DESKTOP"
grep -q 'kp.editElement' "$DESKTOP"
grep -q 'kp.setDesign' "$DESKTOP"
grep -q 'kp.saveChanges' "$DESKTOP"
grep -q 'explicitSave' "$DESKTOP"
grep -q 'request_code_change' "$DESKTOP"

# Local loopback agent: Ollama/Gemma vision + real local Git worktree patches.
grep -q "HOST = process.env.KP_AGENT_HOST || '127.0.0.1'" "$AGENT"
grep -q "MODEL = process.env.KP_GEMMA_MODEL || 'gemma3:4b'" "$AGENT"
grep -q '/api/chat' "$AGENT"
grep -q "req.url === '/v1/catalog'" "$AGENT"
grep -q "req.url === '/v1/files'" "$AGENT"
grep -q "req.url === '/v1/apply'" "$AGENT"
grep -q 'applyPlan' "$AGENT"
grep -q "git.*diff" "$AGENT"
grep -q 'php.*-l' "$AGENT"
grep -q 'qa/local-ai-contract.sh' "$AGENT"
grep -q "^  /\^android" "$AGENT"
grep -q "^  /\^qa\\/mobile-" "$AGENT"
grep -q "^  /\^wp-content\\/mu-plugins\\/kp-mobile-" "$AGENT"
grep -q 'androidWrites: false' "$AGENT"
grep -q 'Access-Control-Allow-Private-Network' "$AGENT"

# Desktop path must not contain any cloud LLM fallback/API route.
if grep -Eqi 'gemini\.google\.com|generativelanguage\.googleapis\.com|api\.openai\.com|@litert-lm/core' "$DESKTOP" "$AGENT"; then
  echo 'FAIL local-ai: desktop flow still contains a cloud LLM/API route.' >&2
  exit 1
fi

# The laptop agent itself must never target Android project files.
if grep -Eq "allowedRoots.*android|['\"]android/" "$AGENT"; then
  echo 'FAIL local-ai: Android appeared in the laptop agent allowlist.' >&2
  exit 1
fi

echo 'PASS local-ai: Chrome live share, voice, local Gemma vision and guarded local website-code edits are present; Android writes are blocked.'
