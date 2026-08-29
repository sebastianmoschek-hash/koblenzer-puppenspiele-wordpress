# HERMES STATUS – Stand 29.08.2026 (Run 90 – Autonomer Wartungslauf)

## Status der 4 Aufgaben

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert** (dieser Lauf) — `qa/cron-maintenance-4-termine-check.mjs` (headless Playwright, nur lesend): **4/4 Seiten OK** (`/termine/` 200, h1 „Termine“, Titel „Termine – puppenspiele“; `/` 200; `/repertoire/` 200; `/kontakt/` 200), 0 Console-/Page-Errors, 0 Overflow (Nachweis: `qa-results/latest-check/browser-check-run90.json` + `.rc` = 0). Zusätzlich **Live-`curl -L`**: **4/4 HTTP 200** + h1 auf `/termine/` = „Termine“. Branch `staging/fix-termine-500` existiert weiterhin **nicht** (per `git ls-remote --heads origin` = kein Treffer, 0 Zeilen) — Fix bleibt in `main` konsolidiert und auf Staging deployed. Kein Deploy/kein Merge nötig (kein neuer Code-Commit seit Run 85). Production unberührt.

2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ — `a5e3b5c` ist **weiterhin Ancestor von `origin/main`** (frisch per `git merge-base --is-ancestor` verifiziert, RC=0). Kein neuer Code-Commit — HEAD main = `fd61096` (Run-89-Statuscommit, `[skip ci]`); non-doc-Commit-Bereich `3d5fbeb..origin/main` = nur `[skip ci]`-Status-Commits (grep-verifiziert, 0 Treffer). **CI-Stand für Funktionsstand `3d5fbeb` frisch via `gh api`**: **14 Statuses** — **10 SUCCESS** (alle Gates + Infra-/Touch-/Visual-Verdicts) und nur **4 Churn-Verdicts rot** (`staging-editor-`, `staging-text-save-`, `staging-session-undo-`, `staging-persistence-verdict` = FAILURE, bekannt & unverändert zu Runs 39–89). Gesamtstatus == failure (nur Churn). **Kein manueller Trigger nötig**.

3. **Thorsten Voice-Smoke-Test**: ✅ — **Weiterhin real in CI eingebunden** (`.circleci/config.yml` frisch per grep verifiziert, Zeilen 69–93: „Prepare Thorsten High voice assets“ → `qa/prepare-android-natural-voice.sh`, „Thorsten natural voice contract“ → `qa/android-natural-voice-contract.sh`, Thorsten Voice Smoke → `bash qa/thorsten-voice-smoke-test.sh` mit RC-Fail-fast, danach APK-Compile). **Zusätzlich lokal frisch ausgeführt** (dieser Lauf: **PASS, RC=0**; Modell-Assets present, PCM16/AudioTrack-Contract grün, kein System-TTS-Fallback; Nachweis: `qa-results/latest-check/thorsten-smoke-run90.log` + `.rc` = 0). Hinweis: Der in der Aufgabenliste genannte Pfad `tests/thorsten-smoke-test.js` existiert weiterhin nicht — die tatsächliche CI-Integration läuft über `qa/thorsten-voice-smoke-test.sh` (kein Handlungsbedarf).

4. **Branch-Konsolidierung**: ✅ **Bereits konsolidiert** — nach `fetch --prune` weiterhin beide Branches **vollständig in main enthalten**: `origin/feature/webapp-primary-agent` (0 ahead: `git rev-list --count ... --not origin/main` = 0) und `origin/ai-repair/local-thorsten-high-v8-20260825` (0 ahead = 0). Beide haben 0 Commits, die main fehlt — Merge wäre ein No-Op („Already up to date“). Kein Merge nötig.

## Aktueller CI-Stand

- HEAD main = `fd61096` (Run-89-Status, `[skip ci]`); **kein neuer Code-Commit seit Run 85**. Funktionsstand unverändert = `3d5fbeb`. Frischer `fetch --prune`: keine neuen Remote-Commits, `staging/fix-termine-500` weiterhin nicht vorhanden.

