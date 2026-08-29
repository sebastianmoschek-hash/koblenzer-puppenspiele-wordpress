# HERMES STATUS – Stand 29.08.2026 (Run 29 – Autonomer Wartungslauf)

## Status der 4 Aufgaben-Defaults

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (dieser Lauf)** — `qa/cron-maintenance-4-termine-check.mjs` (Playwright aus C:/hermes-agent): **4/4 Seiten OK** (`/termine/` 200, `/` 200, `/repertoire/` 200, `/kontakt/` 200), 0 Console-/Page-Errors, 0 Overflow (Nachweis: `qa-results/latest-check/browser-check-run29.json`, lokal, nicht committed). Zusätzlich curl-Probe: alle 4 Routen 200 in 0,21–0,31 s. **Hinweis**: Branch `staging/fix-termine-500` existiert nicht mehr (weder lokal noch remote nach `fetch --prune`) — der Fix ist bereits konsolidiert und deployed; kein Deploy/kein Merge mehr nötig. Production unberührt.
2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ — `a5e3b5c` ist Ancestor von main. Für den Funktionsstand `3d5fbeb`: GitHub-Status `editor-contracts` = **SUCCESS**, `mobile-live-staging-deploy` = **SUCCESS**, `homepage-staging-lab` = SUCCESS. Kein manueller Trigger nötig. Keine neuen Code-Commits seit Run 28 (HEAD main `e92f619`, [skip ci]).
3. **Thorsten Voice-Smoke-Test**: ✅ **Real in CI eingebunden** — Steps in `.circleci/config.yml` (Zeilen ~69–94): `qa/prepare-android-natural-voice.sh` → `qa/android-natural-voice-contract.sh` → `qa/thorsten-voice-smoke-test.sh`, jeweils mit RC-Fail-fast (Logs+RC nach `qa-results/android/`). Android-Job `facaa1a`: SUCCESS (APK ≈279 MB als privates GitHub-Prerelease `homepage-hilfe-test-facaa1af`). Verifiziert, kein Handlungsbedarf.
4. **Branch-Konsolidierung**: ✅ **Bereits konsolidiert** — `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` sind beides Ancestors von origin/main (je 0 Commits hinter). Kein Merge nötig.

## Aktueller CI-Stand

- HEAD main = `e92f619` (Run-28-Nachtrag, 04:11, [skip ci]); kein neuer Code-Commit seit Run 28. Funktionsstand = `3d5fbeb`.
- GitHub-Status `3d5fbeb` (geprüft via `gh api`): `serial-start-1/2`, `editor-contracts`, `mobile-live-staging-deploy`, `homepage-staging-lab`, `serial-end-1/2` = alle **SUCCESS**; Verdicts `staging-infra-`, `staging-touch-`, `staging-visual-` = SUCCESS; `staging-editor-`, `staging-text-save-`, `staging-session-undo-`, `staging-persistence-verdict` = FAILURE (**bekannte Churn-Schicht, unverändert, keine Code-Änderung nötig**). Gesamtstatus = failure (nur Churn).
- GitHub Actions (check-runs): weiterhin alle failure/skipped (Billing-Konto erschöpft, bekannt — kein primärer Runner).
- Android `facaa1a`: SUCCESS (siehe oben). Kein neuer Trigger in diesem Lauf (Begründung s. Offen 5).

## 🔬 Offen

1. **Churn-Schicht** (unverändert rot, keine Code-Änderung nötig): Verdicts editor/text-save/session-undo/persistence. Blocker: CircleCI-Logs lokal nicht verfügbar (kein Token), Lab publiziert keine Editor-Logs. Plan: instrumentierter Lab-Lauf (force-Klicks/Timing) statt riskantem Eingriff — unverändert.
2. **GitHub Actions Billing**: weiterhin alle Actions-Runs failure. User-Aktion nötig; CircleCI bleibt funktionierender Runner.
3. **Release `homepage-hilfe-test-v0.10.3`**: existiert, Herkunft unklar, kein Handlungsbedarf.
4. **Agent-Bar/Menü-Überlappung Tablet** (`.kp-wa-bar` intercepts Menü-Button) — unverändert offen.
5. **🔄 APK weiterhin veraltet vs. main**: Letzter APK-Build `facaa1a` basiert auf `5bf8fe5` (VOR `3d5fbeb`); der SW-Fix + MainActivity-WebView-URL-Client-Teil sind **noch in keinem APK**. **KEIN Trigger in Run 29** — das externe Working-Tree-Work (s. Offen 6) ist weiterhin uncommitted; **(a) das Working-Tree-Work committed ist**, (b) Trigger gewünscht: `git checkout -B feature/android-build-20260828 origin/main && git commit --allow-empty -m "ci(android): trigger APK build synced to main (3d5fbeb)" && git push origin feature/android-build-20260828`. Danach Release `homepage-hilfe-test-<sha>` erwarten.
6. **🔄 Working Tree externes uncommitted Work**: `MainActivity.kt` (67 Insertions, MediaProjection/REQ_SCREEN_CAPTURE=602, LocalVisualAgent, liveScreenActive) + `AndroidManifest.xml` weiterhin **uncommitted** (mtime 03:58–04:01, unverändert seit Run 28). Dateien stabil, wurden weder committed noch gestashed noch angefasst — im Run 29 NICHT angefasst, wie vereinbart. Wenn es in Run 30 weiterhin uncommitted ist: weiter als offen notieren, keine Änderungen.
7. **Neu in Run 29**: nichts Routenbezügliches aufgetreten; `/termine/` + restliche Routen frisch browser-grün (4/4). Kein neuer Befund.

## Abgegrenzte Sicherheitsregeln (strikt eingehalten)

- Nur Staging geprüft (curl + Playwright, nur lesend, kein Login/kein Schreiben). Production unangetastet.
- Keine Secrets berührt/committed. OpenRouter aktiv; lokale Modelle nur für die künftige Web-App.
- Änderungen minimal & reversibel: nur HERMES_STATUS-Commit mit `[skip ci]`. KEIN Android-Trigger, KEIN Merge (nichts nötig), Fremddateien (MainActivity.kt, AndroidManifest.xml) NICHT angefasst.