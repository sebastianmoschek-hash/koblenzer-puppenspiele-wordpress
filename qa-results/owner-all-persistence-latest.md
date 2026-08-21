# Owner controls + Versionen – echter Staging-Test

Erzeugt: 2026-08-21T13:50:29Z
Staging-Deploy bereit: success
E2E-Zugang: success
Persistenz-/Versionsprüfung: failure

## Deploy/Bridge
```text
Expected plugin: 4.5.18
Attempt 1: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.18","mode":"one-time-file"}}
Staging runs plugin 4.5.18
```

## E2E-Setup
```text
::add-mask::aab453d289603ec4553eabe5c0a588ef40286239ac76e7fac99df981ec20f97d
E2E bridge uploaded.
```

## Echter Browser-/DB-Test
```text
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^

page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('.kp-oa-sheet.is-design [data-design="header_radius"]') to be visible
    24 × locator resolved to hidden <input min="0" max="36" step="1" value="0" type="range" data-unit="px" data-kp-touch-guarded="1" data-design="header_radius" data-kp-touch-hardlocked="2"/>

    at openDesign (/home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:67:14)
    at async file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:173:3 {
  log: [
    `  - waiting for locator('.kp-oa-sheet.is-design [data-design="header_radius"]') to be visible`,
    '    24 × locator resolved to hidden <input min="0" max="36" step="1" value="0" type="range" data-unit="px" data-kp-touch-guarded="1" data-design="header_radius" data-kp-touch-hardlocked="2"/>'
  ],
  name: 'TimeoutError'
}

Node.js v22.23.2
```
