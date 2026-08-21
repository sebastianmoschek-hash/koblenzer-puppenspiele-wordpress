# Owner controls + Versionen – echter Staging-Test

Erzeugt: 2026-08-21T15:20:42Z
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
::add-mask::a28263c787f90b7b7ea44f228d6d1ba18439ce70adde1a4e43a11ca644fb58ef
E2E bridge uploaded.
```

## Echter Browser-/DB-Test
```text
file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:10
const fail = message => { throw new Error(message); };
                                ^

Error: Mindestens ein Design-Regler wurde nicht gespeichert. expected={"accent_color":"#112233","accent_dark":"#112233","background_color":"#112233","nav_color":"#112233","surface_color":"#112233","text_color":"#112233","muted_color":"#112233","line_color":"#112233","show_topbar":0,"topbar_left":"Mobiles Figurentheater aus Koblenz QA","topbar_right":"Seit 1995 QA","show_header_image":0,"header_max_width":870,"header_side_gap":33,"header_vertical_gap":8,"header_radius":1,"desktop_nav_opacity":99,"desktop_nav_height":45,"desktop_nav_radius":998,"menu_color":"#112233","menu_opacity":75,"menu_blur":23,"menu_width":322,"menu_radius":22,"menu_offset_y":1,"menu_border_opacity":31,"menu_scrim_opacity":4,"menu_item_padding":10,"menu_item_gap":3,"menu_font_delta":1,"menu_button_size":53,"content_width":730,"wide_width":1050,"card_radius":17,"button_radius":998,"body_font":"humanist","heading_font":"palatino","motion":0} actual={"accent_color":"#f07a22","accent_dark":"#c95c10","background_color":"#080706","nav_color":"#17110e","surface_color":"#241813","text_color":"#f7f1eb","muted_color":"#c9bcb1","line_color":"#4b352a","content_width":720,"wide_width":1040,"card_radius":16,"button_radius":999,"body_font":"system","heading_font":"georgia","motion":1,"show_topbar":1,"topbar_left":"Mobiles Figurentheater aus Koblenz","topbar_right":"Seit 1995","show_header_image":1,"header_image_id":0,"header_max_width":860,"header_side_gap":32,"header_radius":0,"header_vertical_gap":7,"desktop_nav_opacity":100,"desktop_nav_height":44,"desktop_nav_radius":999,"menu_color":"#3a261c","menu_opacity":74,"menu_blur":22,"menu_width":320,"menu_radius":21,"menu_offset_y":0,"menu_border_opacity":30,"menu_scrim_opacity":3,"menu_item_padding":9,"menu_item_gap":2,"menu_font_delta":0,"menu_button_size":52,"instagram_url":"https://www.instagram.com/koblenzer_puppenspiele/"}
    at fail (file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:10:33)
    at file:///home/runner/work/koblenzer-puppenspiele-wordpress/koblenzer-puppenspiele-wordpress/qa/owner-all-persistence-e2e.mjs:182:5

Node.js v22.23.2
```
