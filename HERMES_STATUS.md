# HERMES STATUS – Stand 29.08.2026 (Run 55 – Autonomer Wartungslauf)

## Status der 4 Aufgaben

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (dieser Lauf** — `qa/cron-maintenance-4-termine-check.mjs` (headless Playwright,, nur lesend): **4/4 Seiten OK** (`/termine/` 200,, h1 „Termine“ + 75 Cards,, `/` 200,, `/repertoire/` 200,, `/kontakt/` 200),,** 0 Console-/Page-Errors,,  ̈0 Overflow** (Card-Zahl 75 = konsistent zu Runs 53/54 — kein Regressions-Indikator. Nachweis:`qa-results/latest-check/browser-check-run55.txt`, RC=0). Zusätzlich Live-`curl`: `/termine/` HTTP  200 (0.28s, Basis  200. Branch `staging/fix-termine-500` existiert nach `fetch --prune` weiterhin **nicht** — Fix bleibt konsolidiert ((in main; `a5e3b5c` = ancestor) und auf Staging deployed.. Kein Deploy/kein Merge nötig.. Production unberührt..

2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ — `a5e3b5c` in main-Historie frisch verifiziert (`merge-base --is-ancestor` = ok). Kein neuer Funktions-Commit seit Run  54 (HEAD main = `2858d37` = Run-54-Status,, `[skip ci]`; letzter Funktionsstand unverändert = `3d5fbeb`). CI-Stand für Funktionsstand `3d5fbeb` frisch via `gh api` geprüft: 14 Statuses — **10 SUCCESS** (alle Gates + `staging-infra-`, `staging-touch-`, `staging-visual-`-Verdicts)und nur 4 Churn-Verdicts rot (`staging-editor-`, `staging-text-save-`, `staging-session-undo-`, `staging-persistence-verdict` = FAILURE,, bekannt & unverändert). Gesamtstatus = failure (nur Churn.. Kein manueller Trigger nötig ((kein neuer Code-Commit; Trigger würde nur denselben Churn-Stand erneut laufen lassen..

3. **Thorsten Voice-Smoke-Test**: ✅ — **Weiterhin real in CI eingebunden** (`.circleci/config.yml` Z.,, 69–93: „Prepare Thorsten High voice assets“ → `qa/prepare-android-natural-voice.sh`,, „Thorsten natural voice contract“ → `qa/android-natural-voice-contract.sh`,, „Thorsten voice smoke test (models + Kotlin integration)“ → `bash qa/thorsten-voice-smoke-test.sh` → RC-Fail-fast,, danach APK-Compile`). Zusätzlich **lokal frisch ausgeführt**(dieser Lauf:: PASS,, RC=0,, Modell-Assets present,, PCM16/AudioTrack-Contract gruen,, kein System-TTS-Fallback; Nachweis:`qa-results/latest-check/thorsten-smoke-run55.log`). Hinweis:: Der in der Aufgabenliste genannte Pfad `tests/thorsten-smoke-test.js` existiert weiterhin nicht —die tatsächliche CI-Integration läuft über `qa/thorsten-voice-smoke-test.sh`(kein Handlungsbedarf..

4. **Branch-Konsolidierung**: ✅ **Bereits konsolidiert** — nach `fetch --prune` weiterhin beide Branches **vollständig in main enthalten**: `origin/feature/webapp-primary-agent` (0 ahead,, merge-base = Branch-Tip)und `origin/ai-repair/local-thorsten-high-v8-20260825` (0 ahead,, merge-base = Branch-Tip)). Beide haben **0 Commits**,die main fehlt — Merge wäre ein No-Op („Already up to date“.. Kein Merge nötigt..

## Aktueller CI-Stand

- HEAD main = `2858d37` (Run-54-Status,, `[skip ci]`); **kein neuer Code-Commit seit Run  54**. Funktionsstand unverändert = `3d5fbeb`. Frischer `fetch --prune`: keine neuen Remote-Commits,, `staging/fix-termine-500` weiterhin nicht vorhanden (`ls-remote` leer..

- GitHub-Status `3d5fbeb` (via `gh api` — Nachweis:`qa-results/latest-check/ci-status-run55.json`):  14 Statuses —  10 SUCCESS ((Gates + Infra/Touch/Visual-Verdicts)und nur 4 Churn-Verdicts rot ((editor,, text-save,, session-undo,, persistence.)). Gesamtstatus = failure (nur Churn,, identisch zu Rün  39–54..

- Öffentlicher Lab-Report (`…/kp-homepage-lab/latest/report.json/.md`): unverändert ((generatedAt 2026-08-29T02:07:56Z = Stand seit Run ~28,, commit `3d5fbeb`,, Gesamtstatus FAILURE mit denselben 4 Churn-Failures + editorBrowser/sessionUndo/persistenceBrowser/realTextSave/editorMobileTabletDesktop/saveReloadDbUndo48h-Innenchecks.. Keine Detail-Diagnosen enthalten(Checks nur Status-Strings.); ohne CircleCI-Token weiterhin keine Logs lokal verfügbar...

- GitHub Actions check-runs: weiterhin failure/cancelled (Billing-Konto erschöpft,, bekannt — CircleCI bleibt primärer Runner..

- Android `facaa1a`: SUCCESS (historisch verifiziert.. Kein neuer Trigger (siehe Offen 5..

- Working Tree: unverändert zu Run  54(`AndroidManifest.xml` + `MainActivity.kt` uncommitted,, externes Work,, unangetastet..). Neu nur lokale, untracked Evidence-Dateien unter `qa-results/latest-check/` ((run55: browser-check-run55.txt,, thorsten-smoke-run55.log,, ci-status-run55.json...))

- Beobachtung (kein Eingriff: Production `koblenzer-puppenspiele.de` liefert `/` 200,, `/termine/` aber 404 — der Slug existiert auf Production nicht (nur auf Staging.; kulant nur-lesender GET,, keine Aktion,, Prod bleibt unangetastet..

## 🔬 Offen (unverändert zu Run  54)

1. **Churn-Schicht** (editor,, text-save,, session-undo,, persistence:: weiterhin rot ohne Code-Änderung;; Blocker: CircleCI-Logs ohne Token lokal nicht verfügbar,, öffentlicher Report liefert keine Details.. Plan: instrumentierter Lab-Lauf — unverändert..

2. **GitHub Actions Billing**: weiterhin alle Actions-Runs failure.. User-Aktion nötig;; CircleCI funktioniert..

3. **Release `homepage-hilfe-test-v0.10.3`**: existiert,, Herkunft unklar,, kein Handlungsbedarf...

4. **Agent-Bar/Menü-Überlappung Tablet** (`.kp-wa-bar` intercepts Menü-Button) — unverändert offen..

5. **🔄 APK weiterhin veraltet vs.. main**: Letzter APK-Build `facaa1a` basiert auf `5bf8fe5` (vor `3d5fbeb`)). Der APK-Job filtert auf `/feature/\\android-.*/` — ein Sync+Push des `feature/android-build-20260828` auf main-Stand würde einen frischen Build triggern.. **KEIN Trigger in Run  ̈55** — uncommitted externes Working-Tree-Work(Offen 6) blockiert weiterhin;; Entscheidung nötig,, ob/wann dieses committet wird...

6. **🔄 Working Tree externes uncommitted work** (`MainActivity.kt` MediaProjection/LocalVisualAgent,, `AndroidManifest.xml`): unverändert,, vereinbarungsgemäß NICHT angefasst...

7. **Run  55**: alle   4 Punkte frisch verifiziert((Termine 4/4 browser-grün RC=0 + Live-HTTP 200,, CI-Stand unverändert nur-Churn,, Thorsten lokal PASS RC=0,, branches 0 ahead = 0 Commits vor main.. Kein neuer Commit seit Run  54.. Kein Deploy/kein Merge/kein Trigger nötig.. Status-Commit + Telegram-Summary (Job-Delivery = `telegram:729243650`)) erfolgen hiermit...

## Abgegrenzte Sicherheitsregeln(strikt eingehalten)

- Nur Staging geprüft(Playwright headless,, nur lesend,, kein Login/kein Schreiben) + ein öffentlicher `curl`-GET auf Staging /termine/ und /. Production nur einmaliger, öffentlicher lesender GET auf `/` + `/termine/` (Beobachtung,, kein Eingriff..

- Keine Secrets nach außen;; `.env` blieb unangetastet.. CircleCI-Token: lokal nicht vorhanden (nur geprüft, nichts extrahiert..

- Kein Deploy,, kein Merge,, kein Push von fremdem Work.. Uncommittetes externes Working-Tree-Work blieb unangetastet... Neue Dateien sind nur lokale, untracked Evidence-Dateien...