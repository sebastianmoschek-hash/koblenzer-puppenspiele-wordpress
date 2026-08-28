# HERMES STATUS – Stand 28.08.2026 (Run 16 – Editor-Hang: Root-Cause eingekreist; AUTHPOST-Lauf läuft)

## Letzte Aktionen (autonom, OpenRouter)

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert** (echter lokaler Chromium-Headless): HTTP 200, Titel „Termine – puppenspiele“, H1 „Termine“, **75 Termin-Karten** (`kp-termin-main` × 75), 0 fatal/critical Fehler im DOM (die 6 „500“-Treffer sind nur CSS-z-index-Werte); Homepage rendert ebenso (200, Titel „puppenspiele“). Fix weiterhin live; Branch längst konsolidiert → **kein Deploy nötig**.

2. **Unified Editor Contract / beforeunload-Fix**: a5e3b5c weiterhin in main. CI weiterhin rot auf denselben 6 Editor-Gates (zuletzt e8e97e4/19:32:59Z). GHA fällt sofort mit Billing-Blocker aus (nicht primär). **Kein manueller Trigger nötig** — relevante Pushes starten das Lab automatisch.

3. **Editor-Login-Hang — ROOT-CAUSE-EINGRENZUNG (4 Diagnose-Läufe, nur qa/homepage-editor-lab.mjs)**:
   - **AUTHRENDER (9868902)**: Server rendert die authentifizierte kp_edit-Seite in **592ms/457KB** → Server blitzschnell; Browser bekommt die 200, **dcl feuert trotzdem nie** (Titel=?/Body=), 45s-Goto-Timeout erst nach ~12min (1-vCPU-Sandbox) ⇒ **100% Client-seitig**.
   - **NETTRACE (92c47ae → e8e97e4)**: 83-84 Requests, ALLE fertig, **0 Dialogs/0 Crashes/0 Console-/Page-Fehler**; in den meisten Läufen GENAU EIN pending Request: **`POST admin-ajax.php action=kp_touch_free_layout_load page_key=post-12`** (→ touch-persistence.js `loadLive()` beim Boot, `wp_ajax_`+`wp_ajax_nopriv_`).
   - **Externer Gegenprobe**: derselbe POST antwortet von außen in **145-175ms mit 200** (urlencoded UND multipart, mit Origin-Header; Payload winzig: 271B, global=3 Einträge, page={}) → Endpoint + Daten sind gesund, **„riesige Option“-These verworfen**.
   - **Statische Analyse (komplett)**: KEIN sync-XHR, KEINE Boot-alert/confirm-Schleifen, keine unbounded while/for in Assets/MU-Plugins; die **fetch-Wrapper-Kette** (frontend-editor-compat → touch-persistence → calendar-undo-redo → kp-ai-image-draft-safety) reicht `kp_touch_free_layout_load` nachweislich durch (kein Deadlock/Recursion).
   - **Offene Variablen**: (a) authentifizierter admin-ajax-Serverpfad (nur mit Login-Cookie testbar), (b) Browser-JS-Boot (v.a. `frontend-editor.js` — auth-only und im lokalen Auth-Sim nie geladen).
   - **Lauf d5040b2 (läuft)**: **AUTHPOST** wiederholt exakt diesen POST mit dem Login-Cookie serverseitig → schnell ⇒ Server-Pfad gesund, Hang ist Browser-JS-seitig (nächster Schritt: Bisect/Boot-Fix); hängend ⇒ authentifizierter Serverpfad = Root-Cause.

4. **Thorsten-Voice-Smoke-Test**: ⚠️ **Erneut verifiziert: existiert NICHT** — kein `tests/`-Verzeichnis, keinerlei git-Objekte auf irgendeinem Branch, 0 CI-Verweise. **User-Entscheidung weiterhin offen: anlegen oder verwerfen.**

5. **Branch-Konsolidierung**: ✅ `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` erneut als **Ancestors von main** verifiziert → bereits gemergt. `staging/fix-termine-500` existiert nicht mehr.

## Aktueller CI-Stand (Stand dieses Laufs)

- Zuletzt abgeschlossen: **e8e97e4 (19:32:59Z)** — FAILURE auf denselben 6 Editor-Gates; grün: deploy, stagingReady, temporaryBridge, touch-Slider, touch-Runtime, visual.
- **Diagnose-Lauf d5040b2 (AUTHPOST) läuft**; Ergebnis wird gepollt (~20:00Z erwartet).

## Was funktioniert

- ✅ `/termine/` + Homepage frisch browser-verifiziert (75 Karten, 0 Fehler).
- ✅ Termine-Fix live, beforeunload-Fix in main.
- ✅ Branch-Konsolidierung abgeschlossen.
- ✅ Editor-Hang massiv eingekreist (Server 0,6s; alle Assets; 0 Events; ein pending kp_touch_free_layout_load; Endpoint extern gesund; AUTHPOST trennt final).

## Offen / Nächste Schritte

1. **d5040b2-AUTHPOST auswerten**: schnell → Browser-JS-Boot ist der Root-Cause; dann `frontend-editor.js`-Boot per addInitScript-Bisect ausschalten (ist der einzige nie-lokal-getestete auth-only Boot-Pfad) und/oder lokales Sim um frontend-editor.js+echte Configs erweitern → gezielter Fix. Hängend → authentifizierten admin-ajax-Pfad (Session-Lock/WAF-Cookie-Pfad) serverseitig untersuchen.
2. 🔴 **GitHub-Billing fixen** (User-Aktion) — GHA wieder startfähig.
3. **Thorsten-Smoke-Test**: User-Entscheidung: anlegen oder verwerfen.
4. Optional: Deploy-Mirror härten gegen „kritischer Fehler“-Blitzer.

## Regeln (unverändert)

- NUR Staging (neu.koblenzer-puppenspiele.de) — Production NIE ohne Freigabe.
- Keine Secrets in Git, keine unsicheren Aktionen.
- Lokale Modelle nur für die Homepage-Pflege-Web-App (nicht für den Wartungsjob); OpenRouter für alle Agent-Arbeit.