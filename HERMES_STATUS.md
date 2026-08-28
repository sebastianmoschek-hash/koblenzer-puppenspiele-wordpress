# HERMES STATUS – Stand 28.08.2026 (Run 16 – AUTHRENDER-Diagnose + frischer Browser-Test)

## Letzte Aktionen (autonom, OpenRouter)

1. **Staging `/termine/` (500-Fix)**: ✅ **Erneut frisch browser-verifiziert** — diesmal echter lokaler Chromium-Headless-Render: `/termine/` liefert HTTP 200, RSS-Kopf „Termine – puppenspiele“, H1 „Termine“, **75 Termin-Karten** (`kp-termin-main` × 75), 0 „fatal/critical error“ im DOM (die 6 gezählten „500“-Treffer sind ausschließlich CSS-z-index-Werte), Homepage rendert ebenso (Titel „puppenspiele“). Fix weiterhin live; Branch längst konsolidiert → **kein Deploy nötig**.

2. **Unified Editor Contract / beforeunload-Fix**: Fix (a5e3b5c) weiterhin in main enthalten (Merge-Check OK). Letzter abgeschlossener FULL-Report weiterhin **17:48:03Z / 0902d84 — FAILURE auf denselben 6 Editor-Gates** (editorMobileTabletDesktop, saveReloadDbUndo48h, editorBrowser, sessionUndo, persistenceBrowser, realTextSave). GHA läuft weiterhin sofort mit Billing-Blocker fehl (nicht primär; CircleCI ist der Runner). **Kein manueller Trigger nötig** — relevante Pushes lösen das Lab automatisch aus.

3. **Editor-Login-Hang — neuer Befund + nächster Diagnose-Commit**:
   - Preflight des Laufs 0902d84 bestätigt: **Login-Hop schnell** (302 → `/?kp_edit=1&kp_e2e=1`, 495ms). **Alle 4 Browser-Scripts hängen danach am authentifizierten kp_edit-RENDER** (dcl kommt nie; goto 30s/45s Timeout, editor sogar still >12min SIGKILL).
   - Statische Analyse: **kein** blockierender Outbound-Call im PHP-Renderpfad (grep über mu-plugins+plugin leer), keine offensichtlichen JS-Endlosschleifen/Sync-XHR in den Editor-Assets → kein Blindfix, nicht geraten.
   - ❗ Der Lauf 0902d84 hat die versprochene Server-vs-Client-Trennung NICHT geliefert: editor.log enthält **nur** die Preflight-Zeile (danach starb der Prozess still; Goto-Timeout griff nicht/schluckte den Trace). Diagnose war unter-instrumentiert.
   - **Fix: Commit `9868902` gepusht** (nur `qa/homepage-editor-lab.mjs`, staging-gebunden, reversibel): (a) **AUTHRENDER-Messung** — Set-Cookie aus der 302 mitnehmen und die authentifizierte `/?kp_edit=1&kp_e2e=1` **serverseitig** vermessen (status/bytes/html/ms) → trennt eindeutig „PHP-Render hängt“ von „Client-JS hängt“; (b) `mark()`-Progress-Marker (console.warn + appendFileSync) um jeden Goto-Versuch, je Device, nach Login → ein SIGKILL kann den Befund nicht mehr verschlucken; (c) `pageSnippet()` mit 5s-Timeouts. **Lauf für 9868902 läuft; Diagnose wird gepollt.**

4. **Thorsten-Voice-Smoke-Test**: ⚠️ **Erneut verifiziert und widersprüchlich zur Task-Beschreibung:** `tests/thorsten-smoke-test.js` **existiert nicht** — kein `tests/`-Verzeichnis, **keinerlei** git-Objekte/Commits auf irgendeinem Branch (Suche über `--all`), 0 CI-Verweise. `verify-thorsten-and-web` enthält nur `qa/apply-thorsten-high-fix.py`. Einziger Thorsten-Schutz im CI bleibt der Android-Contract (`.circleci/config.yml`, nur für `/feature\/android-.*/`). → **User-Entscheidung weiterhin offen: Test anlegen oder offiziell verwerfen.**

5. **Branch-Konsolidierung**: ✅ `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` erneut verifiziert: beide **Ancestors von origin/main**, 0 Commits davor → bereits gemergt, nichts zu tun. `staging/fix-termine-500` existiert nicht mehr (konsolidiert).

## Aktueller CI-Stand (Stand dieses Laufs)

- Letzter abgeschlossener FULL-Report: **17:48:03Z / 0902d84** — **FAILURE** (6 Editor-Gates).
- Neuer Full-Lab-Lauf für **9868902** (AUTHRENDER-Diagnose) läuft; Ergebnis wird gepollt (Report ~25–40 min nach 18:14Z).
- ✅ Grün (zuletzt): deploy, stagingReady, temporaryBridge, nativeTouchSliderSaveReset, touchRuntime, visual50Views.
- ❌ Rot (unverändert): editorMobileTabletDesktop, saveReloadDbUndo48h, editorBrowser, sessionUndo, persistenceBrowser, realTextSave.

## Was funktioniert

- ✅ Staging `/termine/` + Homepage: frisch im echten Chromium verifiziert (75 Karten, 0 Fehler, 0 Overflow in Vorläufen).
- ✅ Termine-500-Fix live, beforeunload-Fix in main (in jedem frischen Lauf enthalten).
- ✅ Branch-Konsolidierung abgeschlossen; Thorsten-Android-Contract verdrahtet.
- ✅ Neue Diagnose bei 9868902 verankert: nächster Lauf liefert die Server-vs-Client-Trennung des Editor-Hangs.

## Offen / Nächste Schritte

1. **AUTHRENDER-Ergebnis des Laufs 9868902 auswerten** (Report ↑). Server schnell ⇒ Client-JS-Hang belegt → gezielt Editor-Assets/Netzwerk im Browser mitschneiden (zweiter Diagnose-Schritt) oder konkreten Kandidaten fixen. Server langsam ⇒ PHP-Render-Pfad der authentifizierten kp_edit-Seite untersuchen.
2. 🔴 **GitHub-Billing fixen** (User-Aktion: Settings → Billing → Zahlungsmethode) — danach GHA wieder startfähig (aktuell nur optisch, CircleCI bleibt primär).
3. **Thorsten-Smoke-Test**: User-Entscheidung: anlegen (tests/thorsten-smoke-test.js + CI-Job) oder offiziell verwerfen.
4. Optional (später): Deploy-Mirror härten gegen „kritischer Fehler“-Blitzer während Deploy-Fenstern.

## Regeln (unverändert)

- NUR Staging (neu.koblenzer-puppenspiele.de) — Production NIE ohne Freigabe.
- Keine Secrets in Git, keine unsicheren Aktionen.
- Lokale Modelle nur für die Homepage-Pflege-Web-App (nicht für den Wartungsjob); OpenRouter für alle Agent-Arbeit.
