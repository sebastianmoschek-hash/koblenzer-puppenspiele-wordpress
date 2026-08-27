# HERMES_PROJECT_CONTEXT - Koblenzer Puppenspiele

## Produktziel & Bedienprinzip
- **Ziel:** KI-gestützter Homepage-Techniker ("Sebastian") für den Betreiber der Koblenzer Puppenspiele.
- **Bedienung:** Natürliche deutsche Sprach- & Texteingabe ("Mach den Button grün", "Was siehst du gerade?", "Reparier das").
- **Prinzip:** Der Betreiber sagt, was er möchte. Das System ermittelt selbst die technische Umsetzung.
- **Oberfläche auf der Website:** ✎ Bearbeiten | ✦ KI (visueller Editor + lokaler KI-Kontext).

## Architektursäulen
1. **WordPress Core & Theme (`wp-content/`):**
   - Block-Theme (`koblenzer-puppenspiele-block-theme-phase1-7`)
   - Core-Plugin (`koblenzer-puppenspiele-core-phase2-2`)
   - 45+ MU-Plugins (`wp-content/mu-plugins/`) für Direct-Edit, Touch-Persistence, History & Undo/Redo.
2. **Autonomes E2E-Labor (`.circleci/` & `qa/`):**
   - Staging-Deployment & E2E-Browser-Test auf Chromium/Playwright via CircleCI.
3. **Android App (`android/homepage-technician/`):**
   - WebView-Integration für Betreiberfunktionen, lokale KI-Live-Sessions & Screen-Capture.
4. **Desktop Agent (`desktop/homepage-agent/`):**
   - Node.js-Server (`127.0.0.1:8765`), Ollama-Anbindung (Gemma 3) für lokale Wahrnehmung & direkte Patches.

## Umgebungen & Sicherheitsregeln
- **Staging (`https://neu.koblenzer-puppenspiele.de`):** Autonome Arbeits-, Test- & E2E-Laborumgebung.
- **Produktion (`https://koblenzer-puppenspiele.de`):** **GESPERRT** — Darf NIEMALS ohne ausdrückliche Freigabe verändert oder deployt werden.
- **Workflow:** Lokaler Code → Git Commit → Staging-E2E-Labor (CircleCI) → Echte Browser-Verifikation.

## Top-Level-Ordnerstruktur
- `.circleci/`: CircleCI Pipeline-Konfiguration (`config.yml`).
- `.github/`: GitHub Actions Workflows (Fallback).
- `android/`: Android Techniker-App (`homepage-technician`).
- `desktop/`: Desktop Node.js Agent (`homepage-agent`).
- `qa/`: Test-Skripte, E2E-Verträge & Deployments.
- `qa-artifacts/`: Test-Screenshots & Zwischenergebnisse.
- `qa-results/`: QA-Berichte & JSON/MD Diagnostics.
- `visual-qa/`: Visual Regression Tests (50 Viewports).
- `wp-content/`: WordPress Theme, Core Plugin & MU-Plugins.
