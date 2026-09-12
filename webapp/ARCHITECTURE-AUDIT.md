# Standalone-Editor – Phase-A-Audit

Stand: 2026-09-12, Branch `webapp-no-wordpress-test`, Basis `origin/webapp-no-wordpress-test` (`0c5fe480`).

## Bestand

Die App ist eine statische, mobile-first PWA in `webapp/`. `app.js` rendert lokale JSON-Daten, verwaltet lokale Entwürfe und bietet einen einfachen Cloud-Adapter auf `api/editor-state.php`. Der PHP-Adapter ist auf GitHub Pages nicht ausführbar; dort bleibt Speichern eine lokale Browserfunktion. Der lokale PHP-Server kann den Adapter ausführen.

Die Editorlogik ist derzeit verteilt:

- `editor-bootstrap.js`: Öffnen/Schließen und erste Content-Editable-Schicht.
- `editor-core-mobile.js`: Snapshot-Historie, Wiederherstellung und Rewire.
- `app.js`: Text-, Bild-, Abschnitts- und lokale/cloud Persistenz.
- `direct-manipulation.js`, `mobile-gesture-arbiter.js`, `image-gesture-editor.js`, `background-gesture-editor.js`: direkte Pointer-/Touch-Interaktionen.
- `context-toolbar.js`, `text-button-sheet.js`, `design-editor.js`, `pro-image-editor.js`, `menu-editor.js`, `site-manager-v2.js`: kontextbezogene UI-Module.
- `full-state-persistence.js`, `version-history.js`: vollständiger Cloud-Zustand und Versionsdialog.

## Funktionsmatrix

| Bereich | Status | Befund |
|---|---|---|
| View-Modus / responsive Layout | A | Statische Homepage lädt lokal ohne Console-/HTTP-Fehler. |
| Editor öffnen/schließen | A | Im mobilen und Desktop-Smoke-Test erfolgreich. |
| Textauswahl und Content-Editable | B | Mehrere Wiring-Schichten; zentrale Action fehlt. |
| Abschnitt hinzufügen/verschieben/duplizieren/löschen | B | Vorhanden, primär in `app.js`; Undo-Anbindung verteilt. |
| Undo/Redo/Restore | B | Mobile-Core und Legacy-Stack existieren parallel. |
| Bildeditor | B | UI/Filter/Rotation vorhanden; Datei-/Persistenzpfad separat prüfen. |
| Navigation bearbeiten | B | `menu-editor.js` und `site-manager-v2.js` teilen Zuständigkeiten. |
| Persistenz | B | localStorage robust vorhanden; PHP-Cloud nur mit Server. |
| KI | C | Keine echte KI-Leistung in dieser Standalone-Version; UI darf dies nicht vortäuschen. |
| zentrale Actions | A/B | Vertrag mit `editor-action-engine.js` eingeführt, Migration der Module folgt schrittweise. |

## Phase-A-Roadmap

1. Action-Engine als einzige öffentliche Command-Grenze verwenden; zuerst Abschnitts- und Textaktionen migrieren.
2. Undo-Transaktionen ausschließlich über den bestehenden Mobile-Core registrieren.
3. Selection-/Wiring-Lifecycle zentralisieren und nach Restore über ein Ereignis neu binden.
4. Persistenz als expliziten Adapter behandeln: localStorage immer, PHP-Cloud nur bei erreichbarem Endpoint.
5. Erst danach Bild-, Navigation- und Preset-Aktionen auf denselben Vertrag umstellen.

Die Action-Engine führt keine nicht implementierten Funktionen vor. Nicht registrierte Actions liefern einen klaren Fehler; echte KI- und Serverfunktionen bleiben bis zur tatsächlichen Anbindung deaktiviert.
