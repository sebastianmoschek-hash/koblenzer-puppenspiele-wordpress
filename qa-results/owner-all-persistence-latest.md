# Owner controls + Versionen – echter Staging-Test

Erzeugt: 2026-08-21T23:41:14Z
Staging-only Direktdeploy: success
Staging-Deploy bereit: success
Staging-only E2E-Zugang: success
Persistenz-/Versionsprüfung: failure

## Direktdeploy
```text
Transferring file `assets/touch-gestures.js'
Removing old file `assets/touch-manual-save-gate.js'
Transferring file `assets/touch-manual-save-gate.js'
Removing old file `includes/class-kp-instagram-profile-migration.php'
Transferring file `includes/class-kp-instagram-profile-migration.php'
Removing old file `includes/class-kp-legal.php'
Transferring file `includes/class-kp-legal.php'
Removing old file `includes/class-kp-mobile-menu-float.php'
Transferring file `includes/class-kp-mobile-menu-float.php'
Removing old file `includes/class-kp-mobile-menu-glass.php'
Transferring file `includes/class-kp-mobile-menu-glass.php'
Removing old file `includes/class-kp-mobile-menu-links.php'
Transferring file `includes/class-kp-mobile-menu-links.php'
Removing old file `includes/class-kp-owner-direct-edit-cta.php'
Transferring file `includes/class-kp-owner-direct-edit-cta.php'
Removing old file `assets/touch-persistence.js'
Transferring file `assets/touch-persistence.js'
Removing old file `assets/website-studio-admin.css'
Transferring file `assets/website-studio-admin.css'
Removing old file `assets/website-studio-admin.js'
Transferring file `assets/website-studio-admin.js'
Removing old file `includes/class-kp-owner-edit-focus.php'
Transferring file `includes/class-kp-owner-edit-focus.php'
Removing old file `includes/class-kp-owner-edit-reliability.php'
Transferring file `includes/class-kp-owner-edit-reliability.php'
Removing old file `includes/class-kp-owner-experience.php'
Transferring file `includes/class-kp-owner-experience.php'
Removing old file `includes/class-kp-owner-history.php'
Transferring file `includes/class-kp-owner-history.php'
Removing old file `includes/class-kp-owner-menu-x.php'
Transferring file `includes/class-kp-owner-menu-x.php'
Removing old file `assets/legacy-referenzen/referenzen_stadt.jpg'
Transferring file `assets/legacy-referenzen/referenzen_stadt.jpg'
Removing old file `includes/class-kp-owner-responsive-web.php'
Transferring file `includes/class-kp-owner-responsive-web.php'
Removing old file `includes/class-kp-owner-save-coordinator.php'
Transferring file `includes/class-kp-owner-save-coordinator.php'
Removing old file `includes/class-kp-owner-ui-polish.php'
Transferring file `includes/class-kp-owner-ui-polish.php'
Removing old file `includes/class-kp-owner-web-app-extensions.php'
Transferring file `includes/class-kp-owner-web-app-extensions.php'
Removing old file `includes/class-kp-owner-web-app.php'
Transferring file `includes/class-kp-owner-web-app.php'
Removing old file `assets/legacy-referenzen/referenzen_stadtbibliothek.jpg'
Transferring file `assets/legacy-referenzen/referenzen_stadtbibliothek.jpg'
Removing old file `assets/legacy-referenzen/referenzen_trabentrarbach.png'
Transferring file `assets/legacy-referenzen/referenzen_trabentrarbach.png'
Removing old file `assets/legacy-referenzen/referenzen_yellow.jpg'
Transferring file `assets/legacy-referenzen/referenzen_yellow.jpg'
Removing old file `includes/class-kp-referenzen.php'
Transferring file `includes/class-kp-referenzen.php'
Removing old file `includes/class-kp-repertoire.php'
Transferring file `includes/class-kp-repertoire.php'
Removing old file `includes/class-kp-responsive-sizes.php'
Transferring file `includes/class-kp-responsive-sizes.php'
Removing old file `includes/class-kp-site-finish.php'
Transferring file `includes/class-kp-site-finish.php'
Removing old file `includes/class-kp-social-menu-extensions.php'
Transferring file `includes/class-kp-social-menu-extensions.php'
Removing old file `includes/class-kp-social-studio-clarity.php'
Transferring file `includes/class-kp-social-studio-clarity.php'
Removing old file `includes/class-kp-staging-maintenance-bridge.php'
Transferring file `includes/class-kp-staging-maintenance-bridge.php'
Removing old file `includes/class-kp-termine.php'
Transferring file `includes/class-kp-termine.php'
Removing old file `includes/class-kp-ticket-display.php'
Transferring file `includes/class-kp-ticket-display.php'
Removing old file `includes/class-kp-touch-free-layout.php'
Transferring file `includes/class-kp-touch-free-layout.php'
Removing old file `includes/class-kp-touch-gestures.php'
Transferring file `includes/class-kp-touch-gestures.php'
Removing old file `includes/class-kp-touch-manual-save.php'
Transferring file `includes/class-kp-touch-manual-save.php'
Removing old file `includes/class-kp-touch-persistence.php'
Transferring file `includes/class-kp-touch-persistence.php'
Removing old file `includes/class-kp-website-studio-frontend.php'
Transferring file `includes/class-kp-website-studio-frontend.php'
Removing old file `includes/class-kp-website-studio.php'
Transferring file `includes/class-kp-website-studio.php'
PASS: current plugin mirrored to staging-only WordPress root.
```

## Browser-/DB-Test
```text
file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:10
const fail = message => { throw new Error(message); };
                                ^

