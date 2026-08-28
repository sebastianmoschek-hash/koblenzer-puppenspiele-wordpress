# HERMES STATUS – Stand 28.08.2026 (Run 16 – ROOT-CAUSE: Client-Hang, 1 pending admin-ajax; Diagnose-Lauf läuft)

## Letzte Aktionen (autonom, OpenRouter)

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert** (echter lokaler Chromium-Headless): HTTP 200, Titel „Termine – puppenspiele“, H1 „Termine“, **75 Termin-Karten** (`kp-termin-main` × 75), 0 fatal/critical Fehler im DOM (6 „500“-Treffer = reine CSS-z-index-Werte), Homepage rendert ebenso. Fix weiterhin live; Branch längst konsolidiert → **kein Deploy nötig**.

2. **Unified Editor Contract / beforeunload-Fix**: a5e3b5c weiterhin in main (verifiziert). CI weiterhin rot auf denselben 6 Editor-Gates (letzter Stand vor diesem Lauf: 92c47ae/18:53:12Z). GHA fällt sofort mit Billing-Blocker aus (nicht primär). **Kein manueller Trigger nötig.**

3. **Editor-Login-Hang — ROOT-CAUSE-DURCHBRUCH (2 Diagnose-Läufe)**:
   - **Lauf 9868902 (AUTHRENDER)**: Serverseitige Messung des authentifizierten kp_edit-Renders: **200, 457.741 Bytes HTML, 592ms** → Server ist blitzschnell. Der Browser bekam die 200 (Trace), **dcl feuert trotzdem nie**, Titel/Body unlesbar, Goto-Timer im 1-vCPU-Sandbox um Faktor ~15 ausgehungert (45s-Timeout erst nach 12min). ⇒ **Hang ist 100% CLIENT-SEITIG.**
   - **Lauf 92c47ae (NETTRACE+HOTSTACK)**: Volle Request-Trace: **84 Requests, 83 fertig, GENAU EINER pending: `wp-admin/admin-ajax.php` (>12min ohne Antwort)** — der Browser-Boot der authentifizierten Editor-Seite stößt einen admin-ajax-Request an, der nie zurückkommt; dcl blockiert. HOTSTACK nicht verfügbar (Browser-Profil stoppen scheiterte, weil Target beim 12m-Kill bereits zu). Alle PHP-Renderpfade (mu-plugins+grep) und Assets sind ohne sync-XHR/schleifen -> Verdacht: Mutation-Observer-Kaskade oder blockierender Boot-Call; der POST-Body (action=...) steht NICHT in der URL.
   - **Lauf 4c5c23a (läuft)**: loggt jetzt den **POST-Body der pending admin-ajax (action!)** + **HUNGSTACK-Debugger-Pause** (unterbricht den hängenden Main-Thread an breakable points → exakter Call-Stack). ⇒ nächster Report identifiziert die Action/die Schleife → dann gezielter Fix.
   - Alle Änderungen nur `qa/homepage-editor-lab.mjs` (Diagnose), staging-gebunden, reversibel, keine Secrets.

4. **Thorsten-Voice-Smoke-Test**: ⚠️ **Erneut verifiziert: existiert NICHT** — kein `tests/`-Verzeichnis, keinerlei git-Objekte auf irgendeinem Branch, 0 CI-Verweise (`verify-thorsten-and-web` hat nur `qa/apply-thorsten-high-fix.py`). → **User-Entscheidung weiterhin offen: anlegen oder verwerfen.**

5. **Branch-Konsolidierung**: ✅ Beide Branches (`feature/webapp-primary-agent`, `ai-repair/local-thorsten-high-v8-20260825`) erneut als **Ancestors von main** verifiziert → bereits gemergt. `staging/fix-termine-500` existiert nicht mehr.

## Aktueller CI-Stand (Stand dieses Laufs)

- Lauf 92c47ae (18:53:12Z): **FAILURE** auf denselben 6 Editor-Gates (editorMobileTabletDesktop, saveReloadDbUndo48h, editorBrowser, sessionUndo, persistenceBrowser, realTextSave); deploy/stagingReady/temporaryBridge/touch/visual grün.
- **Neuer Diagnose-Lauf 4c5c23a läuft** (POST-Body + HUNGSTACK); Ergebnis wird gepollt (~19:25Z erwartet).

## Was funktioniert

- ✅ `/termine/` + Homepage: frisch browser-verifiziert (75 Karten, 0 Fehler).
- ✅ Termine-Fix live, beforeunload-Fix in main.
- ✅ Branch-Konsolidierung abgeschlossen.
- ✅ **Root-Cause eingekreist**: Server schnell (0,6s), Client-Hang, 1 pending admin-ajax (action folgt aus 4c5c23a).

## Offen / Nächste Schritte

1. **4c5c23a auswerten** (Report ~19:25Z): pending admin-ajax POST-Body → action; HUNGSTACK → exakte Loop-Stelle. Danach **erster gezielter Fix-Versuch** (Server-Handler der Action oder Client-Boot-Call defensiv/async). Erwartung: 1-2 weitere Läufe bis grün.
2. 🔴 **GitHub-Billing fixen** (User-Aktion) — GHA wieder startfähig.
3. **Thorsten-Smoke-Test**: User-Entscheidung: anlegen oder verwerfen.
4. Optional: Deploy-Mirror härten gegen „kritischer Fehler“-Blitzer.

## Regeln (unverändert)

- NUR Staging (neu.koblenzer-puppenspiele.de) — Production NIE ohne Freigabe.
- Keine Secrets in Git, keine unsicheren Aktionen.
- Lokale Modelle nur für die Homepage-Pflege-Web-App (nicht für den Wartungsjob); OpenRouter für alle Agent-Arbeit.