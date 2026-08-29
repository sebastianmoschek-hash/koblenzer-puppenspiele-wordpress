# HERMES STATUS – Stand 29.08.2026 (Run 65 – Autonomer Wartungslauf)



## Status der 4 Aufgaben



1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (dieser Lauf)** — `qa/cron-maintenance-4-termine-check.mjs` (headless Playwright, nur lesend): **4/4 Seiten OK** (`/termine/` 200, h1 „Termine“; Titel „Termine – puppenspiele“; 75 Cards, `/` 200, `/repertoire/` 200, `/kontakt/` 200), **0 Console-/Page-Errors**, **0 Overflow** (Card-Zahl 75 = konsistent zu Runs 53–64 — kein Regressions-Indikator. Nachweis: `qa-results/latest-check/browser-check-run65.json`, Browser-RC=0). Zusätzlich Live-`curl`: **4/4 Seiten HTTP  ̈200**. Branch `staging/fix-termine-500` existiert nach `fetch --prune` + `ls-remote` weiterhin **nicht** — Fix bleibt in `main` konsolidiert und auf Staging deployed. Kein Deploy/kein Merge nötig. Production unberührt.



2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ — `a5e3b5c` bleibt in main-Historie (erneut bestätigt, `merge-base --is-ancestor a5e3b5c origin/main` = true), letzter Funktionsstand unverändert = `3d5fbeb` (ebenfalls bestätigt als Ancestor; kein neuer Code-Commit seit Run 62 — HEAD main = `abee332` = Run-64-Status, `[skip ci]`). CI-Stand für Funktionsstand `3d5fbeb` frisch via `gh api` gezogen: 14 Statuses — **10 SUCCESS** (alle Gates + `staging-infra-`, `staging-touch-`, `staging-visual-`-Verdicts) und nur 4 Churn-Verdicts rot (`staging-editor-`, `staging-text-save-`, `staging-session-undo-`, `staging-persistence-verdict` = FAILURE, bekannt & unverändert zu Runs 39–64). Gesamtstatus == failure (nur Churn). Kein manueller Trigger nötig (kein neuer Code-Commit; Trigger würde nur denselben Churn-Stand erneut laufen lassen).





