<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
$GLOBALS['kp_test_options'] = array();
$GLOBALS['kp_test_blocks'] = array();
$GLOBALS['kp_serialized_blocks'] = array();
$GLOBALS['kp_post_updates'] = 0;
function wp_json_encode($v){ return json_encode($v); }
function sanitize_key($v){ return preg_replace('/[^a-z0-9_\-]/','',strtolower((string)$v)); }
function sanitize_text_field($v){ return trim(strip_tags((string)$v)); }
function wp_unslash($v){ return $v; }
function esc_url_raw($v){ return (string)$v; }
function absint($v){ return abs((int)$v); }
function sanitize_hex_color($v){ return preg_match('/^#[0-9a-f]{3}([0-9a-f]{3})?$/i',(string)$v) ? $v : null; }
function wp_kses_post($v){ return (string)$v; }
function esc_attr($v){ return htmlspecialchars((string)$v,ENT_QUOTES); }
function is_admin(){ return false; }
function get_option($key,$default=array()){ return $GLOBALS['kp_test_options'][$key] ?? $default; }
function add_option($key,$value=''){ if(array_key_exists($key,$GLOBALS['kp_test_options'])) return false; $GLOBALS['kp_test_options'][$key]=$value; return true; }
function delete_option($key){ unset($GLOBALS['kp_test_options'][$key]); return true; }
function get_queried_object_id(){ return 17; }
function current_user_can(...$args){ return true; }
function get_post($id){ return (object)array('ID'=>(int)$id,'post_content'=>'CURRENT-GUTENBERG-CONTENT'); }
function parse_blocks($content){ return $GLOBALS['kp_test_blocks']; }
function serialize_blocks($blocks){ $GLOBALS['kp_serialized_blocks']=$blocks; return 'SERIALIZED-GUTENBERG-CONTENT'; }
function wp_slash($v){ return $v; }
function wp_update_post($v,$wp_error=false){ $GLOBALS['kp_post_updates']++; return 17; }
function is_wp_error($v){ return false; }
function wp_generate_uuid4(){ static $i=0; $i++; return sprintf('00000000-0000-4000-8000-%012d',$i); }

require __DIR__ . '/../wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/includes/class-kp-frontend-editor-v2.php';
function fail_test(string $message): void { fwrite(STDERR,"FAIL frontend section runtime: $message\n"); exit(1); }
$class = new ReflectionClass('KP_Frontend_Editor_V2');
$key_method = $class->getMethod('block_key'); $key_method->setAccessible(true);
$apply_method = $class->getMethod('apply_section_actions'); $apply_method->setAccessible(true);
$render_method = $class->getMethod('render_block');
$child = array('blockName'=>'core/heading','attrs'=>array(),'innerHTML'=>'<h2>Original</h2>','innerContent'=>array('<h2>Original</h2>'),'innerBlocks'=>array());
$source = array(
  'blockName'=>'core/group','attrs'=>array(),
  'innerHTML'=>'<div id="source-root" aria-describedby="source-root" class="wp-block-group"></div>',
  'innerContent'=>array('<div id="source-root" aria-describedby="source-root" class="wp-block-group">',null,'</div>'),
  'innerBlocks'=>array($child),
);
$source_key = $key_method->invoke(null,$source);
$GLOBALS['kp_test_blocks']=array($source);
$copy_anchor='kp-copy-abc'; $copy_key='a-'.$copy_anchor;
$page=array('blocks'=>array($source_key=>array('styles'=>array('mobile'=>array('hidden'=>1)))),'dom'=>array(),'order'=>array($source_key,$copy_key,'b-two'),'section_actions'=>array(array('type'=>'duplicate','key'=>$source_key,'token'=>$copy_anchor)));
$args=array(&$page,'post-17');
$created=$apply_method->invokeArgs(null,$args);
if($created!==1) fail_test('erste native Gutenberg-Kopie wurde nicht erstellt');
if($GLOBALS['kp_post_updates']!==1) fail_test('native Kopie wurde nicht revisionsfähig über wp_update_post gespeichert');
if(count($GLOBALS['kp_serialized_blocks'])!==2) fail_test('serialisierte Gutenberg-Struktur enthält nicht genau Original und Kopie');
$original=$GLOBALS['kp_serialized_blocks'][0]; $copy=$GLOBALS['kp_serialized_blocks'][1];
$source_anchor=(string)($original['attrs']['anchor']??''); $stable_source_key='a-'.$source_anchor;
if(strpos($source_anchor,'kp-section-')!==0) fail_test('Originalbereich erhielt keine stabile Abschnitts-UUID');
if(strpos($original['innerHTML'],'id="'.$source_anchor.'"')===false) fail_test('Original-UUID und Wrapper-HTML sind nicht synchron');
if(($original['innerBlocks'][0]['innerHTML']??'')!==$child['innerHTML']) fail_test('Inhalt des Originals wurde bei der UUID-Migration verändert');
if(!isset($page['blocks'][$stable_source_key]) || isset($page['blocks'][$source_key])) fail_test('Editorzustand des Originals wurde nicht auf die stabile UUID umgehängt');
if(($page['order'][0]??'')!==$stable_source_key) fail_test('Reihenfolge verwendet nach Migration weiterhin den Inhalts-Hash');
if(($copy['attrs']['anchor']??'')!==$copy_anchor) fail_test('Kopie besitzt keinen stabilen Anchor');
if(strpos($copy['innerHTML'],'id="'.$copy_anchor.'"')===false) fail_test('Kopien-HTML stimmt nicht mit dem Anchor überein');
if(strpos((string)$copy['innerContent'][0],'id="'.$copy_anchor.'"')===false) fail_test('serialisiertes Wrapperfragment stimmt nicht mit dem Anchor überein');
if(strpos($copy['innerHTML'],'aria-describedby="'.$copy_anchor.'"')===false) fail_test('Root-ID-Referenz wurde nicht auf den neuen Anchor umgeschrieben');
$rendered=$render_method->invoke(null,'<section id="'.$copy_anchor.'" aria-labelledby="title-one external-label"><h2 id="title-one" data-kp-edit-key="b-child">Titel</h2><a href="#title-one">Sprung</a></section>',$copy);
if(strpos($rendered,'data-kp-edit-key="'.$copy_key.'"')===false) fail_test('gespeicherte Kopie rendert keinen stabilen Root-Schlüssel');
if(strpos($rendered,'data-kp-edit-key="dup-'.$copy_anchor.'-b-child"')===false) fail_test('gespeicherte Kopie rendert keinen namespaceten Kindschlüssel');
if(strpos($rendered,'id="'.$copy_anchor.'-title-one"')===false) fail_test('gespeicherte Kopie rendert keine eindeutige Kind-ID');
if(strpos($rendered,'aria-labelledby="'.$copy_anchor.'-title-one external-label"')===false) fail_test('lokale oder externe ARIA-Referenzen der gespeicherten Kopie sind falsch');
if(strpos($rendered,'href="#'.$copy_anchor.'-title-one"')===false) fail_test('lokale Ankerreferenz der gespeicherten Kopie ist falsch');
if(isset($page['duplicates'])) fail_test('verwerfbare Metadatenkopien werden weiterhin gespeichert');
if(count(array_keys($page['order'],$copy_key,true))!==1) fail_test('Kopieschlüssel steht mehrfach in order');

