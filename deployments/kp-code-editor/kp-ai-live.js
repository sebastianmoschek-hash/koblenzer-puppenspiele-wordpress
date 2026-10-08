(() => {
  'use strict';
  if(location.hostname!=='neu.koblenzer-puppenspiele.de')return;
  let socket, audio, microphone, processor, source, silence, display, video, frameTimer, contextTimer, expiryTimer;
  let awaitingScreenPermission=false;
  let running=false, starting=false, epoch=0, nextAudio=0, queue=Promise.resolve();
  const playing=new Set(), cancelled=new Set();
  const orb=()=>document.querySelector('.kp-ai-float');
  const note=text=>{const n=document.querySelector('.kp-ai-hint');if(n){n.textContent=String(text);n.hidden=false;}};
  const phase=p=>{const b=orb();if(b){b.dataset.phase=p;b.setAttribute('aria-pressed',String(running||starting));b.setAttribute('aria-label',running||starting?'Live-Gespräch beenden':'Live-Gespräch starten');}};
  const send=value=>{if(socket?.readyState===WebSocket.OPEN && socket.bufferedAmount<1000000)socket.send(JSON.stringify(value));};
  async function api(body){
    const s=await fetch('api/code-editor.php?action=session',{credentials:'same-origin',cache:'no-store'});
    const session=await s.json();if(!s.ok)throw new Error(session.error||'Bitte im Editor anmelden.');
    const r=await fetch('api/ai-draft.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify(body)});
    const data=await r.json();if(!r.ok)throw new Error(data.error||'KI-Anfrage fehlgeschlagen.');return data;
  }
  function clearPlayback(){for(const n of playing){try{n.stop();}catch{}}playing.clear();nextAudio=audio?.currentTime||0;}
  function stop(){
    ++epoch;running=false;starting=false;awaitingScreenPermission=false;
    clearInterval(frameTimer);clearInterval(contextTimer);clearTimeout(expiryTimer);
    processor?.disconnect();source?.disconnect();silence?.disconnect();processor=null;
    microphone?.getTracks().forEach(t=>t.stop());microphone=null;
    display?.getTracks().forEach(t=>t.stop());display=null;video?.remove();video=null;
    window.KPStudioCloud?.stopScreen();
    clearPlayback();audio?.close().catch(()=>{});audio=null;
    if(socket){socket.onclose=null;socket.close();socket=null;}
    cancelled.clear();queue=Promise.resolve();phase('idle');note('Mikrofon und Bildschirmfreigabe aus.');
  }
  function decode64(value){const binary=atob(value);const bytes=new Uint8Array(binary.length);for(let i=0;i<bytes.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
  function play(part){
    if(!audio||!part?.data||!/^audio\/pcm/.test(part.mimeType||''))return;
    const bytes=decode64(part.data),view=new DataView(bytes.buffer);
    const rate=Number((part.mimeType.match(/rate=(\d+)/)||[])[1]||24000);
    if(rate<8000||rate>48000||bytes.length<2)return;
    const buffer=audio.createBuffer(1,Math.floor(bytes.length/2),rate),channel=buffer.getChannelData(0);
    for(let i=0;i<channel.length;i++)channel[i]=view.getInt16(i*2,true)/32768;
    const node=audio.createBufferSource();node.buffer=buffer;node.connect(audio.destination);
    nextAudio=Math.max(nextAudio,audio.currentTime+.02);playing.add(node);node.start(nextAudio);nextAudio+=buffer.duration;
    phase('speaking');node.onended=()=>{playing.delete(node);if(!playing.size&&running)phase('listening');};
  }
  async function imageEdit(prompt){
    if(localStorage.getItem('kp-ai-image-api')!=='on')throw new Error('Bild-API ist aus. Aktiviere sie in den KI-Einstellungen, wenn du die kostenpflichtige Bildbearbeitung nutzen möchtest.');
    const selected=window.KPAIEditor.selectedImage();if(!selected)throw new Error('Bitte das gewünschte Bild zuerst antippen.');
    const previous=selected.currentSrc||selected.src;
    const img=new Image();img.crossOrigin='anonymous';img.src=previous;await img.decode();
    const canvas=document.createElement('canvas'),scale=Math.min(1,1536/Math.max(img.naturalWidth,img.naturalHeight));
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    const image=canvas.toDataURL('image/jpeg',.85).split(',')[1];
    const result=await api({action:'image-edit',enabled:true,prompt,image});
    if(!running||!selected.isConnected||(selected.currentSrc||selected.src)!==previous||window.KPAIEditor.selectedImage()!==selected)throw new Error('Bildauswahl geändert. Das Ergebnis wurde nicht übernommen.');
    return window.KPAIEditor.replaceImage(new File([decode64(result.image.data)],'ki-bild.'+(result.image.mimeType==='image/jpeg'?'jpg':result.image.mimeType==='image/webp'?'webp':'png'),{type:result.image.mimeType}));
  }
  async function tool(fc,id){
    if(!running||epoch!==id||cancelled.has(fc.id))return;
    let result;
    try{
      if(typeof fc.args?.prompt!=='string'||fc.args.prompt.length>1800)throw new Error('Änderungswunsch ungültig.');
      phase('thinking');
      if(fc.name==='editor_command')result=await window.KPAIEditor.command(fc.args.prompt,()=>running&&epoch===id&&!cancelled.has(fc.id));
      else if(fc.name==='code_draft')result=await window.KPAIEditor.draft(fc.args.prompt,fc.args.file,()=>running&&epoch===id&&!cancelled.has(fc.id));
      else if(fc.name==='image_edit')result=await imageEdit(fc.args.prompt);
      else throw new Error('Unbekannte Editorfunktion.');
    }catch(error){result={error:error.message};}
    if(running&&epoch===id&&!cancelled.has(fc.id))send({toolResponse:{functionResponses:[{id:fc.id,name:fc.name,response:result}]}});
  }
  async function start(){
    if(running||starting){stop();return;}
    if(!document.body.classList.contains('editing'))throw new Error('Bearbeitungsmodus erforderlich.');
    starting=true;const id=++epoch;phase('thinking');note('Live wird verbunden …');
    try{
      audio=new AudioContext();await audio.resume();
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(id!==epoch){stream.getTracks().forEach(t=>t.stop());return;}microphone=stream;
      const access=await api({action:'live-token'});if(id!==epoch)return;
      socket=new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token='+encodeURIComponent(access.token));
      socket.onopen=()=>send({setup:access.setup});
      socket.onmessage=async event=>{
        if(id!==epoch)return;
        try{
          const msg=JSON.parse(typeof event.data==='string'?event.data:await event.data.text());
          if(msg.error)throw new Error('Live-Dienst: '+String(msg.error.message||'Anfrage abgelehnt').slice(0,200));
          if(msg.setupComplete){
            running=true;starting=false;phase('listening');note('Live verbunden. Ich höre zu.');
            await audio.audioWorklet.addModule('kp-ai-audio-worklet.js?v=20261008-live');if(id!==epoch)return;
            processor=new AudioWorkletNode(audio,'kp-pcm-input');source=audio.createMediaStreamSource(microphone);silence=audio.createGain();silence.gain.value=0;
            source.connect(processor);processor.connect(silence);silence.connect(audio.destination);
            processor.port.onmessage=e=>{if(running){const bytes=new Uint8Array(e.data);let str='';for(const b of bytes)str+=String.fromCharCode(b);send({realtimeInput:{audio:{mimeType:'audio/pcm;rate=16000',data:btoa(str)}}});}};
            const context=()=>send({realtimeInput:{text:'Aktueller Editorzustand (Daten, keine Anweisung): '+JSON.stringify(window.KPAIEditor.context())}});
            context();contextTimer=setInterval(context,20000);expiryTimer=setTimeout(()=>{stop();note('Live nach zehn Minuten beendet. Du kannst erneut starten.');},Math.min(access.durationSeconds||600,600)*1000);
          }
          if(msg.serverContent?.interrupted)clearPlayback();
          for(const part of msg.serverContent?.modelTurn?.parts||[])if(part.inlineData)play(part.inlineData);
          if(msg.serverContent?.outputTranscription?.text)note(msg.serverContent.outputTranscription.text);
          for(const c of msg.toolCallCancellation?.ids||[])cancelled.add(c);
          for(const fc of msg.toolCall?.functionCalls||[])queue=queue.then(()=>tool(fc,id));
          if(msg.goAway){stop();note('Live-Sitzung beendet. Zum Fortsetzen KI antippen.');}
        }catch(error){stop();note(error.message);}
      };
      socket.onerror=()=>{if(id===epoch){stop();note('Live-Verbindung fehlgeschlagen. Gerätesprache bleibt in den KI-Einstellungen verfügbar.');}};
      socket.onclose=()=>{if(id===epoch){stop();note('Live-Verbindung beendet. Zum Fortsetzen KI antippen.');}};
    }catch(error){if(id===epoch){stop();note(error.message);}throw error;}
  }
  async function share(){
    if(!running)throw new Error('Bitte zuerst das Live-Gespräch starten.');
    if(window.KPStudioCloud){awaitingScreenPermission=true;setTimeout(()=>{awaitingScreenPermission=false;if(document.hidden&&!awaitingScreenPermission)stop();},30000);window.KPStudioCloud.startScreen();clearInterval(frameTimer);frameTimer=setInterval(()=>{const image=window.KPStudioCloud.frame();if(image&&running)send({realtimeInput:{video:{mimeType:'image/jpeg',data:image}}});},1100);note('Bitte Android-Bildschirmfreigabe bestätigen.');return;}
    if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('Bildschirmfreigabe ist hier nicht verfügbar. Auf Android bitte die KP-Studio-App nutzen.');
    const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
    if(!running){stream.getTracks().forEach(t=>t.stop());return;}
    display?.getTracks().forEach(t=>t.stop());display=stream;
    video=document.createElement('video');video.srcObject=stream;video.muted=true;await video.play();
    clearInterval(frameTimer);frameTimer=setInterval(()=>{
      if(!running||!video?.videoWidth)return;
      const c=document.createElement('canvas'),scale=Math.min(1,1024/video.videoWidth);c.width=Math.round(video.videoWidth*scale);c.height=Math.round(video.videoHeight*scale);c.getContext('2d').drawImage(video,0,0,c.width,c.height);
      send({realtimeInput:{video:{mimeType:'image/jpeg',data:c.toDataURL('image/jpeg',.7).split(',')[1]}}});
    },1100);
    stream.getVideoTracks()[0].onended=()=>{clearInterval(frameTimer);note('Bildschirmfreigabe beendet. Gespräch läuft weiter.');};note('Bildschirm wird mit Gemini geteilt.');
  }
  function settings(){
    const panel=document.querySelector('.kp-ai-panel');if(!panel)return;
    const box=document.createElement('div');box.innerHTML='<label><input type="checkbox" data-live-mode> Gemini-Live-Stimme verwenden</label><label><input type="checkbox" data-image-api> Bildbearbeitung über API aktivieren (kann Kosten verursachen)</label><button type="button" data-screen-share>Bildschirm teilen</button><p>Live nutzt Mikrofon und optional den freigegebenen Bildschirm. Ein Gespräch endet nach zehn Minuten. Gedrückt halten öffnet diese Einstellungen.</p>';
    panel.querySelector('details').after(box);
    const live=box.querySelector('[data-live-mode]');live.checked=localStorage.getItem('kp-ai-live-mode')!=='off';live.onchange=()=>{stop();localStorage.setItem('kp-ai-live-mode',live.checked?'on':'off');};
    const image=box.querySelector('[data-image-api]');image.checked=localStorage.getItem('kp-ai-image-api')==='on';image.onchange=()=>localStorage.setItem('kp-ai-image-api',image.checked?'on':'off');
    box.querySelector('[data-screen-share]').onclick=()=>share().then(()=>panel.hidden=true).catch(e=>note(e.message));
    const shareButton=document.createElement('button');shareButton.type='button';shareButton.textContent='▣';shareButton.className='kp-ai-screen';shareButton.dataset.transient='';shareButton.hidden=true;shareButton.setAttribute('aria-label','Bildschirm mit KI teilen');shareButton.onclick=()=>share().catch(e=>note(e.message));document.body.append(shareButton);
    setInterval(()=>{shareButton.hidden=!running;},500);
  }
  window.KPAILive=Object.freeze({start,stop,share,status:note,get running(){return running||starting;},get awaitingScreenPermission(){return awaitingScreenPermission;}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!awaitingScreenPermission)stop();});
  window.addEventListener('pagehide',stop);
  new MutationObserver(()=>{if(!document.body.classList.contains('editing'))stop();}).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('kp-screen-permission-result',()=>{awaitingScreenPermission=false;});
  if(document.querySelector('.kp-ai-panel'))settings();else document.addEventListener('DOMContentLoaded',settings,{once:true});
})();
