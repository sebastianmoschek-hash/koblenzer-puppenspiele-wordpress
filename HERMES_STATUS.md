# HERMES STATUS – Stand 28.08.2026 (Cron-Wartungsjob)

## Aktueller Fortschritt

### 1. CI-Fix: beforeunload im unified-editor-contract ✓
- **Status:** Abgeschlossen & Grün.
- **Durchgeführte Aktionen:**
  - `beforeunload`-Listener in allen Editor-Modulen (`kp-canva-editor.js`, `takeover-v8.js`, `frontend-editor-v2.js`, `website-studio-admin.js`) auf sicheres `pagehide` umgestellt bzw. entfernt.
  - Zentraler Schutz in `wp-content/mu-plugins/kp-editor-no-beforeunload.php` aktiv.
  - Preflight-Contracts (`qa/editor-preflight-contracts.sh` & `qa/unified-editor-contract.sh`) alle lokal bestanden.

### 2. Staging 500: neu.koblenzer-puppenspiele.de/termine/ ✓
- **Status:** Vollständig behoben & Staging verifiziert (HTTP 200 OK).
- **Durchgeführte Aktionen:**
  - Ursachenanalyse 1 (Termine-Query): `KP_Termine::upcoming_query()` auf standardkonformes top-level WP_Query (`'meta_key' => '_kp_date'`, `'meta_value' => current_time('Y-m-d')`, `'meta_compare' => '>='`, `'meta_type' => 'DATE'`, `'orderby' => 'meta_value'`, `'order' => 'ASC'`) umgestellt. `KP_Termine::format_date()` mit Fallback-Guard abgesichert.
  - Ursachenanalyse 2 (MU-Plugin Syntaxfehler): In `wp-content/mu-plugins/kp-mobile-local-ai-repair.php` Zeile 367 wurde ein Syntaxfehler in `foreach ( array_reverse(...) as $comment )` behoben.
  - Verifikation: Live-Requests auf `https://neu.koblenzer-puppenspiele.de/` und `https://neu.koblenzer-puppenspiele.de/termine/` liefern HTTP 200 OK und vollständiges HTML.

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
  - Alle lokalen Preflight-Contracts grün; Fixes committed und auf `origin/main` gepusht.
