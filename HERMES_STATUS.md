# HERMES STATUS – Stand 28.08.2026 (Cron-Wartungsjob, Lauf 5 – Fortsetzungslauf)

## Zusammenfassung

| Aufgabe | Status |
|---|---|
| 1. Staging /termine/ HTTP 500 | ✅ Fix auf main & Staging; **frischer Browser-Test Lauf 5 erneut grün (4/4 Seiten, Termine-Seite 200)** |
| 2. beforeunload-Fix auf main | ✅ Commit `a5e3b5c` auf main; **alle 5 deterministischen Editor-Preflight-Contracts lokal erneut PASS**; CI-Labor unverändert (nur 4 bekannte Login-basierte Verdicts rot) – keine neuen Commits, kein Trigger nötig |
| 3. Thorsten Voice-Smoke-Test | ✅ CI-Einbindung verifiziert (`.circleci/config.yml`, Job `android-homepage-technician`); läuft real beim nächsten `feature/android-*`-Push |
| 4. Branch-Konsolidierung | ✅ Beide Branches weiterhin Vorfahren von main (0 Commits ahead) – nichts zu mergen |
| + Neu (Lauf 5) | 🔧 `qa/homepage-editor-lab.mjs`: Login mit Retry + Diagnose-Details (URL/Titel/Body-Snippet bei Timeout) – für den nächsten CI-Lauf zur Ursachenklärung des E2E-Login-Hangs |

## 1. Staging /termine/ HTTP 500 ✅ (Lauf-5-Browser-Test)
- Es existiert weiterhin **kein** Branch `staging/fix-termine-500` (lokal wie remote geprüft); Fix seit Lauf 3 auf main (`d21c606`, `dab16c9`, `1133891`) und über CircleCI-Labor auf Staging deployed.
- **Frischer lesender Browser-Test (Lauf 5, Playwright headless, 28.08.):** `/termine/` → HTTP 200, H1 „Termine“, Titel „Termine – puppenspiele“, **75 Termin-Karten**, 0 Console-/Page-Errors, 0 px Overflow. `/`, `/repertoire/`, `/kontakt/` → alle 200, keine Errors. **Ergebnis: 4/4 Seiten OK** (Skript `qa/cron-maintenance-4-termine-check.mjs`).
- curl-Checks: `/termine/` 200 in ~0,30 s, `/` 200 in ~0,25 s.

## 2. beforeunload-Fix & CI-Status ⚠️ (unverändert, + neues Diagnose-Werkzeug)
- `a5e3b5c` und beforeunload-Entfernungen sind auf main (Verify in Lauf 4). Seit Lauf 4 **keine neuen Commits** (main == origin/main, 0/0).
- **Letzter Staging-Lab-Bericht** (14:05Z, Commit `7811dbe`): deploy/stagingReady/temporaryBridge/nativeTouchSliderSaveReset/touchRuntime/visual50Views = success; editorMobileTabletDesktop, saveReloadDbUndo48h, editorBrowser, sessionUndo, persistenceBrowser, realTextSave = failure (alle Login-abhängig, bekanntes systematisches Problem, keine neue Regression).
- **Lauf-5-Maßnahme (neu, reversibel):** `login()` in `qa/homepage-editor-lab.mjs` auf Fehlertoleranz geprüft und verbessert: Goto-Timeout 35 s → 45 s, **1 Retry**, und bei Fehlern werden URL, Seitentitel und Body-Snippet im Failure-Report mitgeloggt. Damit dokumentiert der nächste CI-Lauf die exakte Hang-Position (z. B. Redirect-Ziel `/?kp_edit=1&kp_e2e=1` vs. Selector-Wartezeit) automatisch.
- **Lokal verifiziert (dieser Lauf):** `qa/editor-preflight-contracts.sh` alle 5 Contracts PASS (word-history, unified-editor, create-undo-redo, calendar-undo-redo, ai-repair-safety). Kein manueller CI-Trigger nötig.

## 3. Thorsten Voice-Smoke-Test ✅ (unverändert)
- Echter Test `qa/android-natural-voice-contract.sh` in CI vor dem APK-Build eingebunden (Job `android-homepage-technician`); läuft real beim nächsten `feature/android-*`-Push. Deine `tests/thorsten-smoke-test.js` existiert nicht mehr; `qa/android-natural-voice-contract.sh` ist der echte Test.

## 4. Branch-Konsolidierung ✅ (unverändert)
- `feature/webapp-primary-agent` (Tip `e7f8ec1`) und `ai-repair/local-thorsten-high-v8-20260825` (Tip `cfa17f6`) sind weiterhin Vorfahren von main (`rev-list --left-right --count` = 0 ahead). Nichts zu mergen; Löschen nach Freigabe.

## Offene Punkte für den User (Stand Lauf 5)
1. **CI-Editor-Verdicts rot (E2E-Login)** – reproduzierbar über 4+ Commits. Diagnose-Werte fehlen bisher (CircleCI-Dashboard Logs / Build 2602; FTP-Zugang). Neuer Ansatz: verbessertes Lab-Skript aus Lauf 5 liefert beim nächsten vollen CI-Lauf URL/Titel/Body des hängenden Logins – dann lässt sich eindeutig sagen, ob das `/?kp_e2e_login=…`-Redirect-Ziel oder der Editor-Bootstrap hängt.
2. **GitHub Actions Billing-Limit** – Fallback-Workflows laufen nicht. Nicht blockierend.
3. **Thorsten-Assets (115 MB tar.bz2)** nicht in git – CI lädt sie bei jedem Android-Build neu. Optional Release/Artifactory/LFS – Entscheidung User.
4. Alte Branches (`feature/webapp-primary-agent`, `ai-repair/local-thorsten-high-v8-20260825`, `fix/ci-remove-beforeunload-20260827`) können nach Freigabe gelöscht werden.
5. Die übrigen E2E-Login-Skripte (`editor-session-undo-e2e.mjs`, `owner-all-persistence-e2e.mjs`, `text-save-staging-e2e.mjs`, `touch-staging-persistence-e2e.mjs`) haben weiter den 30-s-Goto-Timeout ohne Diagnose-Snippet; bei Bedarf nachziehen (bewusst nicht in Lauf 5 geändert, um klein zu bleiben).

## Nächste sinnvolle Schritte
- Nächsten vollen CircleCI-Staging-Lauf (oder manuellen Trigger mit Erlaubnis) abwarten → neues Lab-Skript liefert die Hang-Diagnose.
- CircleCI-Build 2602 im Dashboard ansehen (Workflow-Log mit editor.log/session-undo.log).
- Nächsten `feature/android-*`-Push abwarten, um die Thorsten-CI-Schritte real grün zu sehen.