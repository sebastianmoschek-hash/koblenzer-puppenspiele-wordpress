# HERMES STATUS – Stand 28.08.2026 (Run 18 – BISECT-Lauf: Touch-Stack-Stub gepusht, CI laeuft; Ausgang folgt unten)

## Letzte Aktionen (autonom, OpenRouter)

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (4/4 Seiten OK)**:
   - `/termine/`: HTTP 200, 1535ms, Titel „Termine – puppenspiele“, H1 „Termine“, **75 Termin-Karten**, 0 Fehler, kein Overflow.
   - `/`: HTTP 200, 1485ms, 22 Karten, 0 Fehler. `/repertoire/`: HTTP 200, 1446ms, 17 Karten. `/kontakt/`: HTTP 200, 1405ms, 1 Karte.
   - Fix weiterhin live; `staging/fix-termine-500` existiert nicht mehr (längst konsolidiert) → **kein Deploy nötig**.

2. **Unified Editor Contract / beforeunload-Fix**: Commit `a5e3b5c` (und Merge `7a91387`) weiterhin in main. Lokale Prüfung: nur noch Kommentare zu „Deliberately no beforeunload“ in `website-studio-admin.js`/`frontend-editor-v2.js` → Contract erfüllt. GHA fällt weiter mit Billing-Blocker aus (nicht primär). Referenz-Lauf 6e3e05f gerade angestoßen → **kein manueller Trigger nötig**; Antwort auf „CI grün?“ = nein (6 Editor-Gates rot, allerletzter Report a14c26c), Ursache = Editor-Hang, siehe Punkt 3.

3. **🎯 BISECT-Lauf 18 (NEU gepusht: `6e3e05f`) – Touch-Stack wird neutralisiert**:
   - v1 (`window.KPFrontendEditor`) ist seit a14c26c zu 100% exculpiert → Stub entfernt (sonst verfälschter Lauf).
   - Neuer Stub in `qa/homepage-editor-lab.mjs`: deaktiviert per `addInitScript` + MutationObserver die Scripts `kp-touch-gestures-js / kp-touch-gesture-safety-js / kp-touch-free-layout-js / kp-touch-persistence-js` VOR Ausführung (type=noop, src geräumt).
   - **Wichtig: `qa/current-staging-validation.txt` (Force-Full-Marker) ist damit ERSTMALS im Remote** – die Vorgängerläufe (QA-mode; `qa`-Report-Provider, deploy übersprungen) haben den Plugin-Deploy auf Staging übersprungen. Dieser Lauf ist ein echter Full-Deploy (Plugin/Theme/mu-plugins) + komplette Browser-/Persistence-/Touch-/Visual-Validierung mit deaktiviertem Touch-Stack.
   - Auswertung: Hang weg / kein NETTRACE-PENDING ⇒ Touch-Stack (Mutation-Loop oder canEdit-Boot) ist Täter. Hang bleibt ⇒ nächster Kandidat `frontend-editor-v2.js` + `owner-web-app.js` (KPOwnerWebApp-Boot).

4. **Thorsten-Voice-Smoke-Test**: ⚠️ **Erneut verifiziert: existiert NICHT** – weder `tests/` noch `thorsten-smoke-test.js` (0 Treffer in allen git-Objekten/Branches; auch im User-Laptop-Klon `C:\dev\...` nicht). In CI vorhanden sind nur die Android-Kontrakte (`qa/android-natural-voice-contract.sh`, `qa/prepare-android-natural-voice.sh` – prüfen das Thorsten-High-ONNX-Asset), kein Java/JS-Smoke-„Test“. **User-Entscheidung weiterhin offen: eigenständigen Smoke-Test anlegen oder verwerfen.**

5. **Branch-Konsolidierung**: ✅ Beide Branches (`feature/webapp-primary-agent`, `ai-repair/local-thorsten-high-v8-20260825`) in main enthalten (Ancestor-of-main verifiziert). `staging/fix-termine-500` existierte nur lokal nicht mehr. Keine Konflikte, nichts zu mergen.

## Aktueller CI-Stand (zu Beginn dieses Laufs)

- Letzter abgeschlossener Report: **a14c26c (BISECT-KPFrontendEditor, 20:24:17Z)** – FAILURE auf denselben 6 Editor-Gates; grün: deploy(stagingReady), temporaryBridge, nativeTouchSliderSaveReset, touchRuntime, visual50Views. Diagnose: Server/Auth exculpiert, dcl feuert nie, 1 pending POST.
- BISECT-Trigger `6e3e05f` gepusht (22:55Z) → neuer Voll-Lauf aktiv, Ergebnis wird unten nachgetragen.

## Was funktioniert

- ✅ `/termine/` + Homepage + Repertoire + Kontakt frisch browser-verifiziert (4/4 Seiten grün).
- ✅ Termine-Fix live, beforeunload-Fix in main, Branches konsolidiert.
- ✅ Server&Network exculpiert (AUTHPOST 154ms), KPFrontendEditor (v1) per Bisect ausgeschlossen.
- ✅ Neuer Bisect-Lauf (Touch-Stack) gestartet – erster Lauf mit echten Staging-Deploy seit dem QA-Mode-Problem.

## Offen / Nächste Schritte

1. **Lauf 6e3e06f auswerten** (erwartete Dauer 60–90 min): Touch-Stack-Täter? → entweder gezielt in `touch-free-layout.js`/`touch-persistence.js` weiter oder als Nächstes `frontend-editor-v2.js`/`owner-web-app.js`.
2. 🔴 **GitHub-Billing fixen** (User-Aktion) – GHA wieder startfähig.
3. **Thorsten-Smoke-Test**: User-Entscheidung: anlegen oder verwerfen (Detail im Punkt 4).

## Regeln (unverändert)

- NUR Staging (neu.koblenzer-puppenspiele.de) – Production NIE ohne Freigabe.
- Keine Secrets in Git, keine unsicheren Aktionen.
- Lokale Modelle nur für die Homepage-Pflege-Web-App (nicht für den Wartungsjob); OpenRouter für alle Agent-Arbeit.