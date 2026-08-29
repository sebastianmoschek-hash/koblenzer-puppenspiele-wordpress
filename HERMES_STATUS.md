# HERMES STATUS – Stand 29.08.2026 (Run 76 – Autonomer Wartungslauf)

## Status der 4 Aufgaben

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert** (dieser Lauf) — `qa/cron-maintenance-4-termine-check.mjs` (headless Playwright,, nur lesend): **4/4 Seiten OK** (`/termine/` 200,, h1 „Termine“, Titel „Termine – puppenspiele“, `/` 200,, `/repertoire/` 200,, `/kontakt/` 200(, **0 Console-/Page-Errors**, **0 Overflow** (Nachweis: `qa-results/latest-check/browser-check-run76.json` + `.rc` = 0(.## Zusätzlich Live-`curl -L`(`--max-time`):** 4/4 Seiten HTTP  200**. Branch `staging/fix-termine-500` existiert nach `fetch --prune` weiterhin **nicht** — Fix bleibt in `main` konsolidiert und auf Staging deployed.## Kein Deploy/kein Merge nötig (kein neuer Code-Commit seit Run  75.. Production unberührt..

2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ — `a5e3b5c` ist **weiterhin Ancestor von `origin/main`** (frisch per `merge-base --is-ancestor` verifiziert,, RC=0;; **kein neuer Code-Commit** — HEAD main = `9953f4e` = Run-75-Statuscommit,, `[skip ci]`; `git rev-list --count 3d5fbeb..origin/main` = 49 (nur Status-Docs,, einschließlich Run-75-Statuscommit(.## CI-Stand für Funktionsstand `3d5fbeb` frisch via `gh api` (volle SHA: **state=`failure`**, **10 SUCCESS** (alle Gates + `staging-infra-`, `staging-touch-`, `staging-visual-`-Verdicts( und nur 4 Churn-Verdicts rot (`staging-editor-`, `staging-text-save-`, `staging-session-undo-`, `staging-persistence-verdict` = FAILURE,, bekannt & unverändert zu Runs 39–75.## Gesamtstatus == failure (nur Churn## **Kein manueller Trigger nötig** (kein neuer Code-Commit;; Trigger würde nur denselben Churn-Stand erneut laufen lassen..

3. **Thorsten Voice-Smoke-Test**: ✅ — **Weiterhin real in CI eingebunden** (`.circleci/config.yml` Z.. 73/82/91 frisch per `grep` verifiziert: „Prepare Thorsten High voice assets“ → `qa/prepare-android-natural-voice.sh`, „Thorsten natural voice contract“ → `qa/android-natural-voice-contract.sh`, „Thorsten voice smoke test (models + Kotlin integration)“ → `bash qa/thorsten-voice-smoke-test.sh` → RC-Fail-fast,, danach APK-Compile(.## **Zusätzlich lokal frisch ausgeführt** (dieser Lauf: **PASS, RC=0**, Modell-Assets present,, PCM16/AudioTrack-Contract gruen,, kein System-TTS-Fallback;; Nachweis: `qa-results/latest-check/thorsten-smoke-run76.log` + `.rc` = 0.. Hinweis: Der in der Aufgabenliste genannte Pfad `tests/thorsten-smoke-test.js` existiert weiterhin nicht (ls tests/ → leer/nicht vorhanden( — die tatsächliche CI-Integration läuft über `qa/thorsten-voice-smoke-test.sh` (kein Handlungsbedarf..

4. **Branch-Konsolidierung**: ✅ **Bereits konsolidiert** — nach `fetch --prune` weiterhin beide Branches **vollständig in main enthalten**: `origin/feature/webapp-primary-agent` (0 ahead: `git rev-list --count ... --not origin/main` = 0( und `origin/ai-repair/local-thorsten-high-v8-20260825` (0 ahead: gleiche Zählung = 0(.## Beide haben **0 Commits**,,die main fehlt — Merge wäre ein No-Op („Already up to date“.. Kein Merge nötig..

## Aktueller CI-Stand

- HEAD main = `9953f4e` (Run-75-Status,, `[skip ci]`); **kein neuer Code-Commit**. Funktionsstand unverändert=`3d5fbeb` (49 Status-Doc-Commits dahinter— konsistent:t nur HERMES_STATUS-Updates seitdem(.## Frischer `fetch --prune`: keine neuen Remote-Commits,, `staging/fix-termine-500` weiterhin nicht vorhanden..

- GitHub-Status `3d5fbeb` (via `gh api`, volle SHA,, Nachweis: `qa-results/latest-check/ci-status-run76.json`): **14 Statuses** — **10 SUCCESS** (Gates + Infra-/Touch-/Visual-Verdicts( und nur 4 Churn-Verdicts rot ((editor,, text-save,, session-undo,, persistence(.## Gesamtstatus == failure ((nur Churn,, identisch zu Runs 39–75..

- Öffentlicher Lab-Report (`…/kp-homepage-lab/latest/report.json`): unverändert;(generatedAt 2026-08-29T02:07:56Z = identisch zu Run  28+), success=false,, bekannte Churn-Matrix— kein neuer Lauf. (Nachweis: `qa-results/latest-check/lab-report-run76.json`..

- Working Tree: unverändert zu Run  75 ((`AndroidManifest.xml` + `MainActivity.kt` uncommitted,, externes Work,, unangetastet.## Neu nur lokale,, untracked Evidence-Dateien unter `qa-results/latest-check/` (run76: browser-check-run76.json + .rc,, thorsten-smoke-run76.log + .rc,, ci-status-run76.json,, lab-report-run76.json|.



## 🔬 Offen (unverändert zu Run  75)

1. **Churn-Schicht** ((editor,, text-save,, session-undo,, persistence.: weiterhin rot ohne Code-Änderung;; Blocker: CircleCI-Logs ohne Token lokal nicht verfügbar,, öffentlicher Report liefert keine Details.. Plan: instrumentierter Lab-Lauf — unverändert..

2. **GitHub Actions Billing**: weiterhin alle Actions-Runs failure.## User-Aktion nötig;; CircleCI funktioniert..

3. **Release `homepage-hilfe-test-v0.10.3`**: existiert,, Herkunft unklar,, kein Handlungsbedarf..

4. **Agent-Bar/Menü-Überlappung Tablet** (`.kp-wa-bar` intercepts Menü-Button(: — unverändert offen..

5. **🔄 APK weiterhin veraltet vs**. main:: Letzter APK-Build `facaa1a` basiert auf `5bf8fe5` ((vor `3d5fbeb`.## Der APK-Job filtert auf `/feature/android-.*/` — ein Sync+Push des `feature/android-build-20260828` auf main-Stand würde einen frischen Build triggern.## **KEIN Trigger in Run  76** — uncommitted externes Working-Tree-Work (Offen  6( blockiert weiterhin;; Entscheidung nötig,, ob/wann dieses committet wird..

6. **🔄 Working Tree externes uncommitted work** (`MainActivity.kt` MediaProjection/LocalVisualAgent,, `AndroidManifest.xml`:: unverändert,, vereinbarungsgemäß NICHT angefasst..

7. **Run  76**: alle   4 Punkte frisch verifiziert ((Termine 4/4 browser-grün RC=0 + Live-HTTP 4/4 200,, CI-Stand unverändert nur-Churn (4/14 rot,, Thorsten lokal PASS RC=0 + CI-Integration per grep bestätigt,, branches  ̈0 ahead =0 Commits vor main## Kein neuer Commit seit Run  75## Kein Deploy/kein Merge/kein Trigger nötig# Status-Commit + Telegram-Summary ((Job-Delivery = `telegram:729243650`)) erfolgen hiermit..

## Abgegrenzte Sicherheitsregeln ((strikt eingehalten)

- Nur Staging geprüft ((Playwright headless,, nur lesend,, kein Login/kein Schreiben( + öffentliche `curl -L`-GETs auf Staging (termine/,, /,, repertoire/,, kontakt/( und auf den öffentlichen Lab-Report ((kein Eingriff.. Production unangetastet..

- Keine Secrets nach außen;; `.env` blieb unangetastet## CircleCI-Token: lokal nicht vorhanden ((nur geprüft,, nichts extrahiert## GitHub-Token: nur read-only `gh api`-Statusabfragen ( scope repo/workflow( — keine Schreibaktionen außer dem Status-Doc-Commit..

- Kein Deploy,, kein Merge,, kein Push von fremdem Work## Uncommittetes externes Working-Tree-Work blieb unangetastet## Neue Dateien sind nur lokale,, untracked Evidence-Dateien# Status-Doc-Commit(HERMES_STATUS.md,, `[skip ci]`( folgt dem etablierten Run-Muster..