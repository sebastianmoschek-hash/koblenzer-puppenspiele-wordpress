# Codex Übergabe – Koblenzer Puppenspiele

Stand: 2026-09-01

## Ziel und Sicherheitsrahmen

Weiterentwicklung der selbst gehosteten WordPress-Homepage und der Android-Homepage-Hilfe zu einer sicheren Eigentümer-Plattform. Alle autonomen Deployments und Browser-Schreibtests sind auf Staging (https://neu.koblenzer-puppenspiele.de) begrenzt. Produktion wurde nicht verändert. Es wurden keine Passwörter, Tokens oder sonstigen Secrets in diese Datei aufgenommen.

## Erledigte Änderungen

- Sichtbarer Eigentümer-Einstieg über die neue Owner-Web-App-Leiste mit „Bearbeiten“ und „KI“.
- Frontend-Editor mit Design-, Größen-, Layout-, Menü-, Text-, Bild-, Undo-/Redo- und Versionsfunktionen weiter abgesichert.
- Owner-QA startet deploygebunden erst nach erfolgreichem Staging-Deploy.
- Gemeinsame Concurrency-Sperre verhindert parallele Owner-Schreibtests auf derselben Staging-Instanz.
- Staging-Live-Bridge-Prüfung ist begrenzt retry-fähig und akzeptiert nur die erwartete unauthentifizierte 401-Antwort.
- Owner-Leiste wird bei einem ungespeicherten Editor-Entwurf ausgeblendet, damit sie Save-/Editor-Buttons nicht überdeckt; im normalen Editorzustand bleibt der Einstieg verfügbar.
- CircleCI-Handoff läuft nur bei relevanten Homepage-/Staging-/QA-Änderungen und nicht bei reinen Tools-/Android-/Ergebnisdateien.
- Lokaler read-only Workflow-Wächter wurde erstellt und im Hintergrund gestartet.

## Relevante Commits

- 5b5c51e – Owner-Aktionen bis zu einem dirty Editor-Entwurf sichtbar halten.
- 7fa5866 – Owner-Leiste zunächst bei vorhandener Editor-Toolbar ausblenden.
- 0f7699d – CircleCI-Handoff für nicht relevante Änderungen begrenzen.
- 16b1a50 – lokalen read-only Staging-Workflow-Wächter hinzufügen.
- Frühere CI-/Touch-/Persistenz-Fixes sind in der Historie enthalten.

## Geänderte Dateien

In den letzten funktionalen Änderungen:

- .github/workflows/owner-all-persistence-staging-qa.yml
- .github/workflows/deploy-staging.yml
- .github/workflows/circleci-staging-report-handoff.yml
- wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/owner-web-agent.css
- tools/staging-workflow-watch.ps1

Weitere vorhandene Änderungen im Arbeitsverzeichnis gehören zum Nutzer und wurden nicht verändert:

- android/homepage-technician/app/src/main/java/de/koblenzerpuppenspiele/techniker/MainActivity.kt
- android/homepage-technician/gradle/
- android/homepage-technician/gradlew
- android/homepage-technician/gradlew.bat
- qa-results/circleci/
- tools/build-and-publish-apk.ps1
- tools/staging-workflow-watch.log

## Git-Status

Branch: codex/main-20260831, synchron mit origin/main.

Der Arbeitsbaum ist absichtlich nicht sauber, weil die oben genannten Android-/QA-/Tool-Dateien unversionierte bzw. lokale Nutzeränderungen enthalten. Diese wurden nicht gelöscht, zurückgesetzt oder überschrieben.

## Builds und Android

- Java 17 und Gradle-Wrapper sind vorhanden.
- Android Debug-Build wurde erfolgreich ausgeführt.
- APK liegt lokal unter android/homepage-technician/app/build/outputs/apk/debug/app-debug.apk.
- Ein Debug-APK wurde auf den Emulator emulator-5554 installiert und gestartet.
- Der Build zeigte keinen fatalen Startfehler in Logcat.
- Die geprüfte APK wurde nach G:\Meine Ablage\Koblenzer-Puppenspiele\Android\koblenzer-puppenspiele-debug.apk kopiert.

## Erfolgreiche Tests

- Staging-Deploy und Staging-Plugin-Healthcheck: erfolgreich.
- Aktive Staging-Version zuletzt: 4.5.29.
- Temporärer staginggebundener E2E-Zugang: Erstellung und Entfernung erfolgreich.
- Native Touch-/Slider-/Drag-/Pinch-Runtime: erfolgreich.
- Native Touch-Slider speichern/zurücksetzen: erfolgreich.
- Visual-QA mit 50 Ansichten: erfolgreich.
- Öffentliche Staging-Routen und mobile Navigation wurden wiederholt geprüft.
- Staging-Endpoint ohne Anmeldung liefert für die Live-Bridge korrekt 401.

## Aktuelle Fehler

Der veröffentlichte CircleCI-Gesamtbericht ist noch rot:

- success: false
- Deploy und Staging-Bereitschaft: grün.
- Touch- und Visual-Gates: grün.
- Editor Mobile/Tablet/Desktop: rot.
- Save → Reload → DB → Undo/48h: rot.
- Session-Undo, Persistenzbrowser und realer Text-Save: rot.

Der zuletzt verwertbare Owner-Fehler war ein Playwright-Timeout, weil die Owner-Leiste durch die vorherige CSS-Regel bereits beim initialisierten Editor versteckt wurde. Diese Regel wurde danach nochmals auf den tatsächlichen Dirty-Zustand eingeschränkt. Ein vollständiger grüner Lauf nach dieser letzten Korrektur steht noch aus.

## Offene Aufgaben

1. Neuen Deploy nach dem letzten CSS-Fix abwarten.
2. Owner-E2E erneut ausführen und prüfen, ob die Design-Aktionskarte geöffnet werden kann.
3. Save-/Reload-/DB-Readback, Undo und Versionswiederherstellung erneut nachweisen.
4. Die verbleibenden CLASS-STORM-/XHR-Trace-Meldungen bewerten und nur bei echtem Funktionsfehler reparieren.
5. Realen Text-Save und alle relevanten Browseransichten erneut prüfen.
6. APK nach einer relevanten Android-Änderung erneut mit Java 17/Gradle bauen, im Emulator installieren, starten und kopieren.
7. Nach erfolgreicher Reparatur einen vollständigen grünen CircleCI-Bericht und den finalen Git-Diff dokumentieren.

## Empfohlene nächste Schritte

- Keine weiteren UI-Änderungen ohne den nächsten echten E2E-Fehlerbericht abwarten.
- Die sichtbare Owner-Leiste im normalen Modus und den Editor-Savezustand getrennt testen.
- Bei erneutem Timeout zuerst den exakten Playwright-Selektor und elementFromPoint-Treffer prüfen.
- Staging- und QA-Berichte immer commitgenau bewerten; alte Reports gelten nicht als Abnahme.
- Produktion bis zu einer ausdrücklichen Freigabe unangetastet lassen.

## Lokaler Beobachter

Der read-only Wächter läuft derzeit im Hintergrund und protokolliert nach tools/staging-workflow-watch.log. Er überwacht Git-Status, Staging-Health, GitHub-Läufe und den neuesten Lab-Report. Er verändert keine Dateien außer seinem eigenen lokalen Log und nimmt keine Deployments oder Schreibtests vor.
