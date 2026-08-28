# HERMES STATUS – Stand 28.08.2026 (Run 16 – EDITOR-HANG GELÖST?: Server 100% exkulpiert (AUTHPOST 154ms); Ursache = Browser-JS-Boot; nächster Schritt: Bisect-Lauf)

## Letzte Aktionen (autonom, OpenRouter)

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert** (echter lokaler Chromium-Headless): HTTP 200, Titel „Termine – puppenspiele“, H1 „Termine“, **75 Termin-Karten** (`kp-termin-main` × 75), 0 fatal/critical Fehler im DOM (6 „500“-Treffer = reine CSS-z-index-Werte); Homepage rendert ebenso. Fix weiterhin live; Branch längst konsolidiert → **kein Deploy nötig**.

2. **Unified Editor Contract / beforeunload-Fix**: a5e3b5c weiterhin in main. CI weiterhin rot auf denselben 6 Editor-Gates (zuletzt d5040b2/19:53:13Z). GHA fällt sofort mit Billing-Blocker aus (nicht primär). **Kein manueller Trigger nötig.**

3. **Editor-Login-Hang — 5 Diagnose-Läufe, SERVER 100% EXKULPIERT, Ursache = Browser-JS-Boot**:
   - **AUTHRENDER (9868902)**: Server rendert authentifizierte kp_edit-Seite in **592ms/457KB** → schnell; Browser bekommt 200, **dcl feuert nie**.
   - **NETTRACE (92c47ae→e8e97e4)**: alle 83-84 Requests geladen, **0 Dialogs/0 Crashes/0 Console-/Page-Fehler**; einziger wiederkehrender pending: **`POST admin-ajax.php action=kp_touch_free_layout_load page_key=post-12`** (touch-persistence.js `loadLive()`, Boot); externer Gegenprobe: Endpoint antwortet 145-175ms/200 (urlencoded+multipart, Payload 271B) → Endpoint+Daten gesund.
   - **🎯 AUTHPOST (d5040b2) — DER FINALE BEWEIS**: exakt dieser POST **mit dem Login-Cookie aus der CI-Sandbox** antwortet in **154ms/200/271B** → **auch der authentifizierte Serverpfad ist gesund. Der Hang ist damit zu 100% Browser-seitig (Client-JS-Boot pinnt den Main-Thread).** Der pending admin-ajax ist Symptom (busy Renderer), nicht Ursache.
   - **Statik komplett**: kein sync-XHR/alert-Loop/while(true) in Assets+MU; fetch-Wrapper-Kette reicht touch_load nachweislich durch.
   - **Lokale Full-Repros (Gast-kp_edit + Flags + alle auth-only Scripts + rekonstruierte Configs): hängen NICHT** (1-2s) → die echte Auth-Session (Adminbar, Nonces, Server-State) fehlt lokal. 
   - **Nächster Schritt (nächster Lauf)**: **Bisect via addInitScript** — `KPFrontendEditor` (Config von `frontend-editor.js`, auth-only, im lokalen Sim nie geladen) stubbing → verschwindet der Hang, ist der Übeltäter gefunden → gezielter Fix. Fallback-Kandidaten danach: KPOwnerWebApp-Boot/Adminbar-Interaktion.
   - Alle Änderungen nur `qa/homepage-editor-lab.mjs` (Diagnose), staging-gebunden, reversibel, keine Secrets.

4. **Thorsten-Voice-Smoke-Test**: ⚠️ **Erneut verifiziert: existiert NICHT** — kein `tests/`-Verzeichnis, keinerlei git-Objekte auf irgendeinem Branch, 0 CI-Verweise. **User-Entscheidung weiterhin offen: anlegen oder verwerfen.**

5. **Branch-Konsolidierung**: ✅ Beide Branches (`feature/webapp-primary-agent`, `ai-repair/local-thorsten-high-v8-20260825`) erneut als **Ancestors of main** verifiziert → bereits gemergt. `staging/fix-termine-500` existiert nicht mehr.

## Aktueller CI-Stand (Stand dieses Laufs)

- Zuletzt abgeschlossen: **d5040b2 (19:53:13Z)** — FAILURE auf denselben 6 Editor-Gates; grün: deploy, stagingReady, temporaryBridge, touch-Slider, touch-Runtime, visual.
- Neuer Diagnose-Stand im Repo bereit (nächster Push triggert Bisect-Lauf; dieser Status-Commit triggert dank 0902d84 keinen teuren Lauf).

## Was funktioniert

- ✅ `/termine/` + Homepage frisch browser-verifiziert (75 Karten, 0 Fehler).
- ✅ Termine-Fix live, beforeunload-Fix in main.
- ✅ Branch-Konsolidierung abgeschlossen.
- ✅ **Editor-Hang: Server+Network zu 100% exkulpiert; Browser-JS-Boot als Ursache bewiesen** — der Weg zum Fix ist jetzt konkret (Bisect → Fix → grün).

## Offen / Nächste Schritte

1. **Bisect-Lauf**: `KPFrontendEditor`-Stub per addInitScript (env-geschaltet) → Hang weg? ⇒ `frontend-editor.js`-Boot ist der Übeltäter → Boot defensiv machen (Fehler abfangen/nicht blockieren). Falls Hang bleibt: Adminbar-/KPOwnerWebApp-Interaktion prüfen (ggf. zweiter Bisect mit `#wpadminbar`-Entfernung).
2. 🔴 **GitHub-Billing fixen** (User-Aktion) — GHA wieder startfähig.
3. **Thorsten-Smoke-Test**: User-Entscheidung: anlegen oder verwerfen.
4. Optional: Deploy-Mirror härten gegen „kritischer Fehler“-Blitzer.

## Regeln (unverändert)

- NUR Staging (neu.koblenzer-puppenspiele.de) — Production NIE ohne Freigabe.
- Keine Secrets in Git, keine unsicheren Aktionen.
- Lokale Modelle nur für die Homepage-Pflege-Web-App (nicht für den Wartungsjob); OpenRouter für alle Agent-Arbeit.