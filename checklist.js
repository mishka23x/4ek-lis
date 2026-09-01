'use strict';

(() => {
  function reportLoadFailure(src) {
    const status = document.getElementById('appStatus');
    if (status) status.textContent = `Не удалось загрузить скрипт приложения: ${src}`;
  }

  function loadScript(src, onload, onerror) {
    const script = document.createElement('script');
    script.src = src;
    script.onload = onload || null;
    script.onerror = () => {
      if (typeof onerror === 'function') onerror();
      else reportLoadFailure(src);
    };
    document.head.appendChild(script);
  }

  function loadCoreAndAnalytics() {
    loadScript('checklist-core.js', () => loadScript('analytics.js'));
  }

  // Curated upstream copy corrections are optional at runtime: if the small
  // reconciliation layer fails to load, the hardened baseline checklist still
  // starts normally rather than becoming unavailable.
  loadScript(
    'template-corrections.js',
    loadCoreAndAnalytics,
    () => {
      console.warn('4ek-lis: optional upstream template corrections could not be loaded');
      loadCoreAndAnalytics();
    }
  );
})();
