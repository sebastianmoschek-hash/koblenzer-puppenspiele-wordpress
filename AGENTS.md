# AGENTS.md — Koblenzer Puppenspiele

## Projektziel
Pflege und Weiterentwicklung der selbst gehosteten WordPress-Seite der Koblenzer Puppenspiele. Die spätere Pflege soll ohne CSS/PHP/GitHub-Wissen direkt in WordPress möglich sein. Änderungen durch Coding-Agenten sollen ohne manuelle ZIP-Uploads über GitHub nach Staging deployed und dort automatisch geprüft werden.

## Installierte Ordnernamen — NICHT ÄNDERN
Theme: `wp-content/themes/koblenzer-puppenspiele-block-theme-phase1-7`
Plugin: `wp-content/plugins/koblenzer-puppenspiele-core-phase2-2`

Eine Änderung der Ordnernamen erzeugt in WordPress doppelte Installationen statt Updates.

## Pflicht-Workflow für Änderungen
1. Bestehende Inhalte/Daten und funktionierende Bereiche nicht unnötig verändern.
2. PHP-Dateien müssen vor Deployment syntaktisch geprüft werden; der GitHub-Workflow erledigt dies zusätzlich automatisch.
3. Änderungen auf `main` deployen automatisch auf `https://neu.koblenzer-puppenspiele.de`.
4. Nach jedem Deployment läuft ein echter Chromium-Render gegen die Live-Staging-Seite.
5. Visual-QA-Ausgaben werden unter `https://neu.koblenzer-puppenspiele.de/visual-qa/` veröffentlicht.
6. Vor Abschluss einer visuellen Aufgabe die Visual-QA-Screenshots und `report.json` selbst prüfen. Den Benutzer nicht routinemäßig um Screenshots bitten.
7. Desktop, Tablet und Smartphone selbst iterativ prüfen; Probleme im Code korrigieren, erneut deployen und erneut rendern.
8. Besonders prüfen: Zeilenumbrüche, horizontales Überlaufen, unnötige Leerflächen, Bildbeschnitt, sehr große Bilder/Überschriften, Kontrast, Button-Hierarchie und mobile Überdeckung durch das Floating-Menü.
9. Bei PHP-/WordPress-Fehlern sofort minimal und reversibel korrigieren; keine Daten löschen.
10. Erst dann als fertig melden, wenn automatischer Funktionscheck und visueller Review plausibel sauber sind.

## Gestaltungsrichtung
- Hochwertige moderne Theater-/Kultur-Ästhetik statt Shop-/Baukasten-Look.
- Dunkle Grundfläche, warme Braunabstufungen, Orange als klare Akzent-/Aktionsfarbe.
- Serifenschrift für charaktervolle Überschriften, ruhige Sans-Serif für Fließtext.
- Klare visuelle Hierarchie, großzügig aber nicht verschwenderisch.
- Mobile-first: kompakte Karten, kurze Wege, große klickbare Ziele, keine unnötig hohen Bildflächen.
- Bilder möglichst wirkungsvoll, aber nie so groß, dass der Inhalt erst nach langem Scrollen beginnt.

## Aktuelles Ziel: „Das Theater“
- Drei kompakte Theater-Infokarten in einer Reihe auf Desktop.
- Orangefarbenes Symbol innerhalb jeder Karte links vom normal umbrechenden Text.
- Keine wortweisen Mini-Spalten.
- Zitatleiste direkt darunter.
- Drei kompakte Ensemblekarten in einer Reihe.
- Ensemblekarte: großes rundes Portrait links, Text rechts.
- Keine großen vertikalen Leerflächen.
- „Mehr Infos →“ sichtbar und zuverlässig.
- „Außerdem unverzichtbar …“ kompakt und ruhig halten.
- Mobile Darstellung kompakt; Floating-Menü darf zentrale Inhalte nicht verdecken.

## Sicherheit
- Keine WordPress-Inhalte oder importierten Termine/Repertoire/Referenzen/Ensemble-Daten löschen.
- Keine Zugangsdaten oder Secrets in Git einchecken.
- Keine WordPress-Core-Dateien deployen oder verändern.
- Änderungen klein, testbar und reversibel halten.
- Für direkten WordPress-Agentenzugriff nur least-privilege, auditierbare Schnittstellen verwenden; niemals ein unbeschränktes Datei-/Admin-Tool allein für Komfort freischalten.
