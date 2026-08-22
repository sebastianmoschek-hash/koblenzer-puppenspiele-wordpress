# Touch-Regler – echter Staging-Test

Erzeugt: 2026-08-22T10:19:53Z
Exakte Staging-Datei: success
Chromium bereit: success
Wischen / Halten+Ziehen: failure

## Staging-Dateiabgleich
```text
Expected SHA256: d26bc4c7467c90130b5d480060ddebe6f7ea38aec1bbc59f2f10c484368a70bb
Attempt 1 staging SHA256: 12c90bfebb8a0fdaf07d621899871c94d252140cbef32efc0d099b4aa59eb7d9
Attempt 2 staging SHA256: 12c90bfebb8a0fdaf07d621899871c94d252140cbef32efc0d099b4aa59eb7d9
Attempt 3 staging SHA256: 12c90bfebb8a0fdaf07d621899871c94d252140cbef32efc0d099b4aa59eb7d9
Attempt 4 staging SHA256: 12c90bfebb8a0fdaf07d621899871c94d252140cbef32efc0d099b4aa59eb7d9
Attempt 5 staging SHA256: 12c90bfebb8a0fdaf07d621899871c94d252140cbef32efc0d099b4aa59eb7d9
Attempt 6 staging SHA256: 12c90bfebb8a0fdaf07d621899871c94d252140cbef32efc0d099b4aa59eb7d9
Attempt 7 staging SHA256: 12c90bfebb8a0fdaf07d621899871c94d252140cbef32efc0d099b4aa59eb7d9
Attempt 8 staging SHA256: 12c90bfebb8a0fdaf07d621899871c94d252140cbef32efc0d099b4aa59eb7d9
Attempt 9 staging SHA256: d26bc4c7467c90130b5d480060ddebe6f7ea38aec1bbc59f2f10c484368a70bb
PASS: exact repository touch safety asset is live on staging.
```

## Browser-Verhalten
```text
file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/touch-slider-hold-browser-test.mjs:8
const fail = message => { throw new Error(message); };
                                ^

Error: Normales Wischen scrollt das Design-Menü nicht: {"value":50,"sheetScroll":0,"inputs":0,"changes":0}
    at fail (file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/touch-slider-hold-browser-test.mjs:8:33)
    at file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/touch-slider-hold-browser-test.mjs:108:42
    at runNextTicks (node:internal/process/task_queues:64:5)
    at process.processImmediate (node:internal/timers:452:9)
    at process.callbackTrampoline (node:internal/async_hooks:130:17)

Node.js v22.23.2
```
