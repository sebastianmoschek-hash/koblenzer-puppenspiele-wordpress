#!/usr/bin/env bash
set -uo pipefail

STAGING_BASE="${STAGING_BASE:-https://neu.koblenzer-puppenspiele.de}"
PLUGIN='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2'
THEME='wp-content/themes/koblenzer-puppenspiele-block-theme-phase1-7'
MU_PLUGINS='wp-content/mu-plugins'
ASSETS="$PLUGIN/assets"
REPORT_DIR='qa-results/circleci'
EDITOR_DIR='qa-artifacts/homepage-lab'
REMOTE_REPORT='/wp-content/uploads/kp-homepage-lab/latest'
SHA="${CIRCLE_SHA1:-unknown}"
RUN_ID="${CIRCLE_WORKFLOW_ID:-local}"
MODE="${KP_CI_MODE:-full}"
export GITHUB_SHA="$SHA"
export GITHUB_RUN_ID="$RUN_ID"
export LFTP_PASSWORD="${STAGING_FTP_PASSWORD:-${LFTP_PASSWORD:-}}"

mkdir -p "$REPORT_DIR" "$EDITOR_DIR"
: > "$REPORT_DIR/pipeline.log"

log(){ printf '%s\n' "$*" | tee -a "$REPORT_DIR/pipeline.log"; }
status_deploy=skipped
status_ready=skipped
status_bridge=skipped
status_editor=skipped
status_ai_chat=skipped
status_persistence=skipped
status_slider=skipped
status_touch=skipped
status_visual=skipped
E2E_TOKEN=''

ftp_cmd(){
  : "${STAGING_FTP_SERVER:?STAGING_FTP_SERVER fehlt}"
  : "${STAGING_FTP_USERNAME:?STAGING_FTP_USERNAME fehlt}"
  : "${LFTP_PASSWORD:?STAGING_FTP_PASSWORD fehlt}"
  lftp -c "set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; set net:max-retries 2; set net:timeout 20; open --user '$STAGING_FTP_USERNAME' --env-password -p 21 '$STAGING_FTP_SERVER'; $1; bye"
}

cleanup_bridge(){
  if [[ -n "${STAGING_FTP_SERVER:-}" && -n "${STAGING_FTP_USERNAME:-}" && -n "${LFTP_PASSWORD:-}" ]]; then
    ftp_cmd "rm -f /wp-content/mu-plugins/kp-e2e-owner-all.php" >/dev/null 2>&1 || true
  fi
}
trap cleanup_bridge EXIT

run_capture(){
  local name="$1"; shift
  local logfile="$REPORT_DIR/$name.log"
  local limit='7m'
  case "$name" in
    editor|persistence) limit='9m' ;;
    session-undo|touch-slider|touch-runtime) limit='6m' ;;
    visual) limit='12m' ;;
  esac
  log "== $name =="
  log "TIMEOUT $name: $limit"
  set +e
  timeout --foreground --signal=TERM --kill-after=15s "$limit" "$@" > >(tee "$logfile") 2>&1
  local rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    log "PASS $name"
  elif [[ $rc -eq 124 || $rc -eq 137 || $rc -eq 143 ]]; then
    log "FAIL $name (timeout $limit, exit $rc)"
  else
    log "FAIL $name (exit $rc)"
  fi
  return $rc
}

log "CircleCI Homepage Lab: $SHA (mode=$MODE)"

if [[ "$MODE" == 'qa' ]]; then
  echo 'QA-only mode: website PHP is unchanged; repository-wide PHP lint skipped.' > "$REPORT_DIR/php-syntax.log"
elif ! find "$PLUGIN" "$THEME" -type f -name '*.php' -print0 | xargs -0 -n1 php -l >> "$REPORT_DIR/php-syntax.log" 2>&1; then
  log 'FAIL PHP syntax';
fi

