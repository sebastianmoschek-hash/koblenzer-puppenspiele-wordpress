<?php
/**
 * Title: Startseite – Grundaufbau
 * Slug: koblenzer-puppenspiele/startseite
 * Categories: featured, koblenzer-puppenspiele
 * Post Types: page
 * Viewport Width: 1280
 */
?>
<!-- wp:pattern {"slug":"koblenzer-puppenspiele/hero"} /-->

<!-- wp:group {"align":"full","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|60"}}},"backgroundColor":"black","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull has-black-background-color has-background" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--60)">
  <!-- wp:group {"align":"wide","layout":{"type":"constrained"}} -->
  <div class="wp-block-group alignwide">
    <!-- wp:heading --><h2 class="wp-block-heading">Nächste Vorstellungen</h2><!-- /wp:heading -->
    <!-- wp:paragraph {"textColor":"muted"} --><p class="has-muted-color has-text-color">Dieser Bereich wird in Phase 2 automatisch mit den nächsten Terminen aus der einfachen Terminverwaltung gefüllt.</p><!-- /wp:paragraph -->
    <!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button {"className":"is-style-outline"} --><div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( home_url( '/termine/' ) ); ?>">Alle Termine</a></div><!-- /wp:button --></div><!-- /wp:buttons -->
  </div>
  <!-- /wp:group -->
</div>
<!-- /wp:group -->

<!-- wp:pattern {"slug":"koblenzer-puppenspiele/booking-cta"} /-->
