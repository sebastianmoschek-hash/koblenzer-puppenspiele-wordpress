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
- **BISECT Lauf 19 vorbereitet (`b98ddfb`)**: Stub in `qa/homepage-editor-lab.mjs` deaktiviert jetzt `kp-frontend-editor-v2-js` + `kp-owner-web-app-js` (KPOwnerWebApp-Boot + Basis) per addInitScript vor Ausführung; Touch-Stub entfernt (keine Mit-Abschaltung → kein verfälschter Lauf); v1-Marker-Reste `qa/bisect-frontend-editor.txt` + `qa/bisect-touch-stack.txt` gelöscht; `qa/bisect-frontend-v2-owner.txt` neu.
- **⚠️ Stolperstein behoben (Push-Head-Überlagerung)**: `b98ddfb` wurde zusammen mit dem Docs-Commit gepusht — CircleCI baut nur den Push-Head (Docs → `circleci-classify.sh` → „docs-only, kein Lab“ → STOP). Der Bisect-Lauf lief dadurch zunächst NICHT. Lösung: **Marker-ONLY-Commit `fad7af0`** (einzige Änderung = `qa/current-staging-validation.txt`) → `force_full`-Pfad im Klassifizierer → der **FULL-Lab-Lauf lief komplett durch**. Wichtig für künftige Läufe: Bisect-/Marker-Commits **immer separat pushen**, niemals gebündelt mit HERMES_STATUS.md.
- **🔬 Lauf-19-Auswertung (`fad7af0`, Modus FULL, veröffentlicht 00:03:31Z+2h): v2/Owner-Boot EXCULPIERT — mit harter Evidenz aus `latest/diagnostics.txt`**:
  - Stub war aktiv (Log: „BISECT aktiv: kp-frontend-editor-v2 + kp-owner-web-app … deaktiviert“), Server-Render gesund (AUTHRENDER 200/618ms, AUTHPOST kp_touch_free_layout_load 200/144ms).
  - **dcl-Hang bleibt**: LOGIN-GOTO Timeout 45s; NETTRACE 84 Requests, **1 Pending = POST `admin-ajax.php action=kp_touch_free_layout_load`** — derselbe Blocker wie in Runs 15–18, obwohl v2+owner aus sind.
  - Gates: deploy/ready/bridge/touch/visual = success; editor/persistence/text-save/session-undo = failure (editor kann mit gestubbtem Kern logischerweise nicht grün sein).
  - Damit sind exculpiert: Server+Auth (Run 15/16), v1 KPFrontendEditor (17), Touch-Stack (18), **v2+owner-web-app (19)**. Der Blocker-POST wird von einem Script ISSUED, das in KEINEM bisherigen Stub-Set lag → nächste Kandidaten: verbleibende Owner-/Bridge-Scripts (`kp-touch-editor-bridge-js` war in keinem Set!) + Adminbar-/Login-Pfad.
- **🎯 Lauf-20-Plan (nächster Lauf, vorbereitet)**: Kein weiteres Blind-Stubbing — Stub-Set komplett deaktivieren und stattdessen im Lab **XHR-Instrumentierung** einbauen (addInitScript wrappt `XMLHttpRequest.open`/`fetch` und loggt `async`-Flag + aufrufendes Script per `document.currentScript`/Stack), damit der Issuer des Sync-Hangs direkt benannt wird. Vermuteter Mechanismus: **synchroner XHR** auf kp_touch_free_layout_load blockiert den Parser → dcl feuert nie (passt zu „0 Events, 1 Pending, Server sonst 145–154ms“). QA-Mode-Lauf reicht (kein Deploy nötig, Staging-Code = main).

## Aktueller CI- & Pipeline-Stand

- `editor-contracts`: **SUCCESS** (CircleCI)
- `mobile-live-staging-deploy`: **SUCCESS** (CircleCI)
- `homepage-staging-lab` (fad7af0): **abgeschlossen, Modus FULL** — deploy/ready/bridge/touch/visual grün, editor/persistence/text-save/session-undo rot (Bisect-Ergebnis s. o.)
- Pipeline für `b98ddfb` wurde nie gebaut (Push-Head-Überlagerung durch Docs-Commit, s. o.).
- GitHub Actions: weiterhin durch Billing limitiert („CircleCI staging report handoff“-Jobs failed/cancelled); CircleCI übernimmt alle Workflows.

## Offene Punkte

1. **Lauf 20: XHR-Issuer-Instrumentierung** (Plan steht, s. o.): Lab-patch (qa-only, eigenständiger Push), QA-Mode-Lauf genügt; Ziel: das aufrufende Script des Blockers `admin-ajax.php action=kp_touch_free_layout_load` (Verdacht: synchroner XHR) direkt benennen → dann gezielter Fix statt weiterem Bisect.
2. **Thorsten-Standalone-Test**: User-Entscheidung ob/ wie `tests/thorsten-smoke-test.js` angelegt wird (bestehende CI-Contracts decken Thorsten bereits ab).
3. **GitHub Billing**: User-Aktion erforderlich, falls GHA reaktiviert werden soll.

## Sicherheitsregeln (strikt eingehalten)

- NUR Staging (`neu.koblenzer-puppenspiele.de`) geprüft; Production (`koblenzer-puppenspiele.de`) unverändert und unberührt.
- Bisect-Stubs wirken ausschließlich im CI-Browser (addInitScript, Marker-gesteuert, reversibel) — kein Eingriff in Theme/Plugin-Deployment-Inhalte.
- Keine Secrets committed. OpenRouter für Wartungsjobs aktiv.