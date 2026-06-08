// Authentication Service
// Import Firebase functions directly
import {
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/** Same as index.custom.html → Flutter [web_compat] localStorage scope. */
function moremiLsPrefix() {
  try {
    const path = window.location.pathname || '/';
    const seg = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)[0] || 'app';
    return 'moremi:' + seg + ':';
  } catch (e) {
    return 'moremi:app:';
  }
}

/** Moremi backend (Express on Vercel). */
const MOREMI_API_DEFAULT = 'https://moremi-pwa.vercel.app';

/** Hostnames that should never be used as MOREMI_API_BASE (deprecated deployments). */
const STALE_API_HOST_SUBSTRINGS = ['wildlife-tracker-gxz5.vercel.app'];

function moremiApiBase() {
  function isStaleApiBase(url) {
    const u = String(url || '').toLowerCase();
    return STALE_API_HOST_SUBSTRINGS.some((s) => u.includes(s));
  }
  try {
    if (typeof window !== 'undefined' && window.MOREMI_API_BASE) {
      let b = String(window.MOREMI_API_BASE).replace(/\/+$/, '');
      if (isStaleApiBase(b)) {
        console.warn('[Moremi] Ignoring stale MOREMI_API_BASE. Using', MOREMI_API_DEFAULT);
        return MOREMI_API_DEFAULT;
      }
      return b;
    }
  } catch (e) {}
  return MOREMI_API_DEFAULT;
}

/**
 * POST to Moremi auth routes. Tries `/api/moremi-auth` first (same mount as flutter-session),
 * then `/api/auth`, so one bad rewrite on Vercel does not break registration.
 */
async function moremiPostAuth(path, body) {
  const base = moremiApiBase();
  const prefixes = ['/api/moremi-auth', '/api/auth'];
  let saw404 = false;
  for (const prefix of prefixes) {
    const url = `${base}${prefix}${path}`;
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(`Network error calling ${prefix}${path}: ${e.message}`);
    }
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {}
    if (response.ok) {
      return { data, url };
    }
    if (response.status === 404) {
      saw404 = true;
      continue;
    }
    const msg = data.message || data.error || text || `Request failed (${response.status})`;
    throw new Error(msg);
  }
  if (saw404) {
    throw new Error(
      `Auth endpoint not found: ${path}. Set MOREMI_API_BASE in firebase-config.js to your live Moremi Vercel URL and deploy the backend (routes/auth register + PIN).`
    );
  }
  throw new Error(`Auth endpoint not found: ${path}`);
}

/** Map Identity Toolkit REST `error.message` codes to user-facing text. */
function mapIdentityToolkitError(raw) {
  const m = String(raw || '').trim();
  if (!m) return 'Sign-in failed. Please try again.';
  if (m.includes('INVALID_LOGIN_CREDENTIALS') || m.includes('INVALID_PASSWORD')) {
    return (
      'Invalid email or password. If this account was created with “email PIN” only, sign in with PIN — password login is for accounts registered with email + password.'
    );
  }
  if (m.includes('EMAIL_NOT_FOUND')) {
    return (
      'Invalid email or password. If this account was created with “email PIN” only, sign in with PIN — password login is for accounts registered with email + password.'
    );
  }
  if (m.includes('USER_DISABLED')) {
    return 'This account has been disabled. Contact an administrator.';
  }
  if (m.includes('OPERATION_NOT_ALLOWED')) {
    return 'Email/password sign-in is turned off in Firebase. In Firebase Console → Authentication → Sign-in method, enable Email/Password.';
  }
  if (m.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
    return 'Too many failed attempts. Wait a few minutes or reset your password.';
  }
  if (m.includes('MISSING_RECAPTCHA_TOKEN') || m.includes('RECAPTCHA')) {
    return 'Sign-in was blocked by security verification. Refresh the page and try again, or use email PIN.';
  }
  return m.replace(/_/g, ' ').toLowerCase() + '. If the problem persists, try PIN sign-in.';
}

