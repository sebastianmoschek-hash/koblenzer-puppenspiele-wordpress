# HERMES STATUS – Stand 29.08.2026 (Run 24 – Autonomer Wartungslauf)

## Status der 4 Aufgaben-Defaults

1. **Staging `/termine/` (500-Fix)**: ✅ **Re-verifiziert (curl + echter Browser)** — `/termine/` HTTP 200 (0,24 s), Browser-Smoke `qa/cron-maintenance-4-termine-check.mjs`: **4/4 Seiten OK** (`/termine/`, `/`, `/repertoire/`, `/kontakt/`), 0 Console-/Page-Errors, 0 Overflow, Termin-Karten vorhanden. Branch `staging/fix-termine-500` existiert nicht mehr remote (gepruned) — Fix ist längst in main und deployed. Kein Deploy nötig, Production unberührt.
2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ **CI grün, kein manueller Trigger nötig** — GitHub-Status für a5e3b5c: `editor-contracts` SUCCESS, `mobile-live-staging-deploy` SUCCESS, `homepage-staging-lab` SUCCESS; rote Verdicts ausschließlich die bekannte Churn-Schicht (`staging-text-save-verdict`, `staging-persistence-verdict`, `staging-editor-verdict`, `staging-session-undo-verdict`). **HEAD `3e091ef`**: `editor-contracts` ✅, `mobile-live-staging-deploy` ✅, `homepage-staging-lab` **pending** — Lab-Lauf für 3e091ef läuft noch; `report.json` zeigt noch 2d51c2b (01:04:33Z, 7 grün / 5 rot, nur bekannte Churn-Gates). GitHub-Actions-Runs weiterhin Billing-bedingt rot (bekannt, CircleCI übernimmt).
3. **Thorsten Voice-Smoke-Test**: ✅→🟡 **Implementiert + lokal grün + NEU in CI eingebunden** — Script existiert als `qa/thorsten-voice-smoke-test.sh` (Commit 3e091ef; der in der Aufgabe genannte Pfad `tests/thorsten-smoke-test.js` existiert weiterhin nicht — kein `tests/`-Verzeichnis im Repo). Lokal ausgeführt: **PASS (RC=0)**, prüft ONNX-Modell, tokens.txt, espeak-ng-data, LocalNaturalVoice.kt/LocalVoiceController.kt + Contract-Script. **CI-Einbindung in diesem Lauf nachgeholt**: neuer Step „Thorsten voice smoke test (models + Kotlin integration)" im `android-homepage-technician`-Job (nach dem Thorsten-Contract-Step, Log `qa-results/android/thorsten-smoke.log`); läuft auf Android-Branches (`/feature\/android-.*/`). Config-Commit folgt mit diesem Lauf.
4. **Branch-Konsolidierung**: ✅ **Nichts zu tun** — `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` sind beide erneut als Ancestors von HEAD `3e091ef` verifiziert (`git merge-base --is-ancestor` = IS-ANCESTOR, `git rev-list --count HEAD..branch` = 0). Kein Merge nötig.

## Aktueller CI-Stand

- HEAD = `3e091ef` (fix(staging): Testmarker-Auto-Clean, Hint-Overlay ausblenden, Thorsten-Smoke-Test, Android versionCode-Bump). NEUER Fehlerbehebungs-/Test-Commit von Run 24: Thorsten-Smoke-Step in `.circleci/config.yml` (Android-Job).
- GitHub-Status HEAD `3e091ef`: editor-contracts ✅ / mobile-live-staging-deploy ✅ / homepage-staging-lab ⏳ pending / serial-start+end ✅. Aktueller FULL-Report: noch `2d51c2b` (01:04:33Z): deploy, stagingReady, temporaryBridge, nativeTouchSliderSaveReset, touchRuntime, visual50Views grün; editorMobileTabletDesktop, saveReloadDbUndo48h, editorBrowser, sessionUndo, persistenceBrowser, realTextSave rot (bekannte Churn-Schicht). `success:false` erwartet.
- Nachweis Browser: `qa-results/termine-staging.html` (Untracked, lokaler Wegwerf-Test, nicht committed).

## 🔬 Offen

1. **Lab-Report für HEAD `3e091ef`**: Lab-Lauf läuft noch (pending seit ~01:10Z); Report-Publikation + Verdict-Flip im nächsten Lauf prüfen und auswerten.
2. **Churn-Schicht** (unverändert): Editor-/Persistenz-Gates rot trotz dcl-Hang-Fix (Lauf 27/28-Erkenntnisse). Plan Lauf 28: Reentrancy-Guards + Lab-force-Klicks, Churn-Quelle (`image-fallback.js`-Verdacht) final benennen.
3. Agent-Bar/Menü-Überlappung auf Tablet (`.kp-wa-bar` intercepts Menü-Button).
4. Thorsten-Smoke-Step läuft erst real in CI, wenn wieder ein `/feature\/android-.*/`-Branch gepusht wird (Android-Job-Filter).
5. GitHub Billing: User-Aktion.

## Abgegrenzte Sicherheitsregeln (strikt eingehalten)

- Nur Staging geprüft (curl + lokaler Wegwerf-Chromium via Playwright, nur lesend, kein Login/kein Schreiben). Production unangetastet.
- Keine Secrets berührt/committed. OpenRouter aktiv; lokale Modelle nur für die künftige Web-App.
- Änderung minimal & reversibel: genau 1 neuer CI-Step (check-only-Script, lokal grün getestet). HERMES_STATUS-Commit mit `[skip ci]`.
- Config.yml-Änderung CRLF-konsistent eingefügt, YAML lokal validiert (pyyaml), `git diff --check` sauber.