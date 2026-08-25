# Lokaler Homepage-Agent (Desktop/Chromium)

Der Agent verbindet die eingeloggte Homepage-Hilfe ausschließlich mit Ollama/Gemma auf diesem Windows-Laptop. Unterhaltung, Bildanalyse und – soweit Chromium das lokale deutsche Sprachpaket unterstützt – Spracheingabe bleiben lokal. Production und Android werden nicht angefasst.

## Schnellstart unter Windows

1. Im lokalen Repository `desktop\homepage-agent\start-windows.ps1` mit PowerShell starten.
2. Das schwarze Fenster offen lassen. Es zeigt bei jedem Start einen sechsstelligen `KOPPLUNGSCODE`.
3. In Chromium/Chrome die eingeloggte Staging-Seite mit `?kp_edit=1` öffnen und „Lokale KI“ anklicken.
4. Den Kopplungscode eingeben, wenn der Browser danach fragt.
5. Zuerst „Stimme testen“ anklicken. Danach kann „Gespräch“ die lokale deutsche Spracheingabe starten.

Das Startskript prüft Node.js 20+, Git und Ollama, startet Ollama und lädt bei Bedarf einmalig `gemma3:4b`. Zugangsdaten werden nicht benötigt. PHP CLI und Bash/Git Bash sind nur für sichere automatische Codeänderungen nötig.

Optional kann `desktop\homepage-agent\install-autostart-windows.ps1` einmal ausgeführt werden. Danach startet der Agent beim Windows-Login in einem sichtbaren Fenster, damit der aktuelle Kopplungscode und Fehler immer erkennbar bleiben.

## Stimme und Gespräch

- „Stimme an/aus“ steuert die Antwortausgabe. Standardmäßig ist sie an.
- „Stimme testen“ lädt die Windows-/Chromium-Stimmen, bevorzugt eine lokale deutsche Stimme und spricht einen festen Testsatz.
- Fehlt eine Stimme, muss in Windows unter **Einstellungen → Zeit und Sprache → Sprache und Region → Deutsch → Sprachoptionen** eine Sprachausgabe installiert werden.
- „Gespräch“ nutzt nur `SpeechRecognition` mit `processLocally=true`. Falls dieser Chromium-Build oder das deutsche Offline-Sprachpaket das nicht unterstützt, wird die Spracheingabe beendet und niemals auf eine Cloud-Erkennung zurückgefallen. Tippen bleibt verfügbar.
- Während die KI spricht, hört das Mikrofon nicht zu. Danach startet es im Gesprächsmodus wieder.

## Bildschirm und Beobachtung

„Bildschirm/Tab/Fenster“ öffnet die native Chromium-Freigabe. Die KI erhält nur dann einen aktuellen komprimierten Frame, wenn eine Frage oder lokale Beobachtung ausgeführt wird. „Beobachten“ vergleicht alle vier Sekunden ausschließlich kleine lokale Bild-Fingerprints. Erst bei einer deutlichen Änderung und höchstens alle 18 Sekunden wird ein aktueller Frame an das lokale Gemma-Modell gesendet. Gemeldet werden nur sichtbare Fehler, Warnungen, fehlgeschlagene Builds oder überraschende Layoutschäden.

Die Freigabe endet über „Freigabe stoppen“, über die Chromium-Anzeige oder beim Schließen der Seite.

## Sichere Website-Codeänderungen

Der Agent darf nur bestehende Dateien unter den freigegebenen WordPress-Verzeichnissen ändern. `qa/` ist lesbar, aber nicht beschreibbar. Android, mobile KI, Workflows, Zugangsdaten und Secret-Dateien sind gesperrt.

Für einen Code-Patch gelten:

- ausschließlich Branch `desktop-ai-fast`;
- sauberer Git-Worktree vor Beginn;
- höchstens fünf Dateien und zehn eindeutige Search/Replace-Operationen;
- nur Risiko `low` oder `medium`;
- PHP-Lint, JavaScript-Syntaxprüfung, `git diff --check` und `qa/local-ai-contract.sh`;
- vollständiges Zurückrollen bei jedem Testfehler;
- sichtbare Bestätigung vor Patch und vor Veröffentlichung;
- Push nur auf den Staging-Branch. Production bleibt getrennt.

Nach erfolgreicher Prüfung kann „Auf Staging“ committen und zu `desktop-ai-fast` pushen. CircleCI lädt nur die erlaubten, geprüften Website-Dateien auf Staging. „Code verwerfen“ restauriert einen noch nicht committeten Patch ohne destruktive Git-Befehle.

## Lokale API

Der Dienst bindet standardmäßig nur an `127.0.0.1:8765`. Alle Endpunkte außer der sechsstelligen Kopplung benötigen ein zufälliges Bearer-Token, das nur unter dem Benutzerprofil in `.kp-homepage-agent/token.json` gespeichert wird.

- `POST /v1/pair` – Browser mit dem sichtbaren Startcode koppeln
- `GET /v1/health` – Agent, Ollama, Modell, Branch und Worktree prüfen
- `POST /v1/chat` – lokale Gemma-Unterhaltung, optional mit Bild
- `GET /v1/catalog` und `POST /v1/files` – erlaubte Dateien auswählen und lesen
- `POST /v1/apply` – kleinen Patch anwenden und vollständig prüfen
- `GET /v1/pending` – offenen geprüften Patch anzeigen
- `POST /v1/revert` – noch nicht committeten Patch restaurieren
- `POST /v1/publish` – committen und auf den Desktop-Staging-Branch pushen

Es existiert keine Shell-API. Vom Browser gelieferte Shell-Kommandos werden nie ausgeführt.