async function identityToolkitSignInWithPassword(apiKey, email, password) {
  const url =
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' +
    encodeURIComponent(apiKey);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const raw = body.error?.message || '';
    throw new Error(mapIdentityToolkitError(raw));
  }
  if (!body.idToken) {
    throw new Error('Sign-in did not return a session. Try PIN sign-in or refresh and try again.');
  }
  return body;
}

/**
 * Exchange a fresh Firebase ID token (from REST or SDK) for a custom token so the client signs in
 * with `signInWithCustomToken` — matches PIN/register and avoids some Auth SDK code paths.
 */
async function moremiFlutterSessionExchange(idToken) {
  const base = moremiApiBase();
  const paths = ['/api/moremi-auth/flutter-session', '/api/auth/flutter-session'];
  let saw404 = false;
  for (const path of paths) {
    const url = `${base}${path}`;
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });
    } catch (e) {
      throw new Error(`Network error calling ${path}: ${e.message}`);
    }
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {}
    if (response.ok && data.customToken) {
      return data.customToken;
    }
    if (response.status === 404) {
      saw404 = true;
      continue;
    }
    const msg =
      data.message || data.error || text || `Session exchange failed (${response.status})`;
    throw new Error(msg);
  }
  if (saw404) {
    throw new Error(
      'Session endpoint not found (404). Deploy the Moremi backend with flutter-session and set MOREMI_API_BASE in firebase-config.js to that deployment.',
    );
  }
  throw new Error('Could not exchange session');
}

class AuthService {
  constructor() {
    this.currentUser = null;
    this.recaptchaVerifier = null;
    this.auth = null;
    this.db = null;
    /** Resolve after [waitForFirebase] and listeners are registered (auth-controller should await this). */
    this.ready = this.init();
  }

  async init() {
    // Wait for Firebase to be ready
    await this.waitForFirebase();

    // Get Firebase instances from global
    this.auth = window.firebaseAuth?.auth;
    this.db = window.firebaseAuth?.db;

    if (!this.auth) {
      console.error('Firebase auth not available');
      return;
    }

    onAuthStateChanged(this.auth, (user) => {
      this.currentUser = user;
      if (user) {
        console.log('User signed in:', user.uid);
        this.updateUserLastLogin(user.uid);
      } else {
        console.log('User signed out');
      }
    });

    // Keep path-scoped ID token fresh for Flutter [ensureSignedIn] / REST calls (JWT expires ~1h).
    onIdTokenChanged(this.auth, async (user) => {
      const p = moremiLsPrefix();
      try {
        if (user) {
          const t = await user.getIdToken();
          localStorage.setItem(p + 'firebaseIdToken', t);
          localStorage.setItem(p + 'firebaseUid', user.uid);
        } else {
          localStorage.removeItem(p + 'firebaseIdToken');
          localStorage.removeItem(p + 'firebaseUid');
        }
      } catch (e) {
        console.warn('Moremi: could not sync firebaseIdToken for Flutter bridge', e);
      }
    });

    // Dart [moremi_firebase_session] calls this to avoid POST /flutter-session with an expired cached JWT.
    window.moremiGetFreshIdToken = async () => {
      try {
        const auth = window.firebaseAuth?.auth;
        const u = auth?.currentUser;
        if (!u) return null;
        const t = await u.getIdToken(true);
        const p = moremiLsPrefix();
        if (t) {
          try {
            localStorage.setItem(p + 'firebaseIdToken', t);
            localStorage.setItem(p + 'firebaseUid', u.uid);
          } catch (e) {}
        }
        return t || null;
      } catch (e) {
        console.warn('moremiGetFreshIdToken failed', e);
        return null;
      }
    };

    window.moremiRequestFreshTokenForDart = () => {
      window.moremiDartFreshTokenReady = false;
      window.moremiDartFreshTokenValue = null;
      if (typeof window.moremiGetFreshIdToken !== 'function') {
        window.moremiDartFreshTokenReady = true;
        return;
      }
      window
        .moremiGetFreshIdToken()
        .then((t) => {
          window.moremiDartFreshTokenValue = t;
          window.moremiDartFreshTokenReady = true;
        })
        .catch(() => {
          window.moremiDartFreshTokenReady = true;
        });
    };
  }

