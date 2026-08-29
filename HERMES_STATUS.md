# HERMES STATUS – Stand 29.08.2026 (Run 28 – Autonomer Wartungslauf)

## Status der 4 Aufgaben-Defaults

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (dieser Lauf)** — `qa/cron-maintenance-4-termine-check.mjs` (Playwright aus C:/hermes-agent): **4/4 Seiten OK** (`/termine/` 200 in 1,5 s, 75 Termin-Karten, `/` 200, `/repertoire/` 200, `/kontakt/` 200), 0 Console-/Page-Errors, 0 Overflow (Nachweis: `qa-results/latest-check/browser-check-run28.json`, lokal, nicht committed). Zusätzlich curl-Probe: alle 4 Routen 200 in 0,25–0,35 s. Fix ist längst auf Staging deployed; **neuer Kontext seit Run 27**: Commit `3d5fbeb` (SW-Fix, s. u.) — `/termine/` bleibt grün. Production unberührt.
2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ — `a5e3b5c` ist Ancestor von main (verifiziert). Für den aktuellen Funktionsstand `3d5fbeb`: GitHub-Status `editor-contracts` = **SUCCESS**, `mobile-live-staging-deploy` = **SUCCESS**. Kein manueller Trigger nötig. Keine neuen Commits seit Run 27 (HEAD main `127864c`, [skip ci]).
3. **Thorsten Voice-Smoke-Test**: ✅ **Real in CI eingebunden** — Step „Thorsten voice smoke test (models + Kotlin integration)“ mit Fail-fast in `.circleci/config.yml` (Zeilen 69–93: prepare → contract → smoke, RC in qa-results/android/), verifiziert. Android-Job `facaa1a` (Branch `feature/android-build-20260828`): **SUCCESS**; APK (≈279 MB) als privates GitHub-Prerelease `homepage-hilfe-test-facaa1af` vorhanden.
4. **Branch-Konsolidierung**: ✅ **Bereits konsolidiert** — `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` sind Ancestors von main (je 0 Commits hinter origin/main). Kein Merge nötig.

## Neuer Befund Run 28: SW-Fix `3d5fbeb` (vom Run-27-Agenten committet) — **Server-Seite live & browser-verifiziert**

- Commit `3d5fbeb` (03:43, „fix(sw): disable stale response-clone crash in service worker, fix initial webview url“) ist in main; CircleCI hat ihn via `mobile-live-staging-deploy` auf Staging deployed (**SUCCESS**).
- **Live-Nachweis auf Staging (dieser Lauf)**: `/ ?kp_webapp_sw=1` liefert 200 mit `Content-Type: application/javascript` + `Service-Worker-Allowed: /` (Pass-through-SW, fetch-Handler leer, Cache-Deletion bei activate). `kp-sw-unregister`-Script ist in allen Seiten (`wp_footer`). Neues Browser-SW-Probe (`sw-probe.mjs`, Playwright): aktive Registration/Controller auf `/` und `/termine/` = **Pass-through-SW `?kp_webapp_sw=1&v=4.5.29`**, Scope `/`; kein alter Caching-SW mehr, 0 Console-/Page-Errors. Server-Fix funktioniert wie geplant.
- **Noch offen zum Fix**: der Client-Teil (MainActivity.kt: initiale WebView-URL) ist **noch in keinem APK** — letzter APK-Build `facaa1a` basiert auf `5bf8fe5` (VOR 3d5fbeb). → **Android-Neu-Trigger nötig** (s. Offen 5).

## Aktueller CI-Stand

- HEAD main = `8ca873b` (Run-28-Status, [skip ci]); Funktionsstand = `3d5fbeb`.
- GitHub-Status `3d5fbeb` (FINAL, 04:12): serial-start-1/2, editor-contracts, mobile-live-staging-deploy, **homepage-staging-lab SUCCESS** (Report publiziert 02:07:56Z = 04:07 lokal), serial-end-1/2 ✅. Verdicts: staging-infra-, staging-touch-, staging-visual-verdict = SUCCESS; staging-editor-, staging-text-save-, staging-session-undo-, staging-persistence-verdict = FAILURE (**bekannte Churn-Schicht, unverändert**). Gesamtstatus = failure (nur Churn, wie erwartet).
- GitHub Actions: weiterhin alle Actions-Runs sofort failure (Billing-Konto erschöpft, bekannt).
- Android `facaa1a`: `android-homepage-technician` SUCCESS; APK-Release vorhanden (siehe oben).

## 🔬 Offen

1. **Churn-Schicht** (unverändert rot, keine Code-Änderung nötig): Verdicts editor/text-save/session-undo/persistence. Blocker: CircleCI-Logs lokal nicht verfügbar (kein API-Token in Umgebung), Lab publiziert keine Editor-Logs. Plan: instrumentierter Lab-Lauf (force-Klicks/Timing) statt riskantem Eingriff — unverändert.
2. **GitHub Actions Billing**: weiterhin alle Actions-Runs-failure. User-Aktion nötig; CircleCI bleibt funktionierender Runner.
3. **Release `homepage-hilfe-test-v0.10.3`**: existiert, Herkunft unklar, kein Handlungsbedarf.
4. **Agent-Bar/Menü-Überlappung Tablet** (`.kp-wa-bar` intercepts Menü-Button) — unverändert offen.
5. **🆕 APK veraltet vs. main**: Letzter APK-Build `facaa1a` enthält NICHT `3d5fbeb` (SW-Fix + MainActivity-WebView-URL) — Basis war `5bf8fe5`. Damit die App vom SW-Fix profitiert: **Android-Trigger nötig**, wenn die laufende Screen-Capture-Arbeit committed ist: `git checkout -B feature/android-build-20260828 origin/main && git commit --allow-empty -m "ci(android): trigger APK build synced to main (3d5fbeb)" && git push origin feature/android-build-20260828` (Pattern wie Run 25/`facaa1a`). Danach Release `homepage-hilfe-test-<sha>` erwarten.
6. **🆕 Working Tree externes uncommitted Work**: `MainActivity.kt` (63 Insertions: MediaProjection/REQ_SCREEN_CAPTURE=602, LocalVisualAgent-Verdrahtung, liveScreenActive) + `AndroidManifest.xml` wurden am 29.08. um 03:54–03:58 **außerhalb dieses Laufs** verändert (lokaler Gradle-Lauf `.gradle/`-Artefakte, vermutlich User/paralleler Agent beim Screen-Capture-Feature). Datein ist stabil, **NICHT commitcheck/stashed/angefasst** worden. Nächster Run soll zuerst prüfen, ob das committed wurde; falls nicht, kurz als offen notieren, KEINE Änderungen daran.
7. **~~Lab `3d5fbeb` pending~~ → ✅ erledigt innerhalb Run 28**: Lab SUCCESS (Report 3d5fbeb/02:07:56Z, infra/touch/visual-Verdicts grün, Editor-Churn wie erwartet). Kein Handlungsbedarf; Run 29 muss nur den Status-Check wiederholen.

## Abgegrenzte Sicherheitsregeln (strikt eingehalten)

- Nur Staging geprüft (curl + Playwright, nur lesend, kein Login/kein Schreiben). Production unangetastet.
- Keine Secrets berührt/committed. OpenRouter aktiv; lokale Modelle nur für die künftige Web-App.
- Änderungen minimal & reversibel: nur HERMES_STATUS-Commit mit `[skip ci]`. KEIN Android-Trigger (Begründung: externes Working-Tree-Work + Lab pending, s. Offen 5/6). Fremddatei `MainActivity.kt` NICHT angefasst.