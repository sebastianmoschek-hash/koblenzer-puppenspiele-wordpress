<?php get_header(); ?>
<main class="kp-page">
  <div class="kp-wrap kp-content">
    <?php while (have_posts()) : the_post(); ?>
      <h1 class="kp-page-title"><?php the_title(); ?></h1>
      <?php the_content(); ?>
    <?php endwhile; ?>
  </div>
</main>
<?php get_footer(); ?>