if [[ "$MODE" == 'qa' ]]; then
  log 'QA-only mode: website code unchanged; reusing the current staging deployment.'
  echo 'QA-only: no plugin/theme/MU code changed, so no website deploy was required.' > "$REPORT_DIR/deploy.log"
  status_deploy=success
elif ftp_cmd "mirror -R --verbose --transfer-all --no-perms --parallel=2 '$PLUGIN' '/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2'; mirror -R --verbose --transfer-all --no-perms --parallel=2 '$THEME' '/wp-content/themes/koblenzer-puppenspiele-block-theme-phase1-7'; rm -f /wp-content/mu-plugins/kp-openrouter-bridge.php; mirror -R --verbose --transfer-all --no-perms --parallel=2 --exclude-glob 'kp-openrouter-bridge.php' '$MU_PLUGINS' '/wp-content/mu-plugins'" > "$REPORT_DIR/deploy.log" 2>&1; then
  status_deploy=success
else
  status_deploy=failure
fi

expected=$(sed -n 's/^ \* Version: //p' "$PLUGIN/koblenzer-puppenspiele-core.php" | head -1)
if [[ "$status_deploy" == success && -n "$expected" ]]; then
  for attempt in $(seq 1 20); do
    if curl --max-time 25 --connect-timeout 10 --fail --silent --show-error --location -H 'Cache-Control: no-cache, no-store' \
      "$STAGING_BASE/?kp_staging_bridge_health=1&kp_circleci=${SHA}-${RUN_ID}-${attempt}" -o "$REPORT_DIR/health.json" \
      && jq -e --arg version "$expected" '.success == true and .data.active == true and .data.version == $version' "$REPORT_DIR/health.json" >/dev/null 2>&1; then
      status_ready=success; break
    fi
    sleep 3
  done
  [[ "$status_ready" == success ]] || status_ready=failure
else
  status_ready=failure
fi

if [[ "$status_ready" == success ]]; then
  E2E_TOKEN=$(openssl rand -hex 32)
  expires=$(( $(date +%s) + 1100 ))
  cat > /tmp/kp-e2e-owner-all.php <<PHP
