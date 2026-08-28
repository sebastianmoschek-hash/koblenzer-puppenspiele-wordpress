# HERMES STATUS – Stand 28.08.2026 (Cron-Wartungsjob, Lauf 4 – Verifikationslauf)

## Zusammenfassung

| Aufgabe | Status |
|---|---|
| 1. Staging /termine/ HTTP 500 | ✅ Kein Deploy nötig – Fix bereits auf main & Staging; **Browser-Test erneut grün (4/4 Seiten, 75 Termin-Karten)** |
| 2. beforeunload-Fix auf main | ✅ Commit `a5e3b5c` auf main verifiziert; CI-Labor (66b6852) grün außer 4 bekannten E2E-Login-Verdicts – kein manueller Trigger nötig |
| 3. Thorsten Voice-Smoke-Test | ✅ In CircleCI eingebunden (`android-homepage-technician`: Prepare + Contract vor APK-Build); echter Test = `qa/android-natural-voice-contract.sh` |
| 4. Branch-Konsolidierung | ✅ Beide Branches weiterhin Vorfahren von main – nichts zu mergen |

## 1. Staging /termine/ HTTP 500 ✅ (erneut verifiziert)
- Es existiert weiterhin **kein** Branch `staging/fix-termine-500` (lokal wie remote geprüft) – der Fix wurde direkt auf main committet (`d21c606`, `6e726e8`, `dab16c9`, `1133891`) und über das CircleCI-Labor auf Staging deployed (Report 28.08. 13:50Z, Commit 66b6852, `deploy: success`).
- **Frischer Browser-Test (Lauf 4, Playwright 1.62.1 headless, nur lesend, 28.08.):**
  - `/termine/` → **HTTP 200**, H1 „Termine“, Titel „Termine – puppenspiele“, **75 Termin-Karten**, 0 Console-/Page-Errors, 0 px horizontaler Overflow
  - `/`, `/repertoire/`, `/kontakt/` → alle HTTP 200, keine Errors, kein Overflow
  - **Ergebnis: 4/4 Seiten OK.** Skript: `qa/cron-maintenance-4-termine-check.mjs` (importiert Playwright aus hermes-agent node_modules).
- Zusätzlich curl-Head-Checks: `/termine/` 200 in ~0,31 s, `/` 200 in ~0,27 s.

## 2. beforeunload-Fix & CI-Status ⚠️ (bekanntes Restproblem, unverändert)
- `a5e3b5c` (Handoff-Waiter) und beforeunload-Entfernungen (`e5448f7`, `7002dca`) sind auf main (Merge `7a91387`). Verifiziert: `takeover-v8.js` (kp-local-ai-desktop-assets) enthält **0** beforeunload-Vorkommen; alle verbleibenden Referenzen sind „Deliberately no beforeunload“-Kommentare bzw. das Mu-Plugin `kp-editor-no-beforeunload.php`, das beforeunload aktiv entfernt.
- **Staging-Labor-Bericht (letzter voller Lauf, Commit 66b6852, 28.08. 13:50Z):**
  - ✅ success: deploy, stagingReady, temporaryBridge, nativeTouchSliderSaveReset, touchRuntime, visual50Views
  - ❌ failure: editorMobileTabletDesktop, saveReloadDbUndo48h, editorBrowser, sessionUndo, persistenceBrowser, realTextSave (alle Login-abhängig)
- **Ursache unverändert (bekanntes systematisches Problem):** E2E-Login-Bridge hängt im CI-Kontext (`page.goto`-Timeout auf `/?kp_e2e_login=…`), reproduzierbar über 4+ Commits. Keine neue Regression.
- Kein manueller Trigger nötig: Letzter Commit `7811dbe` ist docs-only; der letzte Code-Commit `66b6852` ist vollständig durch das Labor abgedeckt. Seit Lauf 3 sind **keine neuen Commits** eingegangen.
- GitHub Actions bleibt wegen Billing-Limit inaktiv (bekannt, nicht blockierend).

## 3. Thorsten Voice-Smoke-Test ✅
- `tests/thorsten-smoke-test.js` existiert nicht; der echte Test ist `qa/android-natural-voice-contract.sh` (Thorsten-High-Assets, Modell-Samplerate, PCM16, AudioTrack-Minimalpuffer, kein System-TTS-Fallback).
- **In CI eingebunden (verifiziert in `.circleci/config.yml`, Job `android-homepage-technician`):** Schritte „Prepare Thorsten High voice assets“ (`qa/prepare-android-natural-voice.sh`) und „Thorsten natural voice contract“ (`qa/android-natural-voice-contract.sh`) laufen vor dem APK-Build.
- Hinweis: Der Android-Job feuert nur auf `/feature\/android-.*/` – die neuen Schritte laufen beim nächsten Android-Branch-Push real in CI.

## 4. Branch-Konsolidierung ✅
- `feature/webapp-primary-agent` (Tip `e7f8ec1`) und `ai-repair/local-thorsten-high-v8-20260825` (Tip `cfa17f6`) sind weiterhin Vorfahren von main (`git merge-base --is-ancestor` = YES, erneut geprüft). Nichts zu mergen; können nach Freigabe gelöscht werden.

## Offene Punkte für den User (unverändert)
1. **CI-Editor-Verdicts rot (E2E-Login-Timeout)** – reproduzierbar über 4+ Commits. Braucht CircleCI-Log-Diagnose (Dashboard: Workflow d3973a8e-95bb-421b-bc32-5a361c011c2b / Build 2602) oder Reproduktion mit FTP-Zugang. Verdacht: `wp_safe_redirect`-Ziel `/?kp_edit=1&kp_e2e=1` hängt unter Auth. Deterministische Contracts + alle öffentlichen Browser-Tests sind grün.
2. **GitHub Actions Billing-Limit** – Fallback-Workflows laufen nicht. Nicht blockierend.
3. **Thorsten-Assets (115 MB tar.bz2)** nicht in git – CI lädt sie bei jedem Android-Build neu. Optional Release/Artifactory/LFS – Entscheidung User.
4. Alte Branches (`feature/webapp-primary-agent`, `ai-repair/local-thorsten-high-v8-20260825`, `fix/ci-remove-beforeunload-20260827`) können nach Freigabe gelöscht werden.

## Nächste sinnvolle Schritte
- CircleCI-Build 2602 im Dashboard ansehen und Editor-Login-Timeout aus `editor.log`/`session-undo.log` diagnostizieren.
- Nächsten `feature/android-*`-Push abwarten, um die Thorsten-CI-Schritte real grün zu sehen.
- Optional: `qa/homepage-editor-lab.mjs` Login auf Fehlertoleranz prüfen.