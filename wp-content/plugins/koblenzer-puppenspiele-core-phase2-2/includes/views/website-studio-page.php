<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }
?>
        <div class="wrap kp-studio-wrap">
            <div class="kp-studio-hero">
                <div>
                    <span class="kp-studio-eyebrow">Koblenzer Puppenspiele</span>
                    <h1>Website Studio</h1>
                    <p>Gestalten wie in einer App: Bereich wählen, Regler bewegen, Vorschau ansehen, speichern. Kein CSS, kein Code.</p>
                </div>
                <button type="button" class="button button-primary kp-studio-preview-toggle"><span class="dashicons dashicons-visibility"></span> Vorschau</button>
            </div>

            <?php if ( $saved ) : ?><div class="notice notice-success is-dismissible"><p><strong>Gespeichert.</strong> Die Website nutzt jetzt diese Einstellungen.</p></div><?php endif; ?>
            <?php if ( $reset ) : ?><div class="notice notice-success is-dismissible"><p><strong>Zurückgesetzt.</strong> Das ursprüngliche Design ist wieder aktiv.</p></div><?php endif; ?>

            <div class="kp-studio-onboarding">
                <div><b>1</b><span><strong>Bereich öffnen</strong><small>z. B. Menü oder Farben</small></span></div>
                <div><b>2</b><span><strong>Einfach schieben</strong><small>Die Vorschau reagiert sofort</small></span></div>
                <div><b>3</b><span><strong>Speichern</strong><small>Erst dann wird es öffentlich</small></span></div>
            </div>

            <form id="kp-studio-form" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post">
                <input type="hidden" name="action" value="kp_save_website_studio">
                <?php wp_nonce_field( 'kp_website_studio_save' ); ?>

                <div class="kp-studio-layout">
                    <main class="kp-studio-controls">
                        <nav class="kp-studio-tabs" aria-label="Designbereiche">
                            <button type="button" class="is-active" data-tab="quick">Schnellstart</button>
                            <button type="button" data-tab="colors">Farben</button>
                            <button type="button" data-tab="menu">Menü</button>
                            <button type="button" data-tab="header">Kopfbereich</button>
                            <button type="button" data-tab="layout">Layout</button>
                            <button type="button" data-tab="type">Schriften</button>
                            <button type="button" data-tab="help">Inhalte</button>
                        </nav>

                        <section class="kp-studio-tab is-active" data-panel="quick">
                            <div class="kp-studio-card kp-studio-card-dark">
                                <h2>Schnellstart</h2>
                                <p>Diese Presets ändern nur die Regler. Erst mit <strong>Speichern</strong> wird etwas veröffentlicht.</p>
                                <div class="kp-studio-presets">
                                    <button type="button" data-preset="original"><span>🎭</span><strong>Original</strong><small>Aktueller Theater-Look</small></button>
                                    <button type="button" data-preset="solid"><span>◼</span><strong>Mehr Kontrast</strong><small>Weniger transparent</small></button>
                                    <button type="button" data-preset="glass"><span>◇</span><strong>Mehr Glas</strong><small>Leichter & moderner</small></button>
                                    <button type="button" data-preset="clean"><span>○</span><strong>Ruhiger</strong><small>Weniger Rundungen</small></button>
                                </div>
                            </div>

                            <div class="kp-studio-card">
                                <h2>Die häufigsten Einstellungen</h2>
                                <?php self::range( 'menu_opacity', 'Menü: Deckkraft', $s['menu_opacity'], 30, 100, 1, '%', '100 % = komplett blickdicht, niedriger = mehr Glas.' ); ?>
                                <?php self::range( 'menu_offset_y', 'Menü höher / tiefer', $s['menu_offset_y'], -120, 180, 2, ' px', 'Minus zieht das Menü nach oben, Plus schiebt es nach unten.' ); ?>
                                <?php self::range( 'menu_width', 'Menübreite', $s['menu_width'], 220, 360, 5, ' px', 'Passt sich auf kleinen Handys trotzdem automatisch an.' ); ?>
                                <?php self::range( 'card_radius', 'Karten abrunden', $s['card_radius'], 0, 36, 1, ' px' ); ?>
                            </div>

                            <div class="kp-studio-card">
                                <h2>Direkt bearbeiten</h2>
                                <p class="kp-studio-muted">Texte und Inhalte bleiben normale WordPress-Inhalte. Hier sind die kurzen Wege.</p>
                                <div class="kp-studio-links">
                                    <a href="<?php echo esc_url( admin_url( 'edit.php?post_type=page' ) ); ?>"><span class="dashicons dashicons-admin-page"></span><strong>Seiten & Texte</strong><small>Startseite, Theater, Kontakt …</small></a>
                                    <a href="<?php echo esc_url( admin_url( 'edit.php?post_type=kp_termin' ) ); ?>"><span class="dashicons dashicons-calendar-alt"></span><strong>Termine</strong><small>Spielplan pflegen</small></a>
                                    <a href="<?php echo esc_url( admin_url( 'edit.php?post_type=kp_repertoire' ) ); ?>"><span class="dashicons dashicons-format-gallery"></span><strong>Repertoire</strong><small>Stücke und Bilder</small></a>
                                    <a href="<?php echo esc_url( admin_url( 'site-editor.php?path=/navigation' ) ); ?>"><span class="dashicons dashicons-menu-alt3"></span><strong>Menüpunkte</strong><small>Seiten hinzufügen / sortieren</small></a>
                                </div>
                            </div>
                        </section>

                        <section class="kp-studio-tab" data-panel="colors">
                            <div class="kp-studio-card">
                                <h2>Farben</h2>
                                <p class="kp-studio-muted">Die wichtigsten Farben wirken automatisch auf Navigation, Buttons und viele Karten.</p>
                                <?php self::color( 'accent_color', 'Akzent / Orange', $s['accent_color'], 'Buttons, aktive Elemente und Highlights.' ); ?>
                                <?php self::color( 'accent_dark', 'Akzent dunkel', $s['accent_dark'], 'Hover- und dunklere Button-Zustände.' ); ?>
                                <?php self::color( 'background_color', 'Seitenhintergrund', $s['background_color'] ); ?>
                                <?php self::color( 'nav_color', 'Menüleiste Desktop', $s['nav_color'] ); ?>
                                <?php self::color( 'surface_color', 'Karten / Flächen', $s['surface_color'] ); ?>
                                <?php self::color( 'text_color', 'Heller Text', $s['text_color'] ); ?>
                                <?php self::color( 'muted_color', 'Ruhiger Text', $s['muted_color'] ); ?>
                                <?php self::color( 'line_color', 'Linien / Rahmen', $s['line_color'] ); ?>
                            </div>
                            <div class="kp-studio-card">
                                <h2>Desktop-Menüleiste</h2>
                                <?php self::range( 'desktop_nav_opacity', 'Deckkraft', $s['desktop_nav_opacity'], 0, 100, 1, '%' ); ?>
                                <?php self::range( 'desktop_nav_height', 'Höhe', $s['desktop_nav_height'], 36, 72, 1, ' px' ); ?>
                                <?php self::range( 'desktop_nav_radius', 'Menüpunkte abrunden', $s['desktop_nav_radius'], 0, 999, 1, ' px' ); ?>
                            </div>
                        </section>

                        <section class="kp-studio-tab" data-panel="menu">
                            <div class="kp-studio-card">
                                <h2>Mobiles Menü</h2>
                                <p class="kp-studio-muted">Hier steckt der „Glas“-Look. Die Höhe bleibt immer automatisch passend zur Anzahl der Menüpunkte.</p>
                                <?php self::color( 'menu_color', 'Grundfarbe', $s['menu_color'] ); ?>
                                <?php self::range( 'menu_opacity', 'Deckkraft', $s['menu_opacity'], 30, 100, 1, '%' ); ?>
                                <?php self::range( 'menu_blur', 'Hintergrund weichzeichnen', $s['menu_blur'], 0, 40, 1, ' px' ); ?>
                                <?php self::range( 'menu_width', 'Breite', $s['menu_width'], 220, 360, 5, ' px' ); ?>
                                <?php self::range( 'menu_radius', 'Ecken abrunden', $s['menu_radius'], 0, 36, 1, ' px' ); ?>
                                <?php self::range( 'menu_offset_y', 'Höher / tiefer', $s['menu_offset_y'], -120, 180, 2, ' px' ); ?>
                                <?php self::range( 'menu_border_opacity', 'Rahmen sichtbar', $s['menu_border_opacity'], 0, 100, 1, '%' ); ?>
                                <?php self::range( 'menu_scrim_opacity', 'Hintergrund abdunkeln', $s['menu_scrim_opacity'], 0, 45, 1, '%' ); ?>
                            </div>
                            <div class="kp-studio-card">
                                <h2>Menüpunkte & Button</h2>
                                <?php self::range( 'menu_item_padding', 'Zeilenhöhe', $s['menu_item_padding'], 5, 18, 1, ' px' ); ?>
                                <?php self::range( 'menu_item_gap', 'Abstand zwischen Seiten', $s['menu_item_gap'], 0, 12, 1, ' px' ); ?>
                                <?php self::range( 'menu_font_delta', 'Schrift größer / kleiner', $s['menu_font_delta'], -4, 6, 1, ' px' ); ?>
                                <?php self::range( 'menu_button_size', 'Menübutton Größe', $s['menu_button_size'], 44, 72, 1, ' px' ); ?>
                            </div>
                        </section>

                        <section class="kp-studio-tab" data-panel="header">
                            <div class="kp-studio-card">
                                <h2>Kopfbereich</h2>
                                <?php self::toggle( 'show_topbar', 'Kleine Infobar anzeigen', $s['show_topbar'], 'Die schmale Zeile ganz oben.' ); ?>
                                <label class="kp-studio-text-control"><strong>Text links</strong><input type="text" name="kp_studio[topbar_left]" value="<?php echo esc_attr( $s['topbar_left'] ); ?>" maxlength="80" data-studio-key="topbar_left"></label>
                                <label class="kp-studio-text-control"><strong>Text rechts</strong><input type="text" name="kp_studio[topbar_right]" value="<?php echo esc_attr( $s['topbar_right'] ); ?>" maxlength="50" data-studio-key="topbar_right"></label>
                                <?php self::toggle( 'show_header_image', 'Headerbild anzeigen', $s['show_header_image'] ); ?>

                                <div class="kp-studio-media-field">
                                    <div>
                                        <strong>Headerbild</strong>
                                        <small>Optional ein eigenes Bild aus der Mediathek wählen. Ohne Auswahl bleibt das aktuelle Bild.</small>
                                    </div>
                                    <input type="hidden" name="kp_studio[header_image_id]" value="<?php echo esc_attr( $s['header_image_id'] ); ?>" id="kp-studio-header-image-id" data-studio-key="header_image_id">
                                    <div class="kp-studio-media-preview <?php echo $image_url ? 'has-image' : ''; ?>" id="kp-studio-header-image-preview">
                                        <?php if ( $image_url ) : ?><img src="<?php echo esc_url( $image_url ); ?>" alt=""><?php else : ?><span class="dashicons dashicons-format-image"></span><?php endif; ?>
                                    </div>
                                    <div class="kp-studio-media-actions">
                                        <button type="button" class="button" id="kp-studio-pick-image">Bild wählen</button>
                                        <button type="button" class="button-link-delete" id="kp-studio-clear-image">Original verwenden</button>
                                    </div>
                                </div>

                                <?php self::range( 'header_max_width', 'Maximale Bildbreite', $s['header_max_width'], 540, 1400, 10, ' px' ); ?>
                                <?php self::range( 'header_side_gap', 'Seitlicher Abstand', $s['header_side_gap'], 0, 100, 2, ' px', 'Auf dem Smartphone bleibt das Bild automatisch volle Breite.' ); ?>
                                <?php self::range( 'header_vertical_gap', 'Abstand oben / unten', $s['header_vertical_gap'], 0, 40, 1, ' px' ); ?>
                                <?php self::range( 'header_radius', 'Bild abrunden', $s['header_radius'], 0, 36, 1, ' px' ); ?>
                            </div>
                        </section>

                        <section class="kp-studio-tab" data-panel="layout">
                            <div class="kp-studio-card">
                                <h2>Abstände & Formen</h2>
                                <?php self::range( 'content_width', 'Textbreite', $s['content_width'], 560, 980, 10, ' px', 'Schmaler ist ruhiger zu lesen, breiter zeigt mehr nebeneinander.' ); ?>
                                <?php self::range( 'wide_width', 'Breite großer Bereiche', $s['wide_width'], 820, 1440, 10, ' px' ); ?>
                                <?php self::range( 'card_radius', 'Karten abrunden', $s['card_radius'], 0, 36, 1, ' px' ); ?>
                                <?php self::range( 'button_radius', 'Buttons abrunden', $s['button_radius'], 0, 999, 1, ' px', '999 px = komplett pillenförmig.' ); ?>
                                <?php self::toggle( 'motion', 'Animationen verwenden', $s['motion'], 'Ausschalten für eine ganz ruhige Darstellung.' ); ?>
                            </div>
                        </section>

                        <section class="kp-studio-tab" data-panel="type">
                            <div class="kp-studio-card">
                                <h2>Schriften</h2>
                                <label class="kp-studio-select-control"><strong>Fließtext</strong><select name="kp_studio[body_font]" data-studio-key="body_font"><option value="system" <?php selected( $s['body_font'], 'system' ); ?>>Klar & modern</option><option value="humanist" <?php selected( $s['body_font'], 'humanist' ); ?>>Weich & freundlich</option><option value="classic" <?php selected( $s['body_font'], 'classic' ); ?>>Klassisch Serif</option></select></label>
                                <label class="kp-studio-select-control"><strong>Überschriften</strong><select name="kp_studio[heading_font]" data-studio-key="heading_font"><option value="georgia" <?php selected( $s['heading_font'], 'georgia' ); ?>>Theater Serif</option><option value="palatino" <?php selected( $s['heading_font'], 'palatino' ); ?>>Elegant</option><option value="system" <?php selected( $s['heading_font'], 'system' ); ?>>Modern Sans</option></select></label>
                                <p class="kp-studio-tip"><span class="dashicons dashicons-lightbulb"></span><strong>Tipp:</strong> Die aktuelle Kombination „Klar & modern“ + „Theater Serif“ ist bewusst gewählt, damit die Seite hochwertig bleibt und auf Handys gut lesbar ist.</p>
                            </div>
                        </section>

                        <section class="kp-studio-tab" data-panel="help">
                            <div class="kp-studio-card">
                                <h2>Inhalte bearbeiten</h2>
                                <p>Das Studio ist fürs <strong>Aussehen</strong>. Inhalte bleiben dort, wo WordPress sie am einfachsten verwalten kann.</p>
                                <div class="kp-studio-links kp-studio-links-wide">
                                    <a href="<?php echo esc_url( admin_url( 'edit.php?post_type=page' ) ); ?>"><span class="dashicons dashicons-admin-page"></span><strong>Seiten & Texte</strong><small>Alle normalen Seiten</small></a>
                                    <a href="<?php echo esc_url( admin_url( 'edit.php?post_type=kp_termin' ) ); ?>"><span class="dashicons dashicons-calendar-alt"></span><strong>Termine</strong><small>Spielplan</small></a>
                                    <a href="<?php echo esc_url( admin_url( 'edit.php?post_type=kp_repertoire' ) ); ?>"><span class="dashicons dashicons-format-gallery"></span><strong>Repertoire</strong><small>Stücke, Bilder, Details</small></a>
                                    <a href="<?php echo esc_url( admin_url( 'edit.php?post_type=kp_ensemble' ) ); ?>"><span class="dashicons dashicons-groups"></span><strong>Ensemble</strong><small>Personen & Fotos</small></a>
                                    <a href="<?php echo esc_url( admin_url( 'edit.php?post_type=kp_referenz' ) ); ?>"><span class="dashicons dashicons-awards"></span><strong>Referenzen</strong><small>Partner & Logos</small></a>
                                    <a href="<?php echo esc_url( admin_url( 'site-editor.php?path=/navigation' ) ); ?>"><span class="dashicons dashicons-menu-alt3"></span><strong>Menüpunkte</strong><small>Reihenfolge und Seiten</small></a>
                                </div>
                            </div>
                            <div class="kp-studio-card">
                                <h2>Profi-Modus</h2>
                                <p>Nur wenn etwas ganz Besonderes gebaut werden soll: Der normale WordPress Website-Editor bleibt weiterhin verfügbar.</p>
                                <a class="button" href="<?php echo esc_url( admin_url( 'site-editor.php' ) ); ?>">WordPress Website-Editor öffnen</a>
                            </div>
                        </section>
                    </main>

                    <aside class="kp-studio-preview-column">
                        <div class="kp-studio-preview-card">
                            <div class="kp-studio-preview-head"><div><strong>Live-Vorschau</strong><small>Nicht gespeichert</small></div><a href="<?php echo esc_url( home_url( '/' ) ); ?>" target="_blank" rel="noopener">Website ↗</a></div>
                            <iframe id="kp-studio-preview" src="<?php echo esc_url( $preview_url ); ?>" title="Vorschau der Website"></iframe>
                        </div>
                    </aside>
                </div>

                <div class="kp-studio-savebar">
                    <span id="kp-studio-dirty"><span class="dashicons dashicons-saved"></span> Alles gespeichert</span>
                    <button type="submit" class="button button-primary button-hero">Änderungen speichern</button>
                </div>
            </form>

            <form class="kp-studio-reset" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post" onsubmit="return confirm('Wirklich alle Design-Einstellungen auf das ursprüngliche Layout zurücksetzen?');">
                <input type="hidden" name="action" value="kp_reset_website_studio">
                <?php wp_nonce_field( 'kp_website_studio_reset' ); ?>
                <button type="submit" class="button-link-delete">Design auf Original zurücksetzen</button>
            </form>

            <div class="kp-studio-preview-drawer" aria-hidden="true">
                <div class="kp-studio-preview-drawer-head"><strong>Live-Vorschau</strong><button type="button" class="kp-studio-preview-close" aria-label="Vorschau schließen">×</button></div>
                <div class="kp-studio-preview-drawer-body"></div>
            </div>
        </div>
