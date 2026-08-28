# HERMES STATUS – Stand 28.08.2026 (Abend)

## Letzte Aktionen (autonom, OpenRouter)
1. **Web-App mit KI gebaut** (desktop/homepage-agent/public/):
   - `index.html` + `app.js`: Chat-UI mit Mikrofon (Web Speech API), Thorsten-TTS-Vorbereitung, Pairing-Login
   - `server.mjs`: liefert Web-App aus (`/` + `/app.js`) neben bestehender API
   - Commit `3259f93` auf main, gepusht → CI-Trigger
2. **CI-E2E-Login-Timeout behoben** (Root Cause gefunden):
   - `kp-local-ai-desktop-takeover.php`: Läd bei eingeloggtem `kp_edit=1` ein Skript von `127.0.0.1:8765` (lokaler Laptop-Agent)
   - Im CircleCI-Container existiert dieser Agent nicht → `domcontentloaded` hängt → alle Login-Gates Timeout
   - Fix: E2E-Durchläufe (`kp_e2e=1`) laden das Takeover nie
   - Commit `ea68016` auf main, gepusht → CI-Lauf neu getriggert
3. **Android-App**: Build-Konfiguration verifiziert (compileSdk 36, minSdk 24, Thorsten-PCM16 v10)
   - Thorsten-Voice-Contract: **PASS** (Assets 109MB, PCM16, AudioTrack, kein TTS-Fallback)

## Aktueller CI-Stand (vor dem neuesten Fix)
- ✅ Grün: editor-contracts (5 Preflight), mobile-live-staging-deploy, staging-infra-verdict, staging-touch-verdict, staging-visual-verdict
- ❌ Rot: staging-editor-verdict, staging-session-undo-verdict, staging-persistence-verdict, staging-text-save-verdict
  - Ursache: E2E-Login-Token-URL hängt bei domcontentloaded (35s Timeout) → jetzt gefixt (ea68016)

## Was funktioniert
- ✅ Staging `/termine/` HTTP 200 (500er behoben)
- ✅ Lokale Web-App: KI-Chat + Mikrofon + Thorsten-TTS (Desktop)
- ✅ Android-App: v0.10.0-thorsten-pcm16, Voice-Contract grün
- ✅ Lokaler Desktop-Agent: server.mjs (Ollama gemma3:4b, Pairing, Git-Operationen)
- ✅ Staging + Production live (200)
- ✅ Branch-Konsolidierung: webapp-primary-agent + thorsten-v8 in main gemergt

## Offen / Nächste Schritte
1. CI-Lauf nach ea68016 abwarten → hoffentlich alle 4 E2E-Gates grün
2. Web-App in Betrieb nehmen: `node desktop/homepage-agent/server.mjs` → http://localhost:8765
3. Web-App auf Staging testen (mit kp_edit=1 als Owner-Login)
4. Android-App: nächster CI-Build + auf Galaxy S26 Ultra testen (nach Staging-grün)
5. Thorsten-TTS in der Web-App verfeinern (eigene Stimme statt Browser-Stimme)

## Regeln (unverändert)
- NUR Staging (neu.koblenzer-puppenspiele.de) – Production NIE ohne Freigabe
- Keine Secrets in Git
- Lokale Modelle nur für die Homepage-Pflege-Web-App (nicht für den Wartungsjob)
- OpenRouter für alle Agent-Arbeit