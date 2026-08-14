<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class KP_Ensemble {
    const POST_TYPE = 'kp_ensemble';

    public static function init() {
        add_action( 'init', [ __CLASS__, 'register_post_type' ] );
        add_action( 'add_meta_boxes', [ __CLASS__, 'meta_boxes' ] );
        add_action( 'save_post_' . self::POST_TYPE, [ __CLASS__, 'save' ] );
        add_action( 'admin_menu', [ __CLASS__, 'admin_menu' ], 25 );
        add_action( 'admin_post_kp_import_ensemble', [ __CLASS__, 'handle_import' ] );
        add_shortcode( 'kp_ensemble', [ __CLASS__, 'shortcode' ] );
        add_shortcode( 'kp_theater_intro', [ __CLASS__, 'theater_intro' ] );
        add_action( 'init', [ __CLASS__, 'ensure_pages' ], 35 );
        add_action( 'init', [ __CLASS__, 'maybe_flush_rewrites' ], 99 );
    }

    public static function register_post_type() {
        register_post_type( self::POST_TYPE, [
            'labels'=>[
                'name'=>'Ensemble','singular_name'=>'Person','add_new'=>'Person hinzufügen',
                'add_new_item'=>'Person hinzufügen','edit_item'=>'Person bearbeiten','menu_name'=>'Ensemble'
            ],
            'public'=>true,'show_ui'=>true,'show_in_menu'=>false,'show_in_rest'=>true,
            'rewrite'=>['slug'=>'ensemble'],'has_archive'=>false,
            'supports'=>['title','editor','thumbnail','page-attributes']
        ] );
    }

    public static function meta_boxes() {
        add_meta_box('kp_ensemble_details','Personen-Details',[__CLASS__,'box'],self::POST_TYPE,'normal','high');
    }
    public static function box($post) {
        wp_nonce_field('kp_ensemble_save','kp_ensemble_nonce');
        $fields=[
            'role'=>'Rolle / Funktion','born'=>'Geburtsjahr / Ort (optional)',
            'short'=>'Kurztext für die Übersicht','url'=>'Externer Link (optional)'
        ];
        foreach($fields as $key=>$label){
            $v=get_post_meta($post->ID,'_kp_ensemble_'.$key,true);
            echo '<p><label><strong>'.esc_html($label).'</strong></label></p>';
            if($key==='short') echo '<textarea class="widefat" rows="3" name="kp_'.$key.'">'.esc_textarea($v).'</textarea>';
            else echo '<input class="widefat" '.($key==='url'?'type="url"':'type="text"').' name="kp_'.$key.'" value="'.esc_attr($v).'">';
        }
        $featured=get_post_meta($post->ID,'_kp_ensemble_featured',true);
        echo '<p><label><input type="checkbox" name="kp_featured" value="1" '.checked($featured,'1',false).'> <strong>Als Haupt-Ensemble anzeigen</strong></label></p>';
        echo '<p><em>Foto rechts als Beitragsbild festlegen. Die ausführliche Vita wird im normalen Texteditor bearbeitet.</em></p>';
    }
    public static function save($id) {
        if(!isset($_POST['kp_ensemble_nonce']) || !wp_verify_nonce($_POST['kp_ensemble_nonce'],'kp_ensemble_save')) return;
        if(defined('DOING_AUTOSAVE')&&DOING_AUTOSAVE) return;
        if(!current_user_can('edit_post',$id)) return;
        foreach(['role','born','short'] as $k) update_post_meta($id,'_kp_ensemble_'.$k,sanitize_text_field($_POST['kp_'.$k]??''));
        update_post_meta($id,'_kp_ensemble_url',esc_url_raw($_POST['kp_url']??''));
        update_post_meta($id,'_kp_ensemble_featured',isset($_POST['kp_featured'])?'1':'0');
    }
    public static function admin_menu() {
        add_submenu_page('kp-puppenspiele','Ensemble','Ensemble','edit_posts','edit.php?post_type='.self::POST_TYPE);
        add_submenu_page('kp-puppenspiele','Ensemble importieren','Ensemble importieren','manage_options','kp-ensemble-import',[__CLASS__,'import_page']);
    }
    public static function import_page() {
        echo '<div class="wrap"><h1>Ensemble übernehmen</h1><p>Vorbereitet sind die drei Hauptprofile sowie die aktuell genannten Mitwirkenden im Bereich „Außerdem unverzichtbar“.</p>';
        echo '<p>Die alten Vita-Texte werden als bearbeitbarer Ausgangsstand übernommen. Zeitabhängige Angaben können anschließend bequem aktualisiert werden.</p>';
        echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="kp_import_ensemble">';
        wp_nonce_field('kp_import_ensemble'); submit_button('Ensemble jetzt importieren'); echo '</form></div>';
    }
    public static function handle_import() {
        if(!current_user_can('manage_options')) wp_die('Keine Berechtigung.');
        check_admin_referer('kp_import_ensemble');
        $items=json_decode(file_get_contents(KP_CORE_DIR.'data/legacy-ensemble.json'),true);
        require_once ABSPATH.'wp-admin/includes/file.php'; require_once ABSPATH.'wp-admin/includes/media.php'; require_once ABSPATH.'wp-admin/includes/image.php';
        $created=0;$skipped=0;
        foreach($items as $i=>$item){
            $existing=get_page_by_path($item['slug'],OBJECT,self::POST_TYPE);
            if($existing){$skipped++;continue;}
            $id=wp_insert_post(['post_type'=>self::POST_TYPE,'post_status'=>'publish','post_title'=>$item['title'],'post_name'=>$item['slug'],
                'post_content'=>wp_kses_post('<p>'.esc_html($item['bio']).'</p>'),'menu_order'=>$i]);
            if(is_wp_error($id)) continue;
            foreach(['role','born','short'] as $k) update_post_meta($id,'_kp_ensemble_'.$k,sanitize_text_field($item[$k]??''));
            update_post_meta($id,'_kp_ensemble_url',esc_url_raw($item['url']??''));
            update_post_meta($id,'_kp_ensemble_featured',!empty($item['featured'])?'1':'0');
            $img=KP_CORE_DIR.'assets/legacy-ensemble/'.basename($item['bundled_image']??'');
            if(!empty($item['bundled_image'])&&file_exists($img)){
                $up=wp_upload_bits(basename($img),null,file_get_contents($img));
                if(empty($up['error'])){
                    $ft=wp_check_filetype($up['file'],null);
                    $aid=wp_insert_attachment(['post_mime_type'=>$ft['type'],'post_title'=>$item['title'],'post_status'=>'inherit'],$up['file'],$id);
                    if(!is_wp_error($aid)){wp_update_attachment_metadata($aid,wp_generate_attachment_metadata($aid,$up['file']));set_post_thumbnail($id,$aid);}
                }
            }
            $created++;
        }
        wp_safe_redirect(add_query_arg(['page'=>'kp-puppenspiele','kp_ens_created'=>$created,'kp_ens_skipped'=>$skipped],admin_url('admin.php')));exit;
    }
    public static function maybe_flush_rewrites() {
        if ( get_option('kp_ensemble_rewrite_version') !== '3.2.3' ) {
            flush_rewrite_rules(false);
            update_option('kp_ensemble_rewrite_version','3.2.3');
        }
    }
    public static function ensure_pages() {
        self::ensure_page('das-theater','Das Theater','[kp_theater_intro]');
    }
    private static function ensure_page($slug,$title,$content){
        $p=get_page_by_path($slug,OBJECT,'page');
        if(!$p) return wp_insert_post(['post_type'=>'page','post_status'=>'publish','post_title'=>$title,'post_name'=>$slug,'post_content'=>$content,'comment_status'=>'closed']);
        if(trim((string)$p->post_content)==='') wp_update_post(['ID'=>$p->ID,'post_content'=>$content]);
        return $p->ID;
    }
    public static function theater_intro() {
        ob_start(); ?>
        <section class="kp-theater-story">
          <p class="kp-kicker">Seit 1995</p>
          <h2>Figurentheater aus Leidenschaft</h2>
          <div class="kp-theater-copy">
            <div class="kp-theater-fact"><span class="kp-theater-icon" aria-hidden="true">◉</span><p>1995 von Björn Christian Küpper in Cochem gegründet, arbeiten die Koblenzer Puppenspiele seit 2010 professionell unter ihrem heutigen Namen.</p></div>
            <div class="kp-theater-fact"><span class="kp-theater-icon" aria-hidden="true">◇</span><p>Das Repertoire reicht von Märchen und Kinderbuchinterpretationen über traditionelle Kasperspiele und Sagen bis zu Uraufführungen und Stoffen der Weltliteratur.</p></div>
            <div class="kp-theater-fact"><span class="kp-theater-icon" aria-hidden="true">♙</span><p>Neben anderen Spielformen pflegt das Ensemble besonders die Kunst des Marionettentheaters im Guckkasten. Die Koblenzer Puppenspiele sind Mitglied der UNIMA und wurden mit Kulturpreisen ausgezeichnet.</p></div>
          </div>
          <blockquote>Mit liebevollen und heiteren Spielen möchten wir Raum zum Träumen und Fantasieren schenken.</blockquote>
        </section>
        <?php echo self::shortcode(['full'=>'1']); return ob_get_clean();
    }
    public static function shortcode($atts=[]) {
        $q=new WP_Query(['post_type'=>self::POST_TYPE,'post_status'=>'publish','posts_per_page'=>-1,'orderby'=>['menu_order'=>'ASC','title'=>'ASC']]);
        if(!$q->have_posts()) return '<p>Noch keine Ensembleprofile angelegt.</p>';
        $main=[];$helpers=[];
        while($q->have_posts()){ $q->the_post(); $id=get_the_ID(); if(get_post_meta($id,'_kp_ensemble_featured',true)==='1') $main[]=$id; else $helpers[]=$id; }
        wp_reset_postdata();
        ob_start(); ?>
        <section class="kp-ensemble-section">
          <p class="kp-kicker">Die Menschen dahinter</p><h2>Das Ensemble</h2>
          <div class="kp-ensemble-grid">
          <?php foreach($main as $id): $img=get_the_post_thumbnail_url($id,'full'); ?>
            <article class="kp-person-card">
              <a href="<?php echo esc_url( add_query_arg( [ 'post_type' => self::POST_TYPE, 'p' => $id ], home_url( '/' ) ) ); ?>">
                <div class="kp-person-image"><?php if($img):?><img src="<?php echo esc_url($img);?>" alt="<?php echo esc_attr(get_the_title($id));?>"><?php endif;?></div>
                <div class="kp-person-copy"><h3><?php echo esc_html(get_the_title($id));?></h3>
                <p class="kp-person-role"><?php echo esc_html(get_post_meta($id,'_kp_ensemble_role',true));?></p>
                <p><?php echo esc_html(get_post_meta($id,'_kp_ensemble_short',true));?></p><span>Mehr Infos →</span></div>
              </a>
            </article>
          <?php endforeach;?>
          </div>
          <?php if($helpers):?><div class="kp-helpers"><h3>Außerdem unverzichtbar …</h3><div class="kp-helper-grid">
          <?php foreach($helpers as $id): $img=get_the_post_thumbnail_url($id,'full'); $url=get_post_meta($id,'_kp_ensemble_url',true);?>
            <article class="kp-helper"><?php if($url):?><a href="<?php echo esc_url($url);?>" target="_blank" rel="noopener"><?php endif;?>
              <?php if($img):?><img src="<?php echo esc_url($img);?>" alt="<?php echo esc_attr(get_the_title($id));?>"><?php endif;?>
              <strong><?php echo esc_html(get_the_title($id));?></strong><small><?php echo esc_html(get_post_meta($id,'_kp_ensemble_role',true));?></small>
            <?php if($url):?></a><?php endif;?></article>
          <?php endforeach;?></div></div><?php endif;?>
        </section>
        <?php return ob_get_clean();
    }
}
