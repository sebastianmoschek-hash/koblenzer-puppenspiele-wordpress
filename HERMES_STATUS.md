# HERMES STATUS – Stand 29.08.2026 (Run 21 – Autonomer Wartungslauf)

## Status der 4 Aufgaben-Defaults

1. **Staging `/termine/` (500-Fix)**: ✅ **Frisch browser-verifiziert (4/4 OK)** — `/termine/`, `/`, `/repertoire/`, `/kontakt/` HTTP 200, 0 Konsolen-/Page-Errors, 0 Overflow. Fix ist seit Run 20 live; auch nach den neuen Deploys (Lauf 23/26) stabil. Produktion unberührt.
2. **Unified Editor Contract / beforeunload-Fix `a5e3b5c`**: ✅ **In main + CI grün** — `editor-contracts` SUCCESS (per GitHub-Commit-Status verifiziert). **Kein manueller Trigger nötig.**
3. **Thorsten Voice-Smoke-Test**: ⚠️ **Unverändert offen (User-Entscheidung)** — `tests/thorsten-smoke-test.js` existiert nicht (kein `tests/`-Verzeichnis); Thorsten-High ist fest in CircleCI abgedeckt (`qa/prepare-android-natural-voice.sh` + `qa/android-natural-voice-contract.sh`). Ich lege ohne Rückmeldung keinen neuen Testpfad an.
4. **Branch-Konsolidierung**: ✅ **Beide Branches sind Ancestors von main** (`feature/webapp-primary-agent`, `ai-repair/local-thorsten-high-v8-20260825`) — bereits integriert, nichts zu tun. Lokale Branches wurden in Run 20 bereinigt.

## 🎉 Durchbruch: dcl-Hang ROOT-CAUSE gefunden, Fix deployed, Login grün

Nach den Bisect-Läufen 15–19 (alle Kandidaten exculpiert) hat Run 21 auf Instrumentierung statt Stubbing umgestellt. Befunde pro Lauf (jeweils eigener CI-Lauf, alle Evidenz in `latest/diagnostics.txt`):

- **Lauf 21 (442bdea)**: Blocker identifiziert = `window.fetch` (async=true, KEIN sync-XHR!) auf `admin-ajax.php action=kp_touch_free_layout_load`, Issuer `loadLive` in `touch-persistence.js:127`. Renderer-Crash (crashes=1), goto-Stall 12 min im toten CDP-Target.
- **Lauf 22 (b4651eb)**: fetch-Antwort-Tracking + GUEST-CTL + Crash-Mark: Server 3-fach exculpiert (PREFLIGHT/AUTHRENDER/AUTHPOST 141–643ms), PENDING schwankt (1↔7), CDP-Session wedged → alle Kommandos blockieren bis Teardown.
- **Lauf 23 (084b596)**: Abort-Watchdog (12s) für den Layout-Load + Lab-Härtung (Seite schließen entriegelt Session): alle 3 Geräte laufen im Budget, GUEST-CTL 200/141ms — **dcl-Hang bleibt**: Renderer NICHT gecrasht (crashes=0), alle Requests fertig → synchroner Main-Thread-Loop ab ~1,5s nach Nav (letzte Console = loadLive-Fetch), Timer/eval tot.
- **Lauf 24 (a82e583)**: LAST-REQS zeigt: der Blocker-POST ist die LETZTE Netzwerkaktion; Edit-Mode-Script-Kette danach (owner-save-coordinator → owner-web-agent* → kp-canva-editor → …).
- **Lauf 25 (073e0f1)**: **CLASS-STORM-Detektor fängt die Pumpen live**: 200+ `classList`-Operationen/s aus `owner-web-agent-desktop-live.js updateUi()` (Zeile 125) und `kp-canva-keys.js assign()` (Zeile 113–115) + Browser-Watchdog (60s, entriegelt Playwright in der Crash-Variante, ensureBrowser-Rel­aunch).
- **Lauf 26 = FIX (af7158e, deployed auf Staging)**: 
  - `owner-web-agent-desktop-live.js`: dokumentweiter childList-Observer rief bei JEDER Mutation `updateUi()`; updateUi schreibt textContent = childList-Mutation → **selbsttriggender Endlos-Loop** (nur sichtbar, wenn `.kp-wa-local-live`-UI existiert = kp_edit; CI ohne lokalen Laptop-Helfer). Fix: stateKey-Guard (unveränderter Zustand ⇒ null DOM-Schreibe) + rAF-Debounce. Verhalten identisch.
  - `kp-canva-keys.js assign()`: `classList.add` nur noch wenn Klasse fehlt (Idempotenz; vorher Ganz-DOM-Rescan + Re-Markierung bei jeder Mutation).
  - **Ergebnis: `LOGIN-GOTO ok status=200` auf allen 3 Geräten — der dcl-Hang ist GESCHLOSSEN.** Layout-POST 200/212ms, Seite interaktiv, XHRTRACE lesbar.

