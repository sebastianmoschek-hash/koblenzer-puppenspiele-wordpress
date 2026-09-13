<?php get_header(); ?>
<main class="kp-page">
  <div class="kp-wrap kp-content">
    <h1 class="kp-page-title">Koblenzer Puppenspiele</h1>
    <?php while (have_posts()) : the_post(); the_content(); endwhile; ?>
  </div>
</main>
<?php get_footer(); ?>
