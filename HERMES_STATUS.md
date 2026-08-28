# HERMES STATUS – Stand 28.08.2026 (Abend, Run 9)

## Letzte Aktionen (autonom, OpenRouter)

1. **Staging `/termine/`**: ✅ verifiziert — HTTP  ị. 200 (0,27s, 220 KB), Titel „Termine – puppenspiele“, echte `kp-termine-*`-Struktur im HTML (668 „termin“-Treffer,. Homepage `/`: 200. Der 500-Fix ist deployed und live. (Branch `staging/fix-termine-500` existiert nicht mehr — Fix wurde direkt auf main committet und via CircleCI deployt..

2. **Unified Editor Contract / CI**: 
   - beforeunload-Fix ist vollständig auf main: Merge `7a91387` (consolidate `fix/ci-remove-beforeunload-20260827` into main) + `a5e3b5c` (staging handoff waiter); beide Vorfahren von origin/main und im aktuellen CI-Lauf `e10f8a8` enthalten.
   - CircleCI-FULL-Lauf `e10f8a8` (Report 15:40:48Z = 17:40:48 local, ~10 min vor diesem Lauf erzeugt): Deploy/stagingReady/Bridge/Touch/Visual **grün**; Editor-E2E-Gates weiterhin **rot** (`editorMobileTabletDesktop`, `saveReloadDbUndo48h`, `editorBrowser`, `sessionUndo`, `persistenceBrowser`, `realTextSave`. Root Cause (Login-Hang vor dem ersten Screenshot** weiterhin OFFEN (damit ist auch die „beforeunload/domcontentloaded“-Hypothese endgültig widerlegt—der Fix war im letzten Lauf drin und die Gates blieben rot,. **Kein manueller Trigger sinnvoll**: kein neuer Codestand seit `e10f8a8` → ein Sofort-Rerun brächte identische rote Gates (nur Credits-Verbrauch..
   - 🔴 **NEUER BEFUND — GHA-Preflight ist durch BILLING blockiert, nicht durch Code**: Der „Editor independent preflight“-Workflow (der „Unified Editor Contract“-Runner: statische Offline-Checks inkl. no-beforeunload-Grep) scheitert seit Tagen in ~4 s, weil **der Job nie gestartet wird**: GitHub-Annotation: „The job was not started because recent account payments have failed or your spending limit needs to be increased.“ (zuletzt Run 33184759308 zu `e10f8a8`. → Manueller `workflow_dispatch`-Trigger hilft NICHT, bis das **GitHub-Billing** gefixt ist (User-Aktion: GitHub → Set­tings → Billing & plans → Zahlungsmethode/Spending-Limit prüfen/fixen..
   - ✅ **Ersatz-Verifikation lokal durchgeführt (alle ureditierbaren Preflight-Checks laufen auf diesem Laptop ohne Billing:** 
     | Check | Lokal | 
     |---|---| 
     | Word/Canva-History-Contract | PASS | 
     | Unified-Save/Undo/AI-Contract | PASS | 
     | Create-Undo/Redo-Contract | PASS | 
     | Calendar-Undo/Redo-Contract | PASS | 
     | JS-Syntax (6 Editor-Runtimes, `node --check`) | PASS | 
     | No-beforeunload-Regression (Grep) | PASS | 
     | PHP-Syntax (kp-mu-plugins) | ⚠️ nicht lokal lauffähig (`php` fehlt auf diesem Windows-Laptop; CircleCI-Deploy=success ⇒ WP lädt die mu-plugins, starkes Indiz OK( |
   → **Der Code-Teil des Unified Editor Contracts ist lokal GRÜN** — nur die GHA-Infrastruktur hängt am Billing. Nach Billing-Fix: Workflow per Push o. `workflow_dispatch` triggern — Grün erwartbar.

.

3. **Thorsten-Voice-Smoke-Test**: `tests/thorsten-smoke-test.js` **existiert NICHT** (kein `tests/`-Verzeichnis im Repo; einzig `qa/desktop-local-live-smoke.sh` matcht „smoke“. → **NICHT in CI eingebunden**. Die Task-Prämisse („Test ist implementiert“) stimmt nicht. **ABER**: Der Android-Thorsten-Voice-Contract (`qa/android-natural-voice-contract.sh`)) ist in CircleCI verdrahtet und **lokal frisch verifiziert: PASS android-natural-voice** (Thorsten-ONNX+espeak-Assets vorhanden, Samplerate model-derived+validiert, PCM16-frame-aligned, AudioTrack initialized+blocking-write-Checks, kein Android-System-TTS-Fallback,. Als offen für den User notiert: Test anlegen oder verwerfen (ggf. mit dem Android-Contract konsolidieren..

4. **Branch-Konsolidierung**: ✅ `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` sind **beide vollständige Vorfahren von origin/main** — bereits gemergt, kein Handlungsbedarf. Auch `fix/ci-remove-beforeunload-20260827` ist via `7a91387` bereits in main konsolidiert..

## Aktueller CI-Stand (Stand dieses Laufs; frischer Lauf durch den Status-Push getriggert)
- Letzter ausgewerteter FULL-Report: `e10f8a8` — **FAILURE**, aber nur wegen Editor-E2E-Gates (siehe oben)..
- ✅ Grün: deploy, stagingReady, temporaryBridge, touch-slider, touch-runtime, visual-50-Views + Verdicts infra/visual/touch..
- ❌ Rot: editorMobileTabletDesktop, saveReloadDbUndo48h, editorBrowser, sessionUndo, persistenceBrowser, realTextSave — Root Cause offen (Login-Phase des E2E-Editors, vor dem ersten Screenshot; Verdacht auf Selektor-/Domcontentloaded-Wartezeit besteht nicht mehr..
- 🟡 GHA „Editor independent preflight“: **blockiert durch GitHub-Billing** (Job startet nicht; kein Code-Fehler..

## Was funktioniert
- ✅ Staging `/termine/` und Homepage: HTTP  ị. 200 mit echten Inhalten..
- ✅ Termine-500-Fix: live auf Staging (Main, deployed..
- ✅ Unified-Editor-Code-Contracts: lokal alle grün (preflight; JS-Syntax; no-beforeunload-Regression clearance..
- ✅ Thorsten-Voice-Contract (Android): PASS lokal; in CI verdrahtet..
- ✅ Web-App (desktop/homepage-agent,, Android-Build, lokaler Desktop-Agent: Stand wie zuvor..

## Offen / Nächste Schritte
1. **GitHub-Billing fixen** (→ damit „Editor independent preflight“ wieder startet; danach Workflow erneut laufen lassen — Code-seitig Grün erwartbar..
2. **E2E-Editor-Login-Hang**: Root Cause lokalisieren — nächster Lauf: CircleCI-Job-Logs/Artifakte ziehen ( die Login-Diagnostik (`pageSnippet` aus `qa/homepage-editor-lab.mjs`, Tokens redacted) existiert bereits im Code, wird aber nicht öffentlich publiziert; Zugriff über CircleCI-API/Token nötig. Oder Lab so erweitern, dass sanitisierte Login-Snippets in den Report publiziert werden..
3. **Thorsten-Smoke-Test**: `tests/thorsten-smoke-test.js` fehlt — User-Entscheidung: anlegen oder verwerfen (Android-Contract deckt Thorsten-Assets bereits ab, PASS.(
4. Optional (später): Deploy-Mirror hardnenengegen „kritischer Fehler“-Blitzer während Deploy-Fenstern..

## Regeln (unverändert)
- NUR Staging (neu.koblenzer-puppenspiele.de)– Production NIE ohne Freigabe..
- Keine Secrets in Git, keine unsicheren Aktionen.

- Lokale Modelle nur für die Homepage-Pflege-Web-App (nicht für den Wartungsjob;; OpenRouter für alle Agent-Arbeit..