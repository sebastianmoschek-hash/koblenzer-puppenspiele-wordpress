# Koblenzer Puppenspiele – Standalone Web-App

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