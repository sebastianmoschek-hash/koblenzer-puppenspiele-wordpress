# Owner Web App – letzter Staging-Test

Erzeugt: 2026-08-21T21:42:52Z

Asset-/Deployment-Prüfung: success
Isolierter Browser-Verhaltenstest: failure
Echter Staging-Speicher-/Reload-Test: success

## Ausgelieferte Staging-Dateien
```text
OK: Staging-Startseite abrufbar
OK: PWA-Manifest abrufbar
OK: Service Worker abrufbar
OK: Owner Web App JS abrufbar
OK: Responsive Web JS abrufbar
OK: Owner Web App CSS abrufbar
OK: Responsive Web CSS abrufbar
OK: App-Icon abrufbar
OK: Touch-Gesten abrufbar
OK: Free-Layout abrufbar
OK: Editor-Bridge abrufbar
OK: Touch-Persistenz abrufbar
OK: Menü-X-Regler abrufbar
OK: kein WordPress-/PHP-Fehlertext
OK: Manifest im HTML eingebunden
OK: Owner Web App im HTML eingebunden
INFO: Responsive Web ist absichtlich nur im eingeloggten Owner-Modus eingebunden.
OK: Instagram-Profil kanonisch auf Staging verlinkt
true
OK: Manifest-Name korrekt
true
OK: Manifest-Kurzname korrekt
true
OK: Manifest standalone
true
OK: Manifest enthält Icon
OK: Service Worker Event-Listener vorhanden
OK: Service Worker fetch vorhanden
OK: Service Worker Cache vorhanden
OK: SVG-App-Icon gültig
OK: owner-web-app JavaScript-Syntax
OK: owner-responsive-web JavaScript-Syntax
OK: touch-gestures JavaScript-Syntax
OK: touch-free-layout JavaScript-Syntax
OK: touch-editor-bridge JavaScript-Syntax
OK: touch-persistence JavaScript-Syntax
OK: owner-menu-x JavaScript-Syntax
OK: Owner-Web-App Styles nicht leer
OK: Responsive-Web Styles nicht leer
OK: Touch-Gesten haben expliziten flush
OK: Touch-Gesten lassen Editor-Toolbar nach Drag durch
OK: Touch-Gesten ohne alten postSave()-Auto-Save
OK: Free-Layout hat expliziten flush
OK: Free-Layout lässt Editor-Toolbar nach Drag durch
OK: Free-Layout ohne alten postSave()-Auto-Save
OK: Editor-Bridge bündelt Touch-Entwürfe
OK: Orange Speichern-Taste ist Persistenzpfad
OK: Live-Persistenz schützt lokale Entwürfe
OK: Live-Persistenz hydriert Runtime
OK: Menü-X-Regler vorhanden
OK: Menü-X-Regler benennt Links/Rechts
FAILURES=0
```

## Touch-Verhalten im isolierten Chromium
```text
file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/touch-runtime-browser-test.mjs:12
const fail = message => { throw new Error(message); };
                                ^

Error: Horizontaler Handy-/Tablet-Menüregler fehlt.
    at fail (file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/touch-runtime-browser-test.mjs:12:33)
    at file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/touch-runtime-browser-test.mjs:121:32

Node.js v22.23.2
```

## Echter Staging-Persistenztest
```text
PASS: echter Staging-End-to-End-Speichertest für post-12: Entwurf lokal, orange Speichern schreibt DB, Reload behält Zustand, Undo bleibt lokal.
```
