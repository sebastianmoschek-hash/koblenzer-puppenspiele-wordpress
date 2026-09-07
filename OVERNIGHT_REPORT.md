# Overnight Self-Healing Report

**Start:** 2026-09-07
**Target:** https://neu.koblenzer-puppenspiele.de
**Mode:** strict throttle, single worker, slowMo=3000, Chrome Windows UA

## Current status
- Playwright is already configured for serial staging runs.
- Staging login endpoint was reachable in the latest checks.
- The latest confirmed UI issue was a duplicate local-AI launcher overlap in preview mode (`.kp-local-ai-launch` / `.kp-lat-launch`).
- AI functionality is currently Gemini-centric and needs a protected proxy layer with `KP_AI_MODE` switching.
- The editor DOM still needs stable `data-*` hooks and a compact JSON snapshot export for external vision copilots.

## Rules
- No destructive DB actions.
- 30s pause after every 5 pages.
- Write screenshots for UI/layout bugs to `test-results/overnight-bugs/`.
- Append findings, fixes, and verification status continuously.

## Workstreams
1. Throttled crawler / report generator
2. Hybrid AI proxy and frontend routing
3. Vision-friendly DOM hooks and overlap cleanup

## Live state
- Three subagents are running in parallel on the workstreams above.
- Playwright throttling is already in place and will be reused by the crawler.
- The current known overlap is the dual local-AI launcher in preview mode; the fix path is to keep only the active takeover control.
- The current AI editor is still Gemini-centric; the proxy task is centralizing the transport and introducing KP_AI_MODE switching.
- The DOM hook task is adding stable data attributes and a compact snapshot helper for external vision tools.
- The crawler helper module `qa/overnight-crawler-lib.mjs` has been created and its node:test unit checks are green.

## Notes
- Use one page action at a time.
- Verify each fix with a single slow follow-up run before moving on.

- 2026-09-06T23:36:45.058Z Overnight crawler started.
- 2026-09-06T23:36:49.359Z Queue built with 10 URLs.
- 2026-09-06T23:36:49.361Z [2026-09-06T23:36:49.360Z] 1/10 / [page]
- 2026-09-06T23:36:56.227Z [2026-09-06T23:36:56.227Z] 2/10 / [editor]
- 2026-09-06T23:37:03.241Z [2026-09-06T23:37:03.241Z] 3/10 /aktuelles/ [page]
- 2026-09-06T23:37:09.699Z [2026-09-06T23:37:09.699Z] 4/10 /aktuelles/ [editor]
- 2026-09-06T23:37:16.156Z [2026-09-06T23:37:16.156Z] 5/10 /das-theater/ [page]
- 2026-09-06T23:37:22.571Z Pause after 5 pages.
- 2026-09-06T23:37:52.575Z [2026-09-06T23:37:52.574Z] 6/10 /das-theater/ [editor]
- 2026-09-06T23:37:59.091Z [2026-09-06T23:37:59.091Z] 7/10 /datenschutz/ [page]
- 2026-09-06T23:38:05.513Z [2026-09-06T23:38:05.513Z] 8/10 /datenschutz/ [editor]
- 2026-09-06T23:38:12.000Z [2026-09-06T23:38:12.000Z] 9/10 /impressum/ [page]
- 2026-09-06T23:38:18.543Z [2026-09-06T23:38:18.543Z] 10/10 /impressum/ [editor]
- 2026-09-06T23:38:25.076Z Done. pages=10 consoleErrors=0 failedRequests=0
- 2026-09-06T23:38:25.078Z Crawler failed: ENOENT: no such file or directory, open 'C:\Users\egvgv\koblenzer-puppenspiele-wordpress\test-results\overnight-bugs\browser-errors.json'
---

## Overnight crawler run 2026-09-06T23:38:57.218Z
- Target: https://neu.koblenzer-puppenspiele.de
- Mode: dry-run | workers=1 | slowMo=3000 | waits=3000ms | pause after every 5 pages for 30s
- Auth state: tests/e2e/.auth/admin.json
- Seed pages: 1
- Initial queue: 2
[2026-09-06T23:38:57.221Z] 1/2 https://neu.koblenzer-puppenspiele.de/ [public]
[2026-09-06T23:38:57.221Z] 2/2 https://neu.koblenzer-puppenspiele.de/?kp_edit=1 [editor]
- Dry-run completed without browser execution.

---

## Overnight crawler run 2026-09-06T23:39:02.788Z
- Target: https://neu.koblenzer-puppenspiele.de
- Mode: live | workers=1 | slowMo=3000 | waits=3000ms | pause after every 5 pages for 30s
- Auth state: tests/e2e/.auth/admin.json
- Seed pages: 1
- Initial queue: 2
[2026-09-06T23:39:03.984Z] 1/2 / public [public]
[2026-09-06T23:39:11.094Z] 1/2 / public [public]
[2026-09-06T23:39:11.095Z] 2/2 / editor [editor]
[2026-09-06T23:39:21.370Z] 2/2 / editor [editor] — 1 mögliche Überdeckungen; screenshot=test-results\overnight-bugs\screenshots\002-editor-neu.koblenzer-puppenspiele.de-kp-edit-1.png
  - layout: 1 mögliche Überdeckungen

