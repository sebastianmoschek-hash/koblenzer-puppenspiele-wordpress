#!/usr/bin/env bash
set -euo pipefail

DESKTOP='wp-content/mu-plugins/kp-local-ai-desktop.php'
AGENT='desktop/homepage-agent/server.mjs'

php -l "$DESKTOP" >/dev/null
node --check "$AGENT" >/dev/null

# Desktop browser helper: local Gemma, live display capture and voice.
grep -Fq 'http://127.0.0.1:8765' "$DESKTOP"
grep -Fq 'gemma3:4b' "$DESKTOP"
grep -Fq 'getDisplayMedia' "$DESKTOP"
grep -Fq 'SpeechRecognition' "$DESKTOP"
grep -Fq 'speechSynthesis' "$DESKTOP"
grep -Fq "'/v1/health'" "$DESKTOP"
grep -Fq "'/v1/chat'" "$DESKTOP"
grep -Fq "'/v1/catalog'" "$DESKTOP"
grep -Fq "'/v1/files'" "$DESKTOP"
grep -Fq "'/v1/apply'" "$DESKTOP"
grep -Fq 'Android-Schreibzugriff: AUS' "$DESKTOP"
grep -Fq 'KPRepairMobile' "$DESKTOP"
grep -Fq 'kp.editElement' "$DESKTOP"
grep -Fq 'kp.setDesign' "$DESKTOP"
grep -Fq 'kp.saveChanges' "$DESKTOP"
grep -Fq 'explicitSave' "$DESKTOP"
grep -Fq 'request_code_change' "$DESKTOP"

# Local loopback agent: Ollama/Gemma vision + real local Git worktree patches.
grep -Fq "HOST = process.env.KP_AGENT_HOST || '127.0.0.1'" "$AGENT"
grep -Fq "MODEL = process.env.KP_GEMMA_MODEL || 'gemma3:4b'" "$AGENT"
grep -Fq '/api/chat' "$AGENT"
grep -Fq "req.url === '/v1/catalog'" "$AGENT"
grep -Fq "req.url === '/v1/files'" "$AGENT"
grep -Fq "req.url === '/v1/apply'" "$AGENT"
grep -Fq 'applyPlan' "$AGENT"
grep -Fq "git(['diff'" "$AGENT"
grep -Fq "spawnSync('php', ['-l'" "$AGENT"
grep -Fq 'qa/local-ai-contract.sh' "$AGENT"
grep -Fq '  /^android\//i,' "$AGENT"
grep -Fq '  /^qa\/mobile-/i,' "$AGENT"
grep -Fq '  /^wp-content\/mu-plugins\/kp-mobile-/i,' "$AGENT"
grep -Fq 'androidWrites: false' "$AGENT"
grep -Fq 'Access-Control-Allow-Private-Network' "$AGENT"

# Desktop path must not contain any cloud LLM fallback/API route.
if grep -Eqi 'gemini\.google\.com|generativelanguage\.googleapis\.com|api\.openai\.com|@litert-lm/core' "$DESKTOP" "$AGENT"; then
  echo 'FAIL local-ai: desktop flow still contains a cloud LLM/API route.' >&2
  exit 1
fi

# Android may occur only in explicit deny/safety language, never as an allow-root.
if grep -F 'allowedRoots' "$AGENT" | grep -qi 'android'; then
  echo 'FAIL local-ai: Android appeared in the laptop agent allowlist.' >&2
  exit 1
fi

echo 'PASS local-ai: Chrome live share, voice, local Gemma vision and guarded local website-code edits are present; Android writes are blocked.'
