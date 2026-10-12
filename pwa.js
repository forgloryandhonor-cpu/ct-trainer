(function () {
  'use strict';

  const app = document.getElementById('app');
  const build = document.querySelector('meta[name="app-build"]').content;
  let status = 'loading';
  let registration;
  let busy = false;
  let resolveReady;
  const ready = new Promise(function (resolve) { resolveReady = resolve; });
  const labels = {
    loading: 'Подготовка к работе офлайн…',
    ready: 'Работает без интернета',
    error: 'Не удалось сохранить для работы офлайн',
    unsupported: 'Офлайн-режим недоступен в этом браузере'
  };

  function paintStatus() {
    document.documentElement.dataset.offline = status;
    const footer = app.querySelector('.home-footer');
    if (!footer) return;
    const shield = footer.querySelector('svg');
    footer.replaceChildren();
    if (shield) footer.appendChild(shield);
    const label = document.createElement('span');
    label.textContent = labels[status];
    footer.appendChild(label);
    footer.setAttribute('role', 'status');
    if (status === 'error') {
      const retry = document.createElement('button');
      retry.className = 'text-button offline-retry';
      retry.textContent = 'Повторить';
      retry.addEventListener('click', prepare);
      footer.appendChild(retry);
    }
  }

  function setStatus(value) {
    status = value;
    paintStatus();
    if (value !== 'loading') resolveReady(value);
  }

  function activated(worker) {
    return new Promise(function (resolve, reject) {
      const timeout = setTimeout(function () { cleanup(); reject(new Error('Offline installation timed out')); }, 30000);
      function cleanup() { clearTimeout(timeout); worker.removeEventListener('statechange', check); }
      function check() {
        if (worker.state === 'activated') { cleanup(); resolve(worker); }
        else if (worker.state === 'redundant') { cleanup(); reject(new Error('Offline installation failed')); }
      }
      worker.addEventListener('statechange', check);
      check();
    });
  }

  function checkCache(worker) {
    return new Promise(function (resolve, reject) {
      const channel = new MessageChannel();
      const timeout = setTimeout(function () { channel.port1.close(); reject(new Error('Offline cache timed out')); }, 30000);
      channel.port1.onmessage = function (event) {
        clearTimeout(timeout);
        channel.port1.close();
        if (event.data && event.data.ok && event.data.build === build) resolve();
        else reject(new Error('Offline cache is incomplete'));
      };
      worker.postMessage({ type: 'PREPARE_OFFLINE' }, [channel.port2]);
    });
  }

  async function prepare() {
    if (busy) return;
    if (!window.isSecureContext || !('serviceWorker' in navigator)) { setStatus('unsupported'); return; }
    busy = true;
    setStatus('loading');
    try {
      registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      let worker = registration.active;
      if (!worker) {
        worker = registration.installing || registration.waiting;
        if (!worker) throw new Error('Offline worker is unavailable');
      }
      if (worker.state !== 'activated') await activated(worker);
      await checkCache(worker);
      setStatus('ready');
    } catch (_) {
      setStatus('error');
    } finally {
      busy = false;
    }
  }

  // Only screen replacements are observed; updating the footer cannot cause a loop.
  new MutationObserver(paintStatus).observe(app, { childList: true });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && registration && navigator.onLine) registration.update().catch(function () {});
  });
  window.VDPWA = Object.freeze({ ready: ready, get status() { return status; } });
  prepare();
})();
