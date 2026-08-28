# HERMES STATUS – Stand 28.08.2026 (Cron-Wartungsjob, Lauf 7)

## Zusammenfassung

| Aufgabe | Status |
|---|---|
| 1. Staging /termine/ HTTP 500 | ✅ Fix seit Lauf 3 auf main & deployed; **frischer Browser-Test Lauf 7 erneut grün: 4/4 Seiten, /termine/ → 200, 75 Termin-Einträge, 0 Fehler**. Kein Branch `staging/fix-termine-500` (weder lokal noch remote) – nichts wartet auf Deploy |
| 2. beforeunload-Fix auf main | ✅ Commit `a5e3b5c` erneut als Vorfahre von main verifiziert; main == origin/main (0/0); kein neuer CI-Trigger nötig – Lab-Report unverändert (Commit 0333868, 14:16Z, 5 bekannte Login-basierte Rot-Verdicts, kein neues Signal) |
| 3. Thorsten Voice-Smoke-Test | ✅ Echter Test `qa/android-natural-voice-contract.sh` + Prepare-Skript in CI eingebunden (`.circleci/config.yml`, Job `android-homepage-technician`, Zeilen 71–78, vor dem APK-Build) – erneut verifiziert |
| 4. Branch-Konsolidierung | ✅ `feature/webapp-primary-agent` (0 ahead / 298 behind) und `ai-repair/local-thorsten-high-v8-20260825` (0 ahead / 290 behind) sind Vorfahren von main; nichts zu mergen, nur noch nach Freigabe löschbar |

## 1. Staging /termine/ HTTP 500 ✅ (Browser-Test Lauf 7)
- Fix-Commits `d21c6066`, `dab16c9`, `1133891` weiterhin auf main; Branch `staging/fix-termine-500` existiert weder lokal noch remote – Fix längst deployed, Aufgabe abgeschlossen.
- Frischer Playwright-Headless-Test (Lauf 7, ~16:31–16:33 Uhr, nur lesend, kein Login, `qa/cron-maintenance-4-termine-check.mjs`): `/termine/` → HTTP 200 in ~1,5 s, H1 „Termine“, Titel „Termine – puppenspiele“, **75 Termin-Einträge**, 0 px Overflow, 0 Console-/Page-Errors. `/` (22 Einträge), `/repertoire/` (17), `/kontakt/` (1) ebenfalls alle 200 und fehlerfrei. **Ergebnis: 4/4 Seiten OK.**
- Deploy-Verifikation: neuester Lab-Report (`https://neu.koblenzer-puppenspiele.de/wp-content/uploads/kp-homepage-lab/latest/report.json`, 14:16Z, Commit 0333868) → `deploy: success`, `stagingReady: success`. Fix ist auf Staging live; es wartet nichts auf Deploy.

## 2. beforeunload-Fix & CI-Status ⚠️ (unverändert zu Lauf 6)
- Commit `a5e3b5c` („ci: keep latest staging handoff waiter only“) erneut als Vorfahre von main verifiziert (`git merge-base --is-ancestor` OK). main == HEAD == origin/main → keine neuen Commits seit Lauf 6.
- Letzter Lab-Report (Commit 0333868 / 14:16Z): `deploy`, `stagingReady`, `temporaryBridge`, `nativeTouchSliderSaveReset`, `touchRuntime`, `visual50Views` = success; `editorMobileTabletDesktop`, `saveReloadDbUndo48h`, `editorBrowser`, `sessionUndo`, `persistenceBrowser`, `realTextSave` = failure (alle Login-abhängig – bekanntes systematisches Problem, keine neue Regression).
- Kein manueller Trigger ohne Freigabe; das Diagnose-Skript (Login-Retry + Hang-Diagnose aus Lauf 5) greift beim nächsten automatischen CI-Lauf.

## 3. Thorsten Voice-Smoke-Test ✅ (unverändert, erneut verifiziert)
- `tests/thorsten-smoke-test.js` existiert nicht; der echte Test ist `qa/android-natural-voice-contract.sh` zusammen mit `qa/prepare-android-natural-voice.sh`.
- Beide sind in `.circleci/config.yml` im Job `android-homepage-technician` vor dem APK-Build eingebunden (Vorbereitung + Contract-Test, Ausgabe nach `qa-results/android/thorsten-*.log`). Läuft beim nächsten Push auf einen `feature/android-*`-Branch.

## 4. Branch-Konsolidierung ✅ (unverändert zu Lauf 6)
- `feature/webapp-primary-agent` (Tip `e7f8ec1`): 0 ahead / 298 behind → vollständig in main enthalten.
- `ai-repair/local-thorsten-high-v8-20260825` (Tip `cfa17f6`): 0 ahead / 290 behind → vollständig in main enthalten.
- Nichts zu mergen; Löschen nur nach ausdrücklicher Freigabe (offener Punkt 4 unten).

## Offene Punkte für den User (Stand Lauf 7)
1. **CI-Editor-Verdicts rot (E2E-Login)** – reproduzierbar über 6+ Commits. Nächster automatischer Lab-Lauf liefert mit dem Diagnose-Skript URL/Titel/Body des hängenden Logins; danach genaue Ursache bestimmbar.
2. **GitHub-Actions-Billing-Limit** – Fallback-Workflows laufen nicht. Nicht blockierend (CircleCI Free ist aktiv).
3. **Thorsten-Assets (115 MB tar.bz2)** nicht in git; CI lädt sie bei jedem Android-Build neu. Optional Release/Artifacts/LFS – Entscheidung User.
4. Alte Branches (`feature/webapp-primary-agent`, `ai-repair/local-thorsten-high-v8-20260825`, `fix/ci-remove-beforeunload-20260827-*`) nach Freigabe löschen.
5. Übrige E2E-Login-Skripte haben noch den 30-s-Goto-Timeout ohne Diagnose; bei Bedarf nachziehen (unverändert zu Lauf 6).

## Nächste sinnvolle Schritte
- Automatischen Lab-Lauf (wird durch diesen Lauf-7-Push getriggert) auf die neue Hang-Diagnose prüfen.
- Nächsten `feature/android-*`-Push abwarten, um die Thorsten-CI-Schritte real grün zu sehen.