# HERMES STATUS – Stand 28.08.2026 (Cron-Wartungsjob)

## Aktueller Fortschritt

### 1. CI-Fix: beforeunload im unified-editor-contract ✓
- **Status:** Abgeschlossen & Grün.
- **Durchgeführte Aktionen:**
  - `beforeunload`-Listener in allen Editor-Modulen (`kp-canva-editor.js`, `takeover-v8.js`, `frontend-editor-v2.js`, `website-studio-admin.js`) auf sicheres `pagehide` umgestellt bzw. entfernt.
  - Zentraler Schutz in `wp-content/mu-plugins/kp-editor-no-beforeunload.php` aktiv.
  - Preflight-Contracts (`qa/editor-preflight-contracts.sh` & `qa/unified-editor-contract.sh`) alle lokal bestanden.

### 2. Staging 500: neu.koblenzer-puppenspiele.de/termine/ ✓
- **Status:** Fehlerursache behoben.
- **Durchgeführte Aktionen:**
  - Ursachenanalyse: `KP_Termine::upcoming_query()` nutzte `meta_query` mit benannter `date_clause` und in `orderby` ein Array `array('date_clause' => 'ASC', 'title' => 'ASC')`. In WP_Query erzeugte dies ein ungültiges SQL (`Unknown column 'date_clause' in order clause`) und führte zu PHP 8.3 / WP_DB_Error HTTP 500 auf der Startseite und `/termine/`.
  - Behebung: `upcoming_query()` auf standardkonformes top-level WP_Query (`'meta_key' => '_kp_date'`, `'meta_value' => current_time('Y-m-d')`, `'meta_compare' => '>='`, `'meta_type' => 'DATE'`, `'orderby' => 'meta_value'`, `'order' => 'ASC'`) umgestellt.
  - `KP_Termine::format_date()` mit Fallback-Guard abgesichert (`if ( false === $timestamp ) return $date;`).

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
  - Vorbereitung und Push auf `main` abgeschlossen; alle 5 Preflight-Contracts lokal grün.
