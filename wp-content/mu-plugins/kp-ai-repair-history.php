<?php
/**
 * Reversible history for merged Gemini code repairs.
 *
 * Visual/content edits continue to use KPWordHistory + the 48h owner history.
 * Code repairs are reverted only through an isolated ai-repair rollback PR and CI.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function kp_ai_repair_history_ready() {
    return function_exists( 'kp_ai_repair_gh' ) && function_exists( 'kp_ai_repair_guard' );
}

function kp_ai_repair_history_entries() {
    if ( ! kp_ai_repair_history_ready() ) { throw new RuntimeException( 'Das Reparaturlabor ist noch nicht geladen.' ); }
    $response = kp_ai_repair_gh( 'GET', '/pulls?state=closed&base=' . rawurlencode( KP_AI_REPAIR_BASE ) . '&sort=updated&direction=desc&per_page=60', null, array( 200 ) );
    $pulls = (array) ( $response['data'] ?? array() );
    $rolled_back = array();
    foreach ( $pulls as $pr ) {
        if ( empty( $pr['merged_at'] ) ) { continue; }
        $title = (string) ( $pr['title'] ?? '' );
        if ( preg_match( '/^\[KI-Rollback\]\s+Reparatur #(\d+)\b/u', $title, $m ) ) {
            $rolled_back[ (int) $m[1] ] = (int) ( $pr['number'] ?? 0 );
        }
    }

    $items = array();
    foreach ( $pulls as $pr ) {
        if ( count( $items ) >= 20 || empty( $pr['merged_at'] ) ) { continue; }
        $title = (string) ( $pr['title'] ?? '' );
        $head = (string) ( $pr['head']['ref'] ?? '' );
        if ( ! str_starts_with( $title, '[KI-Reparatur]' ) || ! str_starts_with( $head, 'ai-repair/' ) || str_starts_with( $head, 'ai-repair/rollback-' ) ) { continue; }
        $number = (int) ( $pr['number'] ?? 0 );
        if ( ! $number ) { continue; }
        $items[] = array(
            'pr'          => $number,
            'title'       => sanitize_text_field( trim( preg_replace( '/^\[KI-Reparatur\]\s*/u', '', $title ) ) ),
            'merged_at'   => sanitize_text_field( (string) $pr['merged_at'] ),
            'sha'         => sanitize_text_field( (string) ( $pr['merge_commit_sha'] ?? '' ) ),
            'rolled_back' => isset( $rolled_back[ $number ] ),
            'rollback_pr' => isset( $rolled_back[ $number ] ) ? $rolled_back[ $number ] : 0,
        );
    }
    return $items;
}

add_action( 'wp_ajax_kp_ai_repair_history', static function () {
    if ( ! kp_ai_repair_history_ready() ) { wp_send_json_error( array( 'message' => 'Das Reparaturlabor ist noch nicht bereit.' ), 503 ); }
    kp_ai_repair_guard();
    try {
        wp_send_json_success( array( 'items' => kp_ai_repair_history_entries() ) );
    } catch ( Throwable $e ) {
        wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
    }
} );

