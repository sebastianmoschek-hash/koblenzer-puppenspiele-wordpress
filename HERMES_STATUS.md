# HERMES STATUS – Stand 28.08.2026 (Abend, Run 10)

## Letzte Aktionen (autonom, OpenRouter)

1. **Staging `/termine/`**: ✅ **Echter Browser-Test durchgeführt** (headless Chromium/Playwright, lokal auf diesem Laptop: `/termine/` → **HTTP 200**, Titel „Termine – puppenspiele“, echte `kp-termine-*`-Struktur (75 Marker, `kp-termine-list/-heading/-button/-month` vorhanden**, keinerlei console-/page-errors. Homepage `/` → **HTTP 200**, ebenfalls fehlerfrei. Der 500-Fix ist live auf Staging (deploy: **success** in beiden neuen CI-Läufen; Branch `staging/fix-termine-500` existiert nicht mehr — Fix längst direkt auf main..

2. **Unified Editor Contract / CI**: beforeunload-Fix `a5e3b5c` ist weiterhin Vorfahr von main (verifiziert**. **Zwei FRISCHE FULL-CI-Läufe abgewartet und ausgewertet** (voriger Stand hatte noch den alten Report von 15:42Z..:
   | Report (generatedAt) | Commit | Ergebnis |
   |---|---|---|
   | 16:04:48Z |     19ea374 (Run-8-Status) | FAILURE — 5 Lab-Gates grün, 8 Editor-Gates rot |
   | 16:25:26Z |	 7e3e956 (aktueller main-HEAD) | FAILURE — gleiche Gates rot; `realTextSave`-Verify fehlte diesmal im Bericht (nicht success; vermutl. Artifakt-/Job-Race.,

   → Die beforeunload/domcontentloaded-Hypothese ist damit endgültig widerlegt**(der Fix war in beiden frischen Läufen enthalten, Gates blieben rot** — Root Cause bleibt der E2E-Editor-**Login-Hang vor dem ersten Screenshot** (OFFEN**. **Kein manueller Trigger nötig/sinnvoll**: CircleCI läuft pro Push automatisch (beide Status-Pushes haben je einen vollständigen FULL-Lauf erzeugt; die Ergebnisse sind code-identisch → ein Rerun brächte keine neuen Erkenntnisse..
   - 🔴 **GHA-Billing-Blocker jetzt direkt via `gh` API verifiziert**: Alle GHA-Workflow-Runs (auch „CircleCI staging report handoff“, „Publish exact CircleCI staging diagnostics“ usw.**) für den letzten Push schlagen in ~3 s mit **0 Steps** fehl (Job `98904481888` im Run `33187584103`)) — das exakte „job was not started (payments/spending limit“-Muster. D.h.: **alle** GitHub-Actions-Jobs sind blockiert — nicht nur der Preflight. (User-Aktion bleibt: GitHub → Settings → Billing & plans → Zahlungsmethode/Spending-Limit fixen; danach Workflows per Push/`workflow_dispatch` triggern — Code-seitig Grün erwartbar(.,.

3. **Thorsten-Voice-Smoke-Test**: `tests/thorsten-smoke-test.js` **existiert weiterhin NICHT** (kein `tests/`-Verzeichnis; auch in der gesamten git history nie vorhanden**. → Task-Prämisse weiterhin nicht erfüllt; **User-Entscheidung: Test anlegen oder offiziell verwerfen**. Der Android-Thorsten-Contract (`qa/android-natural-voice-contract.sh`)) ist in CircleCI verdrahtet und wurde **frisch re-verifiziert: PASS android-natural-voice** (Model-Assets present, Sample-Rate model-derived+validiert, PCM16 frame-aligned, AudioTrack init+blocking/full-write-Checks, generierte Samples nicht-leer, kein Android-System-TTS-Fallback..

4. **Branch-Konsolidierung**: ✅ `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` sind **beide vollständige Vorfahren von origin/main** (0 commits nicht in main** — bereits gemergt, kein Handlungsbedarf. Auch `fix/ci-remove-beforeunload-20260827` ist nur noch lokal vorhanden (remote-seitig via `7a91387` konsolidiert..

## Aktueller CI-Stand (Stand dieses Laufs; zwei frische FULL-Reports ausgewertet**
- Letzter ausgewerteter FULL-Report: **Commit `7e3e956`**, generatedAt **2026-08-28T16:25:26Z** — **FAILURE**.
- ✅ Grün: deploy, stagingReady, temporaryBridge, nativeTouchSliderSaveReset, touchRuntime, visual50Views.
.
- ❌ Rot: editorMobileTabletDesktop, saveReloadDbUndo48h, editorBrowser, sessionUndo, persistenceBrowser(; `realTextSave`-Verify fehlte im jüngsten Bericht (nicht success— vermutl. Artifakt-Race, in den Vorgängerberichten als failure geführt..
- 🟡 GHA „Editor independent preflight“ (und sämtliche anderen GHA-Workflows**: **blockiert durch GitHub-Billing** (via gh-API bestätigt: Jobs starten mit 0 Steps und fallen sofort — kein Code-Fehler..

## Was funktioniert
- ✅ Staging `/termine/` und Homepage: HTTP 200 mit echten Inhalten — **browser-verifiziert** (headless Chromium, 0 console/page-errors..
- ✅ Termine-500-Fix: live auf Staging (deploy success in beiden neuen FULL-Läufen..
- ✅ Unified-Editor-Code-Contracts: lokal grün(Preflight; JS-Syntax; no-beforeunload-Regression clearance (Stand Run    9 unverändert..
- ✅ Thorsten-Voice-Contract (Android): PASS — frisch re-verifiziert;in CI verdrahtet..
- ✅ CI-Automation funktioniert: beide reinen Docs-Pushes haben je einen vollständigen CircleCI-FULL-Lauf angestoßen (serial-group, verifiziert an den frischen Reports..

## Offen / Nächste Schritte
1. **GitHub-Billing fixen** (User-Aktion** — damit starten alle GHA-Jobs wieder (inkl. „Editor independent preflight“; danach Preflight erneut laufen lassen — Code-seitig Grün erwartbar..
2. **E2E-Editor-Login-Hang**: Root Cause weiterhin offen. Nächster Hebel: CircleCI-Job-Logs/Artifakte via CircleCI-API/Token ziehen, oder Lab so erweitern, dass sanitisierte Login-Snippets (`pageSnippet` aus `qa/homepage-editor-lab.mjs`, Tokens redacted** in den Report publiziert werden.(Zusätzlich beobachten: `realTextSave`-Verify fehlte in einem frischen Lauf— evtl. Artifakt-/Job-Race, kein Code-Änderung.**
3. **Thorsten-Smoke-Test**: `tests/thorsten-smoke-test.js` fehlt — User-Entscheidung: anlegen oder verwerfen(Android-Contract deckt Thorsten-Assets ab, PASS..
4. Optional (später): Deploy-Mirror härten gegen „kritischer Fehler“-Blitzer während Deploy-Fenstern..

## Regeln (unverändert**
- NUR Staging (neu.koblenzer-puppenspiele.de** — Production NIE ohne Freigabe..
- Keine Secrets in Git, keine unsicheren Aktionen..
- Lokale Modelle nur für die Homepage-Pflege-Web-App (nicht für den Wartungsjob;; OpenRouter für alle Agent-Arbeit..