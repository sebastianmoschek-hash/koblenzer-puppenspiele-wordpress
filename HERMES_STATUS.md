# HERMES STATUS – Stand 28.08.2026 (Abend)

## Letzte Aktionen (autonom, OpenRouter)
1. **Staging `/termine/` verifiziert: HTTP 200 + echter Inhalt** (Titel „Termine – puppenspiele“). Der 500-Fix liegt auf main und ist deployed (Branch `staging/fix-termine-500` existiert nicht mehr — Fix wurde direkt auf main committet). ⚠️ Während der CI-Deploy-Fenster tritt kurzzeitig ein WP-„kritischer Fehler“ auf `/` und `/termine/` auf (nicht-atomares FTP-Mirror) — nach Deploy-Ende wieder verifiziert OK (3× über 30s, + Endkontrolle).



2. **CI-Deploy-Lücke gefunden + behoben**: Das CircleCI-Lab spiegelte bisher NUR Plugin+Theme auf Staging — der `kp_e2e=1`-Skip im mu-plugin `kp-local-ai-desktop-takeover.php` (ea68016) wurde dadurch NIE auf Staging deployed (Gates trotz Repo-Fix weiter rot). Fix: `qa/circleci-homepage-lab.sh` spiegelt im FULL-Mode jetzt auch `wp-content/mu-plugins` (Commit `081a97d`), plus FULL-Force-Lauf via `qa/current-staging-validation.txt`-Marker (Commit `e10f8a8`). Deploy danach verifiziert: `deploy: success` im FULL-Report..



3. **FULL-CI-Lauf auf `e10f8a8` (mu-Plugins deployed)**: ✅ Deploy/stagingReady/bridge + Touch/Visual/Infra/Editor-Contracts grün; ❌ Editor/Session-Undo/Persistenz/Text-Save weiterhin rot — identisches Muster wie vor dem Deploy. **Damit ist die „Takeover blockiert domcontentloaded“-Hypothese widerlegt**: selbst mit `kp_e2e=1`-Skip live auf Staging scheitert der Login weiterhin (keine Editor-Screenshots publiziert = Fehler vor dem ersten Capture, d.h. in der Login-Phase). **Root Cause ist weiterhin OFFEN** (nicht geraten; Notiz für nächsten Lauf**.

4. **Branch-Konsolidierung verifiziert**: `feature/webapp-primary-agent` und `ai-repair/local-thorsten-high-v8-20260825` sind bereits vollständig in main gemergt (merge-base → both ancestors of origin/main). Kein Merge nötig.



5. **Thorsten-Smoke-Test**: `tests/thorsten-smoke-test.js` EXISTIERT NICHT im Repo (kein `tests/`-Verzeichnis, kein `*thorsten*smoke*`-File). → NICHT in CI eingebunden. Vorhanden ist nur der Android-Thorsten-Voice-Contract (`qa/android-natural-voice-contract.sh`, in CircleCI verdrahtet, zuletzt PASS). Als offen für den User notiert: Test fehlt — anlegen oder verwerfen samt Konsolidierung mit dem Android-Contract..



## Aktueller CI-Stand (Commit `e10f8a8`, FULL-Lauf, Report 15:40:48Z)
- ✅ Grün: `editor-contracts`, `mobile-live-staging-deploy`, `homepage-staging-lab` (Job), deploy, stagingReady, temporaryBridge, touch-slider, touch-runtime, visual-50-Views + Verdicts infra/visual/touch.

- ❌ Rot: `editorMobileTabletDesktop`, `saveReloadDbUndo48h`, `editorBrowser`, `sessionUndo`, `persistenceBrowser`, `realTextSave` (Verdicts: editor, session-undo, persistence, text-save = failure). — Verdachtspunkt: Login-Phase des E2E-Editors (vor dem ersten Screenshot; domcontentloaded/Selektoren-Wait).



## Was funktioniert
- ✅ Staging `/termine/` und Homepage: HTTP 200 mit echten Inhalten..
- ✅ Termine-500-Fix ist live auf Staging (Main, deployed).
- ✅ Web-App (desktop/homepage-agent), Android-Build, lokaler Desktop-Agent: Stand wie zuvor..



## Offen / Nächste Schritte
1. **E2E-Editor-Login-Hang**: Root Cause lokalisieren — nächster Lauf: CircleCI-Diagnose-Logs/Artifakte ziehen (z.B. via CircleCI-Token/API)Oder Lab so erweitern, dass es sanitisierte Login-Diagnose (`pageSnippet` aus `qa/homepage-editor-lab.mjs`, Tokens redacted) in den Report publiziert..
2. **Thorsten-Smoke-Test**: `tests/thorsten-smoke-test.js` fehlt — User-Entscheidung: anlegen oder verwerfen (Android-Contract `qa/android-natural-voice-contract.sh` deckt die Thorsten-Assets bereits ab, PASS).
3. Nach Root-Cause-Fix: neuer FULL-Lauf zur Grün-Bestätigung aller E2E-Gates.
.
4. Optional (später): Deploy-Mirror hardnen ( nicht-atomare FTP-Mirrors verursachen kurzzeitige Fehlerseiten auf Staging während des Deploy-Fensters), um „kritischer Fehler“-Blitzer zu vermeiden..



## Regeln (unverändert)
- NUR Staging (neu.koblenzer-puppenspiele.de) – Production NIE ohne Freigabe.

- Keine Secrets in Git, keine unsicheren AktionenKeine Secrets nach außen (E2E-Tokens rotieren/limitieren sich aufs Deploy-Fenster und mu-plugins-Files werden nur via CircleCI-FTP (STAGING-Creds) deployt..
- Lokale Modelle nur für die Homepage-Pflege-Web-App (nicht für den Wartungsjob), OpenRouter für alle Agent-Arbeit..