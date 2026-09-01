'use strict';

(() => {
  function loadScript(src, onload) {
    const script = document.createElement('script');
    script.src = src;
    script.onload = onload || null;
    script.onerror = () => {
      const status = document.getElementById('appStatus');
      if (status) status.textContent = 'Не удалось загрузить скрипт приложения.';
    };
    document.head.appendChild(script);
  }

  loadScript('checklist-core.js', () => loadScript('analytics.js'));
})();
