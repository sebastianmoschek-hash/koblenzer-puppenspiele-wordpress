# HERMES_DECISIONS - Koblenzer Puppenspiele

Hier werden Architektur- und Betriebskonventionen protokolliert.

## 2026-08 - Architektur- & Betriebskonventionen

### 1. Produktionsschutz (Höchste Priorität)
- **Entscheidung:** Die Produktionsseite (`koblenzer-puppenspiele.de`) ist gesperrt und wird **niemals** ohne ausdrückliche Freigabe geändert oder bespielt.
- **Praxis:** Entwickelt, getestet und verifiziert wird ausschließlich lokal und auf Staging (`neu.koblenzer-puppenspiele.de`).

### 2. Ordnernamen-Konstanz in WordPress
- **Entscheidung:** Theme-Ordner (`koblenzer-puppenspiele-block-theme-phase1-7`) und Plugin-Ordner (`koblenzer-puppenspiele-core-phase2-2`) dürfen niemals umbenannt werden, um doppelte WordPress-Installationen zu verhindern.

### 3. Autonomes Homepage-Labor via CircleCI
- **Entscheidung:** CircleCI (`.circleci/config.yml` + `qa/circleci-homepage-lab.sh`) ist die primäre E2E-Labor-Pipeline. GitHub Actions dient als Fallback.
- **Kriterium:** Ein grüner Build / HTTP 200 reicht nicht aus; Verifikation erfordert echtes Speichern → Reload → DB-Readback im Staging-Browser.

### 4. Lokale KI & Thorsten-TTS
- **Entscheidung:** Die Sprach- und Bildverarbeitung nutzt präferiert lokale Modelle (Ollama Gemma 3, Thorsten-TTS via Sherpa-ONNX/Piper auf Android).
- **Regel:** Kein stummes Zurückfallen auf Cloud-/System-TTS. Bei Fehlern wird die Ursache im Audio-/Model-Pipeline-Code repariert.
- **Rausch-/Audio-Schutz:** Während der Sprachausgabe (TTS) wird die Spracherkennung pausiert, damit sich das System nicht selbst hört.

### 5. Task-Delegation an Hermes
- **Entscheidung:** Lokale Modelle übernehmen einfache Wahrnehmung & Chat. Komplexe Programmierungs-, Refactoring- und Fehlerbehebungsaufgaben werden automatisch als präziser Auftrag an den technischen Agenten (Hermes) übergeben.