// Derselbe Token darf auch bei einer Wiederholung keine zweite Kopie erzeugen.
$GLOBALS['kp_test_blocks']=$GLOBALS['kp_serialized_blocks'];
$repeat=array('blocks'=>array(),'dom'=>array(),'order'=>$page['order'],'section_actions'=>array(array('type'=>'duplicate','key'=>$source_key,'token'=>$copy_anchor)));
$repeat_args=array(&$repeat,'post-17');
if($apply_method->invokeArgs(null,$repeat_args)!==0 || $GLOBALS['kp_post_updates']!==1) fail_test('derselbe Token ist nicht idempotent');

// Eine spätere Änderung des Originals darf die echte Kopie nicht verschwinden lassen.
$GLOBALS['kp_test_blocks'][0]['innerHTML']='<div id="'.$source_anchor.'" class="wp-block-group changed"></div>';
if(count($GLOBALS['kp_test_blocks'])!==2 || ($GLOBALS['kp_test_blocks'][1]['attrs']['anchor']??'')!==$copy_anchor) fail_test('Kopie hängt weiterhin vom Inhalts-Hash des Originals ab');
if($key_method->invoke(null,$GLOBALS['kp_test_blocks'][0])!==$stable_source_key) fail_test('Originalbereich verliert seine Identität nach Gutenberg-Inhaltsänderung');

// Eine gespeicherte Kopie muss selbst erneut duplizierbar sein.
$copy_source_key=$key_method->invoke(null,$GLOBALS['kp_test_blocks'][1]);
$nested_anchor='kp-copy-def';
$again=array('blocks'=>array(),'dom'=>array(),'order'=>array($copy_source_key,'a-'.$nested_anchor),'section_actions'=>array(array('type'=>'duplicate','key'=>$copy_source_key,'token'=>$nested_anchor)));
$again_args=array(&$again,'post-17');
if($apply_method->invokeArgs(null,$again_args)!==1 || count($GLOBALS['kp_serialized_blocks'])!==3) fail_test('gespeicherte Kopie kann nicht erneut dupliziert werden');

// Mehr als 40 echte Kopien dürfen keine ältere sichtbare Kopie löschen.
$many=array($original);
for($i=1;$i<=40;$i++){ $b=$source; $b['attrs']['anchor']='kp-copy-old-'.$i; $b['innerHTML']='<div id="kp-copy-old-'.$i.'" class="wp-block-group"></div>'; $many[]=$b; }
$GLOBALS['kp_test_blocks']=$many;
$forty_one=array('blocks'=>array(),'dom'=>array(),'order'=>array(),'section_actions'=>array(array('type'=>'duplicate','key'=>$stable_source_key,'token'=>'kp-copy-41')));
$forty_one_args=array(&$forty_one,'post-17');
if($apply_method->invokeArgs(null,$forty_one_args)!==1 || count($GLOBALS['kp_serialized_blocks'])!==42) fail_test('41. Kopie verwirft eine ältere Kopie');

// Identische Altbereiche müssen beim ersten Speichern positionsgetreu eigene UUIDs erhalten.
$GLOBALS['kp_test_blocks']=array($source,$source);
$twins=array('blocks'=>array($source_key=>array('styles'=>array('mobile'=>array('hidden'=>1)))),'dom'=>array(),'order'=>array($source_key,$source_key),'section_actions'=>array());
$twins_args=array(&$twins,'post-17');
$apply_method->invokeArgs(null,$twins_args);
$twin_keys=array_map(static function($block) use($key_method){ return $key_method->invoke(null,$block); },$GLOBALS['kp_serialized_blocks']);
if(count(array_unique($twin_keys))!==2) fail_test('identische Altbereiche erhielten keine unterschiedlichen UUIDs');
if($twins['order']!==$twin_keys) fail_test('identische Altbereiche wurden in order nicht positionsgetreu auf UUIDs verteilt');
foreach($twin_keys as $key){ if(!isset($twins['blocks'][$key])) fail_test('Editorzustand eines identischen Altbereichs ging bei der UUID-Migration verloren'); }

echo "PASS frontend section runtime: stable native Gutenberg copies, revisions, idempotency and no copy cap.\n";
