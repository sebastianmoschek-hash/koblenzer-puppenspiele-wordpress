# AGENTS.md — Koblenzer Puppenspiele

## Projektziel
Pflege und Weiterentwicklung der selbst gehosteten WordPress-Seite der Koblenzer Puppenspiele. Der Eigentümer soll Änderungen in ganz normaler Sprache anweisen können, ohne CSS/PHP/GitHub-Wissen. Coding-Agenten übernehmen Umsetzung, Staging-Deployment, echten Browser-Test, Fehlerdiagnose und iterative Reparatur selbstständig.

## Installierte Ordnernamen — NICHT ÄNDERN
Theme: `wp-content/themes/koblenzer-puppenspiele-block-theme-phase1-7`
Plugin: `wp-content/plugins/koblenzer-puppenspiele-core-phase2-2`

Eine Änderung der Ordnernamen erzeugt in WordPress doppelte Installationen statt Updates.

## Produktionsschutz — höchste Priorität
- Ohne ausdrückliche Freigabe niemals Produktion verändern.
- Autonome Änderungen, Browser-Logins, E2E-Schreibtests und Reparaturschleifen laufen ausschließlich auf `https://neu.koblenzer-puppenspiele.de`.
- Keine WordPress-Core-Dateien deployen oder verändern.
- Keine Secrets in Git einchecken.
- Keine importierten Inhalte, Termine, Repertoire-, Referenz- oder Ensemble-Daten löschen.

## Autonomes Homepage-Labor — CircleCI Free
Die zentrale automatische Pipeline ist `.circleci/config.yml`; die ausführbare Logik liegt in `qa/circleci-homepage-lab.sh`. GitHub Actions ist nur noch Fallback, weil das monatliche Actions-Kontingent ausgeschöpft wurde und soll nicht als primärer Auto-Runner verwendet werden.

CircleCI stellt eine kurzlebige Linux-/Chromium-Sandbox bereit und führt ausschließlich auf echtem Staging aus:
1. PHP-Syntaxprüfung.
2. Force-Deploy des aktuellen Plugin-/Theme-Stands nur auf Staging.
3. Verifikation des aktiven Pluginstands.
4. Kurzlebigen, tokenisierten und staging-gebundenen Browserzugang anlegen; nach dem Test wieder entfernen.
5. `qa/homepage-editor-lab.mjs`: echten Eigentümer-Editor auf Mobile, Tablet und Desktop öffnen und bedienen.
6. Auf Mobile mit echtem Chromium-Touch-Stream einen Design-Regler lange halten und mit demselben Finger verschieben.
7. „Design speichern“ als echten Touch-Tap auslösen und Änderung erst nach Reload + WordPress-State-Readback akzeptieren.
8. „Standardwerte“ als echten Touch-Tap prüfen; Standardwerte müssen sichtbar übernommen werden, dürfen aber ohne Speichern nicht in der DB landen.
9. Hit-Testing mit `elementFromPoint()` für Speichern/Zurücksetzen, damit transparente Overlays oder Slider-Guards keine Buttons verdecken.
10. `qa/owner-all-persistence-e2e.mjs`: Design-/Größenregler, Menü-X, Hauptspeichern, Reload, DB-Readback, Undo und 48h-Versionen testen und den Ausgangszustand wiederherstellen.
11. `qa/touch-slider-hold-browser-test.mjs` und `qa/touch-runtime-browser-test.mjs`: nativen Slider-Touch, Drag, Pinch und Touch-Runtime regressionsprüfen.
12. `visual-qa/capture.mjs`: 50 reale Ansichten (Desktop/Laptop/Tablet/Mobile × Seiten) rendern, Screenshots und Layoutdiagnosen erzeugen.
13. Console/Page-Errors, same-origin HTTP-Fehler, horizontalen Overflow, Menüöffnung und Editor-Geometrie protokollieren.
14. Sichere, secret-freie Ergebnisse werden nach `https://neu.koblenzer-puppenspiele.de/wp-content/uploads/kp-homepage-lab/latest/report.json` und `report.md` veröffentlicht; Editor- und Visual-Screenshots liegen darunter in `editor/` und `visual/`.

