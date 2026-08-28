# AUTONOMER ARBEITSAUFTRAG – PROJEKT SEBASTIAN

Du übernimmst ab jetzt die technische Verantwortung für das bestehende Projekt „Sebastian“ / Koblenzer Puppenspiele.

Das Projekt soll nicht neu konzipiert werden. Es existiert bereits ein umfangreicher Entwicklungsstand. Deine Aufgabe ist, den tatsächlichen aktuellen Zustand aus Repository, Branches, Quellcode, Tests, CI, Staging und vorhandenen Projektunterlagen zu ermitteln und das Projekt anschließend weitgehend autonom bis zu einem stabilen, praktisch nutzbaren Gesamtzustand fertigzustellen.

## OBERSTES PRODUKTZIEL

Sebastian soll für den Betreiber der Koblenzer Puppenspiele ein persönlicher KI-gestützter Homepage-Techniker werden.

Der Betreiber soll später möglichst keine Programmierkenntnisse benötigen.

Er soll Sebastian auf Handy oder Laptop in natürlicher deutscher Sprache sagen können, was er möchte, beispielsweise:

- „Mach diesen Button grün.“
- „Verschieb das Menü etwas nach rechts.“
- „Was siehst du gerade auf meinem Bildschirm?“
- „Hier funktioniert etwas nicht. Reparier das.“
- „Mach diesen Bereich schöner.“
- „Prüf die Homepage auf Fehler.“

Sebastian soll den aktuellen Kontext möglichst selbst erkennen, einfache Änderungen direkt durchführen und komplexere technische Aufgaben an den leistungsfähigeren technischen Agenten/Hermes weiterreichen.

Das langfristige Bedienprinzip lautet:

**DER BETREIBER SAGT WAS ER MÖCHTE. DAS SYSTEM ERMITTELT SELBST, WIE ES TECHNISCH UMGESETZT WIRD.**

## DEINE ARBEITSWEISE

Arbeite ab jetzt proaktiv und autonom.

Frage mich nicht bei jedem technischen Detail nach einer Entscheidung.

Wenn du einen Fehler findest:

analysieren → Ursache bestimmen → reparieren → testen → Folgeschäden prüfen → gegebenenfalls weiter reparieren → erneut testen.

Beende deine Arbeit nicht nur deshalb, weil ein einzelner Build erfolgreich war.

Ein grüner Build bedeutet nicht automatisch, dass eine Funktion auf einem echten Gerät oder im Browser funktioniert.

Arbeite deshalb möglichst bis zur tatsächlich verifizierten Funktion.

Wenn mehrere sinnvolle technische Lösungen existieren, wähle selbstständig diejenige, die:

- robust
- wartbar
- sicher
- möglichst lokal
- kostengünstig
- und für einen technisch unerfahrenen Betreiber einfach zu benutzen ist.

Vermeide unnötige Umbauten funktionierender Komponenten.

Repariere bestehende Architektur bevorzugt, statt funktionierende Teile grundlos neu zu schreiben.

## ERSTE AUFGABE: TATSÄCHLICHEN ZUSTAND FESTSTELLEN

Bevor du größere Änderungen machst:

1. Repository vollständig untersuchen.
2. `git fetch --all --prune` durchführen.
3. aktuellen `main` und relevante Entwicklungs-/Repair-Branches untersuchen.
4. README, Projektunterlagen und vorhandene Hermes-Kontextdateien lesen.
5. `.circleci/config.yml`, QA-Skripte und vorhandene Testergebnisse untersuchen.
6. WordPress/MU-Plugins analysieren.
7. Web-App und visuellen Homepage-Editor analysieren.
8. Android-Projekt analysieren.
9. lokale KI-, Sprach- und Bildschirmfunktionen analysieren.
10. Desktop-Agent/Ollama-Komponenten analysieren.
11. vorhandene Staging-Integration untersuchen.

Verlasse dich bei technischen Details auf den aktuellen Code und aktuelle Testergebnisse, nicht blind auf ältere Projektbeschreibungen.

Dokumentiere anschließend den festgestellten Zustand in:

- `HERMES_PROJECT_CONTEXT.md`
- `HERMES_STATUS.md`
- `HERMES_DECISIONS.md`

Halte insbesondere `HERMES_STATUS.md` während der weiteren Arbeit aktuell.

## HOMEPAGE / WEB-APP FERTIGSTELLEN

Die WordPress-Homepage soll eine einfache Besitzeroberfläche besitzen.

Zentrale Bedienung:

✎ Bearbeiten | ✦ KI

Der visuelle Editor muss auf Desktop, Tablet und Smartphone zuverlässig funktionieren.

Prüfe insbesondere:

- Touch-Bedienung
- Scrollen
- Dragging
- Pinch/Zoom, soweit vorgesehen
- Menüs
- Dialoge
- Slider
- responsive Darstellung
- Undo/Redo
- Speichern
- Persistenz nach Reload

Änderungen dürfen nicht versehentlich gespeichert werden.

