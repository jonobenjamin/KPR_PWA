/**
 * Auth Portal - Firebase auth for KPR Monitoring
 * - Email PIN login (same as PWA)
 * - Role-based redirect: admin -> map.html + user-submissions, viewer/user -> map-users.html
 * - Protects map.html, user-submissions.html, map-users.html
 */

const API_BASE = 'https://moremi-pwa.vercel.app';

const KPR_POST_LOGIN_PAGES = {
  'profile.html': ['admin', 'user', 'viewer'],
  'map.html': ['admin'],
  'map-users.html': ['admin', 'user', 'viewer'],
  'user-submissions.html': ['admin'],
  'vehicle-tracker.html': ['admin']
};

function rememberPathForPostLoginRedirect() {
  try {
    const page = (typeof location !== 'undefined' ? location.pathname : '').split('/').pop() || '';
    const base = page.split('?')[0].split('#')[0];
    if (base && base !== 'login.html' && Object.prototype.hasOwnProperty.call(KPR_POST_LOGIN_PAGES, base)) {
      sessionStorage.setItem('kpr_return_after_login', base);
    }
  } catch (e) {
    /* noop */
  }
}

/** If user landed on login after a guard redirect, send them back to the page they wanted (role-checked). */
function takePostLoginRedirect(role) {
  try {
    const raw = sessionStorage.getItem('kpr_return_after_login');
    sessionStorage.removeItem('kpr_return_after_login');
    if (!raw) return null;
    const name = String(raw).split('/').pop().split('?')[0].split('#')[0];
    const allowed = KPR_POST_LOGIN_PAGES[name];
    if (!allowed || !allowed.includes(role)) return null;
    return name;
  } catch (e) {
    return null;
  }
}

/**
 * Wait until Auth has finished restoring persistence (custom token sessions can lag behind authStateReady).
 */
async function waitForResolvedUser(auth, maxWaitMs = 5000) {
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }
  if (auth.currentUser) return auth.currentUser;

  return new Promise((resolve) => {
    const deadline = Date.now() + maxWaitMs;
    let iv = null;
    let unsub = () => {};
    const done = (u) => {
      if (iv != null) {
        clearInterval(iv);
        iv = null;
      }
      try {
        unsub();
      } catch (e) {
        /* noop */
      }
      resolve(u || null);
    };
    unsub = auth.onAuthStateChanged((u) => {
      if (u) done(u);
    });
    iv = setInterval(() => {
      if (auth.currentUser) {
        done(auth.currentUser);
        return;
      }
      if (Date.now() >= deadline) done(null);
    }, 100);
  });
}

async function waitForFirebase() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.firebasePortal?.auth && window.firebasePortal?.db) resolve();
      else setTimeout(check, 50);
    };
    check();
  });
}

async function getUserRole(uid) {
  const { db, doc, getDoc } = window.firebasePortal;
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      if (data.status === 'revoked') return null;
      return data.role || 'viewer';
    }
  } catch (e) {
    console.error('Failed to get user role:', e);
  }
  return 'viewer';
}

async function loginWithPassword(email, password) {
  const emailNorm = String(email || '').trim().toLowerCase();
  if (!emailNorm || !password) throw new Error('Enter email and password');
  const { auth, signInWithEmailAndPassword, db, doc, getDoc, setDoc, serverTimestamp } = window.firebasePortal;
  await signInWithEmailAndPassword(auth, emailNorm, password);
  const user = auth.currentUser;
  if (user) {
    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      const nm = user.displayName || emailNorm.split('@')[0] || '';
      const base = {
        uid: user.uid,
        name: nm,
        email: emailNorm,
        lastLogin: serverTimestamp()
      };
      if (snap.exists()) {
        const prev = snap.data();
        await setDoc(
          userRef,
          {
            ...base,
            ...(prev.phone ? { phone: prev.phone } : {}),
            ...(prev.username ? { username: prev.username } : {}),
            ...(prev.role ? { role: prev.role } : {}),
            ...(prev.status ? { status: prev.status } : {})
          },
          { merge: true }
        );
      } else {
        await setDoc(userRef, { ...base, role: 'user', status: 'active' }, { merge: true });
      }
    } catch (e) {
      console.warn('Could not update user doc after password login:', e);
    }
  }
  return { email: emailNorm, name: user?.displayName || '' };
}

async function requestPin(email, name) {
  const res = await fetch(`${API_BASE}/api/moremi-auth/request-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to send PIN');
  return data;
}

async function verifyPin(email, pin) {
  const res = await fetch(`${API_BASE}/api/moremi-auth/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, pin })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Invalid PIN');
  return data;
}

async function signInWithPin(email, pin) {
  const data = await verifyPin(email, pin);
  const { auth, signInWithCustomToken, db, doc, getDoc, setDoc, serverTimestamp } = window.firebasePortal;
  await signInWithCustomToken(auth, data.customToken);
  const user = auth.currentUser;
  if (user) {
    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      const base = {
        uid: user.uid,
        name: data.name || '',
        email: email.toLowerCase(),
        lastLogin: serverTimestamp()
      };
      await setDoc(userRef, snap.exists() ? base : { ...base, role: 'user', status: 'active' }, { merge: true });
    } catch (e) {
      console.warn('Could not update user doc:', e);
    }
  }
  return data;
}

function redirectByRole(role, returnUrl) {
  const next = takePostLoginRedirect(role);
  if (next) {
    window.location.href = next;
    return;
  }
  if (role === 'admin') {
    if (returnUrl && returnUrl.includes('user-submissions')) {
      window.location.href = 'user-submissions.html';
    } else {
      window.location.href = 'map.html';
    }
  } else {
    window.location.href = 'map-users.html';
  }
}

async function checkAuthAndRedirect(isLoginPage = false) {
  await waitForFirebase();
  const { auth } = window.firebasePortal;

  const user = await waitForResolvedUser(auth);

  if (!user) {
    if (!isLoginPage) {
      rememberPathForPostLoginRedirect();
      window.location.replace('login.html');
    }
    return null;
  }

  const role = await getUserRole(user.uid);
  if (!role) {
    await auth.signOut();
    if (!isLoginPage) {
      rememberPathForPostLoginRedirect();
      window.location.replace('login.html');
    }
    return null;
  }

  if (isLoginPage) {
    redirectByRole(role, document.referrer);
  }

  return { user, role };
}

function canAccessPage(role, page) {
  if (page === 'map-users.html') return true;
  if (page === 'map.html' || page === 'user-submissions.html') return role === 'admin';
  return false;
}

window.AuthPortal = {
  waitForFirebase,
  waitForResolvedUser,
  getUserRole,
  loginWithPassword,
  requestPin,
  verifyPin,
  signInWithPin,
  redirectByRole,
  takePostLoginRedirect,
  checkAuthAndRedirect,
  canAccessPage
};
