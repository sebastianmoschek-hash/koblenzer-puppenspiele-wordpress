const CACHE='kp-webapp-v18';
const FILES=['./','index.html','app.css','context-toolbar.css','pro-image-editor.css','editor-layer-guard.css','app.js','card-editor.js','menu-editor.js','version-history.js','manifest.webmanifest','editor-action-engine.js','editor-v2-core.js','editor-v2-ai.js','editor-v2-overlay.js','editor-bootstrap.js','editor-core-mobile.js','history-controls.js','direct-manipulation.js','design-editor.js','button-label-editor.js','mobile-viewport.js','site-manager-v2.js','universal-editor.js','text-button-sheet.js','mobile-gesture-arbiter.js','image-gesture-editor.js','background-gesture-editor.js','pro-image-editor.js','full-state-persistence.js','roadmap-finish.js','data/repertoire.json','data/termine.json','data/ensemble.json','data/referenzen.json','assets/header.webp'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const url=new URL(e.request.url);
 if(url.origin!==location.origin)return;
 e.respondWith(fetch(e.request).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request)));
});
