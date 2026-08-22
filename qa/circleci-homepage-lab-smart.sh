#!/usr/bin/env bash
set -euo pipefail

MODE="${KP_CI_MODE:-full}"
STAGING_BASE="${STAGING_BASE:-https://neu.koblenzer-puppenspiele.de}"
PLUGIN='wp-content/plugins/koblenzer-puppenspiele-core-phase2-2'
MU='wp-content/mu-plugins'
REPORT_DIR='qa-results/circleci'
REMOTE_REPORT='/wp-content/uploads/kp-homepage-lab/latest'
SHA="${CIRCLE_SHA1:-unknown}"
RUN_ID="${CIRCLE_WORKFLOW_ID:-local}"
export LFTP_PASSWORD="${STAGING_FTP_PASSWORD:-${LFTP_PASSWORD:-}}"

mkdir -p "$REPORT_DIR"

ftp_cmd(){
  : "${STAGING_FTP_SERVER:?STAGING_FTP_SERVER fehlt}"
  : "${STAGING_FTP_USERNAME:?STAGING_FTP_USERNAME fehlt}"
  : "${LFTP_PASSWORD:?STAGING_FTP_PASSWORD fehlt}"
  lftp -c "set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; set net:max-retries 2; set net:timeout 20; open --user '$STAGING_FTP_USERNAME' --env-password -p 21 '$STAGING_FTP_SERVER'; $1; bye"
}

sync_mu_plugins(){
  if [[ -d "$MU" ]]; then
    echo 'Syncing repository MU-plugins to staging (without deleting host-specific MU files).'
    ftp_cmd "mkdir -p /wp-content/mu-plugins; mirror -R --verbose --transfer-all --no-perms --parallel=2 '$MU' '/wp-content/mu-plugins'" >/tmp/kp-mu-deploy.log 2>&1
  fi
}

if [[ "$MODE" != 'pwa' ]]; then
  sync_mu_plugins
  exec bash qa/circleci-homepage-lab.sh
fi

echo 'CircleCI fast PWA lab: deploy + manifest/meta/icon smoke checks.'
: > "$REPORT_DIR/pipeline.log"
status_deploy=failure
status_manifest=failure
status_meta=failure
status_icon=failure
status_health=failure

# Only lint the tiny PHP surface touched by the PWA branding path.
for file in "$MU/kp-webapp-branding.php" "$PLUGIN/includes/class-kp-owner-web-app.php"; do
  if [[ -f "$file" ]]; then
    php -l "$file" >> "$REPORT_DIR/php-syntax.log" 2>&1
  fi
done

# Deploy only the PWA-related files. This avoids re-uploading the entire plugin/theme.
if sync_mu_plugins \
  && ftp_cmd "put '$PLUGIN/includes/class-kp-owner-web-app.php' -o '/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/includes/class-kp-owner-web-app.php'; put '$PLUGIN/assets/kp-app-icon.svg' -o '/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets/kp-app-icon.svg'" >> "$REPORT_DIR/deploy.log" 2>&1; then
  status_deploy=success
fi

if [[ "$status_deploy" == success ]]; then
  expected="$(sed -n 's/^ \* Version: //p' "$PLUGIN/koblenzer-puppenspiele-core.php" | head -1)"
  for attempt in $(seq 1 12); do
    if curl --fail --silent --show-error --location -H 'Cache-Control: no-cache, no-store' \
      "$STAGING_BASE/?kp_staging_bridge_health=1&kp_circleci=${SHA}-${RUN_ID}-${attempt}" -o "$REPORT_DIR/health.json" \
      && jq -e --arg version "$expected" '.success == true and .data.active == true and .data.version == $version' "$REPORT_DIR/health.json" >/dev/null 2>&1; then
      status_health=success
      break
    fi
    sleep 2
  done
fi

if curl --fail --silent --show-error --location -H 'Cache-Control: no-cache, no-store' \
  "$STAGING_BASE/?kp_webapp_manifest=1&kp_brand=kp-1&kp_ci=${SHA}" -o "$REPORT_DIR/manifest.json" \
  && jq -e '.name == "KP" and .short_name == "KP" and .display == "standalone" and (.icons | length) > 0 and (.icons[0].src | contains("kp-app-icon.svg"))' "$REPORT_DIR/manifest.json" >/dev/null; then
  status_manifest=success
fi

if curl --fail --silent --show-error --location -H 'Cache-Control: no-cache, no-store' \
  "$STAGING_BASE/?kp_ci=${SHA}" -o "$REPORT_DIR/home.html" \
  && grep -Eiq 'application-name[^>]+content=.KP.|content=.KP.[^>]+application-name' "$REPORT_DIR/home.html" \
  && grep -Eiq 'apple-mobile-web-app-title[^>]+content=.KP.' "$REPORT_DIR/home.html"; then
  status_meta=success
fi

icon_url="$(jq -r '.icons[0].src // empty' "$REPORT_DIR/manifest.json" 2>/dev/null || true)"
if [[ -n "$icon_url" ]] && curl --fail --silent --show-error --location "$icon_url" -o "$REPORT_DIR/kp-app-icon.svg"; then
  if grep -q '<svg' "$REPORT_DIR/kp-app-icon.svg"; then status_icon=success; fi
fi

overall=success
for s in "$status_deploy" "$status_health" "$status_manifest" "$status_meta" "$status_icon"; do
  [[ "$s" == success ]] || overall=failure
done

generated="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
cat > "$REPORT_DIR/report.json" <<JSON
{
  "generatedAt":"$generated",
  "provider":"CircleCI Free",
  "mode":"pwa-fast",
  "commit":"$SHA",
  "staging":"$STAGING_BASE",
  "success":$([[ "$overall" == success ]] && echo true || echo false),
  "checks":{
    "pwaDeploy":"$status_deploy",
    "stagingReady":"$status_health",
    "manifestKP":"$status_manifest",
    "homeMetaKP":"$status_meta",
    "iconReachable":"$status_icon"
  }
}
JSON

cat > "$REPORT_DIR/report.md" <<MD
# CircleCI Fast-PWA-Labor

Erzeugt: $generated  
Commit: $SHA  
Modus: **PWA FAST**  
Gesamtstatus: **${overall^^}**

- PWA-Dateien + MU-Plugins auf Staging: $status_deploy
- Staging aktiv/bereit: $status_health
- Manifest name/short_name = KP: $status_manifest
- Homescreen-Metadaten = KP: $status_meta
- KP-App-Icon erreichbar: $status_icon

Die teuren Browser-, Touch- und 50-Ansichten-Visualtests wurden bewusst übersprungen, weil dieser Commit ausschließlich die installierbare Web-App betrifft.
MD

if [[ -n "${STAGING_FTP_SERVER:-}" && -n "${STAGING_FTP_USERNAME:-}" && -n "${LFTP_PASSWORD:-}" ]]; then
  ftp_cmd "mkdir -p '$REMOTE_REPORT'; put '$REPORT_DIR/report.json' -o '$REMOTE_REPORT/report.json'; put '$REPORT_DIR/report.md' -o '$REMOTE_REPORT/report.md'" || true
fi

cat "$REPORT_DIR/report.md"
[[ "$overall" == success ]]
