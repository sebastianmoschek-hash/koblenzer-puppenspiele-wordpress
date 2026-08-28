# HERMES STATUS – Stand 28.08.2026 (Cron-Wartungsjob, Lauf 6)

## Zusammenfassung

| Aufgabe | Status |
|---|---|
| 1. Staging /termine/ HTTP 500 | ✅ Fix seit Lauf 3 auf main & auf Staging deployed; **frischer Browser-Test Lauf 6 erneut grün (4/4 Seiten, /termine/ 200, 75 Karten)** |
| 2. beforeunload-Fix auf main | ✅ Commit `a5e3b5c` ist Vorfahre von main (verifiziert); main == origin/main (0/0); kein neuer CI-Trigger nötig – Lab-Report unverändert (4 bekannte Login-basierte Rot-Verdicts, kein neues Signal) |
| 3. Thorsten Voice-Smoke-Test | ✅ Echt-Test `qa/android-natural-voice-contract.sh` in CI eingebunden (Job `android-homepage-technician`, Zeilen 69–84) |
| 4. Branch-Konsolidierung | ✅ Beide Branches 0 ahead / >280 behind → Vorfahren von main; nichts zu mergen, nur noch löschbar |

## 1. Staging /termine/ HTTP 500 ✅ (Browser-Test Lauf 6)
- Fix-Commits `d21c606`, `dab16c9`, `1133891` weiterhin auf main; kein Branch `staging/fix-termine-500` (existiert nicht, war eine Vorgabe aus dem Task-Wording – Fix längst deployed).
- Live-Checks 28.08. (Lauf 6): `/termine/` → 200 in ~0,33 s, `/repertoire/` → 200, `/kontakt/` → 200, `/` → 200.
- **Playwright-Headless-Browser-Test (Lauf 6, lesend, kein Login):** `/termine/` → HTTP 200, H1 „Termine“, Titel „Termine – puppenspiele“, **75 Termin-Karten**, 0 px Overflow, 0 Console-/Page-Errors. `/` (22 Karten), `/repertoire/` (17), `/kontakt/` (1) ebenfalls alle 200, fehlerfrei. **Ergebnis: 4/4 Seiten OK** (`qa/cron-maintenance-4-termine-check.mjs`).
- Deploy-Verifikation: neuester Lab-Report (`wp-content/uploads/kp-homepage-lab/latest/report.json`, 14:16Z) → `deploy: success`, `stagingReady: success`. Fix ist auf Staging live; nichts wartet auf Deploy.

## 2. beforeunload-Fix & CI-Status ⚠️ (unverändert)
- `a5e3b5c` („ci: keep latest staging handoff waiter only“) als Vorfahre von main verifiziert. Main == origin/main bei `069289c` → keine neuen Commits seit Lauf 5.
- Letzter Lab-Report (Commit `0333868` / 14:16Z): deploy, stagingReady, temporaryBridge, nativeTouchSliderSaveReset, touchRuntime, visual50Views = success; editorMobileTabletDesktop, saveReloadDbUndo48h, editorBrowser, sessionUndo, persistenceBrowser, realTextSave = failure (alle Login-abhängig – bekanntes systematisches Problem, keine neue Regression).
- Kein manueller Trigger möglich/ohne Freigabe; das verbesserte Lab-Skript (Login-Retry + Hang-Diagnose aus Lauf 5) liefert Diagnose beim nächsten automatischen CI-Lauf.

## 3. Thorsten Voice-Smoke-Test ✅ (unverändert, erneut verifiziert)
- Echter Test `qa/android-natural-voice-contract.sh` + Asset-Prepare `qa/prepare-android-natural-voice.sh` in `.circleci/config.yml` vor dem APK-Build eingebunden (Job `android-homepage-technician`, Zeilen 69–84). Läuft beim nächsten `feature/android-*`-Push. (`tests/thorsten-smoke-test.js` existiert nicht; der echte Test ist das qa-Skript.)

## 5. Branch-Konsolidierung ✅ (unverändert)
- `feature/webapp-primary-agent` (Tip `e7f8ec1`): 0 ahead / 297 behind → Vorfahre von main.
- `ai-repair/local-thorsten-high-v8-20260825` (Tip `cfa17f6`): 0 ahead / 289 behind → Vorfahre von main.
- Nichts zu mergen; Löschen nach Freigabe des Users.

## Offene Punkte für den User (Stand Lauf 6)
1. **CI-Editor-Verdicts rot (E2E-Login)** – reproduzierbar über 5+ Commits. Nächster automatischer Lab-Lauf liefert mit dem Lauf-5-Diagnose-Skript URL/Titel/Body des hängenden Logins; danach genaue Ursache bestimmbar.
2. **GitHub Actions Billing-Limit** – Fallback-Workflows laufen nicht. Nicht blockierend (CircleCI Free ist aktiv).
3. **Thorsten-Assets (115 MB tar.bz2)** nicht in git; CI lädt sie bei jedem Android-Build neu. Optional Release/Artifactory/LFS – Entscheidung User.
4. Alte Branches (`feature/webapp-primary-agent`, `ai-repair/local-thorsten-high-v8-20260825`, `fix/ci-remove-beforeunload-20260827`) nach Freigabe löschen.
5. Übrige E2E-Login-Skripte (`editor-session-undo-e2e.mjs`, `owner-all-persistence-e2e.mjs`, `text-save-staging-e2e.mjs`, `touch-staging-persistence-e2e.mjs`) haben noch den 30-s-Goto-Timeout ohne Diagnose; bei Bedarf nachziehen.

## Nächste sinnvolle Schritte
- Automatischen Lab-Lauf (dieser Push von Lauf 6 triggert ihn) auf neue Hang-Diagnose prüfen.
- Nächsten `feature/android-*`-Push abwarten, um Thorsten-CI-Schritte real grün zu sehen.