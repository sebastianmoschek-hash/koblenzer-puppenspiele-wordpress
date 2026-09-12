/* Provider-neutral Live AI contracts. No external provider is enabled by default. */
(() => {
  'use strict';
  const v2 = window.KPEditorV2;
  if (!v2 || window.KPEditorV2AI) return;
  const allowedActions = new Set(Object.keys(v2.actions).filter(name => !['apply', 'executeBatch', 'previewBatch'].includes(name)));
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
      setScreenSharing: (enabled, options = {}) => { if (enabled && !options.userActivated) throw new Error('Bildschirmfreigabe benötigt eine ausdrückliche Benutzeraktion'); state = { ...state, screen: Boolean(enabled) }; emit(); },
      send: async input => { if (state.status !== 'connected' || !provider?.send) throw new Error('Kein Live-AI-Provider verbunden'); const reply = await provider.send(input); state = { ...state, conversation: [...state.conversation, { role: 'user', content: input }, { role: 'assistant', content: reply }] }; emit(); return reply; },
      reset: () => { state = { status: 'disconnected', microphone: false, screen: false, conversation: [] }; emit(); }
    };
  }
  function createPlanner(provider = null) {
    return {
      plan: async instruction => { if (!provider?.plan) throw new Error('Kein KI-Provider verbunden'); const plan = await provider.plan({ instruction, context: v2.context.snapshot() }); const validation = validatePlan(plan); if (!validation.ok) throw new TypeError(validation.error); return plan; },
      preview: plan => v2.ai.previewPlan(plan),
      accept: () => v2.ai.commit(),
      reject: () => v2.ai.cancel()
    };
  }
  function createMediaSession(kind) {
    let stream = null;
    const supported = () => kind === 'screen' ? Boolean(navigator.mediaDevices?.getDisplayMedia) : Boolean(navigator.mediaDevices?.getUserMedia);
    return {
      supported,
      active: () => Boolean(stream?.active),
      start: async options => { if (!options?.userActivated) throw new Error(`${kind === 'screen' ? 'Bildschirm' : 'Mikrofon'}freigabe benötigt eine ausdrückliche Benutzeraktion`); if (!supported()) throw new Error('Medienfreigabe wird von diesem Browser nicht unterstützt'); stream = kind === 'screen' ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }) : await navigator.mediaDevices.getUserMedia({ audio: true }); return stream; },
      stop: () => { stream?.getTracks().forEach(track => track.stop()); stream = null; }
    };
  }
  const screenContext = { snapshot: root => ({ enabled: false, requiresUserActivation: true, viewport: { width: innerWidth, height: innerHeight }, selectedElementId: v2.store.get().selection?.elementId || null, rootBounds: root?.getBoundingClientRect?.().toJSON?.() || null }) };
  window.KPEditorV2AI = Object.freeze({ allowedActions: [...allowedActions], validatePlan, createLiveSession, createPlanner, createAudioSession: () => createMediaSession('audio'), createScreenShareSession: () => createMediaSession('screen'), screenContext });
})();
