# Editor V2 – Architektur und Abnahmestand

Stand: 2026-09-12. Zulässiger Branch: `webapp-no-wordpress-test`.

## Laufende Architektur

Die Standalone-PWA arbeitet lokal und ohne WordPress. Der verbindliche Zustandsfluss ist:

`Document Model → Store → Actions/Transactions → Renderer → Website`

- `editor-v2-core.js`: versioniertes Document Model (Schema 2), stabile IDs, Import/Migration, Store, Auswahl, Transaktionen, Undo/Redo, Renderer, lokale Persistenz, zentrale Touch-Gesten und Diagnosekontext.
- `editor-v2-overlay.js`: kontextabhängige V2-Werkzeugleiste, Abschnitts-, Navigations-, Header-, Theme- und KI-Statusoberflächen.
- `text-button-sheet.js`: Text- und Buttonbearbeitung als Vorschau mit genau einer Commit-Transaktion.
- `pro-image-editor.js`: Live-Bildvorschau, Filter, Helligkeit, Kontrast, Sättigung, Temperatur, Weichzeichnen, Transparenz, Zuschneiden, Rotation und Spiegelung als eine Transaktion.
- `editor-v2-ai.js`: providerneutrale Verträge für Plan/Validierung, Realtime-Sitzung, Audio, Bildschirmfreigabe und kontrollierten Editor-/Diagnosekontext.
- `sw.js`: Offline-Basis der statischen PWA.

UI, Touch und der vorbereitete KI-Adapter rufen dieselben V2-Actions auf. Größere Theme- und KI-Änderungen unterstützen Preview, Übernehmen, Verwerfen und Undo. Die frühere Editorlogik bleibt nur als technische Kompatibilitätsschicht geladen; konkurrierende Legacy-Griffe und -Werkzeuge sind im V2-Modus abgeschaltet.

## Fertig und automatisch nachgewiesen

- Originalinhalte: 9 Abschnitte, 17 Repertoireeinträge, 82 Termine, 9 Ensembleeinträge, 25 Referenzen und 66 lokale Mediendateien.
- Strukturierter Import mit stabilen Element-, Abschnitts- und Navigations-IDs.
- Zentrale Actions für Text, Button, Bild, Ebene, Abschnitt, Header, Navigation und Theme.
- Auswahl, Long-Press-Verschieben, Raster-/Element-Snapping mit Hilfslinien, Zwei-Finger-Skalierung/Drehung und Drag-Papierkorb mit Undo.
- Ein History-System für V2-Actions und zusammengefasste Transaktionen.
- Lokales Speichern, neues Browserfenster, Laden und DOM-/Modell-Readback.
- Text-, Button- und Bildeditor mit echter Browserbedienung.
- Abschnitt hinzufügen, verschieben, duplizieren, gestalten und löschen.
- Navigation umbenennen, ergänzen, sortieren und löschen.
- Header-Preset und drei inhaltsbewahrende Website-Designvarianten.
- Getrennter Edit-/View-Modus, mobile Navigation, PWA/Service Worker.
- Providerneutrale KI-Action-Validierung, Preview/Commit/Cancel, Realtime-/Audio-/Screen-Contracts und Fehlerdiagnose.
- Browserprüfungen auf 390, 820 und 1440 Pixel; Android-WebView-Prüfung im Emulator.

## Bewusst externe Grenzen

Eine echte generative Live-/Bild-KI ist nicht angebunden. Ohne ausdrücklich freigegebenen Provider und dessen Zugangsdaten bleiben diese Schaltflächen sichtbar als „Nicht verbunden“ bzw. deaktiviert; es gibt keine Fake-KI. Bildschirmfreigabe verlangt im Vertrag eine ausdrückliche Benutzerfreigabe. Ein physisches Android-Gerät wurde nicht als Emulator ausgegeben.

## Verifikation

```powershell
.\scripts\verify-all.ps1
```

Die Prüfung startet lokal, testet Browserfunktion und Visuals, baut die Debug-APK und führt bei verbundenem Emulator Installation, WebView-Bedienung und Logcat-Absturzprüfung aus. Sie verwendet weder CircleCI noch GitHub Actions, FTPS, WordPress oder Produktion.
