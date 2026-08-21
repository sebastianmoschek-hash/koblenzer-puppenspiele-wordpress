import { chromium } from 'playwright';

const assets = {
  gestures: process.env.KP_TOUCH_GESTURES || '/tmp/touch-gestures.js',
  free: process.env.KP_TOUCH_FREE || '/tmp/touch-free-layout.js',
  bridge: process.env.KP_TOUCH_BRIDGE || '/tmp/touch-editor-bridge.js',
  menuX: process.env.KP_MENU_X || '/tmp/owner-menu-x.js',
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const fail = message => { throw new Error(message); };

async function bootstrap() {
  await page.setContent(`<!doctype html><html><body>
    <div class="kp-fe2-toolbar" style="position:fixed;top:0;left:0;z-index:20;background:#fff">
      <button class="kp-fe2-save">Speichern</button>
      <button class="kp-fe2-undo">Rückgängig</button>
      <div class="kp-fe2-hint"></div><div class="kp-fe2-toast"></div>
    </div>
    <button data-action="design" id="open-design" style="position:absolute;left:12px;top:80px">Design</button>
    <div class="kp-oa-backdrop is-open"><div class="kp-oa-sheet is-design">
      <button class="kp-oa-design-save">Design speichern</button>
      <button class="kp-oa-design-reset">Design zurücksetzen</button>
      <div class="kp-oa-tab" data-pane="menu"><h3>Handy / Tablet</h3></div>
    </div></div>
    <div id="generic" data-kp-edit-key="generic-test" style="position:absolute;left:30px;top:150px;width:120px;height:80px;background:#ddd">Generic</div>
    <header class="kp-header-stage"><img id="header-image" alt="" style="position:absolute;left:210px;top:130px;width:90px;height:70px" /></header>
    <nav class="kp-site-nav"><button class="wp-block-navigation__responsive-container-open" style="position:absolute;left:300px;top:70px;width:50px;height:50px">Menü</button>
      <div class="wp-block-navigation__responsive-container"><div class="wp-block-navigation__responsive-close" style="position:absolute;left:70px;top:390px;width:250px;height:240px;background:#ccc">Menükarte</div></div>
    </nav>
  </body></html>`);

  await page.evaluate(() => {
    window.__writes = [];
    window.__nativeSaveClicks = 0;
    window.KPFrontendEditorV2 = { editMode: true };
    window.KPTouchGestures = { editMode:true, canEdit:true, holdMs:320, ajaxUrl:'/ajax', nonce:'nonce', pageKey:'post-1', global:{}, page:{} };
    window.KPFreeLayout = { editMode:true, canEdit:true, holdMs:320, ajaxUrl:'/ajax', nonce:'nonce', pageKey:'post-1', global:{}, page:{} };
    window.KPOwnerMenuX = { ajaxUrl:'/ajax', nonce:'nonce', value:0 };
    window.fetch = async (_url, init = {}) => {
      const body = init.body;
      const action = body instanceof FormData ? String(body.get('action') || '') : '';
      window.__writes.push(action);
      let global = {}, page = {};
      try { global = JSON.parse(String(body?.get?.('global') || '{}')); } catch {}
      try { page = JSON.parse(String(body?.get?.('page') || '{}')); } catch {}
      const value = Number(body?.get?.('value') || 0);
      return new Response(JSON.stringify({success:true,data:{global,page,value}}), {status:200,headers:{'content-type':'application/json'}});
    };
    document.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('.kp-fe2-save')) window.__nativeSaveClicks += 1;
    });
  });

  await page.addScriptTag({ path: assets.gestures });
  await page.addScriptTag({ path: assets.free });
  await page.addScriptTag({ path: assets.bridge });
  await page.addScriptTag({ path: assets.menuX });
}

async function drag(selector, dx, dy, hold = 380) {
  const box = await page.locator(selector).boundingBox();
  if (!box) fail(`Kein sichtbares Element für ${selector}`);
  const x = box.x + box.width/2, y = box.y + box.height/2;
  await page.mouse.move(x,y); await page.mouse.down(); await page.waitForTimeout(hold);
  await page.mouse.move(x+dx,y+dy,{steps:5}); await page.mouse.up(); await page.waitForTimeout(35);
}

async function pinch(selector, startGap=40, endGap=100) {
  return page.evaluate(({selector,startGap,endGap}) => {
    const el=document.querySelector(selector);
    if (!(el instanceof Element) || typeof Touch!=='function' || typeof TouchEvent!=='function') return false;
    const r=el.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
    const mk=(id,x,y)=>new Touch({identifier:id,target:el,clientX:x,clientY:y,pageX:x,pageY:y,screenX:x,screenY:y,radiusX:2,radiusY:2,rotationAngle:0,force:1});
    const fire=(type,touches,changed)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches,targetTouches:touches,changedTouches:changed}));
    const a0=mk(1,cx-startGap/2,cy), b0=mk(2,cx+startGap/2,cy); fire('touchstart',[a0,b0],[a0,b0]);
    const a1=mk(1,cx-endGap/2,cy), b1=mk(2,cx+endGap/2,cy); fire('touchmove',[a1,b1],[a1,b1]); fire('touchend',[],[a1,b1]);
    return true;
  },{selector,startGap,endGap});
}

