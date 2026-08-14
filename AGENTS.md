# AGENTS.md — Koblenzer Puppenspiele

## Projektziel
Pflege und Weiterentwicklung der selbst gehosteten WordPress-Seite der Koblenzer Puppenspiele. Die spätere Pflege soll ohne CSS/PHP/GitHub-Wissen direkt in WordPress möglich sein.

## Installierte Ordnernamen — NICHT ÄNDERN
Theme: `wp-content/themes/koblenzer-puppenspiele-block-theme-phase1-7`
Plugin: `wp-content/plugins/koblenzer-puppenspiele-core-phase2-2`

Eine Änderung der Ordnernamen erzeugt in WordPress doppelte Installationen statt Updates.

## Pflicht-Workflow
1. Keine Update-ZIP ausgeben, bevor das Layout getestet wurde.
2. Für visuelle Änderungen einen lokalen Render-/Browser-Test verwenden.
3. Screenshots mindestens bei 1600x900, 1366x768, 390x844 und 412x915 erzeugen.
4. Screenshots mit den Zielbildern vergleichen und selbst iterieren.
5. Zeilenumbrüche, Überlauf, unnötige Leerflächen, Bildbeschnitt und mobile Überdeckung vor dem Packaging beheben.
6. Funktionierende, nicht betroffene Bereiche unverändert lassen.
7. Versionsnummer für Cache-Busting erhöhen.
8. ZIPs immer mit den oben genannten exakten Installationsordnern bauen.

## Aktuelles Ziel: „Das Theater“
- Drei kompakte Theater-Infokarten in einer Reihe auf Desktop.
- Orangefarbenes Symbol innerhalb jeder Karte links vom normal umbrechenden Text.
- Keine wortweisen Mini-Spalten.
- Zitatleiste direkt darunter.
- Drei kompakte Ensemblekarten in einer Reihe.
- Ensemblekarte: großes rundes Portrait links, Text rechts.
- Keine großen vertikalen Leerflächen.
- „Mehr Infos →“ sichtbar und zuverlässig.
- „Außerdem unverzichtbar …“ möglichst nicht neu gestalten.
- Mobile Darstellung kompakt; Floating-Menü darf zentrale Inhalte nicht verdecken.

## Sicherheit
- Keine WordPress-Inhalte oder importierten Termine/Repertoire/Referenzen/Ensemble-Daten löschen.
- Keine Zugangsdaten oder Secrets in Git einchecken.
- Änderungen klein, testbar und reversibel halten.
