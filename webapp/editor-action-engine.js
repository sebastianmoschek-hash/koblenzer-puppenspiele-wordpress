/* Shared command boundary for the standalone editor. */
(() => {
  'use strict';
  if (window.KPEditorActions) return;
  const handlers = new Map();
  const history = [];
  const MAX_HISTORY = 100;

  function register(name, handler, options = {}) {
    const key = String(name || '').trim();
    if (!key || typeof handler !== 'function') throw new TypeError('Eine Action benötigt Name und Handler.');
    if (handlers.has(key) && options.replace !== true) throw new Error(`Action bereits registriert: ${key}`);
    handlers.set(key, handler);
    return () => { if (handlers.get(key) === handler) handlers.delete(key); };
  }

  async function execute(name, payload = {}, options = {}) {
    const key = String(name || '').trim();
    const handler = handlers.get(key);
    if (!handler) throw new Error(`Unbekannte Editor-Action: ${key}`);
    const transaction = {
      name: key,
      payload,
      checkpoint: () => window.__kpUndoCheckpoint?.(),
      markDirty: message => window.markDirty?.(message),
      emit: detail => window.dispatchEvent(new CustomEvent('kp-editor-action', { detail: { name: key, ...detail } }))
    };
    const result = await handler(payload, transaction);
    if (options.record !== false) {
      history.push({ name: key, at: Date.now(), payload });
      if (history.length > MAX_HISTORY) history.shift();
    }
    transaction.emit({ payload, result });
    return result;
  }

  window.KPEditorActions = Object.freeze({
    register,
    execute,
    has: name => handlers.has(String(name || '').trim()),
    list: () => [...handlers.keys()],
    recent: () => history.slice()
  });
})();
