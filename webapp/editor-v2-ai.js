/* Provider-neutral Live AI contracts. No external provider is enabled by default. */
(() => {
  'use strict';
  const v2 = window.KPEditorV2;
  if (!v2 || window.KPEditorV2AI) return;
  const allowedActions = new Set(Object.keys(v2.actions).filter(name => name !== 'apply'));
  const validatePlan = plan => {
    if (!plan || !Array.isArray(plan.actions) || plan.actions.length === 0) return { ok: false, error: 'Leerer oder ungültiger Action-Plan' };
    const invalid = plan.actions.find(action => !action || !allowedActions.has(action.name));
    return invalid ? { ok: false, error: `Nicht erlaubte Action: ${invalid?.name || 'unbekannt'}` } : { ok: true };
  };
  function createLiveSession(provider = null) {
    let state = { status: 'disconnected', microphone: false, screen: false, conversation: [] };
    const listeners = new Set();
    const emit = () => listeners.forEach(listener => listener({ ...state }));
    return {
      getState: () => ({ ...state }),
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      connect: async () => { if (!provider?.connect) throw new Error('Kein Live-AI-Provider verbunden'); state = { ...state, status: 'connecting' }; emit(); await provider.connect(); state = { ...state, status: 'connected' }; emit(); },
      disconnect: async () => { await provider?.disconnect?.(); state = { ...state, status: 'disconnected', microphone: false, screen: false }; emit(); },
      setMicrophoneSharing: enabled => { state = { ...state, microphone: Boolean(enabled) }; emit(); },
      setScreenSharing: enabled => { state = { ...state, screen: Boolean(enabled) }; emit(); },
      reset: () => { state = { status: 'disconnected', microphone: false, screen: false, conversation: [] }; emit(); }
    };
  }
  const screenContext = { snapshot: root => ({ enabled: false, requiresUserActivation: true, viewport: { width: innerWidth, height: innerHeight }, selectedElementId: v2.store.get().selection?.elementId || null, rootBounds: root?.getBoundingClientRect?.().toJSON?.() || null }) };
  window.KPEditorV2AI = Object.freeze({ allowedActions: [...allowedActions], validatePlan, createLiveSession, screenContext });
})();
