# HERMES STATUS – Stand 29.08.2026 (Run 31 – Autonomer Wartungslauf)

## Status der 4 Aufgaben-Defaults

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (dieser Lauf)** — `qa/cron-maintenance-4-termine-check.mjs` (headless Playwright, nur lesend): **4/4 Seiten OK** (`/termine/` 200, `/` 200, `/repertoire/` 200, `/kontakt/` 200), 0 Console-/Page-Errors, 0 Overflow (Nachweis: `qa-results/latest-check/browser-check-run31.json`, lokal, nicht committed). Zusätzlich curl-Probe: alle 4 Routen 200 in 0,21–0,28 s. Branch `staging/fix-termine-500` existiert weiterhin nicht (nach fetch --prune) — Fix ist konsolidiert und deployed. Kein Deploy/kein Merge nötig. Production unberührt.
2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ — kein neuer Funktions-Commit seit Run 30; CI-Stand für `3d5fbeb` unverändert (via `gh api`): Pipeline-Gates (`serial-start-1/2`, `editor-contracts`, `mobile-live-staging-deploy`, `homepage-staging-lab`, `serial-end-1/2`) + Verdicts `staging-infra-`, `staging-touch-`, `staging-visual-` = **SUCCESS**; `staging-editor-`, `staging-text-save-`, `staging-session-undo-`, `staging-persistence-` = FAILURE (**bekannte Churn-Schicht, unverändert, keine Code-Änderung nötig**). Kein manueller Trigger nötig.
3. **Thorsten Voice-Smoke-Test**: ✅ — **Weiterhin real in CI eingebunden** (`.circleci/config.yml` Zeilen 69/73/78/82/87/91: assets-prepare → contract → smoke, RC-Fail-fast). Keine Änderung seit Run 28. Kein Handlungsbedarf; kein neuer Android-Trigger (Begründung s. Offen 5).
4. **Branch-Konsolidierung**: ✅ **Bereits konsolidiert** — `origin/feature/webapp-primary-agent` und `origin/ai-repair/local-thorsten-high-v8-20260825` sind nach fetch --prune weiterhin **je 0 Commits** hinter `origin/main` (Ancestor). Kein Merge nötig.

## Aktueller CI-Stand

- HEAD main = `0d2f28c` (Run-30-Status, [skip ci]); **kein neuer Code-Commit seit Run 30**. Funktionsstand unverändert = `3d5fbeb`.
- GitHub-Status `3d5fbeb` (via `gh api`, Repo `sebastianmoschek-hash/koblenzer-puppenspiele-wordpress`): Gates + Infra/Touch/Visual-Verdicts = SUCCESS; nur Churn-Cluster rot. Gesamtstatus = failure (nur Churn).
- CircleCI-Lab-Report (`.../kp-homepage-lab/latest/report.json`): `generatedAt 2026-08-29T02:07:56Z`, commit `3d5fbeb` — **unverändert**; kein neuer Lauf, da kein neuer Funktions-Commit.
- GitHub Actions check-runs: weiterhin failure/skipped (Billing-Konto erschöpft, bekannt — CircleCI bleibt primärer Runner).
- Android `facaa1a`: SUCCESS (historisch verifiziert). Kein neuer Trigger (s. Offen 5).
- Working Tree: exakt identisch zu Run 30 (`AndroidManifest.xml` + `MainActivity.kt` uncommitted, externes Work, unangetastet).

## 🔬 Offen (unverändert zu Run 30)

1. **Churn-Schicht** (editor, text-save, session-undo, persistence): weiterhin rot ohne Code-Änderung; Blocker: CircleCI-Logs ohne Token lokal nicht verfügbar. Plan: instrumentierter Lab-Lauf — unverändert.
2. **GitHub Actions Billing**: weiterhin alle Actions-Runs failure. User-Aktion nötig; CircleCI funktioniert.
3. **Release `homepage-hilfe-test-v0.10.3`**: existiert, Herkunft unklar, kein Handlungsbedarf.
4. **Agent-Bar/Menü-Überlappung Tablet** (`.kp-wa-bar` intercepts Menü-Button) — unverändert offen.
5. **🔄 APK weiterhin veraltet vs. main**: Letzter APK-Build `facaa1a` basiert auf `5bf8fe5` (vor `3d5fbeb`). KEIN Trigger in Run 31 — uncommitted externes Working-Tree-Work (Offen 6) blockiert weiterhin; Entscheidung nötig, ob/wann dieses kommittet wird.
6. **🔄 Working Tree externes uncommitted work** (`MainActivity.kt` MediaProjection/LocalVisualAgent, `AndroidManifest.xml`): unverändert, vereinbarungsgemäß NICHT angefasst.
7. **Run 31**: keine routenbez. Neufunde; `/termine/` + restliche Routen frisch browser-grün (4/4). Kein neuer Commit seit 04:21 (Run 30).

## Abgegrenzte Sicherheitsregeln (strikt eingehalten)

- Nur Staging geprüft (curl + Playwright headless, nur lesend, kein Login/kein Schreiben). Production unangetastet.
- Keine Secrets berührt/committed. Telegram-Abschlussmeldung über `.env`-Token (nicht im Repo). OpenRouter aktiv; lokale Modelle nur für die künftige Web-App.
- Änderungen minimal & reversibel: nur HERMES_STATUS-Commit mit `[skip ci]`. KEIN Android-Trigger, KEIN Merge (nichts nötig), Fremddateien (MainActivity.kt, AndroidManifest.xml) NICHT angefasst.