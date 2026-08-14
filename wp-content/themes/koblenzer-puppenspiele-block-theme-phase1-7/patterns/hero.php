<?php
/**
 * Title: Startseiten-Hero
 * Slug: koblenzer-puppenspiele/hero
 * Categories: banner, koblenzer-puppenspiele
 * Viewport Width: 1280
 */
?>
<!-- wp:group {"align":"full","className":"kp-hero","style":{"spacing":{"padding":{"top":"var:preset|spacing|70","bottom":"var:preset|spacing|70"}}},"layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull kp-hero" style="padding-top:var(--wp--preset--spacing--70);padding-bottom:var(--wp--preset--spacing--70)">
  <!-- wp:group {"align":"wide","layout":{"type":"constrained"}} -->
  <div class="wp-block-group alignwide">
    <!-- wp:paragraph {"textColor":"orange","style":{"typography":{"fontWeight":"800","textTransform":"uppercase","letterSpacing":"0.12em"}},"fontSize":"small"} --><p class="has-orange-color has-text-color has-small-font-size" style="font-weight:800;letter-spacing:0.12em;text-transform:uppercase">Koblenzer Puppenspiele</p><!-- /wp:paragraph -->
    <!-- wp:heading {"level":1,"fontSize":"hero"} --><h1 class="wp-block-heading has-hero-font-size">Figurentheater mit Herz, Witz und Fantasie.</h1><!-- /wp:heading -->
    <!-- wp:paragraph {"className":"kp-muted","fontSize":"large"} --><p class="kp-muted has-large-font-size">Liebevolle und kindgerechte Bearbeitungen tierischer und zauberhafter Kinderbuchhelden – sowie kasperhafte Geschichten mit Schalk und Charme.</p><!-- /wp:paragraph -->
    <!-- wp:buttons -->
    <div class="wp-block-buttons">
      <!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( home_url( '/termine/' ) ); ?>">Termine entdecken</a></div><!-- /wp:button -->
      <!-- wp:button {"className":"is-style-outline"} --><div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( home_url( '/repertoire/' ) ); ?>">Repertoire ansehen</a></div><!-- /wp:button -->
    </div>
    <!-- /wp:buttons -->
  </div>
  <!-- /wp:group -->
</div>
<!-- /wp:group -->
