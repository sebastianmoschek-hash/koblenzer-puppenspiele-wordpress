# Koblenzer Puppenspiele — Editor V2

## Ziel
Neuaufbau eines mobilen Website-Editors mit den Originalinhalten der Koblenzer Puppenspiele. Der bestehende Editor dient nur als Referenz.

## Sicherheitsgrenzen
- Entwicklung ausschließlich auf `editor-v2`.
- `main` niemals verändern.
- Produktive Website `koblenzer-puppenspiele.de` niemals deployen/überschreiben.
- Kein FTPS-Deployment ohne ausdrückliche Freigabe.
- `webapp-no-wordpress-test` bleibt unverändert als Referenz.

## Architektur
Editor V2 trennt strikt:
1. Document Model — strukturierte Website-Daten statt DOM als Datenquelle.
2. Renderer — rendert das Document Model responsiv.
3. Editor Engine — Selection, Move, Resize, Rotate, Text/Bild/Button/Header/Navigation/Abschnitte.
4. History — zuverlässiges Undo/Redo über Commands/Actions.
5. Persistence — lokale/versionierte Speicherung, später Cloud-Sync.
6. Media — Medienbibliothek und professioneller Bildeditor.
7. AI Layer — später Text, Sprache, Bildschirmkontext und Designvorschläge.

## Migrationsregel
Die vorhandene Homepage wird inhaltlich vollständig übernommen: Texte, Bilder, Navigation, Abschnitte und Links. Die alte technische Architektur wird nicht übernommen.

## Reihenfolge
1. V2-Grundgerüst und Document-Model-Schema.
2. Originalhomepage in das Modell migrieren.
3. Responsive Renderer für Mobile/Tablet/Desktop.
4. Selection + direkte Elementbearbeitung.
5. Move/Resize/Rotate + Touch-Gesten + Snap Guides.
6. Text-, Button-, Header-, Navigation- und Abschnittseditor.
7. Undo/Redo und Persistenz.
8. Medienbibliothek + Bildeditor.
9. Design-System/Varianten.
10. KI-/Sprachschicht.
11. Unit-, Integration-, Browser- und Android-Tests.

## Definition of Done
Editor V2 zeigt die vollständigen Originalinhalte, lässt alle vorgesehenen Elemente intuitiv bearbeiten, funktioniert responsiv auf Smartphone/Tablet/Desktop und verändert weder Produktion noch den bisherigen Editor-Branch.