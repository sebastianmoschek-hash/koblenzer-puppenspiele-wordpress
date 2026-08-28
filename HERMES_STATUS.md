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

### 3. Thorsten Voice-Smoke
- **Status:** In Bearbeitung.

### 4. Branch-Konsolidierung
- **Status:** Ausstehend.
