(() => {
  'use strict';
  if (location.hostname !== 'neu.koblenzer-puppenspiele.de') return;
  let orb, mute, hint, active=false, speaking=false, restartTimer, hintTimer;
  let panel, csrf = '', recognition, listening = false, busy = false;
  const request = async (url, options = {}) => {
    const response = await fetch(url, {credentials:'same-origin', cache:'no-store', ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen (' + response.status + ')');
    return data;
  };

  function paint() {
    if (!orb) return;
    orb.dataset.phase=!active?'idle':directBusy?'thinking':speaking?'speaking':'listening';
    orb.setAttribute('aria-pressed',String(active));
    orb.setAttribute('aria-label',active?'Sprachmodus pausieren':'Sprachmodus starten');
    orb.textContent=active?'✦':'✦ KI'; mute.hidden=!active;
  }
  function resume() {
    clearTimeout(restartTimer);
    if (active && !listening && !directBusy && !speaking && !document.hidden) restartTimer=setTimeout(startListening,350);
  }
  const status = message => {
    if (panel) panel.querySelector('[data-ai-status]').textContent=message;
    if (hint) {hint.textContent=message;hint.hidden=false;clearTimeout(hintTimer);hintTimer=setTimeout(()=>{hint.hidden=true;},5000);}
    if (active && !/^(Ich höre|Ich prüfe|Sag deinen)/.test(message)) {
      if ('speechSynthesis' in window) {
        speaking=true;paint();
        const reply=new SpeechSynthesisUtterance(/^Überschrift geändert|^Änderung übernommen/.test(message)?'Erledigt.':/^Änderung rückgängig/.test(message)?'Rückgängig gemacht.':message);
        reply.lang='de-DE';
        const voice=window.speechSynthesis.getVoices().find(v=>v.lang==='de-DE' && /Google|Microsoft/.test(v.name));
        if(voice)reply.voice=voice;
        reply.onend=reply.onerror=()=>{speaking=false;paint();resume();};
        window.speechSynthesis.speak(reply);
      } else resume();
    }
  };
  function stopSpeech() {
    active=false;clearTimeout(restartTimer);if(recognition)recognition.abort();
    listening=false;speaking=false;window.speechSynthesis?.cancel();paint();
  }
  function startListening() {
    if(!active || listening || directBusy || speaking || document.hidden)return;
    const API=window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!API){stopSpeech();status('Spracherkennung nicht verfügbar. KI-Knopf gedrückt halten für Texteingabe.');return;}
    recognition=new API();recognition.lang='de-DE';recognition.continuous=false;recognition.interimResults=false;
    recognition.onresult=event=>{
      const spoken=event.results[0][0].transcript;recognition.abort();listening=false;
      panel.querySelector('[data-ai-prompt]').value=spoken;directCommand(spoken);
    };
    recognition.onerror=event=>{
      if(event.error==='aborted' || event.error==='no-speech')return;
      stopSpeech();status('Mikrofon: '+event.error+'. Zum Fortsetzen erneut KI antippen.');
    };
    recognition.onend=()=>{listening=false;paint();resume();};
    try{recognition.start();listening=true;paint();status('Ich höre zu …');}
    catch(error){stopSpeech();status(error.message);}
  }

  let targets = new Map(), directBusy = false;
  const colors = {blau:'#2563eb',rot:'#dc2626',grün:'#16a34a',gruen:'#16a34a',orange:'#f07a22',weiß:'#ffffff',weiss:'#ffffff',schwarz:'#000000',gelb:'#facc15',lila:'#9333ea'};
  let conversation=[], pendingDelete=null, pendingBackground=null;
  const ids=new WeakMap();let nextId=0;
  const idFor=n=>{if(!ids.has(n))ids.set(n,'e'+(++nextId));return ids.get(n);};
  const stamp=n=>JSON.stringify([n.textContent,n.getAttribute('style'),n.getAttribute('src'),n.getAttribute('href'),n.parentElement?.id]);
  const editable=n=>n?.isConnected && n.matches('main *,main,.masthead h1,.masthead p,.masthead img,.desktop-nav a,.mobile-menu nav a') && !n.closest('[data-transient],.kp-ai-panel');
  function context() {
    targets=new Map();
    const nodes=[...document.querySelectorAll('.masthead img,.masthead h1,.masthead p,main,main>section,main .piece'),...document.querySelectorAll('main h1,main h2,main h3,main p,main a,main img,[data-editable-text],.desktop-nav a')].filter(editable);
    const selected=window.KPStudio?.selected || window.KPCtx?.element;
    if(editable(selected))nodes.unshift(selected);
    return [...new Set(nodes)].slice(0,100).map(n=>{const id=idFor(n);targets.set(id,n);return {id,tag:n.tagName,kind:n.matches('.piece')?'repertoire':n.matches('section,main')?'section':n.matches('img')?'image':n.matches('a')?'link':'text',text:n.textContent.trim().slice(0,160),alt:n.getAttribute('alt')||'',section:n.closest('section')?.id||'',selected:n===selected};});
  }
  function checkpoint(){window.KPStudio?.captureDetail?.();refreshEditableElements();saveDraft();recordHistory();window.KPStudio?.refreshLayerList?.();document.dispatchEvent(new CustomEvent('kp-dirty',{detail:true}));document.dispatchEvent(new CustomEvent('editor-layout-change'));}
  function clickControl(selector,root=document){const b=root.querySelector(selector);if(!b||b.disabled)throw new Error('Diese Editorfunktion ist gerade nicht verfügbar.');b.click();}
  function safeLink(value){if(typeof value!=='string'||value.length>1000)throw new Error('Ungültiges Linkziel.');if(value.startsWith('#')&&/^#[\wäöüß-]+$/i.test(value))return value;const u=new URL(value,location.href);if(!['https:','http:','mailto:','tel:'].includes(u.protocol))throw new Error('Dieses Linkziel ist nicht erlaubt.');return value;}
  const styleValues={color:v=>/^#[\da-f]{6}$/i.test(v),backgroundColor:v=>/^#[\da-f]{6}$/i.test(v),fontSize:v=>Number(v)>=8&&Number(v)<=120,fontWeight:v=>['normal','bold'].includes(v),fontStyle:v=>['normal','italic'].includes(v),textDecoration:v=>['none','underline'].includes(v),textAlign:v=>['left','center','right'].includes(v),opacity:v=>Number(v)>=0&&Number(v)<=1};
  const styleNames={backgroundColor:'background-color',fontSize:'font-size',fontWeight:'font-weight',fontStyle:'font-style',textDecoration:'text-decoration',textAlign:'text-align'};
  function validateOperation(op){
    if(!op||typeof op!=='object')throw new Error('Ungültiger Editorbefehl.');
    const global=['undo','redo','save','preview','versions','export','import','settings','addPage','snap'];
    const types=[...global,'select','style','text','link','alt','width','duplicate','delete','up','down','parent','detail','addText','addButton','addImage','replaceImage','crop','imageAdjustment','imagePreset','removeBackground','editImage'];
    if(!types.includes(op.type))throw new Error('Diese Funktion ist noch nicht angebunden.');
    const n=targets.get(op.id);if(!global.includes(op.type)&&!editable(n))throw new Error('Bitte das Zielelement genauer benennen.');
    if(op.type==='style'&&(!styleValues[op.property]||!styleValues[op.property](op.value)))throw new Error('Ungültige Gestaltung.');
    if(['text','alt','addText','addButton','addPage'].includes(op.type)&&(typeof op.value!=='string'||!op.value.trim()||op.value.length>2000))throw new Error('Bitte den gewünschten Text nennen.');
    if(op.type==='text'&&(n.children.length||n.matches('img,section,main')))throw new Error('Bitte den einzelnen Text statt des ganzen Bereichs auswählen.');
    if(['link','addButton'].includes(op.type))safeLink(op.url);
    if(op.type==='link'&&!n.matches('a'))throw new Error('Bitte einen Link oder Button auswählen.');
    if(['alt','replaceImage','crop','imageAdjustment','imagePreset','removeBackground','editImage'].includes(op.type)&&!n.matches('img'))throw new Error('Bitte ein Bild auswählen.');
    if(op.type==='width'&&!(Number(op.value)>=15&&Number(op.value)<=100))throw new Error('Breite muss zwischen 15 und 100 Prozent liegen.');
    if(['addText','addButton','addImage'].includes(op.type)&&!n.matches('section,main,.piece,.hero-copy'))throw new Error('Bitte den Bereich für das neue Element nennen.');
    if(op.type==='delete'&&n.matches('main,.masthead,.hero,.desktop-nav,.footer'))throw new Error('Dieser Hauptbereich wird nicht gelöscht.');
    if(op.type==='imagePreset'&&!['original','vivid','mono','sepia','rotate-left','rotate-right'].includes(op.value))throw new Error('Unbekannter Bildstil.');
    if(op.type==='imageAdjustment'&&!['brightness','contrast','blur','saturate','grayscale','sepia','rotation'].includes(op.property))throw new Error('Unbekannte Bildeinstellung.');
    if(op.type==='crop'&&!['1:1','4:3','16:9'].includes(op.value))throw new Error('Bitte das gewünschte Bildformat nennen.');
    if(op.type==='addPage'&&op.value.length>100)throw new Error('Bitte einen kürzeren Seitentitel nennen.');
    if(op.type==='editImage'&&(typeof op.value!=='string'||!op.value.trim()||op.value.length>1800))throw new Error('Bitte die Bildänderung genauer beschreiben.');
    if(op.type==='snap'&&typeof op.value!=='boolean')throw new Error('Bitte Raster an oder aus sagen.');
    return n;
  }
  let backgroundLibrary;
  function loadBackgroundLibrary(){
    if(typeof Worker!=='function'||typeof OffscreenCanvas!=='function')throw new Error('Dieser Browser unterstützt lokales KI-Freistellen noch nicht. Bitte Chrome aktualisieren.');
    if(!backgroundLibrary)backgroundLibrary=Promise.resolve({remove:(input,config)=>new Promise((resolve,reject)=>{
      const worker=new Worker('kp-background-worker.js?v=20261008-free10');
      const finish=(error,output)=>{clearTimeout(timer);worker.terminate();error?reject(error):resolve(output);};
      const timer=setTimeout(()=>finish(new Error('Freistellen hat zu lange gedauert. Original unverändert.')),150000);
      worker.onmessage=event=>{const data=event.data||{};if(data.kind==='progress')config.progress?.(data.key,data.current,data.total);else if(data.kind==='result')finish(null,data.output);else if(data.kind==='error')finish(new Error(data.message));};
      worker.onerror=()=>finish(new Error('Freistell-Worker konnte nicht geladen oder gestartet werden.'));worker.postMessage({input});
    })});return backgroundLibrary;
  }
  async function removeBackground(n){
    const before=stamp(n),src=n.currentSrc||n.src;
    const library=await loadBackgroundLibrary();
    const image=new Image();image.crossOrigin='anonymous';image.src=src;await image.decode();
    const canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    let input;try{input=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));}catch{throw new Error('Dieses Bild lässt sich wegen seiner Herkunft nicht lokal freistellen.');}
    if(!input)throw new Error('Bildvorbereitung fehlgeschlagen.');
    status('Ich stelle das Bild lokal frei … Beim ersten Mal wird das KI-Modell geladen.');
    let lastProgress=0;
    let output;try{output=await library.remove(input,{model:'isnet_quint8',device:'cpu',output:{format:'image/png',quality:1},progress:(key,current,total)=>{
      const now=Date.now();if(now-lastProgress<1500)return;lastProgress=now;
      // Download progress is visual only: do not read every chunk aloud or restart listening.
      const msg=key.startsWith('compute')?'Bild wird lokal freigestellt …':'KI-Modell wird geladen'+(total?' ('+Math.round(current/total*100)+' %)':'')+' …';
      if(panel)panel.querySelector('[data-ai-status]').textContent=msg;if(hint){hint.textContent=msg;hint.hidden=false;clearTimeout(hintTimer);}
    }});}catch(error){throw new Error('Lokales Freistellen fehlgeschlagen. Original unverändert. '+String(error.message||'').slice(0,160));}
    if(!n.isConnected||stamp(n)!==before)throw new Error('Das Original wurde inzwischen geändert. Ergebnis wird nicht eingesetzt.');
    if(!document.body.classList.contains('editing'))throw new Error('Bearbeitungsmodus wurde beendet. Original unverändert.');
    if(!(output instanceof Blob)||output.type!=='image/png')throw new Error('Kein gültiges Freistellergebnis.');
    const decoded=await createImageBitmap(output),check=document.createElement('canvas');check.width=decoded.width;check.height=decoded.height;const ctx=check.getContext('2d',{willReadFrequently:true});ctx.drawImage(decoded,0,0);decoded.close();
    const data=ctx.getImageData(0,0,check.width,check.height).data;let visible=0,transparent=0;for(let i=3;i<data.length;i+=4){if(data[i]>220)visible++;if(data[i]<30)transparent++;}
    if(visible<100||transparent<100)throw new Error('Kein eindeutiges Motiv mit transparentem Hintergrund erkannt. Original unverändert.');
    if(typeof window.KPReplaceImage!=='function')throw new Error('Bildspeicher nicht verfügbar.');recordHistory();await window.KPReplaceImage(new File([output],'freigestellt.png',{type:'image/png'}),n);checkpoint();
  }
  async function applyOperation(op){
    const n=validateOperation(op),S=window.KPStudio;
    if(['undo','redo'].includes(op.type)){if(!window.KPHistoryState?.[op.type==='undo'?'canUndo':'canRedo']?.())throw new Error('Keine passende Änderung im Verlauf.');clickControl('[data-history="'+op.type+'"]');return;}
    if(op.type==='save'){if(typeof window.KPSaveAndWait!=='function')throw new Error('Serverspeicher nicht verfügbar.');if(!await window.KPSaveAndWait('draft'))throw new Error('Entwurf konnte nicht gespeichert werden.');return;}
    if(['preview','versions','export','import'].includes(op.type)){clickControl('[data-studio="'+op.type+'"]');return;}
    if(op.type==='settings'){window.KPInline?.openSheet(true);clickControl('[data-il="more"]');return;}
    if(op.type==='snap'){if(typeof window.KPSetSnap!=='function')throw new Error('Raster nicht verfügbar.');window.KPSetSnap(op.value);return;}
    if(op.type==='addPage'){
      const name=op.value.trim(),slug=name.toLowerCase().replace(/[^a-z0-9äöüß]+/gi,'-').replace(/^-|-$/g,'')||'neue-seite';
      if(document.getElementById(slug))throw new Error('Eine Seite mit diesem Namen existiert bereits.');
      const nav=document.querySelector('.desktop-nav'),mobile=document.querySelector('.mobile-menu nav'),main=document.querySelector('main');if(!nav||!mobile||!main)throw new Error('Seitennavigation nicht verfügbar.');
      recordHistory();const section=document.createElement('section');section.className='section custom-page';section.id=slug;const heading=document.createElement('h2');heading.textContent=name;section.append(heading);main.append(section);
      for(const container of [nav,mobile]){const a=document.createElement('a');a.href='#'+slug;a.textContent=name;container.append(a);}checkpoint();S?.select(section);return;
    }
    S?.select(n);
    if(op.type==='select'){n.scrollIntoView({block:'center',behavior:'smooth'});return;}
    if(['duplicate','delete','up','down','parent','detail'].includes(op.type)){recordHistory();clickControl('[data-element="'+({duplicate:'copy',delete:'remove',detail:'open'}[op.type]||op.type)+'"]',S.inspector);return;}
    if(op.type==='replaceImage'){window.KPInline?.openImageSheet(n,'img');return;}
    if(op.type==='crop'){
      if(n.closest('.piece')&&op.value!=='4:3')throw new Error('Repertoirebilder verwenden das Format 4:3.');
      const image=new Image();image.crossOrigin='anonymous';image.src=n.currentSrc||n.src;await image.decode();
      const ratio={'1:1':1,'4:3':4/3,'16:9':16/9}[op.value],sw=image.naturalWidth,sh=image.naturalHeight,cw=Math.min(sw,sh*ratio),ch=cw/ratio;
      const canvas=document.createElement('canvas');canvas.width=Math.round(Math.min(cw,1600));canvas.height=Math.round(canvas.width/ratio);canvas.getContext('2d').drawImage(image,(sw-cw)/2,(sh-ch)/2,cw,ch,0,0,canvas.width,canvas.height);
      let blob;try{blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));}catch{throw new Error('Dieses Bild lässt sich wegen seiner Herkunft nicht zuschneiden.');}
      if(!blob||typeof window.KPReplaceImage!=='function')throw new Error('Bildspeicher nicht verfügbar.');recordHistory();await window.KPReplaceImage(new File([blob],'zugeschnitten.png',{type:'image/png'}),n);checkpoint();return;
    }
    if(op.type==='removeBackground'){await removeBackground(n);return;}
    if(op.type==='imagePreset'){clickControl('[data-image-preset="'+op.value+'"]',S.inspector);return;}
    if(op.type==='imageAdjustment'||op.type==='width'){
      const field=S.inspector.querySelector(op.type==='width'?'[data-property="width"]':'[data-image-adjust="'+op.property+'"]');const value=Number(op.value);
      if(!field||!Number.isFinite(value)||value<Number(field.min)||value>Number(field.max))throw new Error('Wert liegt außerhalb des erlaubten Bereichs.');recordHistory();field.value=String(value);field.dispatchEvent(new Event('input',{bubbles:true}));return;
    }
    recordHistory();
    if(op.type==='style')n.style.setProperty(styleNames[op.property]||op.property,op.property==='fontSize'?Number(op.value)+'px':String(op.value),'important');
    if(op.type==='text')n.textContent=op.value;
    if(op.type==='link')n.setAttribute('href',safeLink(op.url));
    if(op.type==='alt')n.alt=op.value;
    if(['addText','addButton','addImage'].includes(op.type)){
      if(op.type==='addImage'){const image=document.createElement('img');image.src='images/homeseite_koblenzer_puppenspiele.jpg';image.alt='Neues Bild';image.dataset.editableImage='true';image.style.maxWidth='320px';n.append(image);checkpoint();S?.select(image);window.KPInline?.openImageSheet(image,'img');return;}
      const child=document.createElement(op.type==='addButton'?'a':'p');child.textContent=op.value;if(op.type==='addButton'){child.className='button primary';child.href=safeLink(op.url);}n.append(child);S?.select(child);
    }
    checkpoint();
  }
  async function directCommand(prompt){
    if(directBusy)return;directBusy=true;paint();
    try{
      if(!document.body.classList.contains('editing'))throw new Error('Bearbeitungsmodus erforderlich.');
      const words=prompt.toLowerCase().replace(/[.,!?;:]/g,' ').replace(/\s+/g,' ').trim();
      if(/^(abbrechen|vergiss das|nein|nein danke)$/.test(words)){conversation=[];pendingDelete=null;pendingBackground=null;status('Abgebrochen.');return;}
      if(pendingBackground){
        if(/^(ja|ja bitte|bestätigen|bestätige|mach das|freistellen)$/.test(words)){const job=pendingBackground;pendingBackground=null;if(!job.node.isConnected||stamp(job.node)!==job.before)throw new Error('Das Bild wurde inzwischen geändert. Bitte erneut auswählen.');targets.set(job.op.id,job.node);await applyOperation(job.op);conversation=[];status('Bild lokal freigestellt. Rückgängig ist möglich.');return;}
        pendingBackground=null;
      }
      if(pendingDelete){
        if(/^(ja|ja bitte|bestätigen|bestätige|löschen|ja löschen|mach das)$/.test(words)){const {op,node,before}=pendingDelete;pendingDelete=null;if(!node.isConnected||stamp(node)!==before)throw new Error('Der Eintrag hat sich verändert. Bitte erneut benennen.');targets.set(op.id,node);await applyOperation(op);conversation=[];status('Eintrag gelöscht. Rückgängig ist möglich.');return;}
        pendingDelete=null;
      }
      context();let local;
      if(!/\b(nicht|kein|keine)\b/.test(words)){
        if(/rückgängig|rueckgaengig|\bundo\b/.test(words)||/^(bitte )?(zurück|zurueck)$/.test(words))local={type:'undo'};
        else if(/^(bitte )?(wiederholen|wiederherstellen|redo)( bitte)?$/.test(words))local={type:'redo'};
        else if(/^(bitte )?(speichern|entwurf speichern)( bitte)?$/.test(words))local={type:'save'};
        else if(/^(vorschau|zeige die vorschau)$/.test(words))local={type:'preview'};
      }
      if(!local&&!conversation.length){const heading=[...targets].filter(([,n])=>n.tagName==='H1'&&/Koblenzer Puppenspiele/i.test(n.textContent));const matches=Object.keys(colors).filter(k=>new RegExp('\\b'+k+'\\b','i').test(words));if(heading.length===1&&/überschrift|koblenzer puppenspiele/.test(words)&&matches.length===1&&!/nicht|außer|ausser|hintergrund|alle|unten|zweite|andere/.test(words))local={id:heading[0][0],type:'style',property:'color',value:colors[matches[0]]};}
      if(!local&&!conversation.length){
        const page=prompt.trim().match(/^(?:bitte\s+)?(?:erstelle|mach|lege|füge)\s+(?:mir\s+)?(?:eine\s+)?neue\s+seite\s+(?:(?:mit dem namen|namens|mit dem titel)\s+)?[„"]?(.+?)[”"]?(?:\s+an|\s+hinzu)?[.!]?$/i);
        if(page)local={type:'addPage',value:page[1].trim()};
        const selected=window.KPStudio?.selected||window.KPCtx?.element;
        if(!local&&/stell.*frei|freistellen|entfern.*hintergrund/i.test(prompt)&&!/nicht|kein/i.test(prompt)){const image=selected?.matches('img')?selected:/header|kopfzeile/i.test(prompt)?document.querySelector('.masthead img'):null;if(image)local={type:'removeBackground',id:idFor(image)};}
      }
      let result={message:''};const before=new Map([...targets].map(([id,n])=>[id,stamp(n)]));
      if(local)result.operations=[local];else{
        status('Ich prüfe deinen Wunsch …');if(!csrf)csrf=(await request('api/code-editor.php?action=session')).csrf;
        result=await request('api/ai-draft.php',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action:'editor-command',prompt,elements:context(),conversation})});
      }
      conversation.push({role:'user',text:prompt.slice(0,1800)});conversation.push({role:'assistant',text:String(result.message||'').slice(0,1000)});conversation=conversation.slice(-8);
      if(!Array.isArray(result.operations)||result.operations.length>1)throw new Error('Kein eindeutiger Editorbefehl erhalten.');
      if(!result.operations.length){status(result.message||'Welches Element und welche Änderung meinst du?');return;}
      const op=result.operations[0],node=validateOperation(op);
      if(node&&stamp(node)!==before.get(op.id))throw new Error('Das Element wurde inzwischen geändert. Bitte erneut sprechen.');
      if(op.type==='editImage'){conversation=[];status('Die automatische KI-Bildbearbeitung wird gerade eingerichtet. Es wird weder geteilt noch eine kostenpflichtige Bild-API verwendet.');return;}
      if(op.type==='removeBackground'){pendingBackground={op,node,before:stamp(node)};status('Soll ich dieses Bild kostenlos lokal freistellen? Sag Ja oder Abbrechen. Beim ersten Mal wird ein KI-Modell heruntergeladen.');return;}
      if(op.type==='delete'){pendingDelete={op,node,before:stamp(node)};status('Soll ich „'+(node.querySelector('h1,h2,h3')?.textContent||node.textContent||node.alt||'dieses Element').trim().slice(0,80)+'“ wirklich löschen? Sag Ja oder Abbrechen.');return;}
      await applyOperation(op);conversation=[];
      status(op.type==='undo'?'Änderung rückgängig gemacht.':op.type==='save'?'Entwurf auf dem Server gespeichert.':['preview','versions','export','import','settings','replaceImage'].includes(op.type)?'Editorfunktion geöffnet.':op.type==='select'?'Element ausgewählt.':'Änderung übernommen. Rückgängig ist möglich.');
    }catch(error){status(error.message);}finally{directBusy=false;paint();resume();}
  }

  function create() {
    const button = orb = document.createElement('button');
    button.type = 'button'; button.className = 'kp-ai-float'; button.textContent = '✦ KI';
    button.dataset.transient=''; button.setAttribute('aria-label', 'Sprachassistent starten'); button.hidden = true;
    panel = document.createElement('section');
    panel.className = 'kp-ai-panel'; panel.dataset.transient=''; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'KI-Assistent');
    panel.innerHTML = '<header><strong>KI-Assistent</strong><button type="button" data-ai-close aria-label="Schließen">×</button></header>' +
      '<p>Sag, was sich ändern soll. Einfache Änderungen siehst du direkt. Es wird nichts veröffentlicht.</p>' +
      '<details><summary>Gemini-Schlüssel verwalten</summary><p>Nur auf dem Testserver gespeichert. Bei Bereinigung des privaten Serverspeichers erneut eingeben.</p><label>API-Schlüssel <input type="password" data-ai-key autocomplete="off"></label><button type="button" data-ai-save-key>Schlüssel speichern</button></details>' +
      '<label>Dein Wunsch <textarea data-ai-prompt rows="3" placeholder="Mach die Überschrift oben kleiner"></textarea></label>' +
      '<div class="kp-ai-actions"><button type="button" data-ai-mic>🎙 Sprechen</button><button type="button" data-ai-send>Ändern</button></div>' +
      '<p data-ai-status role="status" aria-live="polite"></p>'+
      '<small>Lokales Freistellen: IMG.LY · <a href="kp-background-licenses.txt" target="_blank" rel="noopener">Lizenzen</a> · <a href="https://github.com/sebastianmoschek-hash/koblenzer-puppenspiele-wordpress/tree/codex/kp-editor-ai-staging/deployments/kp-code-editor" target="_blank" rel="noopener">Quellcode</a></small>';

    mute=document.createElement('button');mute.type='button';mute.className='kp-ai-mute';mute.textContent='◼';mute.hidden=true;
    mute.dataset.transient='';mute.setAttribute('aria-label','Mikrofon ausschalten');
    hint=document.createElement('div');hint.className='kp-ai-hint';hint.dataset.transient='';hint.hidden=true;hint.setAttribute('role','status');
    document.body.append(button,hint,panel);
    mute.addEventListener('click',()=>{stopSpeech();status('Mikrofon aus.');});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSpeech();});
    let holdTimer, held=false;
    const settings=()=>{stopSpeech();panel.hidden=false;panel.querySelector('details').open=true;};
    button.addEventListener('pointerdown',()=>{held=false;holdTimer=setTimeout(()=>{held=true;settings();},600);});
    ['pointerup','pointercancel','pointerleave'].forEach(type=>button.addEventListener(type,()=>clearTimeout(holdTimer)));
    button.addEventListener('contextmenu',event=>{event.preventDefault();held=true;settings();});
    button.title='Antippen: Sprachmodus. Gedrückt halten: KI-Einstellungen.';

    button.addEventListener('click',event=>{
      if(held){held=false;return;}
      if(event.shiftKey){settings();return;}
      if(active){stopSpeech();status('Sprachmodus pausiert.');return;}
      panel.hidden=true;active=true;startListening();
    });
    panel.querySelector('[data-ai-save-key]').addEventListener('click', async () => {
      const input = panel.querySelector('[data-ai-key]');
      const save = panel.querySelector('[data-ai-save-key]');
      if (!input.value.trim()) { status('Bitte den Gemini-Schlüssel eingeben.'); return; }
      save.disabled = true;
      try {
        if (!csrf) csrf = (await request('api/code-editor.php?action=session')).csrf;
        await request('api/ai-draft.php', {method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csrf}, body:JSON.stringify({action:'save-key',key:input.value.trim()})});
        status('Schlüssel gespeichert. Eine KI-Antwort ist noch nicht geprüft.');
      } catch (error) { status(error.message); }
      finally { input.value = ''; save.disabled = false; }
    });
    panel.querySelector('[data-ai-close]').addEventListener('click', () => {stopSpeech(); panel.hidden = true;});
    panel.querySelector('[data-ai-mic]').addEventListener('click',()=>{panel.hidden=true;active=true;startListening();});
    panel.querySelector('[data-ai-send]').addEventListener('click', async () => {
      if (busy) return;
      const prompt = panel.querySelector('[data-ai-prompt]').value.trim();
      if (!prompt) {status('Bitte eine Änderung beschreiben.'); return;}
      await directCommand(prompt);
    });
    new MutationObserver(() => {
      const editing = document.body.classList.contains('editing');
      button.hidden = !editing;
      if (!editing) {panel.hidden = true; stopSpeech();}
    }).observe(document.body, {attributes:true, attributeFilter:['class']});
    button.hidden = !document.body.classList.contains('editing'); paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',create); else create();
})();