  /**
   * After PIN / cold start, Firebase may restore the user slightly after first paint.
   * Flutter boots early when [userAuthenticated] is in localStorage — wait so ID token sync runs first.
   */
  async waitForAuthRestore(timeoutMs = 8000) {
    if (!this.auth) return;
    if (this.auth.currentUser) return;
    await new Promise((resolve) => {
      const t = setTimeout(resolve, timeoutMs);
      const unsub = onAuthStateChanged(this.auth, (user) => {
        if (user) {
          clearTimeout(t);
          unsub();
          resolve();
        }
      });
    });
  }

  /**
   * Email + password sign-up (backend creates Firebase Auth user, returns customToken).
   * Used by auth UI: `window.authService.registerWithEmailPassword(...)`.
   */
  async registerWithEmailPassword(email, password, displayName, phone = null, username = null) {
    if (!this.auth) {
      throw new Error('Firebase auth not available');
    }
    const emailNorm = String(email || '').trim().toLowerCase();
    const nameTrim = String(displayName || '').trim();
    const pass = String(password || '');
    const usernameNorm = username != null && String(username).trim() !== ''
      ? String(username).trim().toLowerCase()
      : '';
    if (!emailNorm || !pass || !nameTrim) {
      throw new Error('Email, password, and full name are required');
    }
    if (pass.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    const payload = {
      email: emailNorm,
      password: pass,
      displayName: nameTrim,
      ...(usernameNorm ? { username: usernameNorm } : {}),
      ...(phone ? { phone: String(phone).trim() } : {}),
    };
    const { data } = await moremiPostAuth('/register', payload);
    if (!data.customToken) {
      throw new Error('Registration succeeded but no session token was returned');
    }
    const result = await signInWithCustomToken(this.auth, data.customToken);
    const profileName = data.name || nameTrim;
    try {
      await this.createOrUpdateUser(result.user, {
        email: data.email || emailNorm,
        name: profileName,
        phone: phone || null,
      });
    } catch (error) {
      console.error('createOrUpdateUser after register:', error);
    }
    localStorage.setItem('userAuthenticated', 'true');
    localStorage.setItem('authenticatedUserName', profileName);
    return { success: true, user: result.user };
  }

  /**
   * Email + password sign-in: REST Identity Toolkit (no SDK reCAPTCHA Enterprise / gapi), then
   * `flutter-session` custom token — same session shape as PIN/register.
   */
  async signInWithEmailPassword(email, password) {
    if (!this.auth) {
      throw new Error('Firebase auth not available');
    }
    const emailNorm = String(email || '').trim().toLowerCase();
    const pass = String(password || '');
    if (!emailNorm || !pass) {
      throw new Error('Email and password are required');
    }

    const apiKey = this.auth.app?.options?.apiKey;
    if (!apiKey) {
      throw new Error('Firebase Web API key missing from app configuration');
    }

    const body = await identityToolkitSignInWithPassword(apiKey, emailNorm, pass);
    const idToken = body.idToken;

    let customToken;
    try {
      customToken = await moremiFlutterSessionExchange(idToken);
    } catch (exchangeErr) {
      console.warn('[Moremi] flutter-session failed; trying SDK signInWithEmailAndPassword', exchangeErr);
      try {
        const cred = await signInWithEmailAndPassword(this.auth, emailNorm, pass);
        const displaySdk =
          cred.user.displayName || emailNorm.split('@')[0] || 'User';
        try {
          await this.createOrUpdateUser(cred.user, { email: emailNorm, name: displaySdk });
        } catch (err2) {
          console.error('createOrUpdateUser after SDK email/password sign-in:', err2);
        }
        localStorage.setItem('userAuthenticated', 'true');
        localStorage.setItem('authenticatedUserName', displaySdk);
        return { success: true, user: cred.user };
      } catch (sdkErr) {
        const code = sdkErr && sdkErr.code ? String(sdkErr.code) : '';
        if (
          code === 'auth/invalid-credential' ||
          code === 'auth/wrong-password' ||
          code === 'auth/user-not-found'
        ) {
          throw new Error(
            'Invalid email or password. If this account was created with “email PIN” only, sign in with PIN — password login is for accounts registered with email + password.',
          );
        }
        if (code === 'auth/operation-not-allowed') {
          throw new Error(
            'Email/password sign-in is turned off in Firebase. In Firebase Console → Authentication → Sign-in method, enable Email/Password.',
          );
        }
        if (code === 'auth/too-many-requests') {
          throw new Error('Too many failed attempts. Wait a few minutes or reset your password.');
        }
        const exMsg = exchangeErr && exchangeErr.message ? String(exchangeErr.message) : '';
        const sdkMsg = sdkErr && sdkErr.message ? String(sdkErr.message) : code;
        if (exMsg) {
          throw new Error(`${exMsg} (also: ${sdkMsg})`);
        }
        throw sdkErr;
      }
    }

    const result = await signInWithCustomToken(this.auth, customToken);
    const display =
      result.user.displayName || emailNorm.split('@')[0] || 'User';
    try {
      await this.createOrUpdateUser(result.user, { email: emailNorm, name: display });
    } catch (error) {
      console.error('createOrUpdateUser after email/password sign-in:', error);
    }
    localStorage.setItem('userAuthenticated', 'true');
    localStorage.setItem('authenticatedUserName', display);
    return { success: true, user: result.user };
  }

  /** Alias for shells that call `window.authService.loginWithPassword`. */
  async loginWithPassword(email, password) {
    return this.signInWithEmailPassword(email, password);
  }

  /** Alias for `signInWithEmailPassword`. */
  async signInWithPassword(email, password) {
    return this.signInWithEmailPassword(email, password);
  }

  waitForFirebase() {
    return new Promise((resolve) => {
      const checkFirebase = () => {
        if (window.firebaseAuth && window.firebaseAuth.auth && window.firebaseAuth.db) {
          this.auth = window.firebaseAuth.auth;
          this.db = window.firebaseAuth.db;
          resolve();
        } else {
          setTimeout(checkFirebase, 100);
        }
      };
      checkFirebase();
    });
  }

  // Email PIN Authentication
  async requestEmailPin(email, name) {
    try {
      console.log('Making PIN request for:', email);
      const { data } = await moremiPostAuth('/request-pin', { email, name });
      console.log('PIN request success:', data);
      return { success: true, message: data.message || 'PIN sent to your email' };
    } catch (error) {
      console.error('Email PIN request failed:', error);
      throw new Error(`Failed to send PIN: ${error.message}`);
    }
  }

  async verifyEmailPin(email, pin) {
    try {
      console.log('Making PIN verification request for:', email, 'PIN length:', pin.length);
      const { data } = await moremiPostAuth('/verify-pin', { email, pin });
      console.log('PIN verification success, received custom token:', !!data.customToken);

      if (!data.customToken) {
        throw new Error(data.message || 'Invalid PIN');
      }

      // Sign in with custom token
      console.log('Signing in with custom token...');
      const result = await signInWithCustomToken(this.auth, data.customToken);
      console.log('Firebase sign in successful for user:', result.user.uid);

      // Create/update user document
      console.log('Creating/updating user document...');
      try {
        await this.createOrUpdateUser(result.user, { email, name: data.name });
        console.log('User document created/updated successfully');
      } catch (error) {
        console.error('❌ CRITICAL: Failed to create user document:', error);
        console.error('❌ Error details:', error.code, error.message);
        // Don't throw here - continue with authentication even if user doc fails
      }

      // Store authentication state for offline use
      console.log('DEBUG: Setting localStorage - userAuthenticated=true, authenticatedUserName=', data.name);
      localStorage.setItem('userAuthenticated', 'true');
      localStorage.setItem('authenticatedUserName', data.name);

      // Auth controller will automatically detect the sign-in via onAuthStateChanged listener
      console.log('PIN verification complete - auth state listener will handle the rest');

      return { success: true, user: result.user };
    } catch (error) {
      console.error('Email PIN verification failed:', error);
      throw error;
    }
  }

  // Phone Authentication
  async requestPhoneOtp(phoneNumber, name) {
    try {
      console.log('Requesting phone OTP for:', phoneNumber);

      // Validate phone number format
      const phoneRegex = /^\+[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phoneNumber)) {
        throw new Error('Please enter a valid phone number with country code (e.g., +1234567890)');
      }

      // Initialize reCAPTCHA if not already done
      if (!this.recaptchaVerifier) {
        console.log('Setting up reCAPTCHA verifier...');

        // Clear any existing reCAPTCHA
        const container = document.getElementById('recaptcha-container');
        if (container) {
          container.innerHTML = '';
        }

        try {
          this.recaptchaVerifier = new RecaptchaVerifier(this.auth, 'recaptcha-container', {
            size: 'invisible',
            callback: (response) => {
              console.log('reCAPTCHA solved successfully');
            },
            'expired-callback': () => {
              console.log('reCAPTCHA expired, will recreate on next attempt');
              this.recaptchaVerifier = null;
            },
            'error-callback': (error) => {
              console.error('reCAPTCHA error:', error);
            }
          });
          console.log('reCAPTCHA verifier created successfully');
        } catch (error) {
          console.error('Failed to create reCAPTCHA verifier:', error);
          throw new Error('Failed to initialize security verification. Please refresh the page and try again.');
        }
      }

      console.log('Sending phone verification...');
      this.confirmationResult = await signInWithPhoneNumber(this.auth, phoneNumber, this.recaptchaVerifier);

      // Store user data for later use
      sessionStorage.setItem('pendingPhoneUser', JSON.stringify({ name, phone: phoneNumber }));

      console.log('Phone verification sent successfully');
      return { success: true, message: 'SMS code sent to your phone' };

    } catch (error) {
      console.error('Phone OTP request failed:', error);

      // Reset reCAPTCHA on error
      if (this.recaptchaVerifier) {
        this.recaptchaVerifier.clear();
        this.recaptchaVerifier = null;
      }

      // Handle specific Firebase errors
      if (error.code === 'auth/invalid-phone-number') {
        throw new Error('Invalid phone number format. Please include country code (e.g., +1 for US).');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Too many requests. Please try again later.');
      } else if (error.code === 'auth/missing-recaptcha-token') {
        throw new Error('reCAPTCHA verification failed. Please refresh and try again.');
      }

      throw new Error(`Failed to send SMS: ${error.message}`);
    }
  }

