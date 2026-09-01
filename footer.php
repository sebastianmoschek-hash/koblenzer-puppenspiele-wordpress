<?php if (!defined('ABSPATH')) exit; ?>
<footer class="kp-footer">
  <div class="kp-wrap">
    <strong><?php bloginfo('name'); ?></strong>
    <p>Mobiles Figurentheater aus Koblenz</p>
    <?php
    wp_nav_menu(array(
      'theme_location' => 'footer',
      'container' => false,
      'fallback_cb' => false,
      'menu_class' => '',
      'items_wrap' => '<p>%3$s</p>',
    ));
    ?>
    <p><a href="<?php echo esc_url(home_url('/impressum/')); ?>">Impressum</a> · <a href="<?php echo esc_url(home_url('/datenschutz/')); ?>">Datenschutz</a></p>
  </div>
</footer>
<?php wp_footer(); ?>
</body>
</html>
