# Owner controls + Versionen – echter Staging-Test

Erzeugt: 2026-09-01T14:36:33Z
Staging-only Direktdeploy: success
Staging-Deploy bereit: success
Staging-only E2E-Zugang: success
Persistenz-/Versionsprüfung: failure

## Direktdeploy
```text
Kein Direktdeploy-Log erzeugt.
```

## Browser-/DB-Test
```text
WARNUNG: Restore des Owner-E2E-Ausgangszustands fehlgeschlagen: page.evaluate: Target page, context or browser has been closed
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^

browserContext.close: Target page, context or browser has been closed
    at async file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:350:3 {
  log: []
}

Node.js v22.23.2
```