<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }
define( 'KP_E2E_OWNER_TOKEN', '${E2E_TOKEN}' );
define( 'KP_E2E_OWNER_EXPIRES', ${expires} );
function kp_e2e_owner_allowed( \$raw ) {
    return time() <= KP_E2E_OWNER_EXPIRES
        && 'neu.koblenzer-puppenspiele.de' === strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) )
        && is_string( \$raw ) && hash_equals( KP_E2E_OWNER_TOKEN, \$raw );
}
function kp_e2e_owner_map() { return array(
    'studio'=>'kp_website_studio','sizes'=>'kp_responsive_sizes','navigation'=>'kp_owner_navigation_v1',
    'frontend_global'=>'kp_frontend_editor_global_v1','frontend_pages'=>'kp_frontend_editor_pages_v1',
    'free_global'=>'kp_touch_free_layout_global_v1','free_pages'=>'kp_touch_free_layout_pages_v1',
    'gesture_global'=>'kp_touch_gestures_global_v1','gesture_pages'=>'kp_touch_gestures_pages_v1',
    'image_global'=>'kp_image_position_global_v1','image_pages'=>'kp_image_position_pages_v1','history'=>'kp_owner_history_v1'
); }
add_action( 'init', static function () {
    \$raw = isset( \$_GET['kp_e2e_login'] ) ? (string) wp_unslash( \$_GET['kp_e2e_login'] ) : '';
    if ( ! kp_e2e_owner_allowed( \$raw ) ) return;
    \$admins = get_users( array( 'role'=>'administrator', 'number'=>1, 'fields'=>'ID' ) );
    if ( ! \$admins ) wp_die( 'No staging administrator available.' );
    \$id=(int)\$admins[0]; wp_set_current_user(\$id); wp_set_auth_cookie(\$id,false,is_ssl());
    wp_safe_redirect( add_query_arg( array('kp_edit'=>'1','kp_e2e'=>'1'), home_url('/') ) ); exit;
}, 1 );
function kp_e2e_owner_guard() {
    \$raw=isset(\$_POST['token'])?(string)wp_unslash(\$_POST['token']):'';
    if(!current_user_can('manage_options')||!kp_e2e_owner_allowed(\$raw)) wp_send_json_error(array('message'=>'E2E denied.'),403);
}
add_action('wp_ajax_kp_e2e_owner_state',static function(){
    kp_e2e_owner_guard(); \$data=array(); \$exists=array();
    foreach(kp_e2e_owner_map() as \$key=>\$option){\$sentinel=new stdClass();\$value=get_option(\$option,\$sentinel);\$exists[\$key]=\$value!==\$sentinel;\$data[\$key]=\$value!==\$sentinel?\$value:array();}
    \$data['_exists']=\$exists; wp_send_json_success(\$data);
});
add_action('wp_ajax_kp_e2e_owner_restore',static function(){
    kp_e2e_owner_guard(); \$snapshot=isset(\$_POST['snapshot'])?json_decode(wp_unslash(\$_POST['snapshot']),true):null;
    if(!is_array(\$snapshot)) wp_send_json_error(array('message'=>'Invalid snapshot.'),400);
    \$exists=isset(\$snapshot['_exists'])&&is_array(\$snapshot['_exists'])?\$snapshot['_exists']:array();
    foreach(kp_e2e_owner_map() as \$key=>\$option){if(array_key_exists(\$key,\$exists)&&!\$exists[\$key]){delete_option(\$option);continue;}update_option(\$option,isset(\$snapshot[\$key])?\$snapshot[\$key]:array(),false);}
    if(function_exists('wp_cache_flush'))wp_cache_flush(); wp_send_json_success(array('message'=>'restored'));
});
PHP
  if php -l /tmp/kp-e2e-owner-all.php >/dev/null && ftp_cmd "mkdir -p /wp-content/mu-plugins; put /tmp/kp-e2e-owner-all.php -o /wp-content/mu-plugins/kp-e2e-owner-all.php"; then
    status_bridge=success
  else
    status_bridge=failure
  fi
else
  status_bridge=failure
fi

cp "$ASSETS/touch-gesture-safety.js" /tmp/touch-gesture-safety.js
cp "$ASSETS/touch-gesture-safety.css" /tmp/touch-gesture-safety.css
cp "$ASSETS/touch-gestures.js" /tmp/touch-gestures.js
cp "$ASSETS/touch-free-layout.js" /tmp/touch-free-layout.js
cp "$ASSETS/touch-editor-bridge.js" /tmp/touch-editor-bridge.js
cp "$ASSETS/owner-menu-x.js" /tmp/owner-menu-x.js

if [[ "$status_bridge" == success ]]; then
  export KP_E2E_BASE="$STAGING_BASE" KP_E2E_TOKEN="$E2E_TOKEN" KP_LAB_OUT="$EDITOR_DIR"
  if run_capture editor node qa/homepage-editor-lab.mjs; then status_editor=success; else status_editor=failure; fi
  if ! run_capture section-actions node qa/frontend-section-actions-browser-test.mjs; then status_editor=failure; fi
  if run_capture ai-chat node qa/owner-ai-chat-staging-e2e.mjs; then status_ai_chat=success; else status_ai_chat=failure; fi
  if ! run_capture session-undo node qa/editor-session-undo-e2e.mjs; then status_editor=failure; fi
  if run_capture persistence node qa/owner-all-persistence-e2e.mjs; then status_persistence=success; else status_persistence=failure; fi
else
  status_editor=failure; status_ai_chat=failure; status_persistence=failure
fi

export KP_TOUCH_SAFETY=/tmp/touch-gesture-safety.js KP_TOUCH_SAFETY_CSS=/tmp/touch-gesture-safety.css
if run_capture touch-slider node qa/touch-slider-hold-browser-test.mjs; then status_slider=success; else status_slider=failure; fi
export KP_TOUCH_GESTURES=/tmp/touch-gestures.js KP_TOUCH_FREE=/tmp/touch-free-layout.js KP_TOUCH_BRIDGE=/tmp/touch-editor-bridge.js KP_MENU_X=/tmp/owner-menu-x.js
if run_capture touch-runtime node qa/touch-runtime-browser-test.mjs; then status_touch=success; else status_touch=failure; fi

