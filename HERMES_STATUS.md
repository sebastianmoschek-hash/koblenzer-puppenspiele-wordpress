# HERMES STATUS – Stand 29.08.2026 (Run 25 – Autonomer Wartungslauf)

## Status der 4 Aufgaben-Defaults

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert** — `/termine/` HTTP 200 (0,28 s), Browser-Smoke `qa/cron-maintenance-4-termine-check.mjs`: **4/4 Seiten OK** (`/termine/`, `/`, `/repertoire/`, `/kontakt/`), 0 Console-/Page-Errors, 0 Overflow. Fix ist längst in main deployed (`mobile-live-staging-deploy` für HEAD `3e091ef` = success). Kein Deploy nötig, Production unberührt.
2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ **CI grün, kein manueller Trigger nötig** — GitHub-Status HEAD `3e091ef`: `editor-contracts` SUCCESS, `mobile-live-staging-deploy` SUCCESS, serial-start/end SUCCESS; **`homepage-staging-lab` ⏳ pending** (seit ~01:10Z, >25 min — ungewöhnlich lang, s. Offen 1). Rote Verdicts auf letztem abgeschlossenem Lauf (7811dbe): nur bekannte Churn-Schicht.
3. **Thorsten Voice-Smoke-Test**: ✅→🔄 **Lokal grün, CI-Lauf erstmals angestoßen** — `qa/thorsten-voice-smoke-test.sh` lokal: **PASS (RC=0)** inkl. `android-natural-voice-contract.sh` (Modell-Assets, Samplerate, PCM16/AudioTrack, kein System-TTS-Fallback). CI-Step ist eingebunden (Commit 83cb539, nach Thorsten-Contract-Step). **NEU in diesem Lauf**: `feature/android-build-20260828` auf main-Stand (5bf8fe5) fast-forwarded + Trigger-Commit `facaa1a` gepusht → CircleCI-Job `android-homepage-technician` läuft (**pending**, queued hinter Lab-Lauf). Der Smoke-Step wird damit erstmals real in CI ausgeführt; Ergebnis im nächsten Lauf auswerten.
4. **Branch-Konsolidierung**: ✅ **Bereits konsolidiert** — `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` sind Ancestors von HEAD (0 Commits hinter main). Zusätzlich `feature/android-build-20260828` konsolidiert (FF auf main, Trigger-Commit facaa1a, reversibel).

## Aktueller CI-Stand

- HEAD main = `5bf8fe5` (Run-24-Status, [skip ci]). Android-Branch-Head = `facaa1a` (Trigger-Commit, kein [skip ci]).
- GitHub-Status `3e091ef`: editor-contracts ✅ / mobile-live-staging-deploy ✅ / homepage-staging-lab ⏳ pending / serial ✅.
- GitHub-Status `facaa1a`: `android-homepage-technician` ⏳ pending (Pipeline erkannt).
- **Report-Inkonsistenz entdeckt**: `latest/report.json` zeigt Commit `7811dbe` (generatedAt 28.08. 14:05:42Z, Last-Modified 29.08. 01:06:28Z), aber `latest/report.md` zeigt `2d51c2b` (01:04:33Z). Publikations-Race/Stale-Upload — siehe Offen 2. Inhalt beider: `success:false`, deploy/stagingReady/temporaryBridge/nativeTouchSliderSaveReset/touchRuntime/visual50Views grün; editorMobileTabletDesktop/saveReloadDbUndo48h/editorBrowser/sessionUndo/persistenceBrowser/realTextSave rot (bekannte Churn-Schicht).
- Nachweis Browser: `qa-results/termine-staging.html` (lokal, nicht committed).

## 🔬 Offen

1. **Lab-Lauf für HEAD `3e091ef` hängt/pending seit ~01:10Z** (>25 min; Vergleichsläufe 8–9 min). Kein CircleCI-Token lokal für Detail-Inspektion. Nächster Lauf: Status + Report-Publikation prüfen; falls weiter pending → CircleCI-Web-UI/User.
2. **Report-Publikations-Inkonsistenz**: report.json (7811dbe) vs report.md (2d51c2b) weichen ab, Last-Modified-Datum passt zu keinem der beiden Inhalte sauber. Vermutlich Race zwischen zwei Upload-Jobs. Beobachten; ggf. Publikations-Script (qa/circleci-homepage-lab.sh) auf atomisches Hochladen prüfen.
3. **Churn-Schicht** (unverändert): Editor-/Persistenz-Gates rot trotz dcl-Hang-Fix. Plan Lauf 28: Reentrancy-Guards + Lab-force-Klicks, Churn-Quelle (`image-fallback.js`-Verdacht) final benennen.
4. **Android-Job-Ergebnis** (Thorsten-Smoke real in CI + APK-Build): läuft (pending); Logs als CircleCI-Artefakte (`qa-results/android/thorsten-smoke.log` etc.). Im nächsten Lauf auswerten.
5. Agent-Bar/Menü-Überlappung auf Tablet (`.kp-wa-bar` intercepts Menü-Button).
6. GitHub Billing: User-Aktion (Actions-Runs weiterhin sofort failure; Android-Actions-Workflow startet nicht).

## Abgegrenzte Sicherheitsregeln (strikt eingehalten)

- Nur Staging geprüft (curl + lokaler Wegwerf-Chromium via Playwright, nur lesend, kein Login/kein Schreiben). Production unangetastet.
- Keine Secrets berührt/committed. OpenRouter aktiv; lokale Modelle nur für die künftige Web-App.
- Änderungen minimal & reversibel: (a) Branch `feature/android-build-20260828` FF auf main + 1 Empty-Trigger-Commit (Branch jederzeit zurücksetzbar), (b) HERMES_STATUS-Commit mit `[skip ci]`. Kein Staging-Deploy durch den Android-Branch (Deploy-Jobs sind main-only, verifiziert in .circleci/config.yml).