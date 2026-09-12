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
- Bilder: Filter, Anpassungen, Zuschneiden, Drehen, Spiegeln, Duplizieren und Ebenen.
- Texte und Buttons: Inhalt, Schriftgestaltung, Farben, Ausrichtung, Link und Form.
- Abschnitte: hinzufügen, sortieren, gestalten, duplizieren und löschen.
- Header/Navigation: Design umschalten sowie Menüpunkte bearbeiten und sortieren.
- Website-Design: Original, Warmes Theater und Nachtbühne als verwerfbare Vorschau.
- Auf Gerät speichern: Document Model in `localStorage`; Laden wird mit Schema-Migration unterstützt.
- Undo/Redo fasst Regler-, Bildeditor- und Batchänderungen sinnvoll zusammen.

## KI-Status

Die KI-Schnittstellen sind providerneutral vorbereitet. Es ist absichtlich kein kostenpflichtiger Dienst automatisch verbunden. Ohne freigegebenen Provider zeigt die Oberfläche ehrlich „Nicht verbunden“ und deaktiviert Live-/Bild-KI-Funktionen.

## Android

Die Debug-App lädt den lokalen Editor über `adb reverse` in einer Android-WebView. Die erzeugte APK liegt unter `android/app/build/outputs/apk/debug/app-debug.apk`. Release-Builds enthalten keine hart codierte lokale Entwicklungsadresse.

## Sicherheitsgrenze

Zulässiger Branch ist ausschließlich `webapp-no-wordpress-test`. `main`, Produktion, FTPS und der frühere WordPress-/Offline-Staging-Branch bleiben unangetastet.