Error: Mindestens ein Anzeigegrößen-Regler wurde nicht gespeichert. expected={"all_mobile":101,"all_tablet":101,"all_laptop":101,"all_desktop":101,"header_mobile":101,"header_tablet":101,"header_laptop":101,"header_desktop":101,"navigation_mobile":101,"navigation_tablet":101,"navigation_laptop":101,"navigation_desktop":101,"hero_mobile":101,"hero_tablet":101,"hero_laptop":101,"hero_desktop":101,"termine_mobile":139,"termine_tablet":131,"termine_laptop":130,"termine_desktop":101,"home_booking_mobile":101,"home_booking_tablet":101,"home_booking_laptop":101,"home_booking_desktop":101,"aktuelles_mobile":101,"aktuelles_tablet":101,"aktuelles_laptop":101,"aktuelles_desktop":101,"theater_mobile":101,"theater_tablet":101,"theater_laptop":101,"theater_desktop":101,"repertoire_mobile":101,"repertoire_tablet":101,"repertoire_laptop":101,"repertoire_desktop":101,"referenzen_mobile":101,"referenzen_tablet":101,"referenzen_laptop":101,"referenzen_desktop":101,"booking_mobile":101,"booking_tablet":101,"booking_laptop":101,"booking_desktop":101,"kontakt_mobile":101,"kontakt_tablet":101,"kontakt_laptop":101,"kontakt_desktop":101,"faq_mobile":101,"faq_tablet":101,"faq_laptop":101,"faq_desktop":101,"legal_mobile":101,"legal_tablet":101,"legal_laptop":101,"legal_desktop":101,"generic_mobile":101,"generic_tablet":101,"generic_laptop":101,"generic_desktop":101,"footer_mobile":101,"footer_tablet":101,"footer_laptop":101,"footer_desktop":101} actual={"all_mobile":100,"all_tablet":100,"all_laptop":100,"all_desktop":100,"header_mobile":100,"header_tablet":100,"header_laptop":100,"header_desktop":100,"navigation_mobile":100,"navigation_tablet":100,"navigation_laptop":100,"navigation_desktop":100,"hero_mobile":100,"hero_tablet":100,"hero_laptop":100,"hero_desktop":100,"termine_mobile":140,"termine_tablet":130,"termine_laptop":129,"termine_desktop":100,"home_booking_mobile":100,"home_booking_tablet":100,"home_booking_laptop":100,"home_booking_desktop":100,"aktuelles_mobile":100,"aktuelles_tablet":100,"aktuelles_laptop":100,"aktuelles_desktop":100,"theater_mobile":100,"theater_tablet":100,"theater_laptop":100,"theater_desktop":100,"repertoire_mobile":100,"repertoire_tablet":100,"repertoire_laptop":100,"repertoire_desktop":100,"referenzen_mobile":100,"referenzen_tablet":100,"referenzen_laptop":100,"referenzen_desktop":100,"booking_mobile":100,"booking_tablet":100,"booking_laptop":100,"booking_desktop":100,"kontakt_mobile":100,"kontakt_tablet":100,"kontakt_laptop":100,"kontakt_desktop":100,"faq_mobile":100,"faq_tablet":100,"faq_laptop":100,"faq_desktop":100,"legal_mobile":100,"legal_tablet":100,"legal_laptop":100,"legal_desktop":100,"generic_mobile":100,"generic_tablet":100,"generic_laptop":100,"generic_desktop":100,"footer_mobile":100,"footer_tablet":100,"footer_laptop":100,"footer_desktop":100}
    at fail (file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:10:33)
    at file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:209:5

Node.js v22.23.2
```