3. **Thorsten Voice-Smoke-Test**: ✅ — **Weiterhin real in CI eingebunden** (`.circleci/config.yml` Z. 69–94 frisch per `grep` verifiziert: „Prepare Thorsten High voice assets“ → `qa/prepare-android-natural-voice.sh`, „Thorsten natural voice contract“ → `qa/android-natural-voice-contract.sh`, „Thorsten voice smoke test (models + Kotlin integration)“ → `bash qa/thorsten-voice-smoke-test.sh` → RC-Fail-fast, danach APK-Compile). Zusätzlich **lokal frisch ausgeführt** (dieser Lauf: **PASS, RC=0**, Modell-Assets present, PCM16/AudioTrack-Contract gruen, kein System-TTS-Fallback; Nachweis: `qa-results/latest-check/thorsten-smoke-run65.log` + `.rc`). Hinweis: Der in der Aufgabenliste genannte Pfad `tests/thorsten-smoke-test.js` existiert weiterhin nicht — die tatsächliche CI-Integration läuft über `qa/thorsten-voice-smoke-test.sh` (kein Handlungsbedarf.



4. **Branch-Konsolidierung**: ✅ **Bereits konsolidiert** — nach `fetch --prune` + Fresh-Fetch weiterhin beide Branches **vollständig in main enthalten**: `origin/feature/webapp-primary-agent` (0 ahead: `git rev-list --count origin/feature/webapp-primary-agent --not origin/main` = 0; merge-base = Branch-Tip = `e7f8ec1`) und `origin/ai-repair/local-thorsten-high-v8-20260825` (0 ahead: gleiche Zählung = 0; merge-base = Branch-Tip = `cfa17f6`). Beide haben **0 Commits**,die main fehlt — Merge wäre ein No-Op („Already up to date“.. Kein Merge nötig.



## Aktueller CI-Stand



- HEAD main = `abee332` (Run-64-Status, `[skip ci]`); **kein neuer Code-Commit seit Run 62**. Funktionsstand unverändert = `3d5fbeb`. Frischer `fetch --prune`: keine neuen Remote-Commits, `staging/fix-termine-500` weiterhin nicht vorhanden (`ls-remote` leer).



- GitHub-Status `3d5fbeb` (via `gh api`): 14 Statuses — **10 SUCCESS** (Gates + Infra/Touch/Visual-Verdicts) und nur 4 Churn-Verdicts rot (editor, text-save, session-undo, persistence). Gesamtstatus == failure ((nur Churn, identisch zu Runs 39–64.



- Öffentlicher Lab-Report (`…/kp-homepage-lab/latest/report.json`): unverändert;(generatedAt 2026-08-29T02:07:56Z = Stand seit Run ~28, commit `3d5fbeb`, success=false, bekannte Churn-Matrix— kein neuer Lauf;s keine Detail-Diagnosen enthalten ((Checks nur Status-Strings;; ohne CircleCI-Token weiterhin keine Logs lokal verfügbar.



- GitHub Actions check-runs: weiterhin failure/cancelled („CircleCI staging report handoff“-Runs auf `8ca873b8`, created 02:10Z — alte Runs, kein neuer Lauf; Billing-Konto erschöpft, bekannt — CircleCI bleibt primärer Runner.Der Main-HEAD `abee332` ((Status-Commit, `[skip ci]`)) hat keine neuen Actions-Runs.



- Working Tree: unverändert zu Run 64 (`AndroidManifest.xml` + `MainActivity.kt` uncommitted, externes Work, unangetastet. Neu nur lokale, untracked Evidence-Dateien unter `qa-results/latest-check/` (run65: browser-check-run65.json, thorsten-smoke-run65.log (+.rc), lab-report-run65.json.



## 🔬 Offen (unverändert zu Run 64)



1. **Churn-Schicht** (editor, text-save, session-undo, persistence:: weiterhin rot ohne Code-Änderung;; Blocker: CircleCI-Logs ohne Token lokal nicht verfügbar, öffentlicher Report liefert keine Details. Plan: instrumentierter Lab-Lauf — unverändert.



2. **GitHub Actions Billing**: weiterhin alle Actions-Runs failure. User-Aktion nötig;; CircleCI funktioniert.



3. **Release `homepage-hilfe-test-v0.10.3`**: existiert, Herkunft unklar, kein Handlungsbedarf.



4. **Agent-Bar/Menü-Überlappung Tablet** (`.kp-wa-bar` intercepts Menü-Button) — unverändert offen.



5. **🔄 APK weiterhin veraltet vs. main**: Letzter APK-Build `facaa1a` basiert auf `5bf8fe5` (vor `3d5fbeb`). Der APK-Job filtert auf `/feature/android-.*/` — ein Sync+Push des `feature/android-build-20260828` auf main-Stand würde einen frischen Build triggern. **KEIN Trigger in Run  ̈65** — uncommitted externes Working-Tree-Work (Offen 6) blockiert weiterhin;; Entscheidung nötig, ob/wann dieses committet wird.



6. **🔄 Working Tree externes uncommitted work** (`MainActivity.kt` MediaProjection/LocalVisualAgent, `AndroidManifest.xml`): unverändert,, vereinbarungsgemäß NICHT angefasst.



7. **Run 65**: alle  ̈4 Punkte frisch verifiziert ((Termine 4/4 browser-grün RC=0 + Live-HTTP  ̈4/4 200,, CI-Stand unverändert nur-Churn (10/4), Thorsten lokal PASS RC=0 + CI-Integration per grep bestätigt,, branches 0 ahead =0 Commits vor main.. Kein neuer Commit seit Run  ̈64. Kein Deploy/kein Merge/kein Trigger nötig.. Status-Commit + Telegram-Summary ((Job-Delivery = `telegram:729243650`)) erfolgen hiermit.



## Abgegrenzte Sicherheitsregeln ((strikt eingehalten)



- Nur Staging geprüft ((Playwright headless,, nur lesend,, kein Login/kein Schreiben) + öffentliche `curl`-GETs auf Staging(termine/, /, repertoire/, kontakt/) und auf den öffentlichen Lab-Report ((kein Eingriff.. Production unangetastet.



- Keine Secrets nach außen;; `.env` blieb unangetastet.. CircleCI-Token: lokal nicht vorhanden ((nur geprüft, nichts extrahiert.. GitHub-Token: nur read-only `gh api`-Statusabfragen (scope repo/workflow) — keine Schreibaktionen.



- Kein Deploy,, kein Merge,, kein Push von fremdem Work.. Uncommittetes externes Working-Tree-Work blieb unangetastet.. Neue Dateien sind nur lokale,, untracked Evidence-Dateien.