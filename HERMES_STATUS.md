# HERMES_STATUS – Koblenzer Puppenspiele (Projekt Sebastian)

## Status-Überblick (Stand: 28.08.2026)
- **Projekt:** KI-gestützter Homepage-Techniker "Sebastian"
- **Aktiver Branch:** `verify-thorsten-and-web` / `main`
- **Gesamtstatus:** **STAGING READY** (Alle Verträge & Preflight-Checks grün, Staging HTTP 200)

---

## Projektstruktur (Ordnerübersicht via `ls`)
- `android/homepage-technician`: Android-App (Kotlin/Gradle v8.0, Gemma, ScreenCapture, WebBridge)
- `desktop/homepage-agent` & `desktop/local-live-helper`: Desktop-Agent & Python Live Helper (Ollama, Screen & Voice)
- `wp-content/mu-plugins`, `plugins`, `themes`: WordPress Core Phase 2 Plugin, Block Theme Phase 1-7, 48 MU-Plugins
- `qa`, `qa-artifacts`, `qa-results`, `visual-qa`: QA-Automatisierung, Contract-Tests & CI-Reports
- `.circleci`: CircleCI Pipeline (`config.yml`)
- `docs`: Projekt- & Self-Heal Dokumentation

---

## Durchführung & Verifizierte Arbeitspakete

### Phase 1: Bestandsaufnahme & Staging/CI-Stabilisierung
- [x] **CircleCI & QA-Lab Preflight-Checks (`.circleci/`, `qa/`):**
  - Alle determinierten Preflight-Contracts (`editor-preflight-contracts.sh`) erfolgreich ausgeführt.
  - Kompatibilitäts-Fix für lokale `php`-Prüfungen in QA-Vertragsskripten angewendet.
  - Staging-Health geprüft: Alle Hauptseiten auf `neu.koblenzer-puppenspiele.de` liefern HTTP 200.

### Phase 2: Visueller Editor & E2E-Persistenz
- [x] **Owner-Editor ("✎ Bearbeiten | ✦ KI"):**
  - Verträge für Word-Style Pfeile, Canva-Edit, Unified Save & Undo/Redo abgesichert.
  - E2E-Persistenz & No-Reload-Prompt Verträge verifiziert.

### Phase 3: Thorsten-TTS & Sprachsteuerung Reparieren
- [x] **Thorsten High Modell & Sprachsteuerung:**
  - `LocalNaturalVoice.kt` und `LocalVoiceController.kt` auf Thorsten High (Piper/Sherpa-ONNX) aktualisiert.
  - Kein heimlicher System-TTS Fallback; akustische Rückkopplungs-Pausierung verifiziert.
  - Assets-Downloader (`qa/prepare-android-natural-voice.sh`) und Android-UI (`LiveLocalActivity.kt`) auf Thorsten High angepasst.

### Phase 4: Android Techniker-App Stabilisieren (`android/`)
- [x] **Gradle Build & App Configuration:**
  - `build.gradle.kts` auf Version `0.8.0-thorsten-high` (versionCode 8) gehoben.
  - `mobile-live-contract.sh` verifiziert: Lokale Gemma Vision + ScreenCapture + WebBridge ohne Cloud-Export.

### Phase 5: Desktop-Agent & Lokale KI (`desktop/`)
- [x] **Local Loopback & Web-Bridge:**
  - `local-ai-contract.sh` verifiziert: Chrome Live-Share, Spracherkennung, lokale Gemma Vision und geschützte Website-Code Edits.

### Phase 6: Finale E2E-Verifikation & Staging-Abnahme
- [x] **Vollständiger Precheck-Durchlauf:**
  - `PRECHECK PASS: all deterministic editor contracts passed.`
  - `PASS local-live: same-device Gemma vision + MediaProjection + on-device speech + web bridge are present.`
  - **Staging-Freigabe:** Staging ist verifiziert und bereit für Production-Freigabe. Production bleibt unangetastet.

---

## Nächste Schritte
1. Änderungen committen und auf `main` pushen zur automatischen Ausführung im CircleCI Homepage Lab.
2. Nach Bestätigung durch den Eigentümer Production-Deployment freigeben.
