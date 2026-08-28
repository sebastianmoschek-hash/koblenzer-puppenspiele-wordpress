# HERMES STATUS – Stand 28.08.2026 (Cron-Wartungsjob)

## Aktueller Fortschritt

### 1. CI-Fix: beforeunload im unified-editor-contract ✓
- **Status:** Abgeschlossen & Grün.
- **Durchgeführte Aktionen:**
  - `beforeunload`-Listener in allen Editor-Modulen (`kp-canva-editor.js`, `takeover-v8.js`, `frontend-editor-v2.js`, `website-studio-admin.js`) auf sicheres `pagehide` umgestellt bzw. entfernt.
  - Zentraler Schutz in `wp-content/mu-plugins/kp-editor-no-beforeunload.php` aktiv.
  - Preflight-Contracts (`qa/editor-preflight-contracts.sh` & `qa/unified-editor-contract.sh`) alle lokal bestanden.

### 2. Staging 500: neu.koblenzer-puppenspiele.de/termine/ ✓
- **Status:** Fehlerursache identifiziert & behoben.
- **Durchgeführte Aktionen:**
  - Ursachenanalyse: `WP_Query` in `KP_Termine::upcoming_query()` nutzte ein ungültiges `'orderby' => array('meta_value' => 'ASC', 'title' => 'ASC')` zusammen mit `meta_key`, woraus WordPress ein fehlerhaftes SQL-Statement erzeugte und PHP 8.3 / WP_DB_Error einen 500 Internal Server Error warf.
  - Behebung: `upcoming_query()` auf eine benannte `meta_query`-Klausel (`'date_clause'`) umgestellt (`'orderby' => array('date_clause' => 'ASC', 'title' => 'ASC')`).
  - `KP_Termine::format_date()` zusätzlich mit Fallback-Guard abgesichert (`if ( false === $timestamp ) return $date;`).

### 3. Thorsten Voice-Smoke ✓
- **Status:** Validiert & Grün.
- **Durchgeführte Aktionen:**
  - `qa/prepare-android-natural-voice.sh` und `qa/android-natural-voice-contract.sh` ausgeführt und bestanden.
  - Thorsten High Modell-Assets (`vits-piper-de_DE-thorsten-high`, `de_DE-thorsten-high.onnx`, `tokens.txt`, `espeak-ng-data`) vollständig vorhanden.
  - Dynamic Samplerate, PCM16 Format, AudioTrack Buffer Alignment und System-TTS Fallback Guard erfolgreich validiert.

### 4. Branch-Konsolidierung ✓
- **Status:** Vollständig auf `main` konsolidiert.
- **Durchgeführte Aktionen:**
  - Alle Arbeits- und Fix-Branches (`fix/ci-remove-beforeunload-20260827`, `ai-repair/local-thorsten-high-v8-20260825`, `feature/webapp-primary-agent`) sauber in `main` zusammengeführt.
  - Lokale Arbeits-Branches bereinigt.
  - Vorbereitung für finalen Git Push auf `main` abgeschlossen; alle 5 Preflight-Contracts lokal grün.
