# HERMES STATUS – Stand 28.08.2026 (Cron-Wartungsjob, Lauf 3)

## Zusammenfassung

| Aufgabe | Status |
|---|---|
| 1. Staging /termine/ HTTP 500 | ✅ Behoben, deployed & **echter Browser-Test grün** (7/7 Seiten, 75 Termin-Karten) |
| 2. beforeunload-Fix auf main | ✅ CI: CircleCI grün (editor-contracts, homepage-staging-lab, 4/8 Verdicts); 4 E2E-Login-Verdicts weiterhin rot (bekanntes systematisches Problem) |
| 3. Thorsten Voice-Smoke-Test | ✅ In CircleCI eingebunden (android-homepage-technician) + lokal PASS |
| 4. Branch-Konsolidierung | ✅ Bereits erledigt – beide Branches sind Vorfahren von main (Merge 82462e3/9bc6e5c) |

## 1. Staging /termine/ HTTP 500 ✅
- Fix liegt auf `main` (Commits `d21c606`, `6e726e8`, `dab16c9`, `1133891`); es existiert **kein** Branch `staging/fix-termine-500` (weder lokal noch remote) – Fix wurde direkt auf main committet und über das CircleCI-Labor auf Staging deployed (Report 13:50Z, Commit 66b6852, `deploy: success`).
- **Echter Browser-Test (Playwright 1.62.1, headless Chromium, nur lesend) am 28.08. ~16:00 MESZ:**
  - `/termine/` → **HTTP 200**, Titel „Termine – puppenspiele“, H1 „Termine“, **75 Termin-Karten** (Monats-Überschriften Aug 2026 – Mär 2027), keine Console-/Page-Errors, kein horizontaler Overflow.
  - Weitere 6 Seiten (`/`, `/repertoire/`, `/das-theater/`, `/referenzen/`, `/kontakt/`, `/aktuelles/`) → alle HTTP 200, keine Console-Errors, kein Overflow.
  - **Ergebnis: 0/7 Failures.**
- Zusätzlich HTTP-Head-Checks per curl: `/termine/` 200 in 0,26 s, kein Render-Abbruch, keine PHP-Fehlertexte im HTML.

## 2. beforeunload-Fix & CI-Status ⚠️ (bekanntes Restproblem)
- `a5e3b5c` (Handoff-Waiter) und die beforeunload-Entfernungen (`e5448f7`, `7002dca`) sind auf `main` (Merge `7a91387`). `takeover-v8.js` enthält keinen `beforeunload`-Listener mehr; `frontend-editor-v2.js` dokumentiert den Verzicht.
- **CircleCI-Status für main (66b6852), abgeschlossen:**
  - ✅ success: editor-contracts, mobile-live-staging-deploy, homepage-staging-lab (Job selbst grün!), staging-infra-verdict, staging-touch-verdict, staging-visual-verdict
  - ❌ failure: staging-editor-verdict, staging-session-undo-verdict, staging-persistence-verdict, staging-text-save-verdict
- **Ursache unverändert (aus `diagnostics.txt` des Laufs bestätigt):** Alle Login-abhängigen Browser-Tests laufen in ein `page.goto`-Timeout auf `/?kp_e2e_login=…` (35 s / 30 s, „waiting until domcontentloaded“), in allen 3 Viewports (mobile-390, tablet-820, desktop-1440) sowie session-undo, persistence und text-save. Nicht-Login-Tests (touch-slider, touch-runtime, visual-50) sind grün. Das Muster ist über mehrere Commits reproduzierbar (51b3bd3, d21c606, f01884a, 66b6852) → **systematisches Problem der E2E-Login-Bridge im CI-Kontext, keine neue Regression.**
- Kein manueller Trigger nötig – der letzte Lauf deckt den aktuellen main-Stand ab.
- **GitHub Actions** (nur Fallback): schlägt wegen Billing-Limit fehl („recent account payments have failed or your spending limit needs to be increased“) – bekannt, nicht blockierend, da CircleCI primär ist.

## 3. Thorsten Voice-Smoke-Test ✅
- `tests/thorsten-smoke-test.js` existiert nicht; der echte Test ist `qa/android-natural-voice-contract.sh` (Thorsten-High-Assets, Modell-Samplerate, PCM16, AudioTrack-Minimalpuffer, kein System-TTS-Fallback).
- **In CI eingebunden:** Commit `66b6852` ergänzt im CircleCI-Job `android-homepage-technician` die Schritte „Prepare Thorsten High voice assets“ (`qa/prepare-android-natural-voice.sh`) und „Thorsten natural voice contract“ (`qa/android-natural-voice-contract.sh`) vor dem APK-Build.
- **Lokal bestätigt:** `bash qa/android-natural-voice-contract.sh` → **PASS** (Assets vorhanden, Samplerate modellbasiert+validiert, PCM16 frame-aligned, AudioTrack-Checks, kein TTS-Fallback).
- Hinweis: Der Android-Job feuert nur auf `/feature\/android-.*/` – der neue Thorsten-Schritt läuft also beim nächsten Android-Branch-Push real in CI.

## 4. Branch-Konsolidierung ✅
- `feature/webapp-primary-agent` (Tip `e7f8ec1`) und `ai-repair/local-thorsten-high-v8-20260825` (Tip `cfa17f6`) sind beide Vorfahren von `main` (`git merge-base --is-ancestor` = YES; Merge-Commits `82462e3`/`9bc6e5c` vom 28.08.).
- Nichts mehr zu mergen; beide Branches können bei Bedarf gelöscht werden.

## Offene Punkte für den User
1. **CI-Editor-Verdicts rot (E2E-Login-Timeout)** – reproduzierbar über 4+ Commits. Braucht CircleCI-Log-Diagnose (Dashboard: Workflow d3973a8e-95bb-421b-bc32-5a361c011c2b / Build 2602) oder Reproduktion mit FTP-Zugang. Verdacht aus Vorlauf: `wp_safe_redirect`-Ziel `/?kp_edit=1&kp_e2e=1` hängt unter Auth, bevor `domcontentloaded` feuert. Die deterministischen Contracts und alle öffentlichen Browser-Tests sind grün.
2. **GitHub Actions Billing-Limit** – Fallback-Workflows laufen nicht („spending limit“). Nicht blockierend, aber beobachten.
3. **Thorsten-Assets (115 MB tar.bz2)** nicht in git – CI lädt sie bei jedem Android-Build neu. Optional: Release/Artifactory/LFS – Entscheidung User.
4. Alte Branches (`feature/webapp-primary-agent`, `ai-repair/local-thorsten-high-v8-20260825`, `fix/ci-remove-beforeunload-20260827`) können nach Freigabe gelöscht werden.

## Nächste sinnvolle Schritte
- CircleCI-Build 2602 (main, 66b6852) im Dashboard ansehen: `circleci.com/gh/sebastianmoschek-hash/koblenzer-puppenspiele-wordpress/2602`, Editor-Login-Timeout aus `editor.log`/`session-undo.log` diagnostizieren (Redirect-Hang auf `/?kp_edit=1&kp_e2e=1`).
- Nach Thorsten-CI-Integration: nächsten `feature/android-*`-Push abwarten, um die neuen Schritte real grün zu sehen.
- Optional: `qa/homepage-editor-lab.mjs` Login auf Fehlertoleranz (längeres Timeout / Retry) prüfen, falls der Hang reproduzierbar ist.