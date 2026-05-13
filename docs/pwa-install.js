(function () {
  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent('moremi:pwa-installable'));
  });

  window.moremiPwaInstall = function () {
    if (!deferredPrompt) return Promise.resolve(false);
    deferredPrompt.prompt();
    return deferredPrompt.userChoice.then(function (choice) {
      deferredPrompt = null;
      return choice.outcome === 'accepted';
    });
  };

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('moremi:pwa-installed'));
  });
})();