add_action( 'wp_ajax_kp_ai_repair_rollback', static function () {
    if ( ! kp_ai_repair_history_ready() ) { wp_send_json_error( array( 'message' => 'Das Reparaturlabor ist noch nicht bereit.' ), 503 ); }
    kp_ai_repair_guard( true );
    $repair_pr = isset( $_POST['repair_pr'] ) ? absint( $_POST['repair_pr'] ) : 0;
    if ( ! $repair_pr ) { wp_send_json_error( array( 'message' => 'Reparatur-PR fehlt.' ), 400 ); }

    $branch = '';
    try {
        foreach ( kp_ai_repair_history_entries() as $entry ) {
            if ( $repair_pr === (int) $entry['pr'] && ! empty( $entry['rolled_back'] ) ) {
                throw new RuntimeException( 'Diese KI-Reparatur wurde bereits zurückgenommen.' );
            }
        }

        $pull = kp_ai_repair_gh( 'GET', '/pulls/' . $repair_pr, null, array( 200 ) );
        $pr = $pull['data'];
        $title = (string) ( $pr['title'] ?? '' );
        $head_ref = (string) ( $pr['head']['ref'] ?? '' );
        $merge_sha = (string) ( $pr['merge_commit_sha'] ?? '' );
        if ( empty( $pr['merged_at'] ) || KP_AI_REPAIR_BASE !== ( $pr['base']['ref'] ?? '' ) || ! str_starts_with( $title, '[KI-Reparatur]' ) || ! str_starts_with( $head_ref, 'ai-repair/' ) || ! preg_match( '/^[a-f0-9]{40}$/', $merge_sha ) ) {
            throw new RuntimeException( 'Diese Version gehört nicht zu einer übernommenen KI-Reparatur.' );
        }

        $commit = kp_ai_repair_gh( 'GET', '/commits/' . $merge_sha, null, array( 200 ) );
        $parent_sha = (string) ( $commit['data']['parents'][0]['sha'] ?? '' );
        $files = (array) ( $commit['data']['files'] ?? array() );
        if ( ! preg_match( '/^[a-f0-9]{40}$/', $parent_sha ) || ! $files || count( $files ) > 8 ) {
            throw new RuntimeException( 'Der vorherige Code-Stand kann nicht sicher rekonstruiert werden.' );
        }

        $paths = array();
        foreach ( $files as $file ) {
            $path = ltrim( str_replace( '\\', '/', (string) ( $file['filename'] ?? '' ) ), '/' );
            $status = (string) ( $file['status'] ?? '' );
            if ( 'modified' !== $status || ! kp_ai_repair_allowed_path( $path ) ) {
                throw new RuntimeException( 'Die Reparatur enthält einen Dateityp, der nicht automatisch zurückgenommen werden darf.' );
            }
            $paths[] = $path;
        }
        $paths = array_values( array_unique( $paths ) );
        if ( ! $paths ) { throw new RuntimeException( 'Keine rücksetzbaren Reparaturdateien gefunden.' ); }

        $main = kp_ai_repair_gh( 'GET', '/git/ref/heads/' . rawurlencode( KP_AI_REPAIR_BASE ), null, array( 200 ) );
        $main_sha = (string) ( $main['data']['object']['sha'] ?? '' );
        if ( ! preg_match( '/^[a-f0-9]{40}$/', $main_sha ) ) { throw new RuntimeException( 'GitHub-Hauptstand konnte nicht bestimmt werden.' ); }

        $branch = 'ai-repair/rollback-' . $repair_pr . '-' . gmdate( 'Ymd-His' ) . '-' . strtolower( wp_generate_password( 5, false, false ) );
        kp_ai_repair_gh( 'POST', '/git/refs', array( 'ref' => 'refs/heads/' . $branch, 'sha' => $main_sha ), array( 201 ) );

        foreach ( $paths as $path ) {
            $encoded = kp_ai_repair_gh_path( $path );
            $current = kp_ai_repair_gh( 'GET', '/contents/' . $encoded . '?ref=' . rawurlencode( $branch ), null, array( 200 ) );
            $after = kp_ai_repair_gh( 'GET', '/contents/' . $encoded . '?ref=' . rawurlencode( $merge_sha ), null, array( 200 ) );
            $before = kp_ai_repair_gh( 'GET', '/contents/' . $encoded . '?ref=' . rawurlencode( $parent_sha ), null, array( 200 ) );
            $current_bytes = base64_decode( (string) ( $current['data']['content'] ?? '' ), true );
            $after_bytes = base64_decode( (string) ( $after['data']['content'] ?? '' ), true );
            $before_bytes = base64_decode( (string) ( $before['data']['content'] ?? '' ), true );
            $current_sha = (string) ( $current['data']['sha'] ?? '' );
            if ( false === $current_bytes || false === $after_bytes || false === $before_bytes || ! $current_sha ) {
                throw new RuntimeException( 'Eine Reparaturdatei konnte für die Rücknahme nicht gelesen werden: ' . $path );
            }
            if ( ! hash_equals( hash( 'sha256', $after_bytes ), hash( 'sha256', $current_bytes ) ) ) {
                throw new RuntimeException( 'Die Datei ' . $path . ' wurde nach dieser Reparatur erneut geändert. Aus Sicherheitsgründen wird nichts überschrieben. Nimm zuerst neuere Technik-Änderungen zurück oder erstelle einen gezielten Reparatur-Fix.' );
            }
            if ( hash_equals( hash( 'sha256', $before_bytes ), hash( 'sha256', $current_bytes ) ) ) { continue; }
            kp_ai_repair_gh( 'PUT', '/contents/' . $encoded, array(
                'message' => 'revert(ai): repair #' . $repair_pr,
                'content' => base64_encode( $before_bytes ),
                'sha'     => $current_sha,
                'branch'  => $branch,
            ), array( 200, 201 ) );
        }

        $rollback = kp_ai_repair_gh( 'POST', '/pulls', array(
            'title' => '[KI-Rollback] Reparatur #' . $repair_pr . ' zurücknehmen',
            'head'  => $branch,
            'base'  => KP_AI_REPAIR_BASE,
            'body'  => "Sichere Rücknahme der übernommenen KI-Reparatur #{$repair_pr}.\n\nDie betroffenen Dateien wurden nur dann auf ihren Stand vor der Reparatur gesetzt, wenn sie seitdem unverändert waren. Die Rücknahme muss dieselben CI-Prüfungen bestehen wie ein normaler KI-Fix.",
            'draft' => false,
        ), array( 201 ) );

        wp_send_json_success( array(
            'pr'      => (int) ( $rollback['data']['number'] ?? 0 ),
            'url'     => esc_url_raw( (string) ( $rollback['data']['html_url'] ?? '' ) ),
            'branch'  => $branch,
            'message' => 'Rücknahme-Prüfbranch erstellt. CI prüft jetzt den vorherigen Code-Stand.',
        ) );
    } catch ( Throwable $e ) {
        if ( $branch ) {
            try { kp_ai_repair_gh( 'DELETE', '/git/refs/heads/' . str_replace( '/', '%2F', $branch ), null, array( 204 ) ); } catch ( Throwable $ignored ) {}
        }
        wp_send_json_error( array( 'message' => $e->getMessage() ), 500 );
    }
} );

