# Editor V2 – Fortschrittsprotokoll

Stand: 13. September 2026  
Branch: `webapp-no-wordpress-test`

Dieses Protokoll dokumentiert den lokalen, produktionsfreien Ausbau des Standalone-Editors. Es enthält keine Zugangsdaten.

| Paket | Status | Nachweis / offener Punkt |
|---|---|---|
| A – Export, Import, Sicherungen | DONE | Portabler JSON-Export/-Import, 20 lokale Versionen, Schema-/Größen-/Typ-/ID-Prüfung, Migration, transaktionales Undo und Datenbereinigung; Browser-Smoke auf 390/1440 sowie vollständiger Web-/Visual-/Android-Lauf grün. |
| B – Schriftfamilien | NOT_DONE | Noch nicht begonnen. |
| C – Ebenenverwaltung | PARTIAL | Zentrale `moveLayer`-Action vorhanden; vollständige mobile Oberfläche fehlt. |
| D – Medienbrowser | NOT_DONE | Noch nicht begonnen. |
| E – Abschnitte | PARTIAL | Auswahl, Vorlagen, Verschieben, Duplizieren, Löschen und Basisdesign vorhanden. |
| F – Header | PARTIAL | Basis-Presets vorhanden; Detailbearbeitung offen. |
| G – Navigation | PARTIAL | Umbenennen, Hinzufügen, Sortieren und Löschen vorhanden. |
| H – Mehrere Seiten | PARTIAL | Document Model vorbereitet; sichtbare Seitenverwaltung offen. |
| I – Design Tokens | PARTIAL | Theme-Werte vorhanden; zentraler Token-Editor offen. |
| J – Responsive Hardening | PARTIAL | 390/820/1440 automatisiert geprüft; Zwischenbreiten offen. |
| K – Barrierefreiheit | PARTIAL | Semantische Dialoggrundlagen vorhanden; vollständiger Tastatur-/Fokuslauf offen. |
| L – Tastaturkürzel | NOT_DONE | Noch nicht begonnen. |
| M – Original/V2-Vergleich | PARTIAL | Inhaltsinventur und Visual-QA vorhanden; expliziter Vergleichsbericht offen. |
| N/O – Legacy-Inventur/-Rückbau | PARTIAL | V2-Grenze dokumentiert und Legacy-Werkzeuge im V2-Modus deaktiviert; kontrollierter Rückbau offen. |
| P – Offline/PWA | PARTIAL | Service Worker und Android-Offline-WebView funktionieren; gezielter Offline-Retest offen. |
| Q – Performance | PARTIAL | Gestenpfad vorhanden; Messbericht offen. |
| R – Schema/Migration | PARTIAL | Version 2, Altstandmigration und strikte Importgrenzen vorhanden; zusätzliche Kernmodell-Validierung bleibt offen. |
| S–V – KI/Live/Diagnose/Provider | PARTIAL | Providerneutrale Verträge, Preview, Berechtigungsgrenzen und Diagnosekontext vorhanden; Live-Provider extern. |
| W/X – Android | PARTIAL | Debug-APK, Offline-Assets und Emulator-Smoke grün; Rotations-/Zurücknavigationstest offen. |
| Y – Gesamttests | PARTIAL | Unit-/Browser-/Visual-/Android-Prüfstrecke vorhanden und wird fortlaufend erweitert. |

Produktion, FTPS, `main` und der alte WordPress-/Staging-Arbeitsstand bleiben unangetastet.
