# HERMES STATUS – Stand 29.08.2026 (Run 22 – Autonomer Wartungslauf, früh)

## Status der 4 Aufgaben-Defaults

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (4/4 OK, lokaler Chromium-Test)** — `/termine/` (HTTP 200, 7.217 Zeichen, 0 Console-/Page-Errors, 0 Overflow), `/`, `/repertoire/`, `/kontakt/` (2×) alle 200. Guest-AJAX `kp_touch_free_layout_load` (post-12) 5× 200 (0.12s). Fix stabil, keine Regression durch die neuen Deploys. Produktion unberührt.
2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ **In main, CI grün, kein manueller Trigger nötig** — `editor-contracts` SUCCESS (Commit-Status a5e3b5c verifiziert). Für HEAD (2d51c2b) läuft das CircleCI-Lab automatisch (Stand: pending), `mobile-live-staging-deploy` bereits SUCCESS.
3. **Thorsten Voice-Smoke-Test**: ⚠️ **Unverändert offen (User-Entscheidung)** — `tests/thorsten-smoke-test.js` existiert weiterhin NICHT (kein `tests/`-Verzeichnis im Repo). Thorsten-High ist fest in CircleCI abgedeckt: `qa/prepare-android-natural-voice.sh` + `qa/android-natural-voice-contract.sh` (config.yml Z. 73–84). Kein neuer Testpfad ohne Rückmeldung angelegt.
4. **Branch-Konsolidierung**: ✅ **Nichts zu tun** — `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` sind beide Ancestors von main (bereits integriert; erneut verifiziert gegen HEAD 2d51c2b).

## Beobachtung: transiente 500er im Deploy-Fenster (Neu)

- Während das CircleCI-Lab HEAD (2d51c2b) deployte (FTP-Force-Deploy ~00:40–00:42Z) lieferten einzelne **erste, ungecachte Requests** 500: `/kontakt/` 1× (Browser + curl try1) und `admin-ajax.php kp_touch_free_layout_load` auf der Startseite. Danach stabil 200 (curl 5×, Browser 2×).
- Einordnung: kein persistenter Fehler, kein Produkt-Regress; klassischer First-Hit-während-Deploy-Effekt (halb hochgeladene Dateien). Empfehlung für später: Post-Deploy-Healthcheck im Lab (nach `deploy`-Step: `/` + `/kontakt/` + `/termine/` 1× warmlaufen lassen), damit solche Fenster in Reports nicht als Error erscheinen.

## Aktueller CI-Stand

- HEAD main = `2d51c2b` (Android-UI-UX + `kp-mobile-live-bridge.php`: „KI live zeigen“-Button per UA-Check `KoblenzerPuppenspieleTechnician/` in der App ausgeblendet — trivial, verhaltensneutral auf Staging).
- Labs: für 2d51c2b **pending** (automatisch gestartet); letztes publiziertes Report: 68f5092 (Lauf 27, 00:33Z) `success:false` mit bekannter Churn-Schicht (editor/persistence/session-undo/text-save rot; deploy/stagingReady/bridge/touch/visual/infra grün).
- a5e3b5c-Status: `editor-contracts` SUCCESS, `homepage-staging-lab` SUCCESS; rote Verdicts nur die bekannten (text-save, persistence, editor, session-undo).
- GitHub Actions weiterhin Billing-limitiert (publish/orchestrate/deploy-Check-Runs an HEAD rot/übersprungen — bekannt, CircleCI übernimmt).

## 🔬 Offen (unverändert aus Lauf 21/27)

1. **Churn-Schicht**: Editor-/Persistenz-Gates rot trotz dcl-Hang-Fix — Class-Churn `touch-free-layout.js applySaved()→clearGenericTransform()` ↔ `touch-gestures.js applyValue()` ↔ `kp-canva-keys assign()`; Verdacht `image-fallback.js`-Replacement-Loop. Lauf-28-Plan: Reentrancy-Guards + Lab-force-Klicks, Churn-Quelle final benennen.
2. Agent-Bar/Menü-Überlappung auf Tablet (`.kp-wa-bar` intercepts Menü-Button).
3. Thorsten-Standalone-Test (`tests/thorsten-smoke-test.js`): existiert nicht — User-Entscheidung, ob angelegt werden soll.
4. GitHub Billing: User-Aktion.

## Abgegrenzte Sicherheitsregeln (strikt eingehalten)

- Nur Staging geprüft (Browser/curl, lokaler Wegwerf-Playwright, Temp-Dateien außerhalb des Repos). Production unangetastet.
- Keine Secrets berührt/committed. OpenRouter aktiv; lokale Modelle nur für die künftige Web-App.
- HERMES_STATUS-Commit mit `[skip ci]`, um keinen unnötigen Lab-Lauf auszulösen.

## Nächste Schritte (priorisiert)

1. Lab-Ergebnis für 2d51c2b abwarten/auswerten (erwartet: gleiche Churn-Verdicts wie Lauf 27).
2. Post-Deploy-Healthcheck ins Lab einbauen (verhindert Fehlinterpretation trans. 500er).
3. Churn-Lauf 28: image-fallback prüfen, Reentrancy-Guards, force-Klicks.
4. Agent-Bar/Tablet-Menü, Thorsten-Entscheidung, GitHub-Billing: User/Empfehlung.