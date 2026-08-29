# HERMES STATUS – Stand 29.08.2026 (Run 27 – Autonomer Wartungslauf)

## Status der 4 Aufgaben-Defaults

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (dieser Lauf)** — `qa/cron-maintenance-4-termine-check.mjs` (Playwright aus C:/hermes-agent): **4/4 Seiten OK** (`/termine/` HTTP 200 in 1,54 s, 75 Termin-Karten, `/` 200, `/repertoire/` 200, `/kontakt/` 200), 0 Console-/Page-Errors, 0 Overflow (Nachweis: `qa-results/latest-check/browser-check-run27.json`, lokal, nicht committed). Zusätzlich curl-Probe: `/termine/` 200 in 0,34 s, `/`, `/repertoire/`, `/kontakt/` alle 200. Branch `staging/fix-termine-500` existiert nicht mehr (längst gemergt, `git branch -r` bestätigt); Fix ist über `3e091ef` auf Staging deployed (`mobile-live-staging-deploy` SUCCESS). Kein Deploy nötig, Production unberührt.
2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ **CI grün, kein manueller Trigger nötig** — `a5e3b5c` ist Ancestor von main; GitHub-Status für validierten Commit `3e091ef`: `editor-contracts` SUCCESS, `mobile-live-staging-deploy` SUCCESS, `homepage-staging-lab` SUCCESS (frischer Report 01:34:19Z). Verdicts: infra/touch/visual SUCCESS; editor/text-save/session-undo/persistence FAILURE = bekannte Churn-Schicht (unverändert, s. Offen 1). Keine neuen Commits seit Run 26 (HEAD main = `d51274c`, [skip ci]) — Status identisch, nichts Pending.
3. **Thorsten Voice-Smoke-Test**: ✅ **Real in CI eingebunden und grün** — Step „Thorsten voice smoke test (models + Kotlin integration)“ mit Fail-fast in `.circleci/config.yml` (Zeilen 73–93: prepare → contract → smoke, jeweils RC in qa-results/android/). CircleCI-Job für `facaa1a`: **SUCCESS** (01:30:46Z); APK (292.954.668 Byte ≈ 279 MB) als privates GitHub-Prerelease `homepage-hilfe-test-facaa1af` verifiziert (Asset vorhanden). Zusätzlich Release `homepage-hilfe-test-v0.10.3` (Tag auf 3e091ef) weiterhin vorhanden.
4. **Branch-Konsolidierung**: ✅ **Bereits konsolidiert** — `feature/webapp-primary-agent` (e7f8ec1) und `ai-repair/local-thorsten-high-v8-20260825` (cfa17f6) sind Ancestors von main (0 Commits hinter HEAD). Kein Merge nötig. `feature/android-build-20260828` = 1 Commit vor main (`facaa1a`, Android-CI-Trigger) — bewusst nicht gemergt, ist der Android-Branch-Head mit SUCCESS-Status.

## Aktueller CI-Stand

- HEAD main = `d51274c` (Run-26-Status, [skip ci]). Validierter Funktionsstand = `3e091ef`. Android-Branch-Head = `facaa1a`.
- GitHub-Status `3e091ef`: serial-start/end ✅, editor-contracts ✅, mobile-live-staging-deploy ✅, homepage-staging-lab ✅, Verdicts infra/touch/visual ✅, Verdicts editor/text-save/session-undo/persistence ❌ (Churn-Schicht). Gesamtstatus = failure (nur Churn).
- GitHub-Status `facaa1a`: `android-homepage-technician` = **SUCCESS** (01:30:46Z); APK-Release `homepage-hilfe-test-facaa1af` vorhanden.
- Lab-Report `latest/report.json` = Commit `3e091ef`, generatedAt 01:34:19Z — unverändert seit Run 26, kein neuer Lab-Lauf.

## 🔬 Offen

1. **Churn-Schicht** (unverändert rot): editor/text-save/session-undo/persistence-Verdicts. **Neue Befunde aus Run 27 (statische Analyse, kein Raten in Code-Änderungen):**
   - **image-fallback.js-Verdacht (aus Run 25) abgeschwächt**: `image-fallback.js` ist global enqueued (Theme functions.php, alle Seiten inkl. Editor), mutiert aber nur kaputte Bilder (naturalWidth=0 → src/srcset/sizes-Entfernung + Fallback-Queue). Frische lesende Browser-Probe auf Staging (`/` und `/repertoire/`, Mobile-Viewport): **0 kaputte Bilder** → auf den öffentlichen Seiten hat der Fallback aktuell nichts zu mutieren. Interaktion mit dem Editor bliebe nur im authentifizierten kp_edit-Kontext denkbar (dort nicht prüfbar ohne Bridge-Token).
   - **Reentrancy-Guard existiert bereits**: `owner-save-coordinator.js` flushAll() hat `if(flushing)return flushing` + Button-Disable während des Speicherns (Zeilen 137–156, 163–179). Reentrancy ist damit als Churn-Quelle unwahrscheinlich; der Run-28-Plan sollte sich auf **Lab-force-Klicks + Boot-Timing-Instrumentierung** konzentrieren statt auf neue Guards.
   - **Blocker für definitive Benennung**: Die CircleCI-Job-Logs der fehlgeschlagenen Checks sind lokal nicht verfügbar (kein CircleCI-API-Token in dieser Umgebung, Secrets nur in CircleCI-Projekteinstellungen) und der Lab-Report publiziert nur report.json/report.md + visual/, keine Editor-Logs/-Screenshots. Nächster konkreter Schritt: Run 28 mit instrumentiertem Lab-Lauf (force-Klicks, Timing-Marker) gemäß Plan aus Run 25; bis dahin kein riskanter Code-Eingriff.
2. **GitHub Actions Billing**: weiterhin alle Actions-Runs sofort failure (Check-Runs 3e091ef 01:10–01:11Z). User-Aktion nötig; CircleCI bleibt funktionierender Runner.
3. **Release `homepage-hilfe-test-v0.10.3`**: existiert (Tag auf 3e091ef), Herkunft unklar (nicht CircleCI-SHA-Muster). Kein Handlungsbedarf, nur Dokumentation.
4. Agent-Bar/Menü-Überlappung auf Tablet (`.kp-wa-bar` intercepts Menü-Button) — unverändert offen.

## Abgegrenzte Sicherheitsregeln (strikt eingehalten)

- Nur Staging geprüft (curl + lokaler Wegwerf-Chromium via Playwright, nur lesend, kein Login/kein Schreiben). Production unangetastet.
- Keine Secrets berührt/committed. OpenRouter aktiv; lokale Modelle nur für die künftige Web-App.
- Änderungen minimal & reversibel: nur HERMES_STATUS-Commit mit `[skip ci]`. Kein Staging-Deploy durch diesen Lauf (nichts zu deployen).