Nur eine bewusste Speicheraktion darf dauerhaft persistieren.

Nach dem Speichern muss geprüft werden, ob die Änderung tatsächlich dauerhaft übernommen wurde.

Der KI-Bereich soll natürliche deutsche Unterhaltung ermöglichen und den sichtbaren Homepage-Kontext berücksichtigen.

Kleine visuelle Änderungen sollen möglichst unmittelbar umgesetzt werden können.

## ANDROID-APP FERTIGSTELLEN

Die bestehende Android-App soll nicht neu erfunden, sondern auf Basis des vorhandenen Codes fertiggestellt werden.

Ziel:

- Homepage öffnen
- Besitzerfunktionen verwenden
- lokale KI verwenden
- Bildschirmkontext erfassen
- Spracheingabe
- natürliche lokale Sprachausgabe
- möglichst wenig Cloud-Abhängigkeit
- keine unnötigen laufenden API-Kosten

Die vorhandene lokale Gemma-/LiteRT-LM-Integration soll geprüft und stabilisiert werden.

Der bereits heruntergeladene lokale Gemma-Modellbestand darf nicht unnötig zerstört werden.

Kein unnötiges Deinstallieren der App als Reparaturmethode, wenn dadurch lokale Modelldaten verloren gehen.

Bildschirmdaten sollen grundsätzlich lokal verarbeitet werden und nicht unbemerkt an externe KI-Dienste übertragen werden.

## SPRACHE / THORSTEN VOLLSTÄNDIG REPARIEREN

Die gewünschte natürliche männliche lokale Stimme Thorsten muss tatsächlich funktionieren.

Prüfe den aktuellen Code und die bestehenden Repair-Branches selbst.

Wichtig:

Keine heimliche Android-/Google-System-TTS als Fallback verwenden und anschließend behaupten, Thorsten würde laufen.

Wenn Thorsten nicht geladen oder abgespielt werden kann, muss der tatsächliche Fehler diagnostiziert werden.

Prüfe unter anderem:

- Modellassets
- sherpa-onnx/Piper
- Initialisierung
- AudioTrack
- Buffergrößen
- PCM-Format
- Sample Rate
- Speicher
- Packaging
- Runtime-Fehler
- reale Ausgabe

Die Spracheingabe darf außerdem nicht die eigene Lautsprecherausgabe wieder als neuen Benutzerbefehl interpretieren.

Während Sebastian spricht, darf die Spracherkennung deshalb pausiert werden und anschließend automatisch wieder starten.

## DESKTOP / LOKALE KI

Prüfe die vorhandenen Desktop-Agent-Komponenten und konsolidiere sie, wenn mehrere Generationen oder redundante Implementierungen existieren.

Ziel auf dem Laptop:

Browser/Screen → lokale Wahrnehmung/KI → Hermes für komplexe technische Aufgaben

Ollama bzw. andere lokale Modelle können für Wahrnehmung, einfache Unterhaltung und lokale Aufgaben verwendet werden.

Für schwierige Programmierung und autonome Fehlerbehebung darfst du das leistungsfähigere Agentenmodell verwenden.

Vermeide unnötige Cloud-API-Kosten.

## SELBSTSTÄNDIGE QUALITÄTSSICHERUNG

Erweitere fehlende Tests selbst.

Prüfe nicht nur Happy Paths.

Teste insbesondere bekannte Problemklassen:

- Touch
- mobile Darstellung
- Editor-Persistenz
- Speichern
- Undo/Redo
- Login/Cookies
- lokale KI
- Spracheingabe
- lokale TTS
- Bildschirmfreigabe
- Fehlerbehandlung
- Staging

Ein automatisierter Test darf nicht nur prüfen, ob ein bestimmter Textstring im Quellcode vorkommt, wenn damit die reale Funktion nicht ausreichend abgesichert ist.

Baue sinnvollere Integrations-/Runtime-Smoke-Tests, wo das möglich ist.

## STAGING UND PRODUCTION

Staging ist deine Werkstatt.

Du darfst Staging für Entwicklung, Tests, Browserprüfung und Fehlerbehebung verwenden.

Prüfe nach Web-Änderungen möglichst die tatsächlich ausgelieferte Staging-Seite, nicht nur Repository-Dateien.

Production ist geschützt.

Production darf niemals ohne meine ausdrückliche Freigabe verändert, deployed oder migriert werden.

Auch wenn alles fertig ist:

Nicht selbstständig Production aktualisieren.

Stattdessen berichten:

„Staging ist geprüft und bereit für Production-Freigabe.“

## GIT UND SICHERHEIT

Arbeite nachvollziehbar mit Git.

Erstelle sinnvolle Commits und vermeide riesige unkontrollierte Änderungen.

Vor riskanten Änderungen einen wiederherstellbaren Zustand sicherstellen.

Keine Passwörter, GitHub-Tokens, WordPress-Zugangsdaten oder andere Secrets in:

