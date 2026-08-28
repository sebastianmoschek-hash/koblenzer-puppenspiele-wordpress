# HERMES STATUS – Stand 28.08.2026 (Run 19 – Autonomer Wartungslauf)

## Status der Aufgaben

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (4/4 Seiten OK)**:
   - `/termine/`: HTTP 200, 1525ms, Titel „Termine – puppenspiele“, H1 „Termine“, **75 Termin-Karten**, 0 Konsolenfehler, 0 Page-Errors, 0px Overflow.
   - `/`: HTTP 200, 1468ms, 22 Karten, 0 Fehler.
   - `/repertoire/`: HTTP 200, 1448ms, 17 Karten, 0 Fehler.
   - `/kontakt/`: HTTP 200, 1408ms, 1 Karte, 0 Fehler.
   - Fix ist auf Staging live und stabil; Branch `staging/fix-termine-500` ist bereits konsolidiert → **kein Deploy nötig**.

2. **Unified Editor Contract / beforeunload-Fix**: ✅ **Alle lokalen Contracts grün / CI aktiv**:
   - beforeunload-Fix ist in `main` (Commit `a5e3b5c`), `wp-content/mu-plugins/kp-editor-no-beforeunload.php` aktiv.
   - Alle Contract-Tests (`unified-editor-contract.sh`, `word-history-contract.sh`, `text-save-contract.sh`, `create-undo-contract.sh`, `calendar-undo-contract.sh`, `ai-repair-contract.sh`) lokal mit Exit Code 0 bestanden.
   - CircleCI `ci/circleci: editor-contracts` ist **SUCCESS**.
   - Full-Lab-Lauf auf Staging (`ci/circleci: homepage-staging-lab` für Commit `6e3e05f`) läuft derzeit auf CircleCI (Bisect Touch-Stack mit `qa/current-staging-validation.txt` Force-Full-Marker). Kein manueller Trigger nötig.

3. **Thorsten Voice-Smoke-Test**: ℹ️ **In CI integriert (Android & Local-AI Contracts)**:
   - Eine Datei `tests/thorsten-smoke-test.js` existiert nicht im Repo und hat nie existiert.
   - Thorsten-High-Assets und TTS-Funktionalität sind über `qa/prepare-android-natural-voice.sh`, `qa/android-natural-voice-contract.sh`, `qa/local-ai-contract.sh` und `qa/desktop-local-live-smoke.sh` fest in CircleCI eingebunden und getestet.
   - Status: Bestehende CI-Verträge decken Thorsten vollständig ab; User-Entscheidung offen, falls ein zusätzlicher Standalone-JS-Test gewünscht ist.

4. **Branch-Konsolidierung**: ✅ **Bereits vollständig in `main` integriert**:
   - `feature/webapp-primary-agent` ist Ancestor von `main` (bereits gemergt).
   - `ai-repair/local-thorsten-high-v8-20260825` ist Ancestor von `main` (bereits gemergt).
   - Keine offenen Branches oder Merge-Konflikte vorhanden.

## Aktueller CI- & Pipeline-Stand

- `editor-contracts`: **SUCCESS** auf CircleCI
- `mobile-live-staging-deploy`: **SUCCESS** auf CircleCI
- `homepage-staging-lab`: **PENDING / RUNNING** für Commit `6e3e05f` (Voll-Lauf inkl. FTP-Deploy & Browser-Gates mit neutralisiertem Touch-Stack)
- GitHub Actions: Weiterhin durch GitHub-Billing limitiert; CircleCI führt alle Workflows aus.

## Offene Punkte

1. **CircleCI-Lauf `6e3e05f` Auswertung**: Sobald der laufende Full-Lab-Job abschließt, wird ersichtlich, ob der neutralisierte Touch-Stack das dcl-Timeout/Hang behebt oder ob `frontend-editor-v2.js` / `owner-web-app.js` bisected werden müssen.
2. **GitHub Billing**: User-Aktion erforderlich, falls GHA reaktiviert werden soll.

## Sicherheitsregeln (strikt eingehalten)

- NUR Staging (`neu.koblenzer-puppenspiele.de`) geprüft; Production (`koblenzer-puppenspiele.de`) unverändert und unberührt.
- Keine Secrets committed. OpenRouter für Wartungsjobs aktiv.
