<?php if (!defined('ABSPATH')) exit; ?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width,initial-scale=1">
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<div class="kp-topbar">
  <div class="kp-wrap kp-topbar-inner">
    <span>Mobiles Figurentheater aus Koblenz</span>
    <span>Seit 1995</span>
  </div>
</div>

<header class="kp-site-header">
  <div class="kp-header-media">
    <?php
      $header_image = get_header_image();
      if (!$header_image) {
          // Originalbild der bisherigen Homepage als sicherer Test-Fallback.
          // Für den endgültigen Betrieb bitte unter Design > Customizer > Header-Bild
          // dieselbe Datei lokal in WordPress hinterlegen.
          $header_image = 'https://www.koblenzer-puppenspiele.de/images/homeseite_koblenzer_puppenspiele.jpg';
      }
    ?>
    <img class="kp-header-photo" src="<?php echo esc_url($header_image); ?>" alt="Koblenzer Puppenspiele">

    <details class="kp-menu">
      <summary aria-label="Hauptmenü öffnen">☰ Menü</summary>
      <nav class="kp-nav" aria-label="Hauptnavigation">
        <?php
        wp_nav_menu(array(
            'theme_location' => 'primary',
            'container'      => false,
            'fallback_cb'    => 'kp_default_menu',
            'menu_class'     => 'kp-nav-list',
            'items_wrap'     => '<ul class="%2$s">%3$s</ul>',
            'depth'          => 2,
        ));
        ?>
      </nav>
    </details>
  </div>
</header>
