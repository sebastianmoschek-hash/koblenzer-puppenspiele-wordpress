# Koblenzer Puppenspiele – Standalone Web-App

Lokale Gesamtprüfung unter Windows:

```powershell
.\scripts\verify-all.ps1
```

Sie startet einen kurzlebigen lokalen PHP-Webserver, führt den mobilen und Desktop-Browsertest aus und beendet den Server anschließend. CircleCI, FTPS und Produktion werden dabei nicht verwendet.
Zusätzlich baut sie die vorhandene Android-App und prüft, ob eine Debug-APK erzeugt wurde. Bei verbundenem Emulator/Gerät folgen automatisch Installation, Start, Prozessprüfung, Logcat-Absturzprüfung und Screenshot. Diese Schritte lassen sich einzeln mit `.\scripts\install-android.ps1` und `.\scripts\test-android.ps1` ausführen.

Experimentelle, vollständig von WordPress getrennte Version. Produktion und WordPress-Dateien werden nicht verändert.

## Lokal starten

Im Ordner `webapp` einen beliebigen statischen HTTP-Server starten, z. B. `python -m http.server 8080`, dann `http://localhost:8080` öffnen.

## Funktionen

- responsive Startseite im bestehenden dunklen Braun/Orange-Theaterstil
- mobile Navigation
- lokale JSON-Daten für Repertoire und Termine
- einfacher Eigentümer-Editor für zentrale Texte
- Speichern im Browser via localStorage
- Undo und Standardwerte
- PWA-Manifest und Offline-Service-Worker

## Sicherheitsgrenze

Dieser Ordner benötigt kein WordPress/PHP und greift nicht auf Produktion oder die WordPress-Datenbank zu. Änderungen werden derzeit ausschließlich lokal im Browser gespeichert.
