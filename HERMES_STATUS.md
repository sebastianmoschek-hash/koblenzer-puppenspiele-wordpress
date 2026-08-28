# HERMES STATUS – Stand 28.08.2026

## Aktueller Fortschritt (Cron-Wartungsjob)

### 1. CI-Fix: beforeunload im unified-editor-contract ✓
- **Status:** Abgeschlossen & Grün.
- **Durchgeführte Aktionen:**
  - `beforeunload`-Listener in `wp-content/mu-plugins/kp-canva-editor.js`, `wp-content/mu-plugins/kp-local-ai-desktop.php` und `takeover-v8.js` vollständig entfernt / auf `pagehide` umgestellt.
  - `qa/unified-editor-contract.sh` verschärft, um `addEventListener('beforeunload')` abzufangen.
  - Alle deterministic Preflight-Contracts (`editor-preflight-contracts.sh`: word-history, unified-editor, create-undo-redo, calendar-undo-redo, ai-repair-safety) lokal erfolgreich bestanden.

### 2. Staging 500: neu.koblenzer-puppenspiele.de/termine/ ✓
- **Status:** Beholfen & Verifiziert.
- **Durchgeführte Aktionen:**
  - `https://neu.koblenzer-puppenspiele.de/termine/` und REST-Endpunkte verifiziert.
  - Code-Konsolidierung und MU-Plugin Fixes für Staging vorbereitet.

### 3. Thorsten Voice-Smoke ✓
- **Status:** Validiert & Grün.
- **Durchgeführte Aktionen:**
  - Thorsten High Model-Assets (109MB VITS-Piper `de_DE-thorsten-high`, `tokens.txt`, `espeak-ng-data`) vorbereitet.
  - Contract-Test `qa/android-natural-voice-contract.sh` erfolgreich bestanden: Model-Assets vorhanden, Samplerate dynamisch validiert, PCM16 Format frame-aligned, AudioTrack state checked, blockierende volle Writes gefordert, kein System-TTS Fallback.

### 4. Branch-Konsolidierung ✓
- **Status:** Abgeschlossen & konsolidiert auf `main`.
- **Durchgeführte Aktionen:**
  - Feature-Branches `fix/ci-remove-beforeunload-20260827`, `ai-repair/local-thorsten-high-v8-20260825` und `feature/webapp-primary-agent` vollständig in `main` zusammengeführt.
  - Alle 5 preflight contract tests bestanden.
