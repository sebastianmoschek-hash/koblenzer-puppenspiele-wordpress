(() => {
  'use strict';
  const params = new URLSearchParams(window.location.search);
  if (params.get('kp_edit') !== '1') return;

  function editableInternalUrl(anchor) {
    const raw = anchor.getAttribute('href') || '';
    if (!raw || raw.startsWith('#') || /^(mailto:|tel:|sms:|javascript:)/i.test(raw)) return null;
    let url;
    try { url = new URL(raw, window.location.href); } catch (e) { return null; }
    if (!/^https?:$/i.test(url.protocol) || url.origin !== window.location.origin) return null;
    url.searchParams.set('kp_edit', '1');
    return url;
  }

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest && event.target.closest('a[href]');
    if (!anchor) return;
    if (anchor.closest('#wpadminbar,.kp-fe2-toolbar,.kp-fe2-inspector,.kp-fe2-record-backdrop,.kp-owner-edit-launcher')) return;

    const url = editableInternalUrl(anchor);
    if (!url) return;

    const isSiteNavigation = !!anchor.closest('nav,.wp-block-navigation,.wp-block-navigation__responsive-container,.kp-navigation-bar,.kp-site-nav');
    const isRepertoireOpen = !!anchor.closest('.kp-repertoire-card');

    if (!isSiteNavigation && !isRepertoireOpen) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.href = url.toString();
  }, true);
})();
