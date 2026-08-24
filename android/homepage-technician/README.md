# Koblenzer Puppenspiele – Homepage-Hilfe (Android)

Native Android shell for the existing WordPress owner web app. The website remains the single editor/UI source of truth; Android adds Gemini Live voice/video, user-approved MediaProjection screen sharing and a secure bridge into the existing AI repair lab.

## Intended user flow

1. Open **Homepage-Hilfe**. The app loads the authenticated Koblenzer-Puppenspiele editor in a hardened WebView.
2. Tap **KI live zeigen** (the same action is also exposed inside the web app).
3. Grant microphone and Android screen/app sharing. On Android 14+ the user may share only the Homepage-Hilfe app instead of the whole device.
4. Talk naturally while demonstrating the fault. Roughly one compressed screen frame per second is sent to Gemini Live as visual context.
5. Gemini can inspect current browser/network errors and ask the server-side repair lab for a diagnosis.
6. Code changes never happen in the Android client or directly on live. A repair proposal can only become an `ai-repair/*` branch/PR after an explicit native confirmation dialog.
7. CI status can be checked by Gemini. Merge requires another explicit native confirmation and the WordPress repair server still refuses non-green CI.

## Security model

- No GitHub token, WordPress password or Gemini long-lived API key is stored in Android source.
- WordPress/GitHub repair authority stays server-side in `kp-ai-repair-lab.php`.
- The WebView bridge only works on `https://*.koblenzer-puppenspiele.de` and reuses the user's authenticated WordPress session/nonces.
- Firebase AI Logic is protected with Firebase App Check / Play Integrity for production.
- MediaProjection always requires Android's user consent for each capture session.
- Screen sharing is stopped when the user ends Live mode or Android revokes the projection.

## Development setup

The repository intentionally does **not** contain `app/google-services.json` or signing keys.

1. Open `android/homepage-technician` with current Android Studio.
2. Register Android package `de.koblenzerpuppenspiele.techniker` in the Firebase project.
3. Enable Firebase AI Logic / Gemini Developer API and configure App Check with Play Integrity.
4. Download `google-services.json` into `android/homepage-technician/app/` (it is gitignored).
5. Run the debug build. Debug loads `https://neu.koblenzer-puppenspiele.de/?kp_edit=1`; release loads `https://koblenzer-puppenspiele.de/?kp_edit=1`.

The Live API is currently a Google developer-preview feature, so model/library identifiers are isolated in the Android module and should be updated when Google promotes a stable Live model.

## Web-app integration

`wp-content/mu-plugins/kp-mobile-live-bridge.php` adds `📱 KI live zeigen` to authorized editor sessions.

- Inside Homepage-Hilfe it calls the native `KPAndroidTechnician` bridge directly.
- In an Android browser it opens `koblenzerpuppenspiele://live?url=<current-page>` so the native app can continue on the same page.
- It also records a small redacted ring buffer of recent JavaScript and failed network errors, plus selected-element geometry/style. Gemini can read this through `window.KPRepairMobile.context()` while it watches the screen.

## Before external distribution

- Configure the production Firebase project and Play Integrity App Check.
- Add release signing in a private CI secret store.
- Run an instrumented test on representative Android 14–16 devices, including Samsung Internet/Chrome login handoff and app-only MediaProjection.
- Decide whether the release build should point directly at production or first open a dedicated technician landing page.
