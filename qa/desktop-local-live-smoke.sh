#!/usr/bin/env bash
set -euo pipefail

PHP_FILE='wp-content/mu-plugins/kp-owner-web-desktop-live.php'
JS_FILE='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/owner-web-agent-desktop-live.js'
PY_FILE='desktop/local-live-helper/kp_local_live_helper.py'

for file in "$PHP_FILE" "$JS_FILE" "$PY_FILE"; do
  [[ -f "$file" ]] || { echo "missing $file"; exit 1; }
done

php -l "$PHP_FILE" >/dev/null
node --check "$JS_FILE"
python3 -m py_compile "$PY_FILE"

grep -Fq 'getDisplayMedia' "$JS_FILE"
grep -Fq '127.0.0.1:17381' "$JS_FILE"
grep -Fq "processLocally" "$JS_FILE"
grep -Fq "'/vision'" "$JS_FILE"
grep -Fq "'/repair'" "$JS_FILE"
grep -Fq 'gemma3:4b' "$PY_FILE"
grep -Fq '127.0.0.1' "$PY_FILE"
grep -Fq 'KP_LOCAL_AUTO_PUSH' "$PY_FILE"
grep -Fq 'git("diff", "--check"' "$PY_FILE"
grep -Fq 'Permissions-Policy: loopback-network=(self), on-device-speech-recognition=(self)' "$PHP_FILE"

if grep -Eqi 'generativelanguage\.googleapis\.com|api\.openai\.com|AIza[A-Za-z0-9_-]{20,}' "$JS_FILE" "$PY_FILE"; then
  echo 'desktop local-live path must not call paid AI APIs or contain cloud AI keys'
  exit 1
fi

echo 'desktop local-live smoke PASS'
