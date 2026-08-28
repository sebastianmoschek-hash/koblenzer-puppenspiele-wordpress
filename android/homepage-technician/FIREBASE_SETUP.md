# Firebase / Gemini Live – einmalige Einrichtung

Die Android-App verwendet die Paket-ID:

`de.koblenzerpuppenspiele.techniker`

## 1. Firebase-Projekt anlegen oder auswählen

In der Firebase Console ein Projekt für die Koblenzer Puppenspiele auswählen oder neu anlegen. Für Entwicklung/Test und Produktion sollten später getrennte Firebase-Projekte verwendet werden.

## 2. Android-App registrieren

Im Firebase-Projekt eine Android-App mit exakt dieser Paket-ID registrieren:

`de.koblenzerpuppenspiele.techniker`

Danach `google-services.json` herunterladen. Diese Datei wird nicht ins Repository committed, sondern im CI-Build über das Secret `FIREBASE_GOOGLE_SERVICES_JSON_B64` injiziert.

## 3. Firebase AI Logic / Gemini aktivieren

Den geführten Firebase-AI-Logic-Setupflow für Gemini Developer API aktivieren. Die Android-App verwendet Firebase AI Logic für Gemini Live, Audio/Video und Function Calling.

## 4. App Check

Für die endgültige App App Check mit Play Integrity verwenden und für Firebase AI Logic erzwingen. Für Debug-/Testbuilds die Firebase-Dokumentation zum Debug Provider beachten. Debug-Tokens niemals ins Repository oder in Produktionsbuilds aufnehmen.

## 5. Geschützten APK-Build erzeugen

`google-services.json` base64-kodieren und den Wert als GitHub Actions Secret `FIREBASE_GOOGLE_SERVICES_JSON_B64` hinterlegen. Der Workflow `.github/workflows/android-homepage-technician.yml` schreibt die Datei nur während des Builds nach `app/google-services.json` und lädt anschließend `app-debug.apk` als privates Workflow-Artefakt `homepage-hilfe-debug-apk` hoch.

Ohne dieses Secret bleibt der Build absichtlich lauffähig, erzeugt aber nur die Offline-/WebView-Testhülle; Gemini Live meldet dann, dass Firebase noch nicht eingerichtet ist.
