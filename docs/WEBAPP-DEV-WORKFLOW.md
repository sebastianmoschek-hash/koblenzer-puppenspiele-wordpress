# Web-App Entwicklungsworkflow

Ziel: schnelle Staging-Iterationen ohne unnötige CircleCI-Wartezeit, aber weiterhin klare Sicherheitsgrenzen.

## 1. Routine-Web-App (JS/CSS)

Die primäre Owner-Web-App arbeitet auf `feature/webapp-primary-agent`.

Auf Staging (`neu.koblenzer-puppenspiele.de`) lädt der geschützte Dev-Loader ausschließlich diese Dateien direkt aus dem privaten GitHub-Arbeitsbranch:

- `owner-web-agent.js`
- `owner-web-agent-fast-chat.js`
- `owner-web-agent.css`

Ablauf:

1. Änderung lokal/über GitHub vorbereiten.
2. Syntax kurz prüfen.
3. Direkt auf `feature/webapp-primary-agent` committen.
4. Staging neu laden und testen.

Kein Smoke-Branch, kein Android-Build und kein separater CircleCI-Deploy für solche Änderungen.

## 2. Server-/Security-Code (PHP, Auth, Nonces, GitHub-Bridge, Speichern)

Diese Änderungen bleiben kontrolliert:

1. Änderung auf Arbeitsbranch.
2. PHP-Lint + passende Sicherheitsverträge.
3. Gezielter Staging-Deploy nur der betroffenen Serverdatei(en).
4. Staging-Test.

Kein Android-Build, sofern Android nicht betroffen ist.

## 3. KI-erzeugte Codeänderungen

Immer über den geschützten Agentenweg:

1. isolierter `ai-repair/*`-Branch / PR,
2. CI,
3. bei Rot keine Übernahme,
4. bei Grün ausdrückliche Merge-Bestätigung.

Die KI schreibt niemals direkt in Production.

## 4. Android / lokale Gemma

Kotlin-, Gradle-, Manifest- und native KI-Änderungen werden weiterhin kompiliert und über den Android-CI-Job geprüft.

## 5. Production

Production wird nicht vom Staging-Dev-Loader beeinflusst. Live-Code wird erst nach bewusster Prüfung und Freigabe übernommen.

## Leitregel

**CircleCI ist Sicherheitsnetz, nicht Türsteher vor jeder kleinen Web-App-Iteration.**
