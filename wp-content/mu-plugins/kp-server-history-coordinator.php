<?php
/**
 * One chronological global Undo/Redo lane for server-backed editor actions.
 *
 * Page/Termin/Stück creation and calendar actions keep their own durable
 * payloads, but their browser markers must remain interleaved correctly across
 * redirects/reloads. This coordinator replaces separate marker blocks with one
 * ordered session sequence while delegating the actual restore to each runtime.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', static function () {
    if ( ! is_user_logged_in() || ! current_user_can( 'edit_pages' ) ) { return; }
    ?>
    <script id="kp-server-history-coordinator">
    (()=>{
      'use strict';
      const MAX=50,U='kp-server-undo-seq-v1',R='kp-server-redo-seq-v1';
      const source={
        creation:{undo:'kp-create-undo-v1',redo:'kp-create-redo-v1',runtime:()=>window.KPCreateHistoryRuntime},
        calendar:{undo:'kp-calendar-undo-v1',redo:'kp-calendar-redo-v1',runtime:()=>window.KPCalendarHistoryRuntime}
      };
      let installed=false,undoSeq=[],redoSeq=[];

      const cleanIds=value=>Array.isArray(value)?value.filter(x=>typeof x==='string'&&x).slice(-MAX):[];
      function readJson(key,fallback=[]){try{const value=JSON.parse(sessionStorage.getItem(key)||'null');return value??fallback}catch(_){return fallback}}
      function readIds(key){return cleanIds(readJson(key,[]))}
      function cleanSeq(value){
        if(!Array.isArray(value))return[];
        const out=[];
        for(const item of value){
          if(!item||!source[item.kind]||typeof item.id!=='string'||!item.id)continue;
          if(!out.some(x=>x.kind===item.kind&&x.id===item.id))out.push({kind:item.kind,id:item.id});
        }
        return out.slice(-MAX);
      }
      function save(){try{sessionStorage.setItem(U,JSON.stringify(undoSeq));sessionStorage.setItem(R,JSON.stringify(redoSeq))}catch(_){}}
      function idOrder(a,b){return String(a.id).localeCompare(String(b.id))}
      function rebuild(kindOfStack){
        const entries=[];
        for(const [kind,cfg] of Object.entries(source))for(const id of readIds(cfg[kindOfStack]))entries.push({kind,id});
        entries.sort(idOrder);return cleanSeq(entries);
      }
      function validSeq(seq,kindOfStack){
        const expected=new Map();
        for(const [kind,cfg] of Object.entries(source))expected.set(kind,new Set(readIds(cfg[kindOfStack])));
        const seen=new Map(Object.keys(source).map(k=>[k,new Set()]));
        for(const item of seq){if(!expected.get(item.kind)?.has(item.id))return false;seen.get(item.kind).add(item.id)}
        for(const [kind,set] of expected)if(set.size!==seen.get(kind).size)return false;
        return true;
      }
      function load(){
        undoSeq=cleanSeq(readJson(U,[]));redoSeq=cleanSeq(readJson(R,[]));
        if(!validSeq(undoSeq,'undo'))undoSeq=rebuild('undo');
        if(!validSeq(redoSeq,'redo'))redoSeq=rebuild('redo');
        save();
      }
      function lastUnderlying(kind,stack){const cfg=source[kind];if(!cfg)return'';const ids=readIds(cfg[stack]);return ids.length?ids[ids.length-1]:''}
      async function call(item,method,stack){
        if(!item||lastUnderlying(item.kind,stack)!==item.id)return false;
        const runtime=source[item.kind]?.runtime?.(),fn=runtime?.[method];if(typeof fn!=='function')return false;
        const result=fn.call(runtime);return !!(result&&typeof result.then==='function'?await result:result);
      }
      async function undo(){
        const item=undoSeq[undoSeq.length-1];if(!item)return false;
        if(!await call(item,'undo','undo'))return false;
        undoSeq.pop();redoSeq.push(item);if(redoSeq.length>MAX)redoSeq.shift();save();return true;
      }
      async function redo(){
        const item=redoSeq[redoSeq.length-1];if(!item)return false;
        if(!await call(item,'redo','redo'))return false;
        redoSeq.pop();undoSeq.push(item);if(undoSeq.length>MAX)undoSeq.shift();save();return true;
      }
      function clearRedo(){redoSeq=[];for(const cfg of Object.values(source))cfg.runtime?.()?.clearRedo?.();save()}
      const runtime={undo,redo,clearRedo,counts:()=>({undo:undoSeq.length,redo:redoSeq.length})};

      function newestId(kind){const cfg=source[kind];if(!cfg)return'';const ids=readIds(cfg.undo);return ids.length?ids[ids.length-1]:''}
      function record(kind){
        const id=newestId(kind);if(!id)return false;
        undoSeq=undoSeq.filter(x=>!(x.kind===kind&&x.id===id));undoSeq.push({kind,id});if(undoSeq.length>MAX)undoSeq.shift();
        redoSeq=[];save();return true;
      }

      function install(){
        const history=window.KPWordHistory;if(!history?.register||!history?.seedSpecialist||!history?.push)return false;
        if(!window.KPCreateHistoryRuntime||!window.KPCalendarHistoryRuntime)return false;
        if(installed)return true;installed=true;load();
        history.register('server-history',()=>runtime);
        // Remove the block-seeded legacy markers before installing the exact
        // interleaved sequence. The underlying payload stacks remain untouched.
        history.seedSpecialist('creation',0,0);history.seedSpecialist('calendar',0,0);
        history.seedSpecialist('server-history',undoSeq.length,redoSeq.length);
        const originalPush=history.push.bind(history);
        history.push=kind=>{
          if(kind!=='creation'&&kind!=='calendar')return originalPush(kind);
          if(!record(kind))return false;
          // A new server action after Undo invalidates Redo in both underlying
          // stores, not only in the subsystem that produced the new action.
          for(const [other,cfg] of Object.entries(source))if(other!==kind)cfg.runtime?.()?.clearRedo?.();
          return originalPush('server-history');
        };
        return true;
      }
      install();const timer=setInterval(()=>{if(install())clearInterval(timer)},250);
      window.KPServerHistoryCoordinator={counts:()=>({undo:undoSeq.length,redo:redoSeq.length}),refresh:install};
    })();
    </script>
    <?php
}, 2090 );
