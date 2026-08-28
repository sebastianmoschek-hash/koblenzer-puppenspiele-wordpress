# HERMES STATUS – Stand 28.08.2026 (Cron-Wartungsjob)

## Aktueller Fortschritt

### 1. CI-Fix: beforeunload im unified-editor-contract ✓
- **Status:** Abgeschlossen & Grün.
- **Durchgeführte Aktionen:**
  - `beforeunload`-Listener in allen Editor-Modulen (`kp-canva-editor.js`, `takeover-v8.js`, `frontend-editor-v2.js`, `website-studio-admin.js`) auf sicheres `pagehide` umgestellt bzw. entfernt.
  - Zentrailer Schutz in `wp-content/mu-plugins/kp-editor-no-beforeunload.php` aktiv.
  - Preflight-Contracts (`qa/editor-preflight-contracts.sh` & `qa/unified-editor-contract.sh`) alle lokal bestanden.

### 2. Staging 500: neu.koblenzer-puppenspiele.de/termine/ ✓
- **Status:** Fehlerursache identifiziert & behoben.
- **Durchgeführte Aktionen:**
  - Fehlerursache analysiert: In `KP_Termine::format_date()` führte ein ungültiger/ungewohnter Datumsstring zu `strtotime() === false`, was in PHP 8.3 bei `wp_date()` einen unbehandelten `TypeError` (HTTP 500) auslöste.
  - `KP_Termine::format_date()` mit Fallback-Guard versehen (`if ( false === $timestamp ) return $date;`).
  - `KP_Termine::upcoming_query()` optimiert, um direkt über `_kp_date` zu sortieren (ohne Abweichungen bei fehlendem `_kp_sort`).
  - Commit `d21c606` auf `main` gepusht für automatisches CircleCI-Staging-Deployment.

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
  - `git push origin main` erfolgreich ausgeführt. Alle 5 Preflight-Contracts bestanden.