  async verifyPhoneOtp(otp) {
    try {
      if (!this.confirmationResult) {
        throw new Error('No OTP request found. Please request OTP first.');
      }

      const result = await this.confirmationResult.confirm(otp);

      // Update user document with phone auth data
      const pendingUserData = JSON.parse(sessionStorage.getItem('pendingPhoneUser'));
      if (pendingUserData) {
        await this.createOrUpdateUser(result.user, pendingUserData);
        sessionStorage.removeItem('pendingPhoneUser');

        // Store authentication state for offline use
        console.log('DEBUG: Setting localStorage for phone auth - userAuthenticated=true, authenticatedUserName=', pendingUserData.name);
        localStorage.setItem('userAuthenticated', 'true');
        localStorage.setItem('authenticatedUserName', pendingUserData.name);
      }

      return { success: true, user: result.user };
    } catch (error) {
      console.error('Phone OTP verification failed:', error);
      throw new Error(`Invalid OTP: ${error.message}`);
    }
  }

  // User Management
  async createOrUpdateUser(user, userData) {
    console.log('🔥 STARTING createOrUpdateUser method');
    console.log('🔥 User object:', { uid: user.uid, email: user.email });
    console.log('🔥 UserData:', userData);
    console.log('🔥 Firestore instance available:', !!this.db);
    console.log('🔥 Auth instance available:', !!this.auth);
    console.log('🔥 Current user authenticated:', this.auth?.currentUser ? 'YES' : 'NO');

    if (!this.db) {
      throw new Error('Firestore instance not available');
    }

    if (!this.auth?.currentUser) {
      throw new Error('User not authenticated');
    }

    const userDoc = {
      uid: user.uid,
      name: userData.name,
      email: userData.email,
      phone: userData.phone || null,
      role: 'user',
      status: 'active',
      registeredAt: userData.registeredAt || serverTimestamp(),
      lastLogin: serverTimestamp()
    };

    console.log('🔥 User document data to write:', userDoc);

    try {
      const docRef = doc(this.db, 'users', user.uid);
      console.log('🔥 Document reference path:', docRef.path);
      console.log('🔥 About to call setDoc...');

      try {
        console.log('🔥 Testing basic Firestore connectivity first...');

        // Test connectivity by trying to read from observations collection (which works)
        console.log('🔥 Attempting to read from health collection to test connectivity...');
        const testDocRef = doc(this.db, 'health', 'connectivity_test');
        const testReadPromise = getDoc(testDocRef);
        const testTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connectivity test timeout')), 5000)
        );

        await Promise.race([testReadPromise, testTimeoutPromise]);
        console.log('✅ Firestore connectivity test passed');

        console.log('🔥 Now calling setDoc...');
        const setDocPromise = setDoc(docRef, userDoc, { merge: true });
        const setDocTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('setDoc timeout after 10 seconds')), 10000)
        );

        await Promise.race([setDocPromise, setDocTimeoutPromise]);
        console.log('✅ setDoc completed successfully');
      } catch (setDocError) {
        console.error('❌ setDoc failed with error:');
        console.error('❌ Error code:', setDocError.code);
        console.error('❌ Error message:', setDocError.message);
        console.error('❌ Full error:', setDocError);

        // Check if it's a network/connectivity error
        if (setDocError.message.includes('timeout') || setDocError.message.includes('network')) {
          console.error('🚨 USERS COLLECTION ISSUE: Connectivity works but users collection writes are blocked. Possible causes:');
          console.error('🚨 - Users collection rules not applied correctly');
          console.error('🚨 - Document ID format issues');
          console.error('🚨 - Users collection name conflict');
          console.error('🚨 - Firebase security/policies specific to users collection');
        }

        throw setDocError;
      }

      // Verify the document was created
      console.log('🔍 Verifying document creation...');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        console.log('✅ Document verification successful!');
        console.log('✅ Document data:', docSnap.data());
      } else {
        console.error('❌ Document verification failed - document does not exist after creation');
      }

    } catch (error) {
      console.error('❌ CRITICAL ERROR in createOrUpdateUser:');
      console.error('❌ Error code:', error.code);
      console.error('❌ Error message:', error.message);
      console.error('❌ Full error object:', error);
      throw error;
    }

    console.log('🔥 createOrUpdateUser method completed');
  }

  async updateUserLastLogin(uid) {
    try {
      await updateDoc(doc(this.db, 'users', uid), {
        lastLogin: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to update last login:', error);
    }
  }

  async checkUserStatus() {
    if (!this.currentUser) return null;

    try {
      const userDoc = await getDoc(doc(this.db, 'users', this.currentUser.uid));
      if (userDoc.exists()) {
        return userDoc.data();
      }
      return null;
    } catch (error) {
      console.error('Failed to check user status:', error);
      return null;
    }
  }

  // Check if user is allowed to submit data (not revoked)
  async canSubmitData() {
    const userStatus = await this.checkUserStatus();
    if (!userStatus) {
      console.log('User status not found - allowing submission (new user)');
      return true; // Allow new users to submit until status is set
    }

    const isActive = userStatus.status === 'active' || userStatus.status === undefined;
    console.log('User submission check - status:', userStatus.status, 'allowed:', isActive);

    if (!isActive) {
      console.warn('🚫 REVOKED USER attempted to submit data - BLOCKED');
    }

    return isActive;
  }

  async signOut() {
    await signOut(this.auth);
    this.currentUser = null;
    const p = moremiLsPrefix();
    try {
      localStorage.removeItem(p + 'firebaseIdToken');
      localStorage.removeItem(p + 'firebaseUid');
    } catch (e) {}
    // Clear offline authentication state
    localStorage.removeItem('userAuthenticated');
    localStorage.removeItem('authenticatedUserName');
  }

  isAuthenticated() {
    return !!this.currentUser;
  }
}

// Create global instance
window.authService = new AuthService();