<?php
/**
 * Title: Hauptheader im Stil der Originalseite
 * Slug: koblenzer-puppenspiele/header-main
 * Categories: header, koblenzer-puppenspiele
 * Block Types: core/template-part/header
 * Viewport Width: 1280
 */
$header_image = get_theme_file_uri( 'assets/images/header.webp' );
?>
<!-- wp:group {"align":"full","className":"kp-topbar","style":{"spacing":{"padding":{"top":"0.4rem","bottom":"0.4rem"}}},"backgroundColor":"black","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull kp-topbar has-black-background-color has-background" style="padding-top:0.4rem;padding-bottom:0.4rem">
  <!-- wp:group {"align":"wide","layout":{"type":"flex","flexWrap":"nowrap","justifyContent":"space-between"}} -->
  <div class="wp-block-group alignwide">
    <!-- wp:paragraph {"fontSize":"small"} --><p class="has-small-font-size">Mobiles Figurentheater aus Koblenz</p><!-- /wp:paragraph -->
    <!-- wp:paragraph {"fontSize":"small"} --><p class="has-small-font-size">Seit 1995</p><!-- /wp:paragraph -->
  </div>
  <!-- /wp:group -->
</div>
<!-- /wp:group -->

<!-- wp:group {"align":"full","className":"kp-header-stage","layout":{"type":"default"}} -->
<div class="wp-block-group alignfull kp-header-stage">
  <!-- wp:image {"sizeSlug":"full","linkDestination":"none","align":"full","className":"kp-header-photo"} -->
  <figure class="wp-block-image alignfull size-full kp-header-photo"><img src="<?php echo esc_url( $header_image ); ?>" alt="Koblenzer Puppenspiele – Björn mit Figur und Logo"/></figure>
  <!-- /wp:image -->
</div>
<!-- /wp:group -->

<!-- wp:group {"align":"full","className":"kp-navigation-bar","backgroundColor":"brown","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull kp-navigation-bar has-brown-background-color has-background">
  <!-- wp:navigation {"overlayMenu":"mobile","overlayBackgroundColor":"black","overlayTextColor":"white","align":"wide","className":"kp-site-nav","layout":{"type":"flex","justifyContent":"center","flexWrap":"wrap"}} -->
    <!-- wp:navigation-link {"label":"Startseite","url":"<?php echo esc_url( home_url( '/' ) ); ?>","kind":"custom"} /-->
    <!-- wp:navigation-link {"label":"Aktuelles","url":"<?php echo esc_url( home_url( '/aktuelles/' ) ); ?>","kind":"custom"} /-->
    <!-- wp:navigation-link {"label":"Das Theater","url":"<?php echo esc_url( home_url( '/das-theater/' ) ); ?>","kind":"custom"} /-->
    <!-- wp:navigation-link {"label":"Repertoire","url":"<?php echo esc_url( home_url( '/repertoire/' ) ); ?>","kind":"custom"} /-->
    <!-- wp:navigation-link {"label":"Termine","url":"<?php echo esc_url( home_url( '/termine/' ) ); ?>","kind":"custom"} /-->
    <!-- wp:navigation-link {"label":"Jetzt buchen","url":"<?php echo esc_url( home_url( '/jetzt-buchen/' ) ); ?>","kind":"custom","className":"kp-nav-booking"} /-->
    <!-- wp:navigation-link {"label":"Referenzen","url":"<?php echo esc_url( home_url( '/referenzen/' ) ); ?>","kind":"custom"} /-->
    <!-- wp:navigation-link {"label":"Kontakt","url":"<?php echo esc_url( home_url( '/kontakt/' ) ); ?>","kind":"custom"} /-->
    <!-- wp:navigation-link {"label":"Eigentümer-Bereich","url":"<?php echo esc_url( wp_login_url( add_query_arg( 'kp_edit', '1', home_url( '/' ) ) ) ); ?>","kind":"custom","className":"kp-owner-login"} /-->
  <!-- /wp:navigation -->
</div>
<!-- /wp:group -->
