import { mlsGetWithLegacy } from './moremi-storage.js';

// Authentication UI
class AuthUI {
  constructor() {
    this.currentStep = 'password-login'; // default screen is email + password
    this.userData = {};
    this.init();
  }

  init() {
    this.createAuthContainer();
    // Don't show login selection automatically - let auth controller decide
  }

  createAuthContainer() {
    // Create overlay container
    const container = document.createElement('div');
    container.id = 'auth-overlay';
    container.innerHTML = `
      <div id="auth-container">
        <div id="auth-header">
          <h2>Moremi Wildlife Sightings</h2>
          <p class="auth-strapline">Sign in to record sightings</p>
        </div>
        <div id="auth-content"></div>
        <div id="recaptcha-container"></div>
      </div>
    `;

    // Add styles - Mobile-first responsive design
    const style = document.createElement('style');
    style.textContent = `
      #auth-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(165deg, #1a2744 0%, #0d1520 55%, #142218 100%);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 16px;
        box-sizing: border-box;
      }

      #auth-container {
        background: #f7f9fc;
        border-radius: 16px;
        padding: 0;
        max-width: 400px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow:
          0 4px 0 #2E7D32,
          0 24px 48px rgba(0, 0, 0, 0.45);
        animation: slideUp 0.3s ease-out;
        margin: auto;
        border: 1px solid rgba(46, 125, 50, 0.25);
      }

      #auth-header {
        padding: 22px 22px 16px;
        border-bottom: 1px solid rgba(26, 39, 68, 0.12);
        background: linear-gradient(180deg, #fff 0%, #f8faf8 100%);
        border-radius: 16px 16px 0 0;
      }

      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      #auth-content {
        padding: 22px;
      }

      #auth-header h2 {
        margin: 0 0 6px 0;
        color: #1a2744;
        font-size: 1.35rem;
        font-weight: 700;
        text-align: center;
        line-height: 1.25;
        letter-spacing: -0.02em;
      }

      .auth-strapline {
        margin: 0;
        text-align: center;
        font-size: 0.9rem;
        color: #5c6b7a;
        font-weight: 500;
      }

      .auth-sub {
        margin: 0 0 4px 0;
        font-size: 0.88rem;
        color: #5c6b7a;
        line-height: 1.45;
      }

      #recaptcha-container {
        padding: 0 22px 22px;
      }

      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .form-group label {
        font-weight: 600;
        color: #37474f;
        font-size: 15px;
        margin-bottom: 2px;
      }

      .form-group input {
        padding: 14px 16px;
        border: 2px solid #cfd8dc;
        border-radius: 12px;
        font-size: 16px;
        transition: border-color 0.2s, box-shadow 0.2s;
        width: 100%;
        box-sizing: border-box;
        background: #fff;
      }

      .form-group input:focus {
        outline: none;
        border-color: #2E7D32;
        box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.2);
      }

      .form-group input::placeholder {
        color: #90a4ae;
        font-size: 16px;
      }

      .auth-button {
        background: linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%);
        color: white;
        border: none;
        padding: 16px 20px;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.15s, filter 0.15s;
        width: 100%;
        box-sizing: border-box;
        min-height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .auth-button:hover {
        filter: brightness(1.06);
        transform: translateY(-1px);
      }

      .auth-button:active {
        transform: translateY(0);
      }

      .auth-button:disabled {
        background: #90a4ae;
        cursor: not-allowed;
        transform: none;
        filter: none;
      }

      .auth-button.secondary {
        background: #fff;
        color: #1a2744;
        border: 2px solid #b0bec5;
      }

      .auth-button.secondary:hover {
        background: #eceff1;
        border-color: #90a4ae;
      }

      .auth-links {
        display: flex;
        justify-content: center;
        gap: 16px;
        margin-top: 20px;
        flex-wrap: wrap;
      }

      .auth-links.auth-links-secondary {
        margin-top: 12px;
        padding-top: 16px;
        border-top: 1px solid rgba(26, 39, 68, 0.1);
      }

      .auth-links.auth-links-secondary .auth-link {
        font-size: 14px;
        font-weight: 600;
        color: #546e7a;
      }

      .auth-links.auth-links-secondary .auth-link:hover {
        color: #1B5E20;
      }

      .auth-link {
        color: #1B5E20;
        text-decoration: none;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        padding: 8px 10px;
        border-radius: 8px;
        transition: background 0.2s;
        min-height: 44px;
        display: flex;
        align-items: center;
      }

      .auth-link:hover {
        background: rgba(46, 125, 50, 0.12);
        text-decoration: none;
      }

      .error-message {
        color: #b71c1c;
        font-size: 14px;
        margin-top: 8px;
        text-align: center;
        padding: 12px;
        background: #ffebee;
        border-radius: 10px;
        border: 1px solid #ffcdd2;
      }

      .success-message {
        color: #1B5E20;
        font-size: 14px;
        margin-top: 8px;
        text-align: center;
        padding: 12px;
        background: #e8f5e9;
        border-radius: 10px;
        border: 1px solid #c8e6c9;
      }

      .loading {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 3px solid rgba(255,255,255,0.35);
        border-top: 3px solid #fff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      @media (max-width: 480px) {
        #auth-overlay { padding: 12px; }
        #auth-container { border-radius: 14px; }
        #auth-header { padding: 18px 16px 14px; border-radius: 14px 14px 0 0; }
        #auth-content { padding: 18px 16px; }
        #auth-header h2 { font-size: 1.2rem; }
        .auth-form { gap: 14px; }
        .form-group input { padding: 13px 14px; }
        .auth-button { padding: 14px 18px; min-height: 44px; }
        .auth-links { gap: 12px; margin-top: 16px; }
      }

      @media (max-height: 600px) {
        #auth-container { max-height: 95vh; margin: 8px auto; }
        #auth-overlay { padding: 8px; }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(container);
  }

  /** First screen: email + password. PIN/phone are secondary (small links). */
  showLoginTypeSelection() {
    this.showPrimaryEmailPasswordScreen();
  }

  showPrimaryEmailPasswordScreen() {
    this.currentStep = 'password-login';
    const content = document.getElementById('auth-content');
    const storedAuth = mlsGetWithLegacy('userAuthenticated');
    const storedUserName = mlsGetWithLegacy('authenticatedUserName');

    let offlineButton = '';
    if (storedAuth === 'true' && storedUserName) {
      offlineButton = `
        <button type="button" class="auth-button secondary" onclick="window.authController.startFlutterApp()">
          Continue as ${storedUserName} (offline)
        </button>
      `;
    }

    content.innerHTML = `
        <div class="auth-form">
          ${offlineButton}
          <div class="form-group">
            <label for="pwd-email">Email</label>
            <input type="email" id="pwd-email" placeholder="you@example.com" required autocomplete="username">
          </div>
          <div class="form-group">
            <label for="pwd-password">Password</label>
            <input type="password" id="pwd-password" placeholder="Password" required autocomplete="current-password">
          </div>
          <button type="button" class="auth-button" id="password-submit-btn" onclick="window.authUI.handlePasswordSubmit()">
            Sign in
          </button>
          <div id="password-message"></div>
          <p class="auth-sub" style="text-align:center;margin:12px 0 0;">
            Don&apos;t have an account?
            <a class="auth-link" onclick="window.authUI.showRegisterForm()" style="display:inline;padding:4px 6px;margin-left:4px;">Create one</a>
          </p>
        </div>
        <p class="auth-sub" style="text-align:center;margin:0;">Other ways to sign in</p>
        <div class="auth-links auth-links-secondary">
          <a class="auth-link" onclick="window.authUI.showEmailForm()">Email + one-time PIN</a>
          <a class="auth-link" onclick="window.authUI.showPhoneForm()">Phone</a>
        </div>
    `;
    setTimeout(() => {
      const el = document.getElementById('pwd-email');
      if (el) el.focus();
    }, 100);
  }

  showPasswordLoginForm() {
    this.showPrimaryEmailPasswordScreen();
  }

  showRegisterForm() {
    this.currentStep = 'register';
    const content = document.getElementById('auth-content');
    content.innerHTML = `
      <div class="auth-form">
        <p class="auth-sub">Create your Moremi account — you&apos;ll sign in with email and password.</p>
        <div class="form-group">
          <label for="reg-username">Username</label>
          <input type="text" id="reg-username" placeholder="Shown in your profile (letters, numbers, . _ -)" required autocomplete="username" maxlength="40">
        </div>
        <div class="form-group">
          <label for="reg-name">Full name</label>
          <input type="text" id="reg-name" placeholder="Your name" required autocomplete="name">
        </div>
        <div class="form-group">
          <label for="reg-email">Email</label>
          <input type="email" id="reg-email" placeholder="you@example.com" required autocomplete="email">
        </div>
        <div class="form-group">
          <label for="reg-password">Password</label>
          <input type="password" id="reg-password" placeholder="At least 6 characters" required autocomplete="new-password" minlength="6">
        </div>
        <div class="form-group">
          <label for="reg-confirm">Confirm password</label>
          <input type="password" id="reg-confirm" placeholder="Repeat password" required autocomplete="new-password" minlength="6">
        </div>
        <button type="button" class="auth-button" id="register-submit-btn" onclick="window.authUI.handleRegisterSubmit()">
          Create account
        </button>
        <div id="register-message"></div>
      </div>
      <div class="auth-links">
        <a class="auth-link" onclick="window.authUI.showPrimaryEmailPasswordScreen()">← Back to sign in</a>
      </div>
    `;
    setTimeout(() => document.getElementById('reg-username')?.focus(), 100);
  }

  async handleRegisterSubmit() {
    const username = document.getElementById('reg-username')?.value.trim() || '';
    const name = document.getElementById('reg-name')?.value.trim() || '';
    const email = document.getElementById('reg-email')?.value.trim() || '';
    const password = document.getElementById('reg-password')?.value || '';
    const confirm = document.getElementById('reg-confirm')?.value || '';

    if (!username || !name || !email || !password || !confirm) {
      this.showMessage('register-message', 'Please fill in all fields', 'error');
      return;
    }
    if (username.length < 2) {
      this.showMessage('register-message', 'Username must be at least 2 characters', 'error');
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      this.showMessage('register-message', 'Username: use letters, numbers, dot, underscore, or hyphen only', 'error');
      return;
    }
    if (!this.isValidEmail(email)) {
      this.showMessage('register-message', 'Please enter a valid email address', 'error');
      return;
    }
    if (password.length < 6) {
      this.showMessage('register-message', 'Password must be at least 6 characters', 'error');
      return;
    }
    if (password !== confirm) {
      this.showMessage('register-message', 'Passwords do not match', 'error');
      return;
    }

    this.setLoading('register-submit-btn', true);
    try {
      await window.authService.registerWithEmailPassword(email, password, name, null, username);
      this.showMessage('register-message', 'Account created! Opening app…', 'success');
      setTimeout(() => this.hideAuthAndStartApp(), 600);
    } catch (error) {
      const msg =
        error && error.message
          ? error.message
          : 'Could not create account. Try again or use email + PIN.';
      this.showMessage('register-message', msg, 'error');
    } finally {
      this.setLoading('register-submit-btn', false);
    }
  }

  showEmailForm() {
    this.currentStep = 'email-form';
    const content = document.getElementById('auth-content');
    content.innerHTML = `
      <div class="auth-form">
        <p class="auth-sub">We’ll email you a one-time PIN (good if you don’t use a password).</p>
        <div class="form-group">
          <label for="name">Full Name</label>
          <input type="text" id="name" placeholder="Enter your full name" required>
        </div>
        <div class="form-group">
          <label for="email">Email Address</label>
          <input type="email" id="email" placeholder="Enter your email address" required>
        </div>
        <button class="auth-button" id="email-submit-btn" onclick="window.authUI.handleEmailSubmit()">
          Send PIN Code
        </button>
        <div id="email-message"></div>
      </div>
      <div class="auth-links">
        <a class="auth-link" onclick="window.authUI.showPrimaryEmailPasswordScreen()">← Back to email &amp; password</a>
      </div>
    `;

    // Focus on name field
    setTimeout(() => document.getElementById('name').focus(), 100);
  }

  showEmailPinForm() {
    this.currentStep = 'email-pin';
    const content = document.getElementById('auth-content');
    content.innerHTML = `
      <div class="auth-form">
        <div style="text-align: center; margin-bottom: 20px;">
          <p>Enter the 6-digit PIN sent to<br><strong>${this.userData.email}</strong></p>
        </div>
        <div class="form-group">
          <label for="pin">PIN Code</label>
          <input type="text" id="pin" placeholder="000000" maxlength="6" pattern="[0-9]{6}" required>
        </div>
        <button class="auth-button" id="pin-submit-btn" onclick="window.authUI.handlePinSubmit()">
          Verify PIN
        </button>
        <div id="pin-message"></div>
      </div>
      <div class="auth-links">
        <a class="auth-link" onclick="window.authUI.showEmailForm()">← Back</a>
        <a class="auth-link" onclick="window.authUI.showPrimaryEmailPasswordScreen()">Use email &amp; password instead</a>
        <a class="auth-link" onclick="window.authUI.resendEmailPin()">Resend PIN</a>
      </div>
    `;

    // Auto-focus and format PIN input
    const pinInput = document.getElementById('pin');
    setTimeout(() => pinInput.focus(), 100);

    pinInput.addEventListener('input', (e) => {
      // Only allow numbers
      e.target.value = e.target.value.replace(/\D/g, '');
    });
  }

  showPhoneForm() {
    this.currentStep = 'phone-form';
    const content = document.getElementById('auth-content');
    content.innerHTML = `
      <div class="auth-form">
        <div class="form-group">
          <label for="phone-name">Full Name</label>
          <input type="text" id="phone-name" placeholder="Enter your full name" required>
        </div>
        <div class="form-group">
          <label for="phone">Phone Number</label>
          <input type="tel" id="phone" placeholder="+1234567890" required>
        </div>
        <button class="auth-button" id="phone-submit-btn" onclick="window.authUI.handlePhoneSubmit()">
          Send OTP
        </button>
        <div id="phone-message"></div>
      </div>
      <div class="auth-links">
        <a class="auth-link" onclick="window.authUI.showPrimaryEmailPasswordScreen()">← Back to email &amp; password</a>
      </div>
    `;

    setTimeout(() => document.getElementById('phone-name').focus(), 100);
  }

  showPhoneOtpForm() {
    this.currentStep = 'phone-otp';
    const content = document.getElementById('auth-content');
    content.innerHTML = `
      <div class="auth-form">
        <div style="text-align: center; margin-bottom: 20px;">
          <p>Enter the 6-digit code sent to<br><strong>${this.userData.phone}</strong></p>
        </div>
        <div class="form-group">
          <label for="otp">SMS Code</label>
          <input type="text" id="otp" placeholder="000000" maxlength="6" pattern="[0-9]{6}" required>
        </div>
        <button class="auth-button" id="otp-submit-btn" onclick="window.authUI.handleOtpSubmit()">
          Verify Code
        </button>
        <div id="otp-message"></div>
      </div>
      <div class="auth-links">
        <a class="auth-link" onclick="window.authUI.showPhoneForm()">← Back</a>
      </div>
    `;

    // Auto-focus and format OTP input
    const otpInput = document.getElementById('otp');
    setTimeout(() => otpInput.focus(), 100);

    otpInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
    });
  }

  // Event handlers
  async handlePasswordSubmit() {
    const email = document.getElementById('pwd-email').value.trim();
    const password = document.getElementById('pwd-password').value;

    if (!email || !password) {
      this.showMessage('password-message', 'Please enter email and password', 'error');
      return;
    }

    if (!this.isValidEmail(email)) {
      this.showMessage('password-message', 'Please enter a valid email address', 'error');
      return;
    }

    this.setLoading('password-submit-btn', true);

    try {
      await window.authService.loginWithPassword(email, password);
      this.showMessage('password-message', 'Sign in successful!', 'success');
      setTimeout(() => this.hideAuthAndStartApp(), 600);
    } catch (error) {
      const msg =
        error && error.code === 'auth/invalid-credential'
          ? 'Wrong email or password. Try again or use email + PIN.'
          : error && error.message
            ? error.message
            : 'Sign in failed. Try email + PIN or reset your password in the app profile.';
      this.showMessage('password-message', msg, 'error');
    } finally {
      this.setLoading('password-submit-btn', false);
    }
  }

  async handleEmailSubmit() {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();

    if (!name || !email) {
      this.showMessage('email-message', 'Please fill in all fields', 'error');
      return;
    }

    if (!this.isValidEmail(email)) {
      this.showMessage('email-message', 'Please enter a valid email address', 'error');
      return;
    }

    this.setLoading('email-submit-btn', true);

    try {
      this.userData = { name, email };
      const result = await window.authService.requestEmailPin(email, name);
      this.showMessage('email-message', result.message, 'success');
      this.showEmailPinForm();
    } catch (error) {
      this.showMessage('email-message', error.message, 'error');
    } finally {
      this.setLoading('email-submit-btn', false);
    }
  }

  async handlePinSubmit() {
    const pin = document.getElementById('pin').value.trim();

    if (!pin || pin.length !== 6) {
      this.showMessage('pin-message', 'Please enter a valid 6-digit PIN', 'error');
      return;
    }

    this.setLoading('pin-submit-btn', true);

    try {
      const result = await window.authService.verifyEmailPin(this.userData.email, pin);
      this.showMessage('pin-message', 'Sign in successful!', 'success');
      setTimeout(() => this.hideAuthAndStartApp(), 1000);
    } catch (error) {
      this.showMessage('pin-message', error.message, 'error');
    } finally {
      this.setLoading('pin-submit-btn', false);
    }
  }

  async handlePhoneSubmit() {
    const name = document.getElementById('phone-name').value.trim();
    const phone = document.getElementById('phone').value.trim();

    if (!name || !phone) {
      this.showMessage('phone-message', 'Please fill in all fields', 'error');
      return;
    }

    // Validate phone number format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phone)) {
      this.showMessage('phone-message', 'Please enter a valid phone number with country code (e.g., +1234567890)', 'error');
      return;
    }

    this.setLoading('phone-submit-btn', true);

    try {
      this.userData = { name, phone };
      const result = await window.authService.requestPhoneOtp(phone, name);
      this.showMessage('phone-message', result.message, 'success');
      this.showPhoneOtpForm();
    } catch (error) {
      console.error('Phone auth error:', error);
      this.showMessage('phone-message', error.message, 'error');
    } finally {
      this.setLoading('phone-submit-btn', false);
    }
  }

  async handleOtpSubmit() {
    const otp = document.getElementById('otp').value.trim();

    if (!otp || otp.length !== 6) {
      this.showMessage('otp-message', 'Please enter a valid 6-digit code', 'error');
      return;
    }

    this.setLoading('otp-submit-btn', true);

    try {
      const result = await window.authService.verifyPhoneOtp(otp);
      this.showMessage('otp-message', 'Sign in successful!', 'success');
      setTimeout(() => this.hideAuthAndStartApp(), 1000);
    } catch (error) {
      this.showMessage('otp-message', error.message, 'error');
    } finally {
      this.setLoading('otp-submit-btn', false);
    }
  }

  async resendEmailPin() {
    try {
      const result = await window.authService.requestEmailPin(this.userData.email, this.userData.name);
      this.showMessage('pin-message', 'PIN resent to your email', 'success');
    } catch (error) {
      this.showMessage('pin-message', error.message, 'error');
    }
  }

  // Utility methods
  showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.className = type === 'error' ? 'error-message' : 'success-message';
    element.textContent = message;
  }

  setLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    if (!button) {
      console.warn(`Button with ID ${buttonId} not found - form may have changed`);
      return;
    }

    if (loading) {
      button.disabled = true;
      button.innerHTML = '<span class="loading"></span> Please wait...';
    } else {
      button.disabled = false;
      // Restore original text based on button type
      if (buttonId.includes('email-submit')) {
        button.textContent = 'Send PIN Code';
      } else if (buttonId.includes('pin-submit')) {
        button.textContent = 'Verify PIN';
      } else if (buttonId.includes('phone-submit')) {
        button.textContent = 'Send OTP';
      } else if (buttonId.includes('otp-submit')) {
        button.textContent = 'Verify Code';
      } else if (buttonId.includes('password-submit')) {
        button.textContent = 'Sign in';
      } else if (buttonId.includes('register-submit')) {
        button.textContent = 'Create account';
      } else {
        // Fallback: try to restore original text
        const currentText = button.textContent;
        if (currentText.includes('Please wait...')) {
          button.textContent = currentText.replace('Please wait...', '').trim();
        }
      }
    }
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  hideAuthAndStartApp() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
    // Start the Flutter app via auth controller
    if (window.authController) {
      window.authController.startFlutterApp();
    }
  }

  showAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
    }
  }
}

// Create global instance but don't show UI automatically
// The auth controller will decide whether to show auth UI or go directly to Flutter
window.authUI = new AuthUI();
// Don't call init() automatically - let auth controller control this