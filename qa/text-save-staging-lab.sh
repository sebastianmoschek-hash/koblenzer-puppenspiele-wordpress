#!/usr/bin/env bash
set -euo pipefail

STAGING_BASE="${STAGING_BASE:-https://neu.koblenzer-puppenspiele.de}"
PLUGIN='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2'
MU='wp-content/mu-plugins'
export LFTP_PASSWORD="${STAGING_FTP_PASSWORD:-${LFTP_PASSWORD:-}}"
: "${STAGING_FTP_SERVER:?STAGING_FTP_SERVER fehlt}"
: "${STAGING_FTP_USERNAME:?STAGING_FTP_USERNAME fehlt}"
: "${LFTP_PASSWORD:?STAGING_FTP_PASSWORD fehlt}"

ftp_cmd(){
  lftp -c "set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; set net:max-retries 2; set net:timeout 20; open --user '$STAGING_FTP_USERNAME' --env-password -p 21 '$STAGING_FTP_SERVER'; $1; bye"
}

cleanup(){ ftp_cmd "rm -f /wp-content/mu-plugins/kp-e2e-text-save.php" >/dev/null 2>&1 || true; }
trap cleanup EXIT

if [[ "${KP_TEXT_SAVE_SKIP_DEPLOY:-0}" == '1' ]]; then
  echo 'Reusing the staging deployment from the main homepage lab for text-save E2E.'
else
  echo 'Deploying exact editor/MU code for isolated staging text-save test.'
  ftp_cmd "mirror -R --verbose --transfer-all --no-perms --parallel=2 '$PLUGIN' '/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2'; mkdir -p /wp-content/mu-plugins; rm -f /wp-content/mu-plugins/kp-openrouter-bridge.php; mirror -R --verbose --transfer-all --no-perms --parallel=2 --exclude-glob 'kp-openrouter-bridge.php' '$MU' '/wp-content/mu-plugins'"
fi

E2E_TOKEN="$(openssl rand -hex 32)"
# The CircleCI wrapper allows this browser gate up to 15 minutes. Keep the
# temporary staging login valid beyond that entire bounded window plus setup
# and cleanup time, otherwise a slow but healthy run can turn into a false 403
# near the final Save→Reload→DB readback.
expires=$(( $(date +%s) + 1800 ))
cat > /tmp/kp-e2e-text-save.php <<PHP
<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }
define( 'KP_E2E_TEXT_TOKEN', '${E2E_TOKEN}' );
define( 'KP_E2E_TEXT_EXPIRES', ${expires} );
function kp_e2e_text_allowed( \$raw ) {
    return time() <= KP_E2E_TEXT_EXPIRES
        && 'neu.koblenzer-puppenspiele.de' === strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) )
        && is_string( \$raw ) && hash_equals( KP_E2E_TEXT_TOKEN, \$raw );
}
function kp_e2e_text_map() { return array(
    'frontend_global' => 'kp_frontend_editor_global_v1',
    'frontend_pages'  => 'kp_frontend_editor_pages_v1',
    'history'         => 'kp_owner_history_v1'
); }
add_action( 'init', static function () {
    \$raw=isset(\$_GET['kp_e2e_login'])?(string)wp_unslash(\$_GET['kp_e2e_login']):'';
    if(!kp_e2e_text_allowed(\$raw))return;
    \$admins=get_users(array('role'=>'administrator','number'=>1,'fields'=>'ID'));
    if(!\$admins)wp_die('No staging administrator available.');
    \$id=(int)\$admins[0];wp_set_current_user(\$id);wp_set_auth_cookie(\$id,false,is_ssl());
    wp_safe_redirect(add_query_arg(array('kp_edit'=>'1','kp_e2e_text'=>'1'),home_url('/')));exit;
},1);
function kp_e2e_text_guard(){
    \$raw=isset(\$_POST['token'])?(string)wp_unslash(\$_POST['token']):'';
    if(!current_user_can('manage_options')||!kp_e2e_text_allowed(\$raw))wp_send_json_error(array('message'=>'E2E denied.'),403);
}
add_action('wp_ajax_kp_e2e_text_state',static function(){
    kp_e2e_text_guard();\$data=array();\$exists=array();
    foreach(kp_e2e_text_map() as \$key=>\$option){\$sentinel=new stdClass();\$value=get_option(\$option,\$sentinel);\$exists[\$key]=\$value!==\$sentinel;\$data[\$key]=\$value!==\$sentinel?\$value:array();}
    \$data['_exists']=\$exists;wp_send_json_success(\$data);
});
add_action('wp_ajax_kp_e2e_text_restore',static function(){
    kp_e2e_text_guard();\$snapshot=isset(\$_POST['snapshot'])?json_decode(wp_unslash(\$_POST['snapshot']),true):null;
    if(!is_array(\$snapshot))wp_send_json_error(array('message'=>'Invalid snapshot.'),400);
    \$exists=isset(\$snapshot['_exists'])&&is_array(\$snapshot['_exists'])?\$snapshot['_exists']:array();
    foreach(kp_e2e_text_map() as \$key=>\$option){if(array_key_exists(\$key,\$exists)&&!\$exists[\$key]){delete_option(\$option);continue;}update_option(\$option,isset(\$snapshot[\$key])?\$snapshot[\$key]:array(),false);}
    if(function_exists('wp_cache_flush'))wp_cache_flush();wp_send_json_success(array('message'=>'restored'));
});
PHP
php -l /tmp/kp-e2e-text-save.php >/dev/null
ftp_cmd "mkdir -p /wp-content/mu-plugins; put /tmp/kp-e2e-text-save.php -o /wp-content/mu-plugins/kp-e2e-text-save.php"

export KP_E2E_BASE="$STAGING_BASE" KP_E2E_TOKEN="$E2E_TOKEN"
node qa/text-save-staging-e2e.mjs

echo 'PASS: isolated staging text-save lab.'