Ein fehlender, veralteter oder roter CircleCI-Bericht gilt als Fehler und niemals als grüne Abnahme. CircleCI-Secrets werden ausschließlich in den CircleCI-Projekteinstellungen gehalten: `STAGING_FTP_SERVER`, `STAGING_FTP_USERNAME`, `STAGING_FTP_PASSWORD`.

## Arbeitsweise für Codex / Coding-Agenten
- Eine einfache Benutzeranweisung in fachliche Zielkriterien übersetzen, nicht in Rückfragen zerlegen, wenn die Absicht ausreichend klar ist.
- Vor Änderungen den aktuellen Code und den neuesten CircleCI-Staging-Bericht unter `/wp-content/uploads/kp-homepage-lab/latest/report.json` lesen.
- Kleine, reversible Änderungen auf `main` vornehmen. Relevante Pushes starten nach aktivierter CircleCI-GitHub-Verknüpfung das Homepage-Labor automatisch.
- Nach einem fehlgeschlagenen Lab-Lauf zuerst den konkreten CircleCI-Bericht, Screenshots, Console/Network und betroffenen Codepfad analysieren.
- Danach Fix → Staging-Deploy → echter Browser-Test wiederholen, bis die relevanten Gates grün sind.
- HTTP 200, ein synthetischer DOM-Test oder ein isolierter Unit-Test allein sind niemals Beweis für eine behobene Eigentümer-Interaktion.
- Persistenz gilt erst als bewiesen, wenn UI-Änderung → echter Speichervorgang → Reload → WordPress-State/DB-Readback denselben Wert zeigt.
- Bei Touch-Problemen echte Chromium-Touch-Events verwenden; Maus-/`dispatchEvent`-Simulation allein genügt nicht.
- Benutzer nicht routinemäßig als Testgerät einsetzen. Erst um einen realen Gerätetest bitten, wenn Chromium-Staging grün ist oder ein gerätespezifischer Browserunterschied vermutet wird.
- Erst „fertig“ melden, wenn die für die Aufgabe relevanten Lab-Gates grün sind. Produktion bleibt bis zur ausdrücklichen Freigabe unangetastet.

## Bestehende Visual-QA
Visual-QA-Ausgaben werden weiterhin unter `https://neu.koblenzer-puppenspiele.de/visual-qa/` bzw. im CircleCI-Lab unter `/wp-content/uploads/kp-homepage-lab/latest/visual/` veröffentlicht. Desktop, Tablet und Smartphone selbst prüfen; insbesondere Zeilenumbrüche, horizontalen Overflow, unnötige Leerflächen, Bildbeschnitt, große Bilder/Überschriften, Kontrast, Button-Hierarchie und Überdeckung durch Floating-UI.

## Gestaltungsrichtung
- Hochwertige moderne Theater-/Kultur-Ästhetik statt Shop-/Baukasten-Look.
- Dunkle Grundfläche, warme Braunabstufungen, Orange als klare Akzent-/Aktionsfarbe.
- Serifenschrift für charaktervolle Überschriften, ruhige Sans-Serif für Fließtext.
- Klare visuelle Hierarchie, großzügig aber nicht verschwenderisch.
- Mobile-first: kompakte Karten, kurze Wege, große klickbare Ziele, keine unnötig hohen Bildflächen.
- Bilder wirkungsvoll, aber nie so groß, dass Inhalt erst nach langem Scrollen beginnt.
- Die aktuelle booking-fokussierte Startseite nicht ohne Benutzerwunsch grundsätzlich redesignen; funktionale Reparaturen und gezielte Anweisungen haben Vorrang.

## Sicherheit und Datenintegrität
- Änderungen klein, testbar und reversibel halten.
- Für direkten WordPress-Agentenzugriff nur least-privilege und auditierbare Schnittstellen verwenden.
- Temporäre E2E-Zugänge müssen staging-gebunden, zeitlich begrenzt und nach jedem Lauf entfernt werden.
- E2E-Schreibtests müssen ihren ursprünglichen WordPress-Zustand am Ende wiederherstellen, auch bei Fehlern soweit technisch möglich.
