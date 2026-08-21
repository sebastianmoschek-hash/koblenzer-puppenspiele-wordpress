# Owner controls + Versionen – echter Staging-Test

Erzeugt: 2026-08-21T22:18:13Z
Staging-Deploy bereit: success
Staging-only E2E-Zugang: success
Persistenz-/Versionsprüfung: failure

## Browser-/DB-Test
```text
file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:10
const fail = message => { throw new Error(message); };
                                ^

Error: Orange Speichern hat keinen echten Reload ausgelöst.
    at fail (file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:10:33)
    at closeDesignAndSave (file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:147:18)
    at async file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:176:3

Node.js v22.23.2
```