## Summary
- Completed tasks: 2
- Issue-bearing tasks: 1
- Screenshots written: 1
- Console errors captured: 0
- Failed requests captured: 0

---

## Overnight crawler run 2026-09-06T23:40:23.456Z
- Target: https://neu.koblenzer-puppenspiele.de
- Mode: dry-run | workers=1 | slowMo=3000 | waits=3000ms | pause after every 5 pages for 30s
- Auth state: tests/e2e/.auth/admin.json
- Seed pages: 1
- Initial queue: 2
[2026-09-06T23:40:23.460Z] 1/2 https://neu.koblenzer-puppenspiele.de/ [public]
[2026-09-06T23:40:23.461Z] 2/2 https://neu.koblenzer-puppenspiele.de/?kp_edit=1 [editor]
- Dry-run completed without browser execution.

---

## Overnight crawler run 2026-09-06T23:40:30.056Z
- Target: https://neu.koblenzer-puppenspiele.de
- Mode: dry-run | workers=1 | slowMo=3000 | waits=3000ms | pause after every 5 pages for 30s
- Auth state: tests/e2e/.auth/admin.json
- Seed pages: 1
- Initial queue: 2
[2026-09-06T23:40:30.059Z] 1/2 https://neu.koblenzer-puppenspiele.de/ [public]
[2026-09-06T23:40:30.059Z] 2/2 https://neu.koblenzer-puppenspiele.de/?kp_edit=1 [editor]
- Dry-run completed without browser execution.

---

## Overnight crawler run 2026-09-06T23:40:40.722Z
- Target: https://neu.koblenzer-puppenspiele.de
- Mode: live | workers=1 | slowMo=3000 | waits=3000ms | pause after every 5 pages for 30s
- Auth state: tests/e2e/.auth/admin.json
- Seed pages: 1
- Initial queue: 2
[2026-09-06T23:40:41.929Z] 1/2 / public [public]
[2026-09-06T23:40:49.076Z] 1/2 / public [public]
[2026-09-06T23:40:49.077Z] 2/3 / editor [editor]
[2026-09-06T23:40:58.548Z] 2/3 / editor [editor] — 1 mögliche Überdeckungen; screenshot=test-results\overnight-bugs\screenshots\002-editor-neu.koblenzer-puppenspiele.de-kp-edit-1.png
  - layout: 1 mögliche Überdeckungen
[2026-09-06T23:40:58.550Z] 3/3 / public [public]
[2026-09-06T23:41:07.937Z] 3/3 / public [public] — 1 mögliche Überdeckungen; screenshot=test-results\overnight-bugs\screenshots\003-public-neu.koblenzer-puppenspiele.de-kp-edit-1.png
  - layout: 1 mögliche Überdeckungen

## Summary
- Completed tasks: 3
- Issue-bearing tasks: 2
- Screenshots written: 2
- Console errors captured: 0
- Failed requests captured: 0

---

## Overnight crawler run 2026-09-06T23:45:50.699Z
- Target: https://neu.koblenzer-puppenspiele.de
- Mode: live | workers=1 | slowMo=3000 | waits=3000ms | pause after every 5 pages for 30s
- Auth state: tests/e2e/.auth/admin.json
- Seed pages: 1
- Initial queue: 2
[2026-09-06T23:45:51.664Z] 1/2 / public [public]
[2026-09-06T23:45:58.862Z] 1/2 / public [public]
[2026-09-06T23:45:58.863Z] 2/2 / editor [editor]
[2026-09-06T23:46:08.727Z] 2/2 / editor [editor] — 1 mögliche Überdeckungen; screenshot=test-results\overnight-bugs\screenshots\002-editor-neu.koblenzer-puppenspiele.de-kp-edit-1.png
  - layout: 1 mögliche Überdeckungen
  - overlap: Vorschau Handy Tablet Laptop Desktop ↶ ↷ Speichern ↔ igurentheater, das Kinder begeistert und Veranstaltungen besonders macht. (0.26)

## Summary
- Completed tasks: 2
- Issue-bearing tasks: 1
- Screenshots written: 1
- Console errors captured: 0
- Failed requests captured: 0

---

## Overnight crawler run 2026-09-06T23:53:49.464Z
- Target: https://neu.koblenzer-puppenspiele.de
- Mode: live | workers=1 | slowMo=3000 | waits=3000ms | pause after every 5 pages for 30s
- Auth state: tests/e2e/.auth/admin.json
- Seed pages: 1
- Initial queue: 2
[2026-09-06T23:53:50.633Z] 1/2 / public [public]
[2026-09-06T23:53:57.952Z] 1/2 / public [public]
[2026-09-06T23:53:57.953Z] 2/2 / editor [editor]
[2026-09-06T23:54:07.995Z] 2/2 / editor [editor] — 1 mögliche Überdeckungen; screenshot=test-results\overnight-bugs\screenshots\002-editor-neu.koblenzer-puppenspiele.de-kp-edit-1.png
  - layout: 1 mögliche Überdeckungen
  - overlap: Vorschau Handy Tablet Laptop Desktop ↶ ↷ Speichern ↔ igurentheater, das Kinder begeistert und Veranstaltungen besonders macht. (0.26)

## Summary
- Completed tasks: 2
- Issue-bearing tasks: 1
- Screenshots written: 1
- Console errors captured: 0
- Failed requests captured: 0

---

## Overnight crawler run 2026-09-06T23:55:05.058Z
- Target: https://neu.koblenzer-puppenspiele.de
- Mode: live | workers=1 | slowMo=3000 | waits=3000ms | pause after every 5 pages for 30s
- Auth state: tests/e2e/.auth/admin.json
- Seed pages: 1
- Initial queue: 2
[2026-09-06T23:55:06.159Z] 1/2 / public [public]
[2026-09-06T23:55:13.111Z] 1/2 / public [public]
[2026-09-06T23:55:13.113Z] 2/2 / editor [editor]
[2026-09-06T23:55:23.051Z] 2/2 / editor [editor] — 1 mögliche Überdeckungen; screenshot=test-results\overnight-bugs\screenshots\002-editor-neu.koblenzer-puppenspiele.de-kp-edit-1.png
  - layout: 1 mögliche Überdeckungen
  - overlap: Vorschau Handy Tablet Laptop Desktop ↶ ↷ Speichern ↔ igurentheater, das Kinder begeistert und Veranstaltungen besonders macht. (0.26)

## Summary
- Completed tasks: 2
- Issue-bearing tasks: 1
- Screenshots written: 1
- Console errors captured: 0
- Failed requests captured: 0

---

## Overnight crawler run 2026-09-06T23:56:15.805Z
- Target: https://neu.koblenzer-puppenspiele.de
- Mode: live | workers=1 | slowMo=3000 | waits=3000ms | pause after every 5 pages for 30s
- Auth state: tests/e2e/.auth/admin.json
- Seed pages: 1
- Initial queue: 2
[2026-09-06T23:56:17.105Z] 1/2 / public [public]
[2026-09-06T23:56:24.094Z] 1/2 / public [public]
[2026-09-06T23:56:24.095Z] 2/2 / editor [editor]
[2026-09-06T23:56:32.279Z] 2/2 / editor [editor]

## Summary
- Completed tasks: 2
- Issue-bearing tasks: 0
- Screenshots written: 0
- Console errors captured: 0
- Failed requests captured: 0
- Latest live run: editor verification passed after toolbar width fix.
- 2026-09-07T00:00:00Z AI proxy hardened with upfront config checks and safe JSON decoding.
- 2026-09-07T00:19:17Z latest live smoke passed with editor view active and no layout issues.
- 2026-09-07T00:00Z Undo/Redo history stack reduced to 30 entries, added redo button, and bound Ctrl/Cmd shortcuts to editor history.
- 2026-09-07T00:00Z Focused Playwright editor run failed in auth setup because staging wp-login.php timed out before login.
- 2026-09-07T00:00Z curl checks for /wp-login.php and /?kp_edit=1 also timed out, indicating a staging reachability issue rather than a local JS syntax regression.
- 2026-09-07T00:00Z Added exclusive overlay manager plus event-isolated inspector/record actions to prevent stacked popups.
- 2026-09-07T00:00Z Re-ran Playwright editor-visual; setup still failed at wp-login.php timeout in this environment.

---

## Overnight crawler run 2026-09-07T00:19:01.421Z
- Target: https://neu.koblenzer-puppenspiele.de
- Mode: live | workers=1 | slowMo=3000 | waits=3000ms | pause after every 5 pages for 30s
- Auth state: tests/e2e/.auth/admin.json
- Seed pages: 1
- Initial queue: 2
[2026-09-07T00:19:02.556Z] 1/2 / public [public]
[2026-09-07T00:19:09.684Z] 1/2 / public [public]
[2026-09-07T00:19:09.685Z] 2/2 / editor [editor]
[2026-09-07T00:19:17.804Z] 2/2 / editor [editor]

## Summary
- Completed tasks: 2
- Issue-bearing tasks: 0
- Screenshots written: 0
- Console errors captured: 0
- Failed requests captured: 0
