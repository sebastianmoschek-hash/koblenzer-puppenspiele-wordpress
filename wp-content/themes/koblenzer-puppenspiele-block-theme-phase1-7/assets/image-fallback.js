(() => {
  'use strict';

  const originalUrl = (src) => {
    if (!src) return '';
    try {
      const url = new URL(src, window.location.href);
      // WordPress generated sub-sizes normally end in -WIDTHxHEIGHT before the extension.
      url.pathname = url.pathname.replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp|gif|avif)$)/i, '');
      return url.href;
    } catch (_) {
      return src.replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp|gif|avif)(?:\?|$))/i, '');
    }
  };

  const recover = (img) => {
    if (!(img instanceof HTMLImageElement) || img.dataset.kpOriginalRetried === '1') return;
    const fallback = originalUrl(img.currentSrc || img.src);
    if (!fallback || fallback === img.src) return;
    img.dataset.kpOriginalRetried = '1';
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.src = fallback;
  };

  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement) recover(event.target);
  }, true);

  const checkLoadedImages = () => {
    document.querySelectorAll('img').forEach((img) => {
      if (img.complete && img.naturalWidth === 0) recover(img);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkLoadedImages, { once: true });
  } else {
    checkLoadedImages();
  }
})();
