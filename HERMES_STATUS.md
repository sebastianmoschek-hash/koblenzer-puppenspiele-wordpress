# HERMES_STATUS - Koblenzer Puppenspiele

## Ist-Zustand (Bestandsaufnahme 28.08.2026)
- **Repository-Pfad:** `C:\dev\koblenzer-puppenspiele-wordpress`
- **Aktiver Branch:** `main` (synchron mit `origin/main`)
- **Letzter Commit:** `a5e3b5c` — `ci: keep latest staging handoff waiter only`

## Modul-Zustandsmatrix
1. **WordPress Homepage & Visueller Editor (`wp-content/`):**
   - Block-Theme & Core-Plugin aktiv.
   - Editor-Buttons (✎ Bearbeiten | ✦ KI) und Undo/Redo/Persistence-Funktionen über 45+ MU-Plugins realisiert.
   - *Fehler/Befunde aus Visual QA:* Auf Staging zeigten einzelne Seiten (`/termine`, `/das-theater` auf Tablet/Desktop) zeitweise HTTP 500 – Verifikation erforderlich.

2. **CI/CD & Autonomes Staging-Labor (`.circleci/`, `qa/`):**
   - CircleCI Pipeline konfiguriert (`.circleci/config.yml`).
   - *Befund:* Letzter abgelegter Report `qa-results/circleci-latest.md` zeigte Preflight-Fehler / Abbruch vor Hauptlabor. Staging-Lab-Test muss sauber durchlaufen.

3. **Android Techniker-App (`android/homepage-technician`):**
   - Kotlin / Gradle-Projekt vorhanden.
   - *Befund:* `qa-results/android-latest.json` meldet Build-Fehler (`androidBuild: 1`). Gradle-Assembly muss korrigiert und auf lokales Thorsten-TTS & Gemma geprüft werden.

4. **Desktop Agent (`desktop/homepage-agent`):**
   - Node.js Server (`server.mjs`) auf Port 8765 vorhanden.
   - Ollama-Anbindung (`gemma3:4b`) für Browser-Befehle, Patches & lokalen Text/Bild-Kontext.

## Offene Arbeitspakete (Priorisiert)
1. [ ] **WordPress & Staging-Health:** HTTP 500 Ursachen auf `/termine` & `/das-theater` analysieren und beheben.
2. [ ] **CircleCI Staging-Lab:** Preflight- und Labor-Skripte prüfen, grünen Durchlauf auf Staging sicherstellen.
3. [ ] **Android Techniker-App:** Gradle-Build reparieren, Thorsten-TTS (Sherpa-ONNX/Piper) und lokale Sprachpausierung verifizieren.
4. [ ] **Desktop-Agent & Ollama:** Server-Steuerung und Hermes-Übergabe für komplexe Code-Aufgaben verifizieren.
5. [ ] **E2E Visual & Persistence QA:** Echte Persistence (Speichern → Reload → State-Readback) und Touch-Gesten absichern.