- GitHub-Status `3d5fbeb` (via `gh api`, 14 Statuses): **10 SUCCESS** (Gates + Infra-/Touch-/Visual-Verdicts) und nur 4 Churn-Verdicts rot (editor, text-save, session-undo, persistence). Gesamtstatus == failure (nur Churn, identisch zu Runs 39–89). Nachweis: `qa-results/latest-check/ci-status-run90.json`.

- Öffentlicher Lab-Report (`…/kp-homepage-lab/latest/report.json`): unverändert; kein neuer CircleCI-Lauf, da kein neuer Code-Commit; generatedAt 02:07:56Z, commit `3d5fbeb`, identisch zu Runs 87–89. Nachweis: `qa-results/lab-report-latest-run90.json`.

- Working Tree: unverändert zu Run 89 (`AndroidManifest.xml` + `MainActivity.kt` uncommitted, externes Work, unangetastet). Neu nur lokale, untracked Evidence-Dateien unter `qa-results/latest-check/` (run90: browser-check-run90.json/.rc/.err, thorsten-smoke-run90.log/.rc, ci-status-run90.json/.rc/.err) + `qa-results/lab-report-latest-run90.json`.

## 🔬 Offen (unverändert zu Run 89)

1. **Churn-Schicht** (editor, text-save, session-undo, persistence): weiterhin rot ohne Code-Änderung; Blocker: CircleCI-Logs ohne Token lokal nicht verfügbar, öffentlicher Report liefert keine Details. Plan: instrumentierter Lab-Lauf — unverändert.

2. **GitHub Actions Billing**: weiterhin alle Actions-Runs failure. User-Aktion nötig; CircleCI funktioniert.

3. **Release `homepage-hilfe-test-v0.10.3`**: existiert, Herkunft unklar, kein Handlungsbedarf.

4. **Agent-Bar/Menü-Überlappung Tablet** (`.kp-wa-bar` intercepts Menü-Button): unverändert offen.

5. **🔄 APK weiterhin veraltet vs. main**: Letzter APK-Build basiert auf Stand vor `3d5fbeb`. Der APK-Job filtert auf `/feature/android-.*/` — ein Sync+Push des `feature/android-build-20260828` würde einen frischen Build triggern. **KEIN Trigger in Run 90** — uncommittetes externes Working-Tree-Work (Offen 6) blockiert weiterhin; Entscheidung nötig, ob/wann dieses committet wird.

6. **🔄 Working Tree externes uncommitted work** (`MainActivity.kt` MediaProjection/LocalVisualAgent, `AndroidManifest.xml`): unverändert, vereinbarungsgemäß NICHT angefasst.

7. **Run 90**: alle 4 Punkte frisch verifiziert (Termine 4/4 browser-grün RC=0 + Live-HTTP 4/4 200; CI unverändert nur-Churn 4/14 rot; Thorsten lokal PASS RC=0 + CI-Integration per grep/read bestätigt; branches 0 ahead = vollständig konsolidiert). Kein neuer Commit seit Run 85. Kein Deploy/kein Merge/kein Trigger nötig. Status-Commit + Telegram-Summary (Job-Delivery = `telegram:729243650`) erfolgen hiermit.

## Abgegrenzte Sicherheitsregeln (strikt eingehalten)

- Nur Staging geprüft (Playwright headless, nur lesend, kein Login/kein Schreiben) + öffentliche `curl -s`-GETs auf Staging (termine/, /, repertoire/, kontakt/) und auf den öffentlichen Lab-Report (kein Eingriff). Production unangetastet.

- Keine Secrets nach außen; `.env` blieb unangetastet. GitHub-Token: nur read-only `gh api`- und Status-Abfragen (Scope repo/workflow) — keine Schreibaktionen außer dem Status-Doc-Commit.

- Kein Deploy, kein Merge, kein Push von fremdem Work. Uncommittetes externes Working-Tree-Work blieb unangetastet. Neue Dateien sind nur lokale, untracked Evidence-Dateien. Status-Doc-Commit (HERMES_STATUS.md, [skip]) folgt dem etablierten Run-Muster.