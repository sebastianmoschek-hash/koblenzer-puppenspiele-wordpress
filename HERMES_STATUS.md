# HERMES STATUS – Stand 29.08.2026 (Run 23 – Autonomer Wartungslauf)

## Status der 4 Aufgaben-Defaults

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (7/7 OK, lokaler Chromium-Test ~03:00 MESZ)** — `/termine/` HTTP 200, 75 Termin-Karten (`article.kp-termin-card`), 0 Console-/Page-Errors, 0 Overflow; `/`, `/repertoire/`, `/das-theater/`, `/referenzen/`, `/kontakt/`, `/aktuelles/` alle 200. Branch `staging/fix-termine-500` existiert nicht mehr remote (gepruned) — Fix ist längst in main deployed. Kein Deploy nötig, Produktion unberührt.
2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ **In main (Ancestor von HEAD verifiziert), CI automatisch, kein manueller Trigger nötig** — `editor-contracts` SUCCESS (a5e3b5c), `mobile-live-staging-deploy` SUCCESS. Neuer **FULL-Report für 2d51c2b publiziert (01:04:33Z)**: deploy/stagingReady/bridge/touch/visual **grün**; editor/persistence/session-undo **rot** (bekannte Churn-Schicht, unverändert); `realTextSave` in diesem FULL-Lauf nicht gelistet. Commit-Status 2d51c2b `homepage-staging-lab` aktuell noch `pending` (Report liegt bereits auf Staging; Verdict-Status folgen nach – nächster Lauf prüft Final-Verdicts).
3. **Thorsten Voice-Smoke-Test**: ⚠️ **Unverändert offen (User-Entscheidung)** — `tests/thorsten-smoke-test.js` existiert weiterhin NICHT (kein `tests/`-Verzeichnis im Repo). Thorsten-High ist in CI fest abgedeckt über den `android-homepage-technician`-Job (config.yml Z. 67–84: `qa/prepare-android-natural-voice.sh` + `qa/android-natural-voice-contract.sh`), läuft auf `/feature\/android-.*/`-Branches. **Neu: APK-Prerelease `homepage-hilfe-test-v0.10.2` (Clean UI & Logout) veröffentlicht** – Asset `app-debug.apk` (293 MB) unter github.com/sebastianmoschek-hash/koblenzer-puppenspiele-wordpress/releases/tag/homepage-hilfe-test-v0.10.2.
4. **Branch-Konsolidierung**: ✅ **Nichts zu tun** — `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` sind beide Ancestors von main (erneut verifiziert gegen HEAD ff43aae). Zusatz: `feature/android-build-20260828` ist ebenfalls bereits integriert (HEAD 442bdea ist Ancestor von main).

## Aktueller CI-Stand

- HEAD = `ff43aae` (nur Doku, `[skip ci]`). CI-Deploy-Kopf = `2d51c2b` (Android-UI-UX + `kp-mobile-live-bridge.php`).
- **Frischer FULL-Lab-Report für 2d51c2b (01:04:33Z)** ausgewertet: 7 Gates grün (deploy, stagingReady, temporaryBridge, nativeTouchSliderSaveReset, touchRuntime, visual50Views), 4 rot (editorMobileTabletDesktop, saveReloadDbUndo48h, editorBrowser, sessionUndo, persistenceBrowser – alles bekannte Churn-Schicht). `success:false` wie erwartet.
- a5e3b5c-Status: `editor-contracts` SUCCESS, `homepage-staging-lab` SUCCESS; rote Verdicts nur die bekannten.
- Beobachtung: Report-Publikation erfolgt vor dem Commit-Status-Flip (lab-Status noch `pending`, obwohl report.json schon aktuell ist).
- GitHub Actions weiterhin Billing-limitiert (publish/orchestrate/sync/inventory rot – bekannt, CircleCI übernimmt).

## 🔬 Offen (unverändert)

1. **Churn-Schicht**: Editor-/Persistenz-Gates rot trotz dcl-Hang-Fix (Lauf 27/28-Erkenntnisse unverändert gültig). Plan Lauf 28: Reentrancy-Guards + Lab-force-Klicks, Churn-Quelle (`image-fallback.js`-Verdacht) final benennen.
2. Agent-Bar/Menü-Überlappung auf Tablet (`.kp-wa-bar` intercepts Menü-Button).
3. Thorsten-Standalone-Test (`tests/thorsten-smoke-test.js`): existiert nicht — User-Entscheidung, ob angelegt werden soll.
4. GitHub Billing: User-Aktion.

## Abgegrenzte Sicherheitsregeln (strikt eingehalten)

- Nur Staging geprüft (Browser/curl, lokaler Wegwerf-Chromium via Playwright, Temp-/qa-results-Dateien). Production unangetastet.
- Keine Secrets berührt/committed. OpenRouter aktiv; lokale Modelle nur für die künftige Web-App.
- HERMES_STATUS-Commit mit `[skip ci]`, um keinen unnötigen Lab-Lauf auszulösen.