- Prompts
- Repository
- Commits
- Logs
- HERMES-Kontextdateien

schreiben.

Verwende vorhandene sichere Authentifizierung bzw. Secret Stores.

Wenn wirklich eine Anmeldung durch mich erforderlich ist, frage mich einmal konkret nach genau dieser Interaktion und arbeite danach weiter.

## WANN DU MICH FRAGEN SOLLST

Unterbrich deine Arbeit möglichst nicht wegen normaler technischer Entscheidungen.

Frage mich nur, wenn:

1. eine Anmeldung/2FA erforderlich ist, die nur ich durchführen kann,
2. Production verändert werden müsste,
3. Geld ausgegeben oder ein kostenpflichtiger Dienst aktiviert werden müsste,
4. eine irreversible oder riskante Aktion meine ausdrückliche Zustimmung benötigt,
5. eine echte Produktentscheidung existiert, die sich nicht sinnvoll aus dem bisherigen Projektziel ableiten lässt.

Ein fehlgeschlagener Test, Buildfehler oder Programmierfehler ist kein Grund, mich sofort zu fragen.

Versuche ihn selbst zu lösen.

## DEFINITION VON „FERTIG“

Das Projekt ist nicht fertig, nur weil der Code kompiliert.

Das Ziel ist erreicht, wenn möglichst vollständig folgende Nutzererfahrung funktioniert:

Ich öffne Sebastian auf meinem Smartphone oder Laptop.

Ich kann beispielsweise sagen:

„Hallo Sebastian.“

Sebastian antwortet mit einer angenehmen männlichen lokalen Stimme.

Ich kann fragen:

„Was siehst du gerade?“

Sebastian kann den freigegebenen Homepage-/Bildschirmkontext lokal erfassen und sinnvoll beschreiben.

Ich kann sagen:

„Der Bereich gefällt mir nicht. Mach ihn schöner.“

Sebastian versteht den Kontext.

Eine einfache Änderung führt Sebastian selbst aus.

Für eine komplexe technische Änderung erstellt er automatisch einen präzisen technischen Auftrag für Hermes.

Hermes analysiert den tatsächlichen Code, nimmt die Änderung vor, testet sie und überprüft das Ergebnis auf Staging.

Danach bekomme ich eine verständliche Rückmeldung und kann das Ergebnis prüfen.

Ich soll dafür nicht Git, PHP, Kotlin, Gradle, WordPress-Interna, CI-Logs oder Terminalbefehle verstehen müssen.

## PERSISTENTER PROJEKTKONTEXT

Du sollst das Projekt so dokumentieren, dass auch nach einem Neustart oder einer neuen Session möglichst wenig Wissen verloren geht.

Pflege fortlaufend:

- `HERMES_PROJECT_CONTEXT.md` = Architektur, Produktziel, wichtige Komponenten, Sicherheitsgrenzen und langfristig gültige Informationen.
- `HERMES_STATUS.md` = aktueller Stand, offene Fehler, laufende Arbeiten, zuletzt getestete Funktionen, nächste sinnvolle Schritte.
- `HERMES_DECISIONS.md` = wichtige technische Entscheidungen mit kurzer Begründung, damit spätere Sessions sie nicht versehentlich rückgängig machen.

Wenn deine Hermes-Version projektbezogene Dateien wie `HERMES.md`, `.hermes.md` oder `AGENTS.md` automatisch einliest, richte eine passende Projektdatei ein, die auf diese drei Dokumente verweist.

## ZIEL FÜR SPÄTERE BEDIENUNG

Nach erfolgreicher Einrichtung soll ich dir künftig kurze natürliche Aufträge geben können wie:

- „Arbeite an Sebastian weiter.“
- „Wie ist der aktuelle Stand?“
- „Thorsten funktioniert noch nicht. Reparier das vollständig.“
- „Mach die Android-App fertig.“
- „Prüf die Homepage auf Fehler und behebe sie.“
- „Mach den Bereich auf dem Handy schöner.“

Du sollst dann den vorhandenen Projektkontext selbst lesen, den aktuellen Stand selbst feststellen und die notwendigen technischen Schritte eigenständig ableiten.

## JETZT STARTEN

Beginne jetzt mit der vollständigen Bestandsaufnahme.

Erstelle daraus einen priorisierten internen Arbeitsplan und beginne anschließend direkt mit der Umsetzung.

Arbeite die Probleme selbstständig nacheinander ab.

Wenn ein Fehler einen Folgefehler offenlegt, bearbeite diesen ebenfalls.

Halte deinen Status persistent fest, damit eine neue Hermes-Session die Arbeit ohne Wissensverlust fortsetzen kann.

Gib mir keine lange Liste von Dingen, die ich erledigen soll.

Arbeite selbst.

Melde dich bei mir nur bei den oben definierten Blockern oder wenn ein sinnvoller, tatsächlich getesteter Meilenstein erreicht wurde.

Production bleibt unangetastet, bis ich ausdrücklich die Freigabe erteile.
