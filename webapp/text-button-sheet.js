(() => {
  'use strict';
  let target = null, legacyDone = null, legacyBefore = '', v2TargetId = '', draft = null;
  const q = selector => document.querySelector(selector);
  const editing = () => document.body.classList.contains('editing');
  const textSelector = 'h1,h2,h3,h4,h5,h6,p,li,figcaption,blockquote,.brand';
  const buttonSelector = 'a.btn,a.ghost,main button';
  const number = (value, fallback) => Number.isFinite(parseFloat(value)) ? parseFloat(value) : fallback;
  const hex = color => { const values = String(color).match(/\d+/g); return !values || values.length < 3 ? '#ffffff' : `#${values.slice(0, 3).map(value => (+value).toString(16).padStart(2, '0')).join('')}`; };
  function modelElement() {
    if (!v2TargetId) return null;
    for (const page of window.KPEditorV2?.store.get().document.pages || []) for (const section of page.sections) {
      const element = section.elements.find(item => item.id === v2TargetId);
      if (element) return element;
    }
    return null;
  }
  function checkpoint() { if (!v2TargetId && !legacyDone) legacyDone = window.__kpUndoCheckpoint?.(); }
  function preview(property, value) {
    if (!target || !draft) return;
    if (property === 'text') target.textContent = value;
    else if (property === 'href' && target.tagName === 'A') target.setAttribute('href', value || '#');
    else target.style[property] = typeof value === 'number' && ['fontSize', 'letterSpacing', 'borderRadius'].includes(property) ? `${value}px` : String(value);
  }
  function slider(name, label, min, max, step) { return `<label>${label} <output data-${name}-out></output><input data-${name} type="range" min="${min}" max="${max}" step="${step}"></label>`; }
  function ui() {
    let panel = q('#kpElementSheet');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'kpElementSheet'; panel.hidden = true;
    panel.innerHTML = `<div class="kp-es-scrim"></div><div class="kp-es-sheet"><div class="kp-es-grab"></div><header><strong data-title>Bearbeiten</strong><button data-done>Fertig</button></header><main><section data-text><label>Text<textarea data-content rows="3"></textarea></label><div class="kp-es-row"><button data-align="left">Links</button><button data-align="center">Mitte</button><button data-align="right">Rechts</button></div>${slider('size','Schriftgröße',10,96,1)}${slider('lineheight','Zeilenabstand',.8,2.2,.05)}${slider('spacing','Zeichenabstand',-2,8,.25)}<label>Textfarbe <input data-color type="color"></label><div class="kp-es-row"><button data-bold>Fett</button><button data-italic>Kursiv</button></div></section><section data-button hidden><label>Buttontext<input data-label type="text"></label><label>Link<input data-link type="text" inputmode="url" placeholder="#abschnitt oder https://…"></label><label>Buttonfarbe <input data-bg type="color"></label><label>Textfarbe <input data-bcolor type="color"></label>${slider('bsize','Schriftgröße',10,48,1)}${slider('radius','Rundung',0,40,1)}</section></main></div>`;
    document.body.append(panel);
    panel.querySelector('[data-done]').onclick = finish;
    panel.querySelector('.kp-es-scrim').onclick = cancel;
    panel.querySelector('[data-content]').oninput = event => { checkpoint(); draft.text = event.target.value; preview('text', draft.text); };
    panel.querySelectorAll('[data-align]').forEach(button => button.onclick = () => { checkpoint(); draft.styles.textAlign = button.dataset.align; preview('textAlign', button.dataset.align); });
    const bindRange = (selector, field, css, output, fallback = 0) => panel.querySelector(selector).oninput = event => { checkpoint(); const value = number(event.target.value, fallback); draft.styles[field] = value; preview(css, value); panel.querySelector(output).value = field === 'lineHeight' ? value.toFixed(2) : `${value} px`; };
    bindRange('[data-size]', 'fontSize', 'fontSize', '[data-size-out]', 16);
    bindRange('[data-lineheight]', 'lineHeight', 'lineHeight', '[data-lineheight-out]', 1.2);
    bindRange('[data-spacing]', 'letterSpacing', 'letterSpacing', '[data-spacing-out]');
    bindRange('[data-bsize]', 'fontSize', 'fontSize', '[data-bsize-out]', 16);
    bindRange('[data-radius]', 'borderRadius', 'borderRadius', '[data-radius-out]');
    panel.querySelector('[data-color]').oninput = event => { checkpoint(); draft.styles.color = event.target.value; preview('color', event.target.value); };
    panel.querySelector('[data-bold]').onclick = () => { checkpoint(); draft.styles.fontWeight = String(draft.styles.fontWeight ?? draft.effective.fontWeight) >= '600' ? '400' : '800'; preview('fontWeight', draft.styles.fontWeight); };
    panel.querySelector('[data-italic]').onclick = () => { checkpoint(); draft.styles.fontStyle = (draft.styles.fontStyle ?? draft.effective.fontStyle) === 'italic' ? 'normal' : 'italic'; preview('fontStyle', draft.styles.fontStyle); };
    panel.querySelector('[data-label]').oninput = event => { checkpoint(); draft.text = event.target.value; preview('text', draft.text); };
    panel.querySelector('[data-link]').oninput = event => { checkpoint(); draft.href = event.target.value; preview('href', draft.href); };
    panel.querySelector('[data-bg]').oninput = event => { checkpoint(); draft.styles.background = event.target.value; preview('background', event.target.value); };
    panel.querySelector('[data-bcolor]').oninput = event => { checkpoint(); draft.styles.color = event.target.value; preview('color', event.target.value); };
    let sheetDrag = null; const sheet = panel.querySelector('.kp-es-sheet'), grab = panel.querySelector('.kp-es-grab');
    grab.onpointerdown = event => { sheetDrag = { id: event.pointerId, y: event.clientY }; grab.setPointerCapture?.(event.pointerId); };
    grab.onpointermove = event => { if (sheetDrag?.id === event.pointerId) sheet.style.transform = `translateY(${Math.max(0, event.clientY - sheetDrag.y)}px)`; };
    grab.onpointerup = event => { if (!sheetDrag) return; const delta = Math.max(0, event.clientY - sheetDrag.y); sheetDrag = null; delta > 100 ? cancel() : sheet.style.transform = ''; };
    return panel;
  }
  function setRange(panel, name, value, suffix = ' px') { panel.querySelector(`[data-${name}]`).value = value; panel.querySelector(`[data-${name}-out]`).value = `${value}${suffix}`; }
  function open(element) {
    if (!editing() || !element) return;
    const isButton = element.matches(buttonSelector), isText = element.matches(textSelector);
    if (!isButton && !isText) return;
    target = element; legacyDone = null; v2TargetId = element.dataset.v2Id && window.KPEditorV2 ? element.dataset.v2Id : ''; legacyBefore = v2TargetId ? '' : window.__kpHistory?.snapshot?.() || '';
    const computed = getComputedStyle(element), model = modelElement(), computedFontSize = number(computed.fontSize, 16), computedLineHeight = computed.lineHeight === 'normal' ? 1.2 : number(computed.lineHeight, computedFontSize * 1.2) / computedFontSize;
    draft = { type: isButton ? 'button' : 'text', text: model?.content?.text ?? element.textContent, href: model?.content?.href ?? element.getAttribute('href') ?? '#', styles: { ...(model?.styles || {}) }, effective: { fontSize: computedFontSize, lineHeight: computedLineHeight, letterSpacing: number(computed.letterSpacing, 0), color: hex(computed.color), background: hex(computed.backgroundColor), borderRadius: number(computed.borderRadius, 0), fontWeight: computed.fontWeight, fontStyle: computed.fontStyle, textAlign: computed.textAlign } };
    const panel = ui(); panel.hidden = false; panel.querySelector('.kp-es-sheet').style.transform = ''; panel.querySelector('[data-title]').textContent = isButton ? 'Button bearbeiten' : 'Text bearbeiten'; panel.querySelector('[data-text]').hidden = isButton; panel.querySelector('[data-button]').hidden = !isButton;
    if (isButton) { panel.querySelector('[data-label]').value = draft.text; panel.querySelector('[data-link]').value = draft.href; panel.querySelector('[data-bg]').value = draft.styles.background ?? draft.effective.background; panel.querySelector('[data-bcolor]').value = draft.styles.color ?? draft.effective.color; setRange(panel, 'bsize', Math.round(draft.styles.fontSize ?? draft.effective.fontSize)); setRange(panel, 'radius', Math.round(draft.styles.borderRadius ?? draft.effective.borderRadius)); }
    else { panel.querySelector('[data-content]').value = draft.text; panel.querySelector('[data-color]').value = draft.styles.color ?? draft.effective.color; setRange(panel, 'size', Math.round(draft.styles.fontSize ?? draft.effective.fontSize)); setRange(panel, 'lineheight', number(draft.styles.lineHeight ?? draft.effective.lineHeight, 1.2).toFixed(2), ''); setRange(panel, 'spacing', number(draft.styles.letterSpacing ?? draft.effective.letterSpacing, 0)); }
    document.body.classList.add('kp-element-sheet-open');
  }
  function finish() {
    if (v2TargetId && draft) {
      const commands = [{ name: 'setText', payload: [v2TargetId, draft.text] }, { name: 'setTextStyle', payload: [v2TargetId, draft.styles] }];
      if (draft.type === 'button') commands.push({ name: 'setButtonLink', payload: [v2TargetId, draft.href] });
      window.KPEditorV2.actions.executeBatch(draft.type === 'button' ? 'Button bearbeiten' : 'Text bearbeiten', commands);
    } else legacyDone?.();
    legacyDone = null; legacyBefore = ''; v2TargetId = ''; draft = null; ui().hidden = true; document.body.classList.remove('kp-element-sheet-open'); window.markDirty?.('Element bearbeitet – noch speichern'); target = null;
  }
  function cancel() {
    const before = legacyBefore, isV2 = Boolean(v2TargetId), element = target;
    legacyDone = null; legacyBefore = ''; v2TargetId = ''; draft = null; ui().hidden = true; document.body.classList.remove('kp-element-sheet-open');
    if (isV2 && element) { element.removeAttribute('style'); window.KPEditorV2.renderer.render(window.KPEditorV2.store.get().document, document.documentElement); } else if (before) window.__kpHistory?.restore?.(before);
    target = null;
  }
  window.addEventListener('kp-element-activate', event => { const element = event.detail?.element; if (element?.matches(`${buttonSelector},${textSelector}`)) open(element); });
  window.kpElementSheet = { open };
})();
