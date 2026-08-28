# HERMES STATUS – Stand 28.08.2026 (Run 15 – Root-Cause-Lauf mit frischem Browser-Test)

## Letzte Aktionen (autonom, OpenRouter)

1. **Staging `/termine/` (500-Fix)**: ✅ **Frischer echter Browser-Test** (lokal, headless Chromium/Playwright): **4/4 Seiten HTTP 200** — `/termine/` → HTTP 200, H1 „Termine“, Titel „Termine – puppenspiele“, **75 Termin-Karten**; `/` → 200 (22 Karten); `/repertoire/` → 200; `/kontakt/` → 200. **0 Console-/Page-Errors, 0 horizontaler Overflow.** Fix weiterhin live; Branch längst in main konsolidiert → **kein Deploy nötig**.

2. **Unified Editor Contract / beforeunload-Fix**: ✅ Fix (a5e3b5c) weiterhin in main enthalten. ❗ **NEUER FULL-Report vorgefunden: generatedAt 2026-08-28T17:07:22Z, Commit `f21b814`** (neuer als der 16:46:43Z/90cc6bc aus Run 14) — **immer noch FAILURE auf denselben 6 Editor-Gates**; grün: deploy, stagingReady, temporaryBridge, nativeTouchSliderSaveReset, touchRuntime, visual50Views. beforeunload-Fix ist Ancestor von f21b814 → **im frischen Lauf enthalten, CI bleibt unabhängig davon rot**.

3. **Root-Cause-Durchbruch (E2E-Editor-Login-Hang)**: 🔬 Erstmals `latest/diagnostics.txt` (47 KB, publiziert vom Lab-Orchestrator) **vollständig ausgewertet**:
   - **Alle 4 Browser-Scripts scheitern 100% reproduzierbar am ersten `page.goto(?kp_e2e_login=<token>)`**: editor 45s/2 Versuche, session-undo/persistence/text-save 30s — jeder Lauf, 2 verschiedene Tokens.
   - **Gast-Pfade antworten sofort**: `/`, `/?kp_edit=1&kp_e2e=1`, `/?kp_e2e_login=<fake>` und bridge-health alle **0.1–0.3s** (eigene Read-only-Probes) → der Hang ist **spezifisch für den validen-Token/Auth→302→kp_edit-Editor-Pfad**, nicht der Deploy-/Server-Blitzer (touch/visual liefen PASS direkt davor).
   - **Fixes gepusht (main `0902d84`, 2 Commits)**: (a) `qa/homepage-editor-lab.mjs` **Node-fetch-Preflight** (redirect:manual, 25s) + **HTTP-Response-Trace** beim Login → nächster Lauf trennt eindeutig Server-Hang vs. Browser-Render-Hang der authentifizierten kp_edit-Seite; (b) `qa/circleci-classify.sh`: **HERMES_STATUS.md-Commits = nicht-meaningful** → reine Wartungs-Logbuch-Pushes lösen keinen ~25-min-Lab-Lauf mehr aus (spart CircleCI-Credits; bisher brannte JEDER Status-Commit einen Full-Lauf). Nur qa/-Dateien, staging-gebunden, reversibel. **Lab-Lauf für 0902d84 läuft; Report wird gepollt.**

4. **Thorsten-Voice-Smoke-Test**: ⚠️ Unverändert: `tests/thorsten-smoke-test.js` **existiert nicht** (kein `tests/`-Verzeichnis, keine git-Objekte, NULL CI-Verweise). Einziger Thorsten-Schutz im CI: Android-Contract (`.circleci/config.yml` Z. 70–86, nur bei `/feature\/android-.*/`). → **User-Entscheidung offen: anlegen oder offiziell verwerfen.**

5. **Branch-Konsolidierung**: ✅ `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` erneut verifiziert: **0 Commits vor origin/main, beide Ancestors** → bereits gemergt, nichts zu tun. `staging/fix-termine-500` existiert nicht mehr (konsolidiert).

## Aktueller CI-Stand (Stand dieses Laufs)

- Letzter abgeschlossener FULL-Report: **17:07:22Z / f21b814** — **FAILURE** (6 Editor-Gates).
- Neuer Lab-Lauf für Commit **0902d84** (Preflight-Diagnostik) wurde durch den Push getriggert; Ergebnis wird gepollt (Report-Veröffentlichung am Lauf-Ende, ~25 min).
- ✅ Grün (zuletzt): deploy, stagingReady, temporaryBridge, nativeTouchSliderSaveReset, touchRuntime, visual50Views.
- ❌ Rot (unverändert): editorMobileTabletDesktop, saveReloadDbUndo48h, editorBrowser, sessionUndo, persistenceBrowser, realTextSave.

## Was funktioniert

- ✅ Staging `/termine/` + Homepage: HTTP 200, echte Inhalte, frisch browser-verifiziert (4/4, 0 Fehler, 0 Overflow).
- ✅ Termine-500-Fix live, beforeunload-Fix in main (in jedem frischen Lauf enthalten).
- ✅ Branch-Konsolidierung abgeschlossen; Thorsten-Android-Contract verdrahtet.
- ✅ Neue Root-Cause-Lage: Hang ist reproduzierbar nur im Auth-/Editor-Pfad; nächster Lauf liefert mit Preflight+Trace die exakte Trennung.

## Offen / Nächste Schritte

1. 🔴 **GitHub-Billing fixen** (User-Aktion: Settings → Billing → Zahlungsmethode/Spending-Limit) — danach GHA wieder startfähig.
2. **Editor-Login-Hang**: Preflight+Trace-Ergebnis des 0902d84-Laufs auswerten (Diagnostics/`latest/editor/`). Je nach Befund: Server-seitig den 302→kp_edit-Render untersuchen (schwere authentifizierte Seite) oder Browser-seitig (Chromium-Render). Dann erster gezielter Fix-Versuch.
3. **Thorsten-Smoke-Test**: User-Entscheidung: anlegen oder verwerfen.
4. Optional (später): Deploy-Mirror härten gegen „kritischer Fehler“-Blitzer während Deploy-Fenstern (aktuell niedrigere Prio, da Touch/Visual während des hängenden Auth-Laufs PASS liefen).

## Regeln (unverändert)

- NUR Staging (neu.koblenzer-puppenspiele.de) — Production NIE ohne Freigabe.
- Keine Secrets in Git, keine unsicheren Aktionen.
- Lokale Modelle nur für die Homepage-Pflege-Web-App (nicht für den Wartungsjob); OpenRouter für alle Agent-Arbeit.