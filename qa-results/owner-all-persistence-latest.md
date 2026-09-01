# Owner controls + Versionen – echter Staging-Test

Erzeugt: 2026-09-01T15:06:00Z
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
file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:18
const fail = message => { throw new Error(message); };
                                ^

Error: Frontend-Editor wurde nicht initialisiert. Diagnose={"status":200,"url":"https://neu.koblenzer-puppenspiele.de/?kp_e2e_login=6fbe3d13dc604efa53da616f91bdfe48f94db8bed2906603bf919c410bff5b77","title":"puppenspiele","body":"Zum Inhalt springen Mobiles Figurentheater aus Koblenz Seit 1995 KOBLENZER PUPPENSPIELE Figurentheater, das Kinder begeistert und Veranstaltungen besonders macht. Liebevolle Kinderbuchhelden, fantasievolle Geschichten und kasperhafter Schalk – für Familien, Einrichtungen und Veranstaltungen. Jetzt buchen Stücke entdecken VORHANG AUF Ein Theatererlebnis mit Herz, Witz und Fantasie Entdecken Sie unser Repertoire, finden Sie öffentliche Vorstellungen oder fragen Sie direkt einen Auftritt für Ihre Veranstaltung an. Geschichten, die bleiben Bekannte Kinderbuchhelden und eigene Theaterwelten werden auf der Bühne lebendig. Nah am Publikum Figuren, Humor und direkte Spielfreude schaffen Theatermomente, bei denen Kinder wirklich dabei sind. Einfach anfragen Stück auswählen, Wunschtermin und Rahmen nennen – die Buchungsseite führt direkt zur Anfrage. Puppentheater für Ihre Veranstaltung? Senden Sie direkt Ihre Anfrage – die Details können anschließend gemeinsam geklärt werden. Jetzt buchen Demnächst live erleben Die nächsten öffentlichen Vorstellungen auf einen Blick. Nächste Vorstellungen DI. 01. SEP. 10:00 Uhr Geschlossene Vorstellung Geschlossene Vorstellung Boppard-Weiler DO. 03. SEP. 16","globals":{"fe2":true,"owner":true,"responsive":false,"registry":false},"scripts":["https://neu.koblenzer-puppenspiele.de/wp-includes/js/wp-emoji-release.min.js?ver=7.0.4","https://neu.koblenzer-puppenspiele.de/wp-includes/js/dist/script-modules/block-library/navigation/view.min.js?ver=96a846e1d7b789c39ab9","https://neu.koblenzer-puppenspiele.de/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-editor-v2.js?ver=4.5.29","https://neu.koblenzer-puppenspiele.de/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/frontend-card-controls.js?ver=4.5.29","https://neu.koblenzer-puppenspiele.de/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/owner-web-app.js?ver=4.5.29","https://neu.koblenzer-puppenspiele.de/wp-content/themes/koblenzer-puppenspiele-block-theme-phase1-7/assets/image-fallback.js?ver=1788274894","https://neu.koblenzer-puppenspiele.de/wp-content/mu-plugins/kp-canva-keys.js?ver=1788274709","https://neu.koblenzer-puppenspiele.de/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/touch-gestures.js?ver=1788274894","https://neu.koblenzer-puppenspiele.de/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/touch-gesture-safety.js?ver=1788275074","https://neu.koblenzer-puppenspiele.de/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/touch-free-layout.js?ver=1788274894","https://neu.koblenzer-puppenspiele.de/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/touch-editor-bridge.js?ver=1788274894","https://neu.koblenzer-puppenspiele.de/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/touch-persistence.js?ver=1788274894","https://neu.koblenzer-puppenspiele.de/wp-content/mu-plugins/kp-canva-editor.js?ver=1788274709","https://neu.koblenzer-puppenspiele.de/wp-content/mu-plugins/kp-canva-image-inherit.js?ver=1788274709","https://neu.koblenzer-puppenspiele.de/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/design-reset-reliability.js?ver=4.5.29"]}
    at fail (file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:18:33)
    at file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:234:5

Node.js v22.23.2
```
