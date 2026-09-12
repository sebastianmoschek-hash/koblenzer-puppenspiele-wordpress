# Inventar der übernommenen Originalhomepage

Dieses Inventar beschreibt die im Standalone-Editor lokal vorhandenen Originalinhalte. Das Editor-V2-Mockup wurde nur als Bedienreferenz verwendet.

## Header und Navigation

- Marke: Koblenzer Puppenspiele
- Menüpunkte: Start, Aktuell, Programm, Tourplan, Das Theater, Ensemble, Referenzen, Presse, Jetzt buchen
- Originalfarbwelt: dunkles Braun/Schwarz, warmes Orange, cremeweiße Typografie
- Responsive Navigation: vollständige Desktopnavigation und mobiles Menü

## Seitenabschnitte

1. Hero/Start mit Marke, Hauptüberschrift, Einleitung, zwei Handlungslinks und Original-Headerbild
2. Aktuell
3. Programm/Repertoire
4. Tourplan/Termine
5. Das Theater
6. Ensemble
7. Referenzen
8. Pressespiegel
9. Buchungsanfrage

## Strukturierte Daten und Medien

| Bereich | Datensätze | lokale Medien |
|---|---:|---:|
| Repertoire | 17 | 32 |
| Termine | 82 | – |
| Ensemble | 9 | 8 |
| Referenzen | 25 | 25 |
| Header | 1 | 1 |

Gesamt: 66 lokale Mediendateien. Die gerenderte Abnahmeansicht enthält 9 Abschnitte, 35 Überschriften und 46 geladene Bilder. Automatisierte Tests prüfen, dass kein Bild defekt ist, kein Link sein Zielattribut verliert und kein globaler horizontaler Overflow entsteht.

## Migrationsregel

Überschriften, Texte, Links, Bilder und Buttons werden mit stabilen IDs als Editorobjekte importiert. Persistiert wird das versionierte Document Model, niemals Editor-Chrome oder ein unveränderlicher Gesamt-HTML-Snapshot. Inhalte und Design sind getrennt genug modelliert, damit Themes das Aussehen ändern, ohne Texte oder Bilder zu ersetzen.
