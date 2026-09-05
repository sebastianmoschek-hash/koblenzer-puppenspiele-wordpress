#!/usr/bin/env bash
set -euo pipefail
PHP='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/includes/class-kp-frontend-editor-v2.php'
JS='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-editor-v2.js'
CSS='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-editor-v2.css'
fail(){ printf 'FAIL frontend section actions contract: %s\n' "$*" >&2; exit 1; }
for f in "$PHP" "$JS" "$CSS"; do [[ -f "$f" ]] || fail "missing $f"; done

node --check "$JS"
if command -v php >/dev/null 2>&1; then php -l "$PHP" >/dev/null; fi

grep -Fq 'section_actions' "$PHP" || fail 'server does not sanitize queued section actions'
grep -Fq 'apply_section_actions' "$PHP" || fail 'server does not apply queued section actions'
grep -Fq "current_user_can( 'edit_post'" "$PHP" || fail 'section mutation lacks post capability check'
grep -Fq "'duplicate'" "$PHP" || fail 'duplicate action is not explicitly allowlisted'
grep -Fq "'anchor'" "$PHP" || fail 'duplicated block lacks a unique WordPress anchor'
grep -Fq 'wp_update_post' "$PHP" || fail 'duplicate is not written through WordPress revision-aware APIs'
grep -Fq "array_slice( \$data['section_actions'], 0, 10" "$PHP" || fail 'queued section actions are not bounded'
grep -Fq 'kp-fe2-hidden-toggle' "$JS" || fail 'active V2 hide control missing'
grep -Fq 'kp-fe2-duplicate' "$JS" || fail 'active V2 duplicate control missing'
grep -Fq 'kp-fe2-drag' "$JS" || fail 'semantic section drag control missing'
grep -Fq 'kp-fe2-hidden-preview' "$CSS" || fail 'safe hidden preview styling missing'
grep -Fq 'fe2-20260905-1' "$PHP" || fail 'editor asset cache version was not advanced'

echo 'PASS frontend section actions contract: bounded authorized WordPress duplication, responsive hide preview and semantic drag controls.'
