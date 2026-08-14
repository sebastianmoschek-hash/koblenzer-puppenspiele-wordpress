(() => {
  'use strict';

  const pluginBase = `${window.location.origin}/wp-content/plugins/koblenzer-puppenspiele-core-phase2-2/assets`;

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

  const basename = (src) => {
    try {
      const url = new URL(src, window.location.href);
      return decodeURIComponent(url.pathname.split('/').pop() || '').replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp|gif|avif)$)/i, '');
    } catch (_) {
      return String(src || '').split('/').pop().split('?')[0].replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp|gif|avif)$)/i, '');
    }
  };

  const aliases = {
    'faust_repertoire.jpg': 'legacy-repertoire/faust_repertoire.jpg',
    'ein_baum_fuer_den_weihnachtsmann_repertoire.jpg': 'legacy-repertoire/ein_baum_fuer_den_weihnachtsmann_repertoire.jpg',
    'bjoern_christian_kuepper.png': 'legacy-ensemble/bjoern_christian_kuepper.png',
    'sarah_juengling.png': 'legacy-ensemble/sarah_juengling.png',
    'sebastian_moschek.png': 'legacy-ensemble/sebastian_moschek.png',
    'ursula_birgid_kuepper.png': 'legacy-ensemble/ursula_birgid_kuepper.png',
    'martin_wolfram.png': 'legacy-ensemble/martin_wolfram.png',
    'gordian_schneider.png': 'legacy-ensemble/gordian_schneider.png',
    'helmut_schmidt.png': 'legacy-ensemble/helmut_schmidt.png',
    'stefanie_czapla.png': 'legacy-ensemble/stefanie_czapla.png'
  };

  const tryNext = (img) => {
    let queue = [];
    try { queue = JSON.parse(img.dataset.kpFallbackQueue || '[]'); } catch (_) {}
    const next = queue.shift();
    img.dataset.kpFallbackQueue = JSON.stringify(queue);
    if (!next) {
      img.classList.add('kp-image-unavailable');
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.removeAttribute('src');
      return;
    }
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.src = next;
  };

  const prepare = (img) => {
    if (!(img instanceof HTMLImageElement) || img.dataset.kpFallbackPrepared === '1') return;
    img.dataset.kpFallbackPrepared = '1';

    const selected = img.currentSrc || img.src || '';
    const original = originalUrl(selected);
    const file = basename(original || selected);
    const queue = [];

    if (original && original !== selected) queue.push(original);
    if (aliases[file]) queue.push(`${pluginBase}/${aliases[file]}`);
    if (file) {
      queue.push(`${pluginBase}/legacy-ensemble/${encodeURIComponent(file)}`);
      queue.push(`${pluginBase}/legacy-repertoire/${encodeURIComponent(file)}`);
      queue.push(`${pluginBase}/legacy-referenzen/${encodeURIComponent(file)}`);
    }

    img.dataset.kpFallbackQueue = JSON.stringify([...new Set(queue)]);
    tryNext(img);
  };

  document.addEventListener('error', (event) => {
    if (!(event.target instanceof HTMLImageElement)) return;
    if (event.target.dataset.kpFallbackPrepared === '1') tryNext(event.target);
    else prepare(event.target);
  }, true);

  const check = () => {
    document.querySelectorAll('img').forEach((img) => {
      if (img.complete && img.naturalWidth === 0) prepare(img);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check, { once: true });
  else check();
  window.addEventListener('load', check, { once: true });
})();
