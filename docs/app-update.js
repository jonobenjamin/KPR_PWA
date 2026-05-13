(function () {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready.then(function (reg) {
    reg.addEventListener('updatefound', function () {
      var newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', function () {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available — skip waiting and reload.
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  });

  var refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
})();