add_action( 'wp_footer', static function () {
    if ( ! function_exists( 'kp_ai_repair_can_use' ) || ! kp_ai_repair_can_use() ) { return; }
    $edit_mode = isset( $_GET['kp_edit'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kp_edit'] ) );
    if ( ! $edit_mode || ! defined( 'KP_AI_REPAIR_NONCE' ) ) { return; }
    $cfg = array(
        'ajaxUrl' => admin_url( 'admin-ajax.php' ),
        'nonce'   => wp_create_nonce( KP_AI_REPAIR_NONCE ),
        'canMerge'=> function_exists( 'kp_ai_repair_can_merge' ) && kp_ai_repair_can_merge(),
    );
    ?>
    <style id="kp-ai-repair-history-style">
      .kp-tech-history-sheet{position:fixed;z-index:2147482890;left:50%;bottom:12px;transform:translateX(-50%);width:min(720px,calc(100vw - 20px));max-height:82vh;overflow:auto;background:#151515;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:20px;padding:15px;box-shadow:0 24px 80px rgba(0,0,0,.62)}.kp-tech-history-sheet[hidden]{display:none!important}.kp-tech-history-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.kp-tech-history-close{border:0;background:transparent;color:#fff;font-size:26px}.kp-tech-history-list{display:grid;gap:9px;margin-top:12px}.kp-tech-history-row{padding:11px;border-radius:13px;background:rgba(255,255,255,.06);display:grid;gap:6px}.kp-tech-history-row small{opacity:.72}.kp-tech-history-row button,.kp-tech-history-merge{justify-self:start;min-height:40px;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:7px 11px;background:#2b2b2b;color:#fff;font-weight:750}.kp-tech-history-merge{background:#187c45}.kp-tech-history-status{margin-top:10px;font-size:13px;white-space:pre-wrap}
    </style>
    <script id="kp-ai-repair-history-runtime">
    (()=>{
      'use strict';
      const cfg=<?php echo wp_json_encode( $cfg, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;
      const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
      async function api(action,fields={}){const fd=new FormData();fd.append('action',action);fd.append('nonce',cfg.nonce);Object.entries(fields).forEach(([k,v])=>fd.append(k,String(v)));const r=await fetch(cfg.ajaxUrl,{method:'POST',credentials:'same-origin',cache:'no-store',body:fd});const j=await r.json().catch(()=>null);if(!r.ok||!j?.success)throw new Error(j?.data?.message||'Technik-Historie fehlgeschlagen.');return j.data||{}}
      let sheet=document.querySelector('.kp-tech-history-sheet');
      if(!sheet){sheet=document.createElement('section');sheet.className='kp-tech-history-sheet';sheet.hidden=true;sheet.innerHTML='<div class="kp-tech-history-head"><div><strong>↶ Technik-Versionshistorie</strong><div style="font-size:12px;opacity:.7">Übernommene KI-Code-Reparaturen · Rücknahmen laufen wieder über Prüfbranch + CI.</div></div><button class="kp-tech-history-close" type="button">×</button></div><div class="kp-tech-history-list"></div><div class="kp-tech-history-status"></div>';document.body.appendChild(sheet)}
      const list=sheet.querySelector('.kp-tech-history-list'),status=sheet.querySelector('.kp-tech-history-status');
      const setStatus=t=>status.textContent=t||'';
      async function load(){setStatus('Technik-Versionen werden geladen …');try{const d=await api('kp_ai_repair_history');const items=d.items||[];list.innerHTML=items.length?items.map(x=>`<div class="kp-tech-history-row"><strong>${esc(x.title||('KI-Reparatur #'+x.pr))}</strong><small>PR #${Number(x.pr)||0} · ${esc(x.merged_at||'')}</small>${x.rolled_back?'<span>↶ bereits zurückgenommen</span>':cfg.canMerge?`<button type="button" data-kp-tech-rollback="${Number(x.pr)||0}">Reparatur zurücknehmen</button>`:''}</div>`).join(''):'<div class="kp-tech-history-row">Noch keine übernommene KI-Code-Reparatur vorhanden.</div>';setStatus('')}catch(e){setStatus(e.message)}}
      async function poll(pr){for(let i=0;i<90;i++){const d=await api('kp_ai_repair_status',{pr});setStatus('Rücknahme-PR #'+pr+' · '+(d.health||'pending'));if(d.health==='failure')throw new Error('Die CI-Prüfung der Rücknahme ist rot. Es wurde nichts übernommen.');if(d.health==='success')return d;await new Promise(r=>setTimeout(r,4000))}throw new Error('Die CI-Prüfung ist noch nicht abgeschlossen.')}
      list.addEventListener('click',async e=>{const btn=e.target.closest('[data-kp-tech-rollback]');if(!btn)return;const repairPr=Number(btn.dataset.kpTechRollback)||0;if(!repairPr||!confirm('KI-Reparatur #'+repairPr+' wirklich zurücknehmen? Die Rücknahme wird zuerst auf einem Prüfbranch getestet.'))return;btn.disabled=true;try{const rb=await api('kp_ai_repair_rollback',{repair_pr:repairPr});setStatus(rb.message||'Rücknahme wird geprüft …');await poll(rb.pr);setStatus('✅ Rücknahme ist grün geprüft.');const merge=document.createElement('button');merge.type='button';merge.className='kp-tech-history-merge';merge.textContent='Geprüfte Rücknahme übernehmen';merge.onclick=async()=>{if(!confirm('Geprüfte Rücknahme jetzt übernehmen?'))return;merge.disabled=true;try{const out=await api('kp_ai_repair_merge',{pr:rb.pr});setStatus('✅ '+(out.message||'Rücknahme übernommen.'));merge.remove();await load()}catch(err){setStatus(err.message);merge.disabled=false}};btn.parentElement.appendChild(merge)}catch(err){setStatus(err.message)}finally{btn.disabled=false}});
      sheet.querySelector('.kp-tech-history-close').onclick=()=>{sheet.hidden=true};
      function installButton(){const actions=document.querySelector('.kp-ai-repair-actions');if(!actions||actions.querySelector('.kp-tech-history-open'))return;const b=document.createElement('button');b.type='button';b.className='kp-tech-history-open';b.textContent='↶ Technik-Historie';b.onclick=()=>{sheet.hidden=false;void load()};actions.appendChild(b)}
      new MutationObserver(installButton).observe(document.documentElement,{childList:true,subtree:true});installButton();
    })();
    </script>
    <?php
}, 2190 );
