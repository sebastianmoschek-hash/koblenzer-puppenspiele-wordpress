# Owner controls + Versionen – echter Staging-Test

Erzeugt: 2026-09-01T18:03:25Z
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
Browser logs:

<launching> /home/runner/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-edgeupdater --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,BlockOriginHeaderModificationOnRedirect,Translate,AutoDeElevate,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --disable-updater-scheduler --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --headless --hide-scrollbars --mute-audio --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 --no-sandbox --user-data-dir=/tmp/playwright_chromiumdev_profile-jlf0jA --remote-debugging-pipe --no-startup-window
<launched> pid=2773
[pid=2773][err] [0901/175415.831764:WARNING:media/gpu/vaapi/vaapi_wrapper.cc:1655] drmGetDevices2() has not found any devices
[pid=2773][err] [0901/175415.836893:WARNING:sandbox/policy/linux/sandbox_linux.cc:405] InitializeSandbox() called with multiple threads in process gpu-process.
[pid=2773][err] [0901/175418.391646:INFO:CONSOLE:2] "JQMIGRATE: Migrate is installed, version 3.4.1", source: https://neu.koblenzer-puppenspiele.de/wp-includes/js/jquery/jquery-migrate.min.js?ver=3.4.1 (2)
[pid=2773] <gracefully close start>
    at async file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:350:3 {
  log: []
}

Node.js v22.23.2
```
