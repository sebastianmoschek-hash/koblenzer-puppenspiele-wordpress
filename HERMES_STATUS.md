# HERMES STATUS – Stand 29.08.2026 (Run 30 – Autonomer Wartungslauf)

## Status der 4 Aufgaben-Defaults

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (dieser Lauf)** — `qa/cron-maintenance-4-termine-check.mjs` (headless Playwright aus C:/hermes-agent, nur lesend): **4/4 Seiten OK** (`/termine/` 200, `/` 200, `/repertoire/` 200, `/kontakt/` 200), 0 Console-/Page-Errors, 0 Overflow (Nachweis: `qa-results/latest-check/browser-check-run30.json`, lokal, nicht committed). Zusätzlich curl-Probe: alle 4 Routen 200 in 0,22–0,26 s. Branch `staging/fix-termine-500` existiert weiterhin nicht (lokal/remote nach fetch --prune) — Fix ist konsolidiert und deployed; kein Deploy/kein Merge nötig. Production unberührt.
2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ — `a5e3b5c` weiterhin Ancestor von main. Für Funktionsstand `3d5fbeb` (GitHub-Status via `gh api`): `ci/circleci: serial-start-1/2`, `editor-contracts`, `mobile-live-staging-deploy`, `homepage-staging-lab`, `serial-end-1/2` = alle **SUCCESS**; Verdicts `staging-infra-`, `staging-touch-`, `staging-visual-` = SUCCESS; `staging-editor-`, `staging-text-save-`, `staging-session-undo-`, `staging-persistence-` = FAILURE (**bekannte Churn-Schicht, unverändert, keine Code-Änderung nötig**). Kein manueller Trigger nötig.
3. **Thorsten Voice-Smoke-Test**: ✅ **Weiterhin real in CI eingebunden** — `.circleci/config.yml` Zeilen 73/82/91: `qa/prepare-android-natural-voice.sh` → `qa/android-natural-voice-contract.sh` → `qa/thorsten-voice-smoke-test.sh` (RC-Fail-fast, Logs nach `qa-results/android/`). Android-Job `facaa1a` SUCCESS (verifiziert in früheren Runs). Kein neuer Trigger in diesem Lauf (Begründung s. Offen 5). Kein Handlungsbedarf.
4. **Branch-Konsolidierung**: ✅ **Bereits konsolidiert** — `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` sind weiterhin **je 0 Commits** hinter origin/main (Ancestor, 357 bzw. 349 Commits in main enthalten). Kein Merge nötig.

## Aktueller CI-Stand

- HEAD main = `e976ab0` (Run-29-Status, 04:21, [skip ci]); **kein neuer Code-Commit seit Run 29**. Funktionsstand unverändert = `3d5fbeb`.
- GitHub-Status `3d5fbeb` (geprüft via `gh api`, korrektes Repo `sebastianmoschek-hash/koblenzer-puppenspiele-wordpress`): Pipeline-Gates und Infra/Touch/Visual-Verdicts = SUCCESS; nur Churn-Cluster rot (s. o.). Gesamtstatus = failure (nur Churn).
- CircleCI-Lab-Report (= `wp-content/uploads/kp-homepage-lab/latest/report.json`, frisch gezogen als `qa-results/lab-report-run30.json`): `generatedAt 2026-08-29T02:07:56Z`, commit `3d5fbeb`, checks: deploy/stagingReady/temporaryBridge/nativeTouchSliderSaveReset/touchRuntime/visual50Views = success; editorMobileTabletDesktop/saveReloadDbUndo48h/editorBrowser/sessionUndo/persistenceBrowser/realTextSave = failure (Churn, **identisch zu Run 28/29**). Kein neuer Lab-Lauf, weil kein neuer Funktions-Commit.
- GitHub Actions check-runs: weiterhin alle failure/skipped (Billing-Konto erschöpft, bekannt — kein primärer Runner).
- Android `facaa1a`: SUCCESS (historisch verifiziert). Kein neuer Trigger in diesem Lauf (Begründung s. Offen 5).

## 🔬 Offen

1. **Churn-Schicht** (unverändert rot, keine Code-Änderung nötig): Verdicts/Checks editor, text-save, session-undo, persistence, saveReloadDbUndo48h. Blocker: CircleCI-Logs lokal nicht verfügbar (kein Token), Lab publiziert keine Editor-Logs. Plan: instrumentierter Lab-Lauf (force-Klicks/Timing) statt riskantem Eingriff — unverändert.
2. **GitHub Actions Billing**: weiterhin alle Actions-Runs failure. User-Aktion nötig; CircleCI bleibt funktionierender Runner.
3. **Release `homepage-hilfe-test-v0.10.3`**: existiert, Herkunft unklar, kein Handlungsbedarf.
4. **Agent-Bar/Menü-Überlappung Tablet** (`.kp-wa-bar` intercepts Menü-Button) — unverändert offen.
5. **🔄 APK weiterhin veraltet vs. main**: Letzter APK-Build `facaa1a` basiert auf `5bf8fe5` (VOR `3d5fbeb`); der SW-Fix + MainActivity-WebView-URL-Client-Teil sind **noch in keinem APK**. **KEIN Trigger in Run 30** — uncommitted externes Working-Tree-Work (s. Offen 6) weiterhin unverändert; um den Fix ins nächste APK zu bringen, müsste zuerst entschieden werden, ob/wann das Working-Tree-Work committed wird.
6. **🔄 Working Tree externes uncommitted work**: `MainActivity.kt` (MediaProjection/REQ_SCREEN_CAPTURE=602, LocalVisualAgent, liveScreenActive) + `AndroidManifest.xml` weiterhin **uncommitted** (mtime 03:58/04:01, **identisch zu Run 28/29**). Dateien stabil; wurden weder committed noch gestashed noch angefasst — vereinbarungsgemäß NICHT angefasst.
7. **Neu in Run 30**: nichts Routenbezügliches aufgetreten; `/termine/` + restliche Routen frisch browser-grün (4/4). Kein neuer Befund. Git-Pfad-Hinweis für künftige Läufe: `gh api`-Repo heißt `sebastianmoschek-hash/koblenzer-puppenspiele-wordpress` (nicht .../homepage).

## Abgegrenzte Sicherheitsregeln (strikt eingehalten)

- Nur Staging geprüft (curl + Playwright, nur lesend, kein Login/kein Schreiben). Production unangetastet.
- Keine Secrets berührt/committed. Telegram-Token wurde NICHT ins Repo geschrieben. OpenRouter aktiv; lokale Modelle nur für die künftige Web-App.
- Änderungen minimal & reversibel: nur HERMES_STATUS-Commit mit `[skip ci]`. KEIN Android-Trigger, KEIN Merge (nichts nötig), Fremddateien (MainActivity.kt, AndroidManifest.xml) NICHT angefasst.