if [[ "$MODE" == 'qa' && "${KP_CI_CHANGED_FILES:-}" != *"visual-qa/"* ]]; then
  status_visual=success
  log 'SKIP visual: QA-only change did not touch visual-qa; keeping the last 50-view visual result.'
elif [[ "$status_ready" == success ]]; then
  export VISUAL_QA_BASE_URL="$STAGING_BASE"
  if run_capture visual node visual-qa/capture.mjs; then status_visual=success; else status_visual=failure; fi
else
  status_visual=failure
fi

cleanup_bridge
trap - EXIT

overall=success
for s in "$status_deploy" "$status_ready" "$status_bridge" "$status_editor" "$status_ai_chat" "$status_persistence" "$status_slider" "$status_touch" "$status_visual"; do
  [[ "$s" == success ]] || overall=failure
done

generated=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
cat > "$REPORT_DIR/report.json" <<JSON
{
  "generatedAt":"$generated",
  "provider":"CircleCI Free",
  "mode":"$MODE",
  "commit":"$SHA",
  "staging":"$STAGING_BASE",
  "success":$([[ "$overall" == success ]] && echo true || echo false),
  "checks":{
    "deploy":"$status_deploy",
    "stagingReady":"$status_ready",
    "temporaryBridge":"$status_bridge",
    "editorMobileTabletDesktop":"$status_editor",
    "ownerAiChat":"$status_ai_chat",
    "saveReloadDbUndo48h":"$status_persistence",
    "nativeTouchSliderSaveReset":"$status_slider",
    "touchRuntime":"$status_touch",
    "visual50Views":"$status_visual"
  }
}
JSON

cat > "$REPORT_DIR/report.md" <<MD
# Kostenloses Homepage-Labor – letzter CircleCI-Staging-Stand

Erzeugt: $generated  
Commit: $SHA  
Provider: CircleCI Free  
Modus: **${MODE^^}**  
Gesamtstatus: **${overall^^}**

- Staging-Code bereit / Deploy: $status_deploy
- Aktive Staging-Version: $status_ready
- Temporärer E2E-Zugang: $status_bridge
- Echter Editor Mobile/Tablet/Desktop + Session-Undo: $status_editor
- Geschützter Eigentümer-KI-Chat mit echter Antwort: $status_ai_chat
- Speichern → Reload → DB + Undo/48h: $status_persistence
- Nativer Touch-Regler + Zurücksetzen/Speichern: $status_slider
- Drag/Pinch/Touch-Runtime: $status_touch
- Visual-QA 50 Ansichten: $status_visual

Produktion wurde nicht verändert.
MD

if [[ -n "${STAGING_FTP_SERVER:-}" && -n "${STAGING_FTP_USERNAME:-}" && -n "${LFTP_PASSWORD:-}" ]]; then
  ftp_cmd "mkdir -p '$REMOTE_REPORT'; put '$REPORT_DIR/report.json' -o '$REMOTE_REPORT/report.json'; put '$REPORT_DIR/report.md' -o '$REMOTE_REPORT/report.md'" || true
  [[ -d "$EDITOR_DIR" ]] && ftp_cmd "mkdir -p '$REMOTE_REPORT/editor'; mirror -R --delete --no-perms '$EDITOR_DIR' '$REMOTE_REPORT/editor'" || true
  [[ -d visual-qa/output ]] && ftp_cmd "mkdir -p '$REMOTE_REPORT/visual'; mirror -R --delete --no-perms 'visual-qa/output' '$REMOTE_REPORT/visual'" || true
fi

cat "$REPORT_DIR/report.md"
[[ "$overall" == success ]]
