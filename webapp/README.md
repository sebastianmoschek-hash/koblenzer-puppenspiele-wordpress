# Koblenzer Puppenspiele – Standalone Editor V2

Mobile-first Website-Builder-PWA mit den echten Inhalten der Koblenzer Puppenspiele. Die Website selbst ist die Bearbeitungsfläche; Änderungen werden lokal, strukturiert und versioniert gespeichert.

## Start und Gesamtprüfung

```powershell
.\scripts\start-web.ps1
.\scripts\verify-all.ps1
```

Alternativ genügt im Verzeichnis `webapp` ein statischer Server auf Port 8080. Die App ist anschließend unter `http://127.0.0.1:8080/` erreichbar.

`verify-all.ps1` prüft Browserfunktion und Visuals, baut die Android-Debug-APK und führt bei verbundenem Emulator Installation, echte WebView-Bedienung und Logcat-Prüfung aus. CircleCI, GitHub Actions, FTPS, WordPress und Produktion werden nicht verwendet.

## Bedienung

- `Bearbeiten` öffnet den V2-Modus.
- Element antippen zeigt nur passende Werkzeuge.
- Bilder: lokale Originalmedien durchsuchen/ersetzen sowie Filter, Anpassungen, Zuschneiden, Drehen, Spiegeln und Duplizieren.
- Ebenen: Elemente eines Abschnitts in einer mobilen Liste auswählen und schrittweise oder vollständig nach vorne/hinten anordnen.
- Texte und Buttons: Inhalt, sechs Schriftfamilien, Schriftgestaltung, Farben, Ausrichtung, Link und Form.
- Abschnitte: Text-, Bild- oder Call-to-Action-Vorlage hinzufügen, sortieren, duplizieren/löschen sowie Typ, Breite, Höhe, Abstände, Farbe und lokales Hintergrundbild gestalten.
- Header: Titel, lokales Logo, Größe/Position, Hintergrund, Höhe, Layout und Navigationsabstände bearbeiten oder als Preset wechseln.
- Navigation: Text und Linkziel bearbeiten, per Pfeil/Drag sortieren, gekoppelte Abschnitte anlegen und wahlweise nur den Menüpunkt oder auch seinen Abschnitt löschen.
- Responsive Ansicht: Smartphone, Tablet oder Desktop als kontrollierte Editor-Vorschau auswählen.
- Website-Design: Original, Warmes Theater und Nachtbühne als verwerfbare Vorschau.
- Auf Gerät speichern: Document Model in `localStorage`; Laden wird mit Schema-Migration unterstützt.
- Sicherung/Import: V2-Dokument als geprüfte JSON-Datei exportieren oder in einem anderen Browserprofil wiederherstellen; beschädigte, fremde und neuere inkompatible Schemas werden ohne Zustandsänderung abgewiesen. Bis zu 20 lokale Versionen bleiben zusätzlich auf dem Gerät und jeder Import ist per Undo rückgängig machbar.
- Undo/Redo fasst Regler-, Bildeditor- und Batchänderungen sinnvoll zusammen.
- Desktop-Tastatur: `Ctrl/Cmd+Z`, `Shift+Z`/`Ctrl+Y`, `Ctrl/Cmd+D`, `Ctrl/Cmd+S`, `Delete` und `Escape`; Eingabefelder bleiben davon sicher getrennt.

## KI-Status

Die KI-Schnittstellen sind providerneutral vorbereitet. Es ist absichtlich kein kostenpflichtiger Dienst automatisch verbunden. Ohne freigegebenen Provider zeigt die Oberfläche ehrlich „Nicht verbunden“ und deaktiviert Live-/Bild-KI-Funktionen.

## Android

Die Debug-App enthält den Standalone-Editor vollständig in der APK und lädt ihn über Androids sicheren lokalen Asset-Host. Sie benötigt auf dem Handy keinen Laptop-Webserver und keine `adb reverse`-Verbindung. Die erzeugte APK liegt unter `android/homepage-technician/app/build/outputs/apk/debug/app-debug.apk`. Release-Builds enthalten keine hart codierte lokale Entwicklungsadresse.

## Sicherheitsgrenze

Zulässiger Branch ist ausschließlich `webapp-no-wordpress-test`. `main`, Produktion, FTPS und der frühere WordPress-/Offline-Staging-Branch bleiben unangetastet.