async function orangeSave() { await page.locator('.kp-fe2-save').click(); await page.waitForTimeout(160); }

try {
  await bootstrap();

  await drag('#generic',44,26);
  let s=await page.evaluate(()=>({move:document.querySelector('#generic')?.style.translate||'',dirty:window.KPTouchGestureRuntime?.isDirty?.(),writes:[...window.__writes]}));
  if(!s.dirty||!s.move||s.move==='0px 0px') fail('Generic-Drag funktioniert nicht.');
  if(s.writes.length) fail(`Generic-Drag speichert automatisch: ${s.writes.join(', ')}`);
  await orangeSave();
  s=await page.evaluate(()=>({dirty:window.KPTouchGestureRuntime?.isDirty?.(),writes:[...window.__writes],native:window.__nativeSaveClicks}));
  if(s.dirty||s.writes.filter(x=>x==='kp_touch_gesture_save').length!==1||s.native!==1) fail(`Orange Speichern für Generic fehlerhaft: ${JSON.stringify(s)}`);

  const before=await page.locator('#generic').evaluate(el=>el.style.translate);
  const writesBeforeUndo=await page.evaluate(()=>window.__writes.length);
  await drag('#generic',30,0); await page.locator('.kp-fe2-undo').click(); await page.waitForTimeout(50);
  const undo=await page.evaluate(()=>({move:document.querySelector('#generic')?.style.translate||'',writes:window.__writes.length,dirty:window.KPTouchGestureRuntime?.isDirty?.()}));
  if(undo.move!==before||undo.writes!==writesBeforeUndo||!undo.dirty) fail(`Rückgängig fehlerhaft: ${JSON.stringify(undo)}`);
  await orangeSave();

  const writesBeforePinch=await page.evaluate(()=>window.__writes.length), scaleBefore=await page.locator('#generic').evaluate(el=>el.style.scale||'1');
  if(!await pinch('#generic')) fail('Synthetischer Pinch nicht unterstützt.');
  await page.waitForTimeout(50);
  const ps=await page.evaluate(()=>({scale:document.querySelector('#generic')?.style.scale||'1',dirty:window.KPTouchGestureRuntime?.isDirty?.(),writes:window.__writes.length}));
  if(ps.scale===scaleBefore||Number(ps.scale)<=1||!ps.dirty||ps.writes!==writesBeforePinch) fail(`Pinch/Auto-Save fehlerhaft: ${JSON.stringify(ps)}`);
  await orangeSave();

  const menuBefore=await page.locator('.wp-block-navigation__responsive-close').evaluate(el=>el.style.transform), writesBeforeMenu=await page.evaluate(()=>window.__writes.length), nativeBefore=await page.evaluate(()=>window.__nativeSaveClicks);
  await drag('.wp-block-navigation__responsive-close',52,-18);
  const ms=await page.evaluate(()=>({transform:document.querySelector('.wp-block-navigation__responsive-close')?.style.transform||'',dirty:window.KPFreeLayoutRuntime?.isDirty?.(),writes:window.__writes.length}));
  if(!ms.dirty||!ms.transform||ms.transform===menuBefore||ms.writes!==writesBeforeMenu) fail(`Menükarte/Auto-Save fehlerhaft: ${JSON.stringify(ms)}`);
  await orangeSave();
  const saved=await page.evaluate(()=>({writes:[...window.__writes],native:window.__nativeSaveClicks,free:window.KPFreeLayoutRuntime?.isDirty?.(),generic:window.KPTouchGestureRuntime?.isDirty?.()}));
  const menuWrites=saved.writes.slice(writesBeforeMenu);
  if(!menuWrites.includes('kp_touch_free_layout_save')||saved.free||saved.generic||saved.native!==nativeBefore+1) fail(`Menü-Speichern fehlerhaft: ${JSON.stringify(saved)}`);

  await page.locator('#open-design').click(); await page.waitForTimeout(40);
  const slider=page.locator('[data-kp-menu-x] input[type="range"]');
  if(await slider.count()!==1) fail('Horizontaler Handy-/Tablet-Menüregler fehlt.');
  const writesBeforeSlider=await page.evaluate(()=>window.__writes.length);
  await slider.evaluate(el=>{el.value='64';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const live=await page.evaluate(()=>({css:document.documentElement.style.getPropertyValue('--kp-owner-menu-offset-x').trim(),writes:window.__writes.length}));
  if(live.css!=='64px'||live.writes!==writesBeforeSlider) fail(`Menüregler Live/Auto-Save fehlerhaft: ${JSON.stringify(live)}`);
  await page.locator('.kp-oa-design-save').evaluate(el=>el.click()); await page.waitForTimeout(100);
  const sliderNewWrites=await page.evaluate(n=>window.__writes.slice(n),writesBeforeSlider);
  if(sliderNewWrites.filter(x=>x==='kp_owner_menu_x_save').length!==1) fail(`Menüregler wird beim Design-Speichern nicht genau einmal persistiert: ${sliderNewWrites.join(', ')}`);

  console.log('PASS: Drag, Pinch, Undo, Menükarte, orange Speichern und Handy-/Tablet-Menüregler funktionieren ohne Auto-Save.');
} finally {
  await browser.close();
}
