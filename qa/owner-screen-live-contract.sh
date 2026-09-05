#!/usr/bin/env bash
set -euo pipefail

JS='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/owner-web-agent-fast-chat.js'
PHP='wp-content/mu-plugins/kp-owner-web-agent.php'
CSS='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/owner-screen-live.css'

fail(){ printf 'FAIL owner screen live contract: %s\n' "$*" >&2; exit 1; }
for file in "$JS" "$PHP" "$CSS"; do [[ -f "$file" ]] || fail "missing $file"; done

node --check "$JS"
if command -v php >/dev/null 2>&1; then php -l "$PHP" >/dev/null; fi

grep -Fq 'navigator.mediaDevices?.getDisplayMedia' "$JS" || fail 'browser display capture missing'
grep -Fq "getDisplayMedia({ video:" "$JS" || fail 'display capture must be video-only and user initiated'
grep -Fq 'captureScreenFrame' "$JS" || fail 'current-frame capture missing'
grep -Fq "fd.append('screen'" "$JS" || fail 'screen frame is not attached to protected request'
grep -Fq "const visual = screen ? await apiRequest('kp_owner_web_agent_chat'" "$JS" || fail 'repair path does not obtain a visual diagnosis first'
grep -Fq 'SICHTANALYSE AUS GETEILTEM BILDSCHIRM' "$JS" || fail 'repair request does not receive the visual diagnosis'
grep -Fq "addEventListener('ended'" "$JS" || fail 'browser stop-sharing event is not handled'
grep -Fq 'track.stop()' "$JS" || fail 'explicit stop-sharing cleanup missing'
grep -Fq 'Bildschirm teilen' "$JS" || fail 'plain-language share control missing'
grep -Fq 'Bildschirmfreigabe beenden' "$JS" || fail 'plain-language stop control missing'
grep -Fq 'data:image/jpeg;base64,' "$JS" || fail 'bounded JPEG frame encoding missing'

grep -Fq "isset( \$_POST['screen'] )" "$PHP" || fail 'server does not accept a protected screen frame'
grep -Fq 'base64_decode' "$PHP" || fail 'server does not validate encoded screen data'
grep -Fq '1500000' "$PHP" || fail 'decoded screen frame lacks a hard size bound'
grep -Fq 'inline_data' "$PHP" || fail 'screen frame is not sent as Gemini multimodal input'
grep -Fq 'generateContent' "$PHP" || fail 'multimodal Gemini request missing'
grep -Fq 'owner-screen-live.css' "$PHP" || fail 'screen-live stylesheet is not enqueued by WordPress'
if grep -Eq "'store'[[:space:]]*=>[[:space:]]*true" "$PHP"; then
  fail 'screen-capable path must not request provider-side storage'
fi
grep -Fq '.kp-wa-screen-share' "$CSS" || fail 'screen-share control styling missing'

if grep -Eq 'update_option\([^\n]*(screen|screenshot)|file_put_contents\([^\n]*(screen|screenshot)' "$PHP"; then
  fail 'screen image must never be persisted by WordPress code'
fi

echo 'PASS owner screen live: user-initiated capture, one bounded frame per request, explicit stop, no WordPress persistence.'
