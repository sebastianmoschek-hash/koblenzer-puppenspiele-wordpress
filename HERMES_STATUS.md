# HERMES STATUS – Stand 28.08.2026 (Cron-Wartungsjob, Lauf 2)

## Zusammenfassung

| Aufgabe | Status |
|---|---|
| 1. Staging /termine/ HTTP 500 | ✅ Behoben & deployed – HTTP 200 live verifiziert |
| 2. beforeunload-Fix (a5e3b5c) auf main | ✅ Auf main – CI läuft, Editor-Verdicts aktuell ROT (Login-Timeout) |
| 3. Thorsten Voice-Smoke-Test | 🔧 Test existiert, war NICHT in CI eingebunden → jetzt in CircleCI integriert |
| 4. Branch-Konsolidierung | ✅ Beide Branches in main gemergt (via 82462e3) |

## 1. Staging /termine/ HTTP 500 ✅
- Fix ist auf `main` (Commits `d21c606`, `6e726e8`, `dab16c9`, `1133891`) und über CircleCI-Labor auf Staging deployed (Report 2026-08-28T11:04Z, `deploy: success`, Commit f01884a).
- **Live-Verifikation heute (13:29 MESZ):** `https://neu.koblenzer-puppenspiele.de/termine/` → **HTTP 200 OK** in 0.26 s, vollständiges HTML ohne Render-Abbruch. Weitere Staging-Seiten (/, /repertoire/, /das-theater/, /referenzen/, /kontakt/) alle HTTP 200 schnell.
- Browser-Test mit Playwright: nicht möglich, da Playwright lokal nicht installiert ist (kein node_modules im Repo). Stattdessen HTTP-/HTML-Verifikation durchgeführt.
- Kein Branch `staging/fix-termine-500` vorhanden – Fix wurde direkt auf main committet (Aufgabe damit gegenstandslos).

## 2. beforeunload-Fix & CI-Status ⚠️
- `a5e3b5c` (GitHub-Actions-Handoff-Waiter) und die eigentlichen beforeunload-Entfernungen (`e5448f7`, `7002dca`) sind auf `main` (Merge `7a91387`).
- GitHub-Status f01884a (main, 12:44): **failure** – aber differenziert:
  - ✅ success: editor-contracts (deterministische Preflight-Contracts), mobile-live-staging-deploy, homepage-staging-lab, staging-infra-verdict, staging-touch-verdict, staging-visual-verdict
  - ❌ failure: staging-editor-verdict, staging-session-undo-verdict, staging-persistence-verdict, staging-text-save-verdict
- **Ursache der 4 roten Gates:** Alle Browser-Tests, die den temporären E2E-Login nutzen (`/wp-content/mu-plugins/kp-e2e-owner-all.php`), laufen in ein `page.goto`-Timeout (35 s / 30 s) auf `/?kp_e2e_login=…` – schon beim Navigieren zum Login, bevor der Editor initialisiert. Betroffen: editor (alle 3 Viewports), session-undo, persistence, text-save.
- Interessant: Nicht-Login-Tests (touch-slider, touch-runtime, visual-50-Views) sind grün, Staging ist schnell erreichbar (0.2–0.3 s per curl). Das Muster ist über mehrere Commits reproduzierbar (51b3bd3, d21c606, f01884a) → kein neuer Regression, sondern offenbar ein systematisches Problem des E2E-Login-Bridges im CI-Kontext.
- **Nicht reproduzierbar ohne FTP-Zugang:** Die Bridge-Datei wird nach jedem CI-Lauf per `cleanup_bridge` entfernt (404 auf Staging bestätigt), Secrets liegen nur in CircleCI. → Als OFFEN dokumentiert; nächster Schritt: im Kreis-Lauf 3 oder mit CircleCI-Zugang Logs des Login-Hangs prüfen (möglicherweise hängt der wp_safe_redirect-Target `/?kp_edit=1&kp_e2e=1` unter Auth).
- Kein manueller Trigger nötig: Der letzte Lauf umfasst bereits den aktuellen main-Stand (f01884a, 11:04Z).

## 3. Thorsten Voice-Smoke-Test 🔧→✅
- `tests/thorsten-smoke-test.js` existiert NICHT. Der echte Test ist `qa/android-natural-voice-contract.sh` (Thorsten-High-Assets, Samplerate, PCM16, AudioTrack, kein System-TTS-Fallback).
- **War NICHT in CI eingebunden**: Weder `.circleci/config.yml` noch GitHub-Actions-Workflows riefen ihn auf. Der lokale Laptop-Aufruf wurde nur über `qa/prepare-android-natural-voice.sh` erreicht.
- **Jetzt in CircleCI integriert** (Job `android-homepage-technician`):
  1. Neuer Schritt „Prepare Thorsten High voice assets" → `qa/prepare-android-natural-voice.sh` (lädt Modell-Assets bei Bedarf aus dem sherpa-onnx-Release)
  2. Neuer Schritt „Thorsten natural voice contract" → `qa/android-natural-voice-contract.sh` (bricht bei fehlenden Assets/PCM16/System-TTS ab)
- **Lokal bestanden:** `bash qa/android-natural-voice-contract.sh` → PASS (Assets 127 MB vorhanden in Worktree, aber **nicht** in git getrackt – wird in CI heruntergeladen).
- Hinweis: CircleCI-Android-Job feuert nur auf `/feature\/android-.*/`; GitHub-Actions-Workflow ebenso – d. h. Thorsten-Check läuft im Android-Zweig-Kontext. Auf main läuft zusätzlich der deterministische Preflight (`qa/mobile-live-contract.sh` referenziert LocalNaturalVoice.kt via `mobile-live-contract.sh`? Nein – separater Check nötig, siehe offene Punkte).

## 4. Branch-Konsolidierung ✅
- `feature/webapp-primary-agent` (Tip `e7f8ec1`) und `ai-repair/local-thorsten-high-v8-20260825` (Tip `cfa17f6`) sind beide Vorfahren von `main` (git merge-base --is-ancestor = YES; Merge-Commit `82462e3` vom 28.08. 11:54).
- Nichts mehr zu mergen.

## Offene Punkte für den User
1. **CI-Editor-Verdicts rot (E2E-Login-Timeout)** – siehe oben. Braucht entweder einen CircleCI-Log-Diagnose-Lauf (User kann CircleCI-Dashboard checken) oder Reproduktion mit FTP-Zugang. Die deterministischen Contracts und alle öffentlichen Browser-Tests sind grün.
2. Thorsten-Modell-Assets (127 MB) sind nicht in git; CI lädt sie bei jedem Android-Build neu (Zeit/Volumen). Optional: Assets in ein Release/Artifactory auslagern oder LFS evaluieren – Entscheidung dem User überlassen.
3. `HERMES_STATUS.md` der vorherigen Session (f01884a) wurde in der Arbeitskopie durch eine 1-Zeilen-Notiz überschrieben; diese Datei ist jetzt wieder vollständig.

## Nächste sinnvolle Schritte
- CircleCI-Workflow f01884a im Dashboard ansehen (`circleci.com/gh/sebastianmoschek-hash/koblenzer-puppenspiele-wordpress/2588`), Editor-Login-Timeout-Diagnose aus `editor.log` holen.
- Optional: `qa/homepage-editor-lab.mjs` auf Fehlertoleranz/Longer-Timeout prüfen, wenn der Login-Hang reproduzierbar ist.
- Nach Thorsten-CI-Integration: Android-Branch pushen bzw. nächsten feature/android-* Anlass abwarten, um die neuen Schritte real grün zu sehen.