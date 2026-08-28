# HERMES STATUS – Stand 28.08.2026

## Aktueller Fortschritt (Cron-Wartungsjob)

### 1. CI-Fix: beforeunload im unified-editor-contract ✓
- **Status:** Abgeschlossen & Grün.
- **Durchgeführte Aktionen:**
  - `beforeunload`-Listener in `wp-content/mu-plugins/kp-canva-editor.js` und `wp-content/mu-plugins/kp-local-ai-desktop.php` vollständig entfernt / auf `pagehide` umgestellt.
  - `qa/unified-editor-contract.sh` verschärft, um `addEventListener('beforeunload')` abzufangen.
  - Alle deterministic Preflight-Contracts (`editor-preflight-contracts.sh`: word-history, unified-editor, create-undo-redo, calendar-undo-redo, ai-repair-safety) lokal erfolgreich bestanden.

### 2. Staging 500: neu.koblenzer-puppenspiele.de/termine/ ✓
- **Status:** Beholfen & Verifiziert.
- **Durchgeführte Aktionen:**
  - Live-Anfrage an `https://neu.koblenzer-puppenspiele.de/termine/` sowie den zugehörigen REST-Endpunkt `/wp-json/wp/v2/pages/18` durchgeführt.
  - Ergebnis: HTTP 200 OK, vollständiges HTML (2575 Zeilen) ohne PHP-Fehler oder Render-Abbrüche. Kein HTTP 500-Fehler vorhanden.

### 3. Thorsten Voice-Smoke ✓
- **Status:** Validiert & Grün.
- **Durchgeführte Aktionen:**
  - Thorsten High Model-Assets (109MB VITS-Piper `de_DE-thorsten-high`, `tokens.txt`, `espeak-ng-data`) vorbereitet.
  - Contract-Test `qa/android-natural-voice-contract.sh` erfolgreich bestanden: Model-Assets vorhanden, Samplerate dynamisch validiert, PCM16 Format frame-aligned, AudioTrack state checked, blockierende volle Writes gefordert, kein System-TTS Fallback.

### 4. Branch-Konsolidierung
- **Status:** In Bearbeitung.
