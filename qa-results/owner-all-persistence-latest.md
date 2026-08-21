# Owner controls + Versionen – echter Staging-Test

Erzeugt: 2026-08-21T21:36:20Z
Staging-Deploy bereit: success
E2E-Zugang: success
Persistenz-/Versionsprüfung: failure

## Deploy/Bridge
```text
Expected plugin: 4.5.22
Attempt 1: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 2: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 3: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 4: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 5: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 6: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 7: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 8: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 9: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 10: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 11: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 12: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 13: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 14: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 15: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 16: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 17: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 18: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 19: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 20: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 21: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.21","mode":"one-time-file"}}
Attempt 22: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.22","mode":"one-time-file"}}
Staging runs plugin 4.5.22
```

## E2E-Setup
```text
::add-mask::e8554b59740713d1f9b9fce865fd8d303c160bc91401c6d7fc168125b3aa6d8f
E2E bridge uploaded.
```

## Echter Browser-/DB-Test
```text
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^

page.waitForSelector: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('.kp-fe2-save') to be visible

    at /home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:168:14 {
  log: [ "  - waiting for locator('.kp-fe2-save') to be visible" ],
  name: 'TimeoutError'
}

Node.js v22.23.2
```
