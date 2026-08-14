=== Koblenzer Puppenspiele – Inhalte ===
Contributors: koblenzer-puppenspiele
Requires at least: 6.6
Requires PHP: 7.4
Stable tag: 3.2.2

Phase 2.1: einfache Terminverwaltung ohne externe Plugins.

Funktionen:
* eigener Bereich „Puppenspiele“ im WordPress-Backend
* Termine mit Datum, Uhrzeit, Ort, Spielstätte, Status, Ticket-/Info-Link und Hinweis
* Termin duplizieren für mehrere Vorstellungen am selben Tag
* automatische Sortierung kommender Termine
* Shortcodes [kp_naechste_termine limit="5"] und [kp_termine]
* optionaler Einmal-Import des alten Spielplans aus termine.html (August 2026 bis November 2027)

Das Plugin enthält keine Server-Zugangsdaten und verändert bei der Aktivierung keine bestehenden Seiten oder Termine.


== 2.2.0 ==
* Terminansicht auf Desktop und Laptop deutlich kompakter gestaltet.
* Kleinere Datumskacheln, Typografie, Buttons und Abstände.
* Mobile Lesbarkeit bleibt erhalten.


== 2.2.1 ==
* Versionskennung für zuverlässiges CSS-Cache-Busting korrigiert.
* Update-Paket verwendet denselben Plugin-Ordner wie 2.2.0.


== 2.2.2 ==
* Mobile Termin-Karten nochmals deutlich kompakter gemacht.
* Kleinere Datumskacheln, Texte, Status-Badges, Buttons und Abstände.


== 3.0.0 ==
* Repertoire-Verwaltung mit 17 vorbereiteten aktuell aufgeführten Stücken.
* Import von Titelbildern und historischen Infoblättern in die WordPress-Mediathek.
* Moderne Repertoire-Karten und strukturierte Einzelansichten.
* Termine können mit Repertoire-Stücken verknüpft werden; bestehende Termine werden beim Import automatisch zugeordnet.


== 3.0.1 ==
* Repertoire-Import auf exakt 17 aktuell auf der offiziellen Repertoire-Seite aufgeführte Produktionen korrigiert.
* Der Goldschatz im Mühlenweiher ergänzt.
* Ein Baum für den Weihnachtsmann ergänzt.
* Historische Archivstücke werden nicht automatisch importiert.


== 3.0.2 ==
* Repertoire-Karten auf Smartphones kompakter und übersichtlicher gestaltet.
* Bild links, Titel/Alter/Dauer rechts; Kurzbeschreibung auf zwei Zeilen begrenzt.
* Aktionen kompakter; Detail-Fakten und Infoboxen mobil enger gesetzt.


== 3.1.0 ==
* Eigener Referenzen-Bereich im Puppenspiele-Backend.
* Import der 25 aktuell verwendeten Referenz-Kacheln samt Bildern und Ziel-Links.
* Responsive Referenzen-Übersicht per Shortcode [kp_referenzen].


== 3.1.1 ==
* Referenzen-Komponente wird nun korrekt beim Pluginstart initialisiert.
* Menüpunkt Referenzen und Referenzen importieren erscheinen unter Puppenspiele.
* Referenz-Post-Type wird bei Aktivierung korrekt registriert.


== 3.1.2 ==
* Die WordPress-Seite Referenzen wird automatisch angelegt, falls sie fehlt.
* Der Slug lautet /referenzen/ und der Inhalt enthält automatisch [kp_referenzen].
* Eine bereits vorhandene leere Referenzen-Seite wird automatisch mit dem Shortcode befüllt.


== 3.2.0 ==
* Ensemble-Verwaltung und Import ergänzt.
* Drei Hauptprofile plus sechs aktuell genannte Mitwirkende vorbereitet.
* Das-Theater-Seite wird automatisch bereitgestellt.


== 3.2.2 ==
* Theater-Infokarten kompakter mit orangefarbenen Symbolen.
* Drei Haupt-Ensemblekarten wie im Layoutentwurf: großes rundes Portrait links, Text rechts.
* Überflüssige Kartenhöhe entfernt.
* Mehr-Infos-Links auf robuste WordPress-Query-URLs umgestellt, damit Profilseiten unabhängig von Permalink-Regeln öffnen.
