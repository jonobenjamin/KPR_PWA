/**
 * Portal chrome: avatar initials + account dropdown (Bootstrap 5).
 * Requires window.firebasePortal from js/firebase-config.js for Firebase flows.
 * After Firebase is ready: AuthPortal.waitForFirebase().then(() => wirePortalShellUi()).
 */
(function () {
  'use strict';

  var LOGIN_DEFAULT = 'login.html';

  function initialsFromLabel(label) {
    if (!label || typeof label !== 'string') return '··';
    var t = label.trim();
    if (!t) return '··';
    var parts = t.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    var local = t.indexOf('@') !== -1 ? t.split('@')[0] : t;
    local = local.replace(/[^a-zA-Z0-9]/g, '');
    if (!local.length) return '··';
    if (local.length === 1) return (local + local).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }

  function setInitialsEl(el, label) {
    if (!el) return;
    var s = initialsFromLabel(label);
    el.textContent = s;
  }

  async function resolveDisplayLabel(user, fp) {
    if (!user) return '';
    try {
      if (fp && fp.db && fp.doc && fp.getDoc) {
        var snap = await fp.getDoc(fp.doc(fp.db, 'users', user.uid));
        if (snap.exists()) {
          var n = snap.data().name;
          if (n && typeof n === 'string' && n.trim()) return n.trim();
        }
      }
    } catch (e) {
      console.warn('portal-app-shell: users doc read:', e);
    }
    if (user.displayName && String(user.displayName).trim()) return String(user.displayName).trim();
    if (user.email) return String(user.email).trim();
    if (user.phoneNumber) return String(user.phoneNumber).trim();
    return '';
  }

  async function applyUserToUi(user, fp, initialsEl, fallbackLabel) {
    if (!initialsEl) return;
    if (!user || !fp || !fp.auth) {
      setInitialsEl(initialsEl, fallbackLabel || 'Admin');
      return;
    }
    var label = await resolveDisplayLabel(user, fp);
    setInitialsEl(initialsEl, label || fallbackLabel || '··');

    var profile = document.getElementById('userAvatarProfileLink');
    if (profile) {
      profile.setAttribute('href', 'profile.html');
    }
  }

  function wirePortalShellUi(opts) {
    opts = opts || {};
    var loginUrl = opts.loginUrl || LOGIN_DEFAULT;
    var fallbackLabel = opts.fallbackInitialsLabel || 'Admin';

    var initialsEl = document.getElementById('userAvatarInitials');
    var signOutEl = document.getElementById('userAvatarSignOut');
    var btn = document.getElementById('userAvatarMenuBtn');
    var ribbon = opts.ribbonSelector
      ? document.querySelector(opts.ribbonSelector)
      : (document.querySelector('.app-page-header') || document.querySelector('.top-ribbon'));
    if (ribbon) ribbon.classList.add('has-user-avatar-fixed');

    function goLogin() {
      window.location.href = loginUrl;
    }

    if (signOutEl) {
      signOutEl.addEventListener('click', function (e) {
        e.preventDefault();
        var fp = window.firebasePortal;
        if (fp && fp.signOut && fp.auth) {
          fp.signOut(fp.auth).catch(function () {}).finally(goLogin);
        } else {
          goLogin();
        }
      });
    }

    var fp = window.firebasePortal;

    if (!fp || !fp.auth) {
      applyUserToUi(null, null, initialsEl, fallbackLabel);
      return;
    }

    fp.onAuthStateChanged(fp.auth, function (user) {
      applyUserToUi(user, fp, initialsEl, fallbackLabel);
    });

    if (typeof window.bootstrap !== 'undefined' && btn) {
      try {
        new window.bootstrap.Dropdown(btn);
      } catch (_) { /* noop */
      }
    }
  }

  window.wirePortalShellUi = wirePortalShellUi;
})();
