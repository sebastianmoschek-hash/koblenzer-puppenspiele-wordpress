# HERMES STATUS – Stand 29.08.2026 (Run 26 – Autonomer Wartungslauf)

## Status der 4 Aufgaben-Defaults

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (dieser Lauf)** — `/termine/` HTTP 200 (0,26 s), Browser-Smoke `qa/cron-maintenance-4-termine-check.mjs` (Playwright aus C:/hermes-agent): **4/4 Seiten OK** (`/termine/` 22 Karten, `/`, `/repertoire/`, `/kontakt/`), 0 Console-/Page-Errors, 0 Overflow. Branch `staging/fix-termine-500` existiert nicht mehr (längst gemergt); Fix ist über `3e091ef` auf Staging deployed (`mobile-live-staging-deploy` SUCCESS). Kein Deploy nötig, Production unberührt.
2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ **CI grün, kein manueller Trigger nötig** — `a5e3b5c` als Ancestor von main verifiziert. GitHub-Status für validierten Commit `3e091ef`: `editor-contracts` SUCCESS, `mobile-live-staging-deploy` SUCCESS, `homepage-staging-lab` **SUCCESS** (frischer Report 01:34:19Z, publiziert 01:36:25Z — der in Run 25 noch pendende Lab-Lauf ist durchgelaufen). Verdicts: infra/touch/visual SUCCESS; editor/text-save/session-undo/persistence FAILURE = bekannte Churn-Schicht (unverändert, s. Offen 1).
3. **Thorsten Voice-Smoke-Test**: ✅ **Real in CI gelaufen und grün** — Step „Thorsten voice smoke test (models + Kotlin integration)" ist mit Fail-fast (`exit "$rc"`) in `.circleci/config.yml` (android-homepage-technician) eingebunden. CircleCI-Job für Trigger-Commit `facaa1a`: **SUCCESS** (Status 01:30:46Z), APK (279 MB) als privates GitHub-Prerelease `homepage-hilfe-test-facaa1af` publiziert (Asset-Upload 01:30:41Z). Lokaler Gegencheck `qa/thorsten-voice-smoke-test.sh`: **PASS (RC=0)** inkl. `android-natural-voice-contract.sh`. Zusätzlich existiert Release `homepage-hilfe-test-v0.10.3` (Tag auf `3e091ef`, APK 01:11:13Z) — Herkunft nicht eindeutig (nicht CircleCI-SHA-Tag-Muster, kein Actions-Workflow in Check-Runs), für User nutzbar.
4. **Branch-Konsolidierung**: ✅ **Bereits konsolidiert** — `feature/webapp-primary-agent` (e7f8ec1) und `ai-repair/local-thorsten-high-v8-20260825` (cfa17f6) sind Ancestors von main (0 Commits hinter HEAD). Kein Merge nötig.

## Aktueller CI-Stand

- HEAD main = `2f04cb5` (Run-25-Status, [skip ci]). Validierter Funktionsstand = `3e091ef`. Android-Branch-Head = `facaa1a`.
- GitHub-Status `3e091ef` (vollständig): serial-start/end ✅, editor-contracts ✅, mobile-live-staging-deploy ✅, homepage-staging-lab ✅, Verdicts infra/touch/visual ✅, Verdicts editor/text-save/session-undo/persistence ❌ (Churn-Schicht). Gesamtstatus des Commits = failure (nur Churn).
- GitHub-Status `facaa1a`: `android-homepage-technician` = **SUCCESS** (01:30:46Z), APK-Release `homepage-hilfe-test-facaa1af` vorhanden.
- Frischer Lab-Report: `latest/report.json` = Commit `3e091ef`, generatedAt 01:34:19Z; `report.md` identisch (3e091ef, 01:34:19Z) — **Publikations-Race aus Run 25 trat diesmal nicht auf** (json/md konsistent).
- Nachweis Browser: `qa-results/termine-staging.html` (lokal, nicht committed).

## 🔬 Offen

1. **Churn-Schicht** (unverändert, jetzt vollständig belegt): editor/text-save/session-undo/persistence-Verdicts rot trotz dcl-Hang-Fix und grünem Lab-Job. Plan Lauf 28 (aus Run 25): Reentrancy-Guards + Lab-force-Klicks, Churn-Quelle (`image-fallback.js`-Verdacht) final benennen. Kein neuer Regressionstrend sichtbar (infra/touch/visual weiter grün).
2. **GitHub Actions Billing**: weiterhin alle Actions-Runs sofort failure (Check-Runs 3e091ef: inventory/sync/publish/orchestrate etc. 01:10–01:11Z). User-Aktion nötig; CircleCI bleibt funktionierender Runner.
3. **Release `homepage-hilfe-test-v0.10.3`**: existiert (Tag auf 3e091ef), aber nicht über das CircleCI-SHA-Tag-Muster erzeugt; Herkunft unklar (vermutlich manuell). Kein Handlungsbedarf, nur Dokumentation.
4. Agent-Bar/Menü-Überlappung auf Tablet (`.kp-wa-bar` intercepts Menü-Button) — unverändert offen.

## Abgegrenzte Sicherheitsregeln (strikt eingehalten)

- Nur Staging geprüft (curl + lokaler Wegwerf-Chromium via Playwright, nur lesend, kein Login/kein Schreiben). Production unangetastet.
- Keine Secrets berührt/committed. OpenRouter aktiv; lokale Modelle nur für die künftige Web-App.
- Änderungen minimal & reversibel: nur HERMES_STATUS-Commit mit `[skip ci]`. Kein Staging-Deploy durch diesen Lauf (nichts zu deployen).