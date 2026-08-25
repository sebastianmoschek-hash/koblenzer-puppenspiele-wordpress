# Lokaler Laptop-Agent für die Homepage-Hilfe

Dieser Dienst ist ausschließlich für den Desktop-/Chrome-Strang gedacht. Er läuft auf `127.0.0.1`, spricht lokal mit Ollama/Gemma und darf nur freigegebenen Website-Code im lokalen Git-Repository lesen bzw. über exakte Search/Replace-Patches ändern.

## Voraussetzungen

- Node.js 20 oder neuer
- Git
- PHP CLI (für `php -l` bei PHP-Änderungen)
- Bash/Git Bash (für `qa/local-ai-contract.sh`)
- Ollama
- lokaler Checkout dieses Repositories

## Einmalig Gemma installieren

```bash
ollama pull gemma3:4b
```

`gemma3:4b` ist die Standardkonfiguration, weil sie Text und Bilder versteht. Ein anderes lokales Gemma-Modell kann über `KP_GEMMA_MODEL` gesetzt werden.

## Agent starten

Im Repository-Root:

```bash
node desktop/homepage-agent/server.mjs
```

Danach im eingeloggten Chrome-Browser die Homepage-Hilfe öffnen. Sie verbindet sich mit `http://127.0.0.1:8765`.

Falls das Repository an anderer Stelle liegt, kann der Root explizit gesetzt werden:

```bash
KP_REPO_ROOT=/pfad/zum/repository node desktop/homepage-agent/server.mjs
```

Unter PowerShell entsprechend:

```powershell
$env:KP_REPO_ROOT='C:\Pfad\zum\repository'
node desktop/homepage-agent/server.mjs
```

## Chrome-Funktionen

- **Bildschirm/Tab/Fenster:** Chrome öffnet die native Freigabeauswahl (`getDisplayMedia`). Solange die Freigabe aktiv ist, bekommt Gemma bei einer Anfrage einen aktuellen komprimierten Frame. Die Freigabe kann jederzeit über Chrome oder „Freigabe stoppen“ beendet werden.
- **Sprache:** Die Schaltfläche „Sprache“ nutzt die in Chrome verfügbare SpeechRecognition-Schnittstelle für deutsche Spracheingabe. „Antworten“ nutzt die Browser-Sprachausgabe. Gemma selbst bleibt davon unabhängig lokal in Ollama.
- **Direkte Homepage-Änderungen:** Bereits vorhandene deterministische Editor-Aktionen bleiben für Text/Design/Speichern zuständig.
- **Code-Änderungen:** Wenn Code nötig ist, wählt Gemma aus dem vom lokalen Agenten gelieferten Dateikatalog, liest maximal fünf erlaubte Dateien und erzeugt einen kleinen Patch. Vor dem Schreiben erscheint eine Bestätigung. Danach werden PHP-Lint und der lokale AI-Contract ausgeführt. Bei Testfehlern wird der Patch zurückgerollt.

## Sicherheitsgrenzen

Der Agent bindet standardmäßig nur an `127.0.0.1`. Er führt keine vom Browser gelieferten Shell-Kommandos aus und besitzt keine allgemeine Shell-API. Schreibzugriffe sind auf die Website-Verzeichnisse begrenzt.

Der Laptop-Agent sperrt insbesondere:

- `android/**`
- Android-Workflows
- `qa/*android*`
- `qa/mobile-*`
- `wp-content/mu-plugins/kp-mobile-*`

Damit kann der parallele Android-Strang nicht über die Laptop-Hilfe überschrieben werden.

## Lokale API

- `GET /v1/health` – Agent/Ollama/Repository prüfen
- `GET /v1/catalog` – erlaubte Website-Dateien auflisten
- `POST /v1/chat` – lokale Gemma-Unterhaltung, optional mit Bild
- `POST /v1/files` – erlaubte Dateien lesen
- `POST /v1/apply` – validierten Search/Replace-Patch anwenden, testen und Git-Diff zurückgeben

Der Agent committed oder pusht in dieser Ausbaustufe noch nicht automatisch. Er ändert den echten lokalen Git-Worktree und liefert den resultierenden Diff zurück; Deployment/Push bleibt damit ein separater, kontrollierter Schritt.
