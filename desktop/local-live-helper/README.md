# Homepage-Hilfe · Live lokal am Laptop

Ziel: Die normale Web-App bleibt in Chrome. Chrome teilt auf Wunsch einen Tab, ein Fenster oder den Bildschirm. Bild und Sprache werden lokal verarbeitet; für den Live-Modus ist keine Gemini-/OpenAI-KI-API nötig.

## Lokale KI

Der Desktop-Helfer spricht ausschließlich mit einer lokalen Ollama-Installation unter `127.0.0.1:11434`. Standardmodell ist `gemma3:4b` (multimodal, Text + Bild, ca. 3,3 GB).

Der Helfer selbst lauscht nur auf `127.0.0.1:17381`. Er akzeptiert Browser-Aufrufe nur von:

- `https://neu.koblenzer-puppenspiele.de`
- `https://koblenzer-puppenspiele.de`
- `http://localhost`
- `http://127.0.0.1`

## Windows

Im geklonten Repository PowerShell öffnen und starten:

```powershell
.\desktop\local-live-helper\start-windows.ps1
```

Das Skript prüft Ollama, installiert es bei vorhandenem `winget` bei Bedarf, lädt einmalig `gemma3:4b` und startet den lokalen Helfer. Standardmäßig wird das aktuelle Repository als lokaler Code-Arbeitsordner verwendet und der Branch `feature/webapp-primary-agent` erwartet.

## macOS / Linux

Ollama einmalig installieren, danach:

```bash
chmod +x desktop/local-live-helper/start-macos-linux.sh
./desktop/local-live-helper/start-macos-linux.sh
```

## Web-App

Danach in Chrome die Homepage-Hilfe öffnen, `✦ KI` wählen und `Live lokal` starten. Chrome zeigt den normalen Dialog zur Bildschirmfreigabe. Die Web-App sendet nur einen verkleinerten aktuellen Frame an `127.0.0.1`; der Frame verlässt den Rechner nicht.

Wenn Chrome die neue On-Device-Web-Speech-API unterstützt, setzt die Web-App für Sprache `processLocally = true` und installiert bei Bedarf das deutsche Sprachpaket. Im lokalen Modus wird nicht still auf Cloud-Spracherkennung zurückgefallen.

## Lokale Code-Reparaturen

Wenn die visuelle KI aus einer Aussage einen konkreten Reparaturauftrag ableitet, kann der Helfer optional denselben lokalen Git-Arbeitsordner untersuchen. Er:

1. lässt Gemma höchstens drei relevante Textdateien auswählen,
2. liest nur diese Dateien,
3. akzeptiert nur kleine `risk=low`-Änderungen mit eindeutigen exakten Suchstellen,
4. prüft `git diff --check` sowie vorhandene JS-/PHP-Syntaxprüfer,
5. committed lokal und kann auf den Staging-Arbeitsbranch pushen.

Standard der Startskripte ist `KP_LOCAL_AUTO_PUSH=1`. Zum Abschalten vor dem Start:

```powershell
$env:KP_LOCAL_AUTO_PUSH='0'
```

oder unter macOS/Linux:

```bash
export KP_LOCAL_AUTO_PUSH=0
```

Andere lokale Arbeitsordner können mit `KP_LOCAL_REPO` gesetzt werden.

## Wichtige Umgebungsvariablen

- `KP_OLLAMA_MODEL` – Standard `gemma3:4b`
- `KP_OLLAMA_URL` – Standard `http://127.0.0.1:11434`
- `KP_LOCAL_LIVE_PORT` – Standard `17381`
- `KP_LOCAL_REPO` – lokaler Git-Arbeitsordner für Reparaturen
- `KP_LOCAL_BRANCH` – Standard `feature/webapp-primary-agent`
- `KP_LOCAL_AUTO_PUSH` – `1` oder `0`
