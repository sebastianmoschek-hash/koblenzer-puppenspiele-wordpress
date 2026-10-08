/* Local-only worker. IMG.LY 1.7.0 (AGPL-3.0), ONNX Runtime 1.21.0 (MIT).
 * Licenses: kp-background-licenses.txt. Corresponding source:
 * https://github.com/sebastianmoschek-hash/koblenzer-puppenspiele-wordpress/tree/codex/kp-editor-ai-staging/deployments/kp-code-editor
 * No image API, uploads, billing, or Gemini app automation.
 */
'use strict';
importScripts('kp-background-lib.js?v=20261008-free10');
self.onmessage=async event=>{
  const {input}=event.data||{};
  if(!(input instanceof Blob)){self.postMessage({kind:'error',message:'Ungültiges Bild.'});return;}
  try{
    const output=await KPBackground.remove(input,{model:'isnet_quint8',device:'cpu',output:{format:'image/png',quality:1},progress:(key,current,total)=>self.postMessage({kind:'progress',key,current,total})});
    self.postMessage({kind:'result',output});
  }catch(error){self.postMessage({kind:'error',message:String(error.message||'Freistellen fehlgeschlagen.').slice(0,300)});}
};
