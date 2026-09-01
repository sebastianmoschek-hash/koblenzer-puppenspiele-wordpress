# Owner controls + Versionen – echter Staging-Test

Erzeugt: 2026-09-01T16:14:17Z
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
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^

locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('.kp-wa-bar [data-kp-wa-edit], .kp-oa-tools').first() to be visible
    31 × locator resolved to hidden <button type="button" class="kp-wa-main" data-kp-wa-edit="">✎ Bearbeiten</button>

    at /home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:238:76 {
  log: [
    "  - waiting for locator('.kp-wa-bar [data-kp-wa-edit], .kp-oa-tools').first() to be visible",
    '    31 × locator resolved to hidden <button type="button" class="kp-wa-main" data-kp-wa-edit="">✎ Bearbeiten</button>'
  ],
  name: 'TimeoutError'
}

Node.js v22.23.2
```
