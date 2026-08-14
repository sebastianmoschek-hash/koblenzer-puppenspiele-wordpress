(() => {
  'use strict';

  const originalUrl = (src) => {
    if (!src) return '';
    try {
      const url = new URL(src, window.location.href);
      url.pathname = url.pathname.replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp|gif|avif)$)/i, '');
      return url.href;
    } catch (_) {
      return src.replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp|gif|avif)(?:\?|$))/i, '');
    }
  };

  const recover = (img) => {
    if (!(img instanceof HTMLImageElement) || img.dataset.kpOriginalRetried === '1') return;

    const selectedSource = img.currentSrc || img.src;
    const fallback = originalUrl(selectedSource);
    if (!fallback) return;

    // A broken currentSrc can come from srcset even while img.src already points
    // at the valid original. Always remove responsive candidates before retrying.
    img.dataset.kpOriginalRetried = '1';
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.src = fallback;
  };

  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement) recover(event.target);
  }, true);

  const checkImages = () => {
    document.querySelectorAll('img').forEach((img) => {
      if ((img.complete && img.naturalWidth === 0) || /-\d+x\d+\.(?:jpe?g|png|webp|gif|avif)(?:\?|$)/i.test(img.currentSrc || '')) {
        if (img.complete && img.naturalWidth === 0) recover(img);
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkImages, { once: true });
  } else {
    checkImages();
  }

  window.addEventListener('load', checkImages, { once: true });
})();
