# Owner controls + Versionen – echter Staging-Test

Erzeugt: 2026-08-21T19:12:14Z
Staging-Deploy bereit: success
E2E-Zugang: success
Persistenz-/Versionsprüfung: failure

## Deploy/Bridge
```text
Expected plugin: 4.5.20
Attempt 1: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 2: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 3: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 4: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 5: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 6: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 7: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 8: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 9: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 10: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 11: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 12: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 13: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 14: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.19","mode":"one-time-file"}}
Attempt 15: {"success":true,"data":{"active":true,"host":"neu.koblenzer-puppenspiele.de","version":"4.5.20","mode":"one-time-file"}}
Staging runs plugin 4.5.20
```

## E2E-Setup
```text
::add-mask::14ea91d5d8af591665799367489e0c240b984d8c3d03a59570f0a612a8422225
E2E bridge uploaded.
```

## Echter Browser-/DB-Test
```text
file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:10
const fail = message => { throw new Error(message); };
                                ^

Error: E2E-Zustand konnte nicht gelesen werden: {"ok":false,"status":500,"json":null}
    at fail (file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:10:33)
    at state (file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:41:44)
    at async file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:170:19

Node.js v22.23.2
```
