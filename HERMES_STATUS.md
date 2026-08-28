# HERMES STATUS – Stand 28.08.2026 (Run 20 – Autonomer Wartungslauf)

## Status der Aufgaben

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (4/4 Seiten OK, Playwright/Chromium)**:
   - `/termine/`: HTTP 200, 1528ms, H1 „Termine“, **75 Termin-Karten**, 0 Overflow, 0 Konsolenfehler, 0 Page-Errors.
   - `/`: HTTP 200, 1480ms, 22 Karten; `/repertoire/`: HTTP 200, 1435ms, 17 Karten; `/kontakt/`: HTTP 200, 1402ms, 1 Karte — alle 0 Fehler.
   - Fix ist auf Staging live und stabil; Branch `staging/fix-termine-500` existiert nicht mehr (bereits konsolidiert) → **kein Deploy nötig**. Produktion unberührt.

2. **Unified Editor Contract / beforeunload-Fix**: ✅ **In main + CI grün**:
   - beforeunload-Fix `a5e3b5c` ist Ancestor von `main` (bestätigt), `wp-content/mu-plugins/kp-editor-no-beforeunload.php` aktiv (5 beforeunload-Matches im Datei-Check).
   - CircleCI `ci/circleci: editor-contracts` = **SUCCESS** (für 6e3e05f und 4b278a1 per GitHub-Commit-Status verifiziert). **Kein manueller Trigger nötig.**
   - Gesamt-CI auf main ist nur wegen der bekannten dcl-Hang-Bisect-Gates rot (separates Thema, s. u.).

3. **Thorsten Voice-Smoke-Test**: ⚠️ **`tests/thorsten-smoke-test.js` existiert NICHT** (kein `tests/`-Verzeichnis im Repo; auch nie vorhanden — Annahme der Aufgabe ≠ Realität, nicht raten, sondern offen notieren):
   - Thorsten-High-Abdeckung läuft stattdessen fest in CircleCI: `qa/prepare-android-natural-voice.sh` + `qa/android-natural-voice-contract.sh` (Asset-Contract: `de_DE-thorsten-high.onnx`, `tokens.txt`, `espeak-ng-data`), dazu Local-AI-/Desktop-Contracts.
   - **Offene User-Entscheidung**: Soll ein eigenständiger `tests/thorsten-smoke-test.js` angelegt und in CI verdrahtet werden? (Vorschlag: Node-Smoke, der ONNX-Assets + sherpa-onnx-Synthese prüft.) Ich lege ohne Rückmeldung keinen neuen Testpfad an.

4. **Branch-Konsolidierung**: ✅ **Beide Branches bereits vollständig in main integriert**:
   - `feature/webapp-primary-agent` = Ancestor von `main` (gemergt, keine Konflikte).
   - `ai-repair/local-thorsten-high-v8-20260825` = Ancestor von `main` (gemergt, keine Konflikte).
   - Lokale Branches per `git branch -d` bereinigt (sicher, nur gemergte). Remote-Refs bleiben als Historie erhalten; können bei Bedarf geprunt werden.

## Neu in Run 20: Bisect-Fortschritt (dcl-Hang / Editor-Gates)

- **Lauf-18-Auswertung (6e3e05f, Modus FULL, veröffentlicht 20:55:54Z)**: Deploy/Staging/Bridge/**Touch**/Visual = success; **Editor/Persistence/TextSave/SessionUndo = failure** → **Touch-Stack zu 100% exculpiert** (der zuletzt einzige Pending kp_touch_free_layout_load war Symptom, nicht Ursache).
- **BISECT Lauf 19 gepusht (`b98ddfb`)**: Stub in `qa/homepage-editor-lab.mjs` deaktiviert jetzt `kp-frontend-editor-v2-js` + `kp-owner-web-app-js` (KPOwnerWebApp-Boot + Basis) per addInitScript vor Ausführung; Touch-Stub entfernt (keine Mit-Abschaltung → kein verfälschter Lauf); v1-Marker-Reste `qa/bisect-frontend-editor.txt` + `qa/bisect-touch-stack.txt` gelöscht; `qa/bisect-frontend-v2-owner.txt` neu; Force-Full-Marker aktualisiert (voller Staging-Deploy inkl. mu-plugins). CircleCI-Lauf startet automatisch durch den Push.

## Aktueller CI- & Pipeline-Stand

- `editor-contracts`: **SUCCESS** (CircleCI)
- `mobile-live-staging-deploy`: **SUCCESS** (CircleCI)
- `homepage-staging-lab` (6e3e05f): **abgeschlossen** — Touch/Visual/Deploy grün, Editor/Persistence/TextSave/SessionUndo rot (Bisect-Zwischenstand)
- `homepage-staging-lab` (b98ddfb): **läuft** (Bisect Lauf 19)
- GitHub Actions: weiterhin durch Billing limitiert („CircleCI staging report handoff“-Jobs failed/cancelled); CircleCI übernimmt alle Workflows.

## Offene Punkte

1. **Lauf-19-Auswertung (b98ddfb)**: Sobald der Lab-Lauf fertig ist: Feuert dcl wieder / verlassen die Editor-Gates das Event-0-Bild → v2/Owner-Boot ist der Übeltäter (dann in Lauf 20 `kp-owner-web-app-js` allein einkreisen); bleibt der Hang → nächster Kandidat Owner-/Adminbar-Pfad der kp_e2e_login-Sequenz.
2. **Thorsten-Standalone-Test**: User-Entscheidung ob/ wie `tests/thorsten-smoke-test.js` angelegt wird (bestehende CI-Contracts decken Thorsten bereits ab).
3. **GitHub Billing**: User-Aktion erforderlich, falls GHA reaktiviert werden soll.

## Sicherheitsregeln (strikt eingehalten)

- NUR Staging (`neu.koblenzer-puppenspiele.de`) geprüft; Production (`koblenzer-puppenspiele.de`) unverändert und unberührt.
- Bisect-Stubs wirken ausschließlich im CI-Browser (addInitScript, Marker-gesteuert, reversibel) — kein Eingriff in Theme/Plugin-Deployment-Inhalte.
- Keine Secrets committed. OpenRouter für Wartungsjobs aktiv.