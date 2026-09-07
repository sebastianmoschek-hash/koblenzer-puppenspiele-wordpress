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
grep -Fq 'prepare_copied_block' "$PHP" || fail 'native Gutenberg copy preparation missing'
grep -Fq 'serialize_blocks( $blocks )' "$PHP" || fail 'native Gutenberg blocks are not serialized'
grep -Fq 'wp_update_post' "$PHP" || fail 'native copy does not create a WordPress revision'
grep -Fq "add_option( \$lock" "$PHP" || fail 'duplicate mutation lacks an atomic page lock'
grep -Fq "\$block['attrs']['anchor'] = \$anchor" "$PHP" || fail 'copy anchor is not persisted in block attributes'
grep -Fq "self::set_first_tag_attribute( \$block['innerHTML'], 'id', \$anchor )" "$PHP" || fail 'copy anchor is not synchronized with wrapper HTML'
grep -Fq 'stabilize_section_blocks' "$PHP" || fail 'original sections are not migrated to stable UUIDs'
grep -Fq "'kp-section-' . sanitize_key( wp_generate_uuid4() )" "$PHP" || fail 'stable section UUID generation missing'
if grep -Fq "array_slice( array_values( \$duplicates ), -40" "$PHP"; then fail 'legacy 40-copy data-loss cap remains'; fi
grep -Fq "array_slice( \$data['section_actions'], 0, 10" "$PHP" || fail 'queued section actions are not bounded'
php qa/frontend-section-runtime-php-test.php >/dev/null
grep -Fq 'kp-fe2-hidden-toggle' "$JS" || fail 'active V2 hide control missing'
grep -Fq 'kp-fe2-duplicate' "$JS" || fail 'active V2 duplicate control missing'
grep -Fq 'kp-fe2-drag' "$JS" || fail 'semantic section drag control missing'
grep -Fq 'kp-fe2-hidden-preview' "$CSS" || fail 'safe hidden preview styling missing'
grep -Fq '[data-kp-section-preview-copy]::before' "$CSS" || fail 'unsaved label is not limited to preview copies'
if grep -Fq '[data-kp-section-copy]::before' "$CSS"; then fail 'saved copies are incorrectly labelled unsaved'; fi
grep -Fq 'fe2-20260905-3' "$PHP" || fail 'editor asset cache version was not advanced'

echo 'PASS frontend section actions contract: bounded authorized WordPress duplication, responsive hide preview and semantic drag controls.'
