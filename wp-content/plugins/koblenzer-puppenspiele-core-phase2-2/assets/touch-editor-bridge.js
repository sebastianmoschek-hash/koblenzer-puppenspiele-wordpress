(() => {
  'use strict';

  const editor = window.KPFrontendEditorV2;
  if (!editor?.editMode) return;

  const gestureActions = new Set([
    'kp_touch_gesture_save',
    'kp_touch_free_layout_save'
  ]);
  const pendingGestureSaves = new Set();
  let lastGestureFailure = '';
  let replayingMainSave = false;
  let waitingForGestureSaves = false;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function(input, init = {}) {
    const body = init?.body;
    const action = body instanceof FormData ? String(body.get('action') || '') : '';
    const responsePromise = nativeFetch(input, init);

    if (!gestureActions.has(action)) return responsePromise;

    const tracked = responsePromise.then(async response => {
      try {
        const json = await response.clone().json();
        if (!response.ok || json?.success === false) {
          lastGestureFailure = json?.data?.message || 'Position oder Größe konnte nicht gespeichert werden.';
        } else {
          /* Every gesture request contains the complete current gesture state.
             A later successful request therefore supersedes an earlier failure. */
          lastGestureFailure = '';
        }
      } catch (_) {
        if (!response.ok) lastGestureFailure = 'Position oder Größe konnte nicht gespeichert werden.';
      }
    }).catch(error => {
      lastGestureFailure = error?.message || 'Position oder Größe konnte nicht gespeichert werden.';
    }).finally(() => {
      pendingGestureSaves.delete(tracked);
    });

    pendingGestureSaves.add(tracked);
    return responsePromise;
  };

  function editorToast(message, type = 'error') {
    const toast = document.querySelector('.kp-fe2-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `kp-fe2-toast is-visible is-${type}`;
    clearTimeout(editorToast.timer);
    editorToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function waitUntilGestureSavesAreQuiet() {
    /* Let a touchend-triggered chained save enter fetch() before checking. */
    await wait(90);
    const deadline = Date.now() + 6000;

    while (Date.now() < deadline) {
      const batch = [...pendingGestureSaves];
      if (batch.length) await Promise.allSettled(batch);
      await wait(45);
      if (!pendingGestureSaves.size) break;
    }

    if (pendingGestureSaves.size) {
      throw new Error('Die Positionsänderung braucht noch zu lange. Bitte Speichern noch einmal antippen.');
    }
    if (lastGestureFailure) throw new Error(lastGestureFailure);
  }

  /* The direct editor also sees clicks bubbling from the Gutenberg navigation
     button and selects its parent block. Stop only that bubbling step at the
     button itself; WordPress' own button listener on the same element still runs. */
  function protectMenuControl(button) {
    if (!(button instanceof Element) || button.dataset.kpEditMenuTapProtected === '1') return;
    button.dataset.kpEditMenuTapProtected = '1';
    button.addEventListener('click', event => {
      event.stopPropagation();

      /* Fallback for browser/theme combinations where the core Navigation view
         listener is delegated instead of attached directly to the button. */
      const nav = button.closest('.kp-site-nav');
      const container = nav?.querySelector('.wp-block-navigation__responsive-container');
      if (!container) return;
      const opening = button.matches('.wp-block-navigation__responsive-container-open');
      setTimeout(() => {
        const isOpen = container.classList.contains('is-menu-open') || container.classList.contains('has-modal-open');
        if (opening && !isOpen) {
          container.classList.add('is-menu-open', 'has-modal-open');
          container.setAttribute('aria-hidden', 'false');
          document.documentElement.classList.add('has-modal-open');
          document.body.classList.add('kp-menu-open');
        } else if (!opening && isOpen) {
          container.classList.remove('is-menu-open', 'has-modal-open');
          container.setAttribute('aria-hidden', 'true');
          document.documentElement.classList.remove('has-modal-open');
          document.body.classList.remove('kp-menu-open');
        }
      }, 0);
    }, true);
  }

  function protectMenuControls(root = document) {
    if (root instanceof Element && root.matches('.kp-site-nav .wp-block-navigation__responsive-container-open,.kp-site-nav .wp-block-navigation__responsive-container-close')) {
      protectMenuControl(root);
    }
    root.querySelectorAll?.('.kp-site-nav .wp-block-navigation__responsive-container-open,.kp-site-nav .wp-block-navigation__responsive-container-close').forEach(protectMenuControl);
  }

  protectMenuControls();
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof Element) protectMenuControls(node);
    }));
  }).observe(document.documentElement, {childList:true, subtree:true});

  /* The orange editor save button used to reload roughly half a second after its
     own payload was stored. A drag/pinch request could still be in flight then.
     Hold the main save until every pending gesture request has definitely ended,
     then replay the original click so the existing editor save stays authoritative. */
  document.addEventListener('click', async event => {
    const button = event.target.closest?.('.kp-fe2-save');
    if (!button || replayingMainSave) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (waitingForGestureSaves) return;

    waitingForGestureSaves = true;
    button.disabled = true;
    const originalHtml = button.innerHTML;
    button.innerHTML = '<span class="dashicons dashicons-update"></span><span>Positionen sichern…</span>';

    try {
      await waitUntilGestureSavesAreQuiet();
      replayingMainSave = true;
      button.disabled = false;
      button.click();
    } catch (error) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      editorToast(error?.message || 'Position oder Größe konnte nicht gespeichert werden.');
    } finally {
      replayingMainSave = false;
      waitingForGestureSaves = false;
    }
  }, true);
})();