## 🔬 Offen (Lauf 28-Kandidaten — nächster Wartungslauf)

Die Editor-/Persistenz-Gates sind weiter rot — jetzt wegen der **zweiten Schicht** (kein Hang mehr, aber Sustained-Churn):
1. **Class-Churn während des Edit-Boots bleibt**: `touch-free-layout.js applySaved()→clearGenericTransform()` (Zeile 139, classList-remove) ↔ `touch-gestures.js applyValue()` (Zeile 112, toggle) ↔ `kp-canva-keys assign()` — gegenseitiges Entfernen/Wieder-Setzen hält den Main-Thread beim Interagieren beschäftigt → `[data-action="design"]`-Klick und Tablet-Menü-Klick stallen (30s-Timeouts), Persistenz-E2E 15m-Timeout. Verdacht zusätzlich: `image-fallback.js` ersetzt kaputte legacy-JPGs im Kreis (4 legacy-repertoire-Bilder sind die letzten Request vor dem Freeze).
2. **Agent-Bar überlagert auf Tablet das Menü**: `.kp-wa-bar` (unten zentriert, width 560px) intercepts den `.wp-block-navigation__responsive-container-open`-Klick (Zeiger-Ereignisse) — Layout-abhängig (gespeicherte menu-button-Position).
3. **Lab-Anpassungen teils schon umgesetzt (Lauf 27 = 68f5092, qa-only)**: Editor-Entry-Point auf Agent-Bar-Primär-UI (`[data-kp-wa-edit]`) umgestellt (`.kp-oa-tools` ist per CSS auf left:-9999px = Legacy); offen: force-Klicks für design/menu + Interception-Marks.

## Parallel-Agent-Hinweis (wichtig)

Ein anderer Prozess arbeitet im selben Repo (erzeugte `feature/android-build-20260828` von main@442bdea, pushte `28d1af6` direkt auf main, uncommittete Änderungen an `MainActivity.kt`/`kp-mobile-live-bridge.php`). Der Worktree wurde nach jedem Push auf den Fremd-Branch zurückgestellt; die fremden uncommitteten Änderungen wurden nie angefasst oder committed.

## Aktueller CI-Stand (main @ 68f5092)

- `editor-contracts`: **SUCCESS** · `homepage-staging-lab` (Lauf 27, mode qa): **Job SUCCESS**
- Verdicts: **touch + infra = SUCCESS**; editor/persistence/session-undo/text-save = failure (Churn-Schicht, s. o.)
- Lauf 27 (qa): login grün, Design-Sheet-Klick ställt; Artefakte (`latest/editor/report.json`, `summary.md`, `diagnostics.txt`) werden wieder publiziert.
- GitHub Actions: weiterhin Billing-limitiert; CircleCI übernimmt.

## Abgegrenzte Sicherheitsregeln (strikt eingehalten)

- NUR Staging geprüft/besprochen; Production unverändert. Bisect-/Diagnose-Instrumentierung ausschließlich CI-Browser (addInitScript), reversibel.
- Produkt-Fixes (Load-Abort-Watchdog, updateUi-Guard, assign-Idempotenz) klein, verhaltensneutral, nur über Staging-Deploy validiert.
- Keine Secrets committed. OpenRouter aktiv (lokale Modelle nur für die künftige Web-App).

## Nächste Schritte (priorisiert)

1. **Lauf 28**: Churn-Quelle final benennen (Priority: `image-fallback.js`-Replacement-Loop prüfen; Reentrancy-Guards für `applySaved`/`applyValue` mit Zustandsvergleich) + Lab-force-Klicks für design/menu. Ziel: Editor-Gates grün.
2. Agent-Bar/Menü-Überlappung auf Tablet klären (CSS/Position).
3. Thorsten-Standalone-Test: User-Entscheidung.
4. GitHub Billing: User-Aktion.