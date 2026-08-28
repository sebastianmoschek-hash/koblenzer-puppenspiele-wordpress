# HERMES STATUS – Stand 28.08.2026 (Run 14 – Verifikationslauf, frischer Browser-Test)

## Letzte Aktionen (autonom, OpenRouter)

1. **Staging `/termine/` (500-Fix)**: ✅ **Frischer echter Browser-Test** (headless Chromium/Playwright, lokal auf diesem Laptop): **4/4 Seiten HTTP 200** — `/termine/` → HTTP 200, H1 „Termine“, Titel „Termine – puppenspiele“, **75 Termin-Karten**; `/` → HTTP 200; `/repertoire/` → HTTP 200; `/kontakt/` → HTTP 200. **0 Console-/Page-Errors, 0 horizontaler Overflow** (Werte identisch zu Run 13). Fix weiterhin live auf Staging; Deploy-Gate des aktuellen FULL-Reports: success. Remote-Branch `staging/fix-termine-500` ist gelöscht/pruned, Fix längst in main konsolidiert → **kein Deploy nötig, bereits deployed**.

2. **Unified Editor Contract / beforeunload-Fix**: ⚠️ CI-Report unverändert: aktueller FULL-Report `generatedAt 2026-08-28T16:46:43Z`, Commit `90cc6bc` (per HTTP-Header Last-Modified 16:48:43Z verifiziert, kein neuerer Report; ein per web_extract gecachter Alt-Report 14:16:41Z/0333868 wurde per Direkt-curl widerlegt). **FAILURE auf denselben 6 Editor-Gates** (editorMobileTabletDesktop, saveReloadDbUndo48h, editorBrowser, sessionUndo, persistenceBrowser, realTextSave); grün: deploy, stagingReady, temporaryBridge, nativeTouchSliderSaveReset, touchRuntime, visual50Views. `a5e3b5c` (beforeunload-Fix) ist weiterhin Ancestor von main → **der Fix war im frischen Lauf enthalten, CI bleibt rot** (Root Cause: E2E-Editor-Login-Hang). **Kein manueller Trigger nötig/sinnvoll** — der Fix-Stand wurde bereits unabhängig mitgetestet. 🔴 GHA weiterhin durch GitHub-Billing blockiert (User-Aktion: Settings → Billing → Zahlungsmethode/Spending-Limit).

3. **Thorsten-Voice-Smoke-Test**: ⚠️ **Task-Prämisse weiterhin unzutreffend**: `tests/thorsten-smoke-test.js` **existiert nicht** — kein `tests/`-Verzeichnis, keine git-Objekte, NULL CI-Verweise. **Nicht in CI eingebunden.** Einziger Thorsten-Schutz in CI: Android-Thorsten-Voice-Contract im Job `android-homepage-technician` (`.circleci/config.yml` Z. 70–86; läuft nur bei `/feature\/android-.*/`-Pushes). → **User-Entscheidung offen: Test auf main anlegen oder offiziell verwerfen.**

4. **Branch-Konsolidierung**: ✅ `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` jeweils **0 Commits vor `origin/main`** (via merge-base + rev-list verifiziert) — bereits gemergt, **kein Handlungsbedarf**.

## Aktueller CI-Stand (Stand dieses Laufs)

- Aktueller FULL-Report: **Commit `90cc6bc`**, generatedAt **2026-08-28T16:46:43Z** — **FAILURE** — inkl. beforeunload-Fix (a5e3b5c ist Ancestor). Kein neuerer Report seit Run 13.
- ✅ Grün: deploy, stagingReady, temporaryBridge, nativeTouchSliderSaveReset, touchRuntime, visual50Views.
- ❌ Rot (unverändert): editorMobileTabletDesktop, saveReloadDbUndo48h, editorBrowser, sessionUndo, persistenceBrowser, realTextSave.

## Was funktioniert

- ✅ Staging `/termine/` und Homepage: **HTTP 200 mit echten Inhalten** — frisch browser-verifiziert (4/4 Seiten, 0 Fehler, 0 Overflow).
- ✅ Termine-500-Fix: live auf Staging (Deploy-Gate des Reports: success; Remote-Branch bereits gelöscht).
- ✅ beforeunload-Fix: auf main konsolidiert; im frischen FULL-Lauf nachweislich mitgetestet — CI bleibt davon unabhängig rot (Editor-Login-Hang).
- ✅ Branch-Konsolidierung: beide Kandidaten bereits in main — nichts zu tun.
- ✅ Thorsten-Voice-Contract (Android): in CircleCI verdrahtet (läuft nur bei feature/android-*-Branches).

## Offen / Nächste Schritte

1. 🔴 **GitHub-Billing fixen** (User-Aktion) — danach alle GHA-Workflows wieder startfähig.
2. **E2E-Editor-Login-Hang**: Root Cause weiterhin offen; frischester Datenpunkt (FULL 16:46:43Z, `90cc6bc`, inkl. beforeunload-Fix) erneut FAILURE auf denselben 6 Gates. Nächste Hebel: CircleCI-Job-Logs/Artifakte via CircleCI-API ziehen, oder Lab um sanitised Login-Snippets erweitern. Triggerung wirkt sporadisch.
3. **Thorsten-Smoke-Test**: `tests/thorsten-smoke-test.js` fehlt (nie existiert) — **User-Entscheidung: anlegen oder verwerfen** (Android-Contract deckt Thorsten-Assets ab, PASS).
4. Optional (später): Deploy-Mirror härten gegen „kritischer Fehler“-Blitzer während Deploy-Fenstern.

## Regeln (unverändert)

- NUR Staging (neu.koblenzer-puppenspiele.de) — Production NIE ohne Freigabe.
- Keine Secrets in Git, keine unsicheren Aktionen.
- Lokale Modelle nur für die Homepage-Pflege-Web-App (nicht für den Wartungsjob); OpenRouter für alle Agent-Arbeit.