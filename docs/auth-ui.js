// Authentication UI
class AuthUI {
  constructor() {
    this.currentStep = 'login-type'; // login-type, email-form, email-pin, phone-form, phone-otp
    this.userData = {};
    this.init();
  }

  init() {
    this.createAuthContainer();
    this.showLoginTypeSelection();
  }

  createAuthContainer() {
    // Create overlay container
    const container = document.createElement('div');
    container.id = 'auth-overlay';
    container.innerHTML = `
      <div id="auth-container">
        <div id="auth-header">
          <h2>Sign In to Wildlife Tracker</h2>
        </div>
        <div id="auth-content"></div>
        <div id="recaptcha-container"></div>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      #auth-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      #auth-container {
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        animation: slideUp 0.3s ease-out;
      }

      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      #auth-header h2 {
        margin: 0 0 20px 0;
        color: #333;
        font-size: 24px;
        text-align: center;
      }

      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .form-group label {
        font-weight: 500;
        color: #555;
        font-size: 14px;
      }

      .form-group input {
        padding: 12px 16px;
        border: 2px solid #e1e5e9;
        border-radius: 8px;
        font-size: 16px;
        transition: border-color 0.2s;
      }

      .form-group input:focus {
        outline: none;
        border-color: #007aff;
      }

      .auth-button {
        background: #007aff;
        color: white;
        border: none;
        padding: 14px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
      }

      .auth-button:hover {
        background: #0056cc;
      }

      .auth-button:disabled {
        background: #ccc;
        cursor: not-allowed;
      }

      .auth-button.secondary {
        background: #f0f0f0;
        color: #333;
      }

      .auth-button.secondary:hover {
        background: #e0e0e0;
      }

      .auth-links {
        display: flex;
        justify-content: center;
        gap: 16px;
        margin-top: 20px;
      }

      .auth-link {
        color: #007aff;
        text-decoration: none;
        font-size: 14px;
        cursor: pointer;
      }

      .auth-link:hover {
        text-decoration: underline;
      }

      .error-message {
        color: #dc3545;
        font-size: 14px;
        margin-top: 8px;
        text-align: center;
      }

      .success-message {
        color: #28a745;
        font-size: 14px;
        margin-top: 8px;
        text-align: center;
      }

      .loading {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #007aff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(container);
  }

  showLoginTypeSelection() {
    this.currentStep = 'login-type';
    const content = document.getElementById('auth-content');
    content.innerHTML = `
      <div class="auth-form">
        <button class="auth-button" onclick="window.authUI.showEmailForm()">
          📧 Sign in with Email
        </button>
        <button class="auth-button secondary" onclick="window.authUI.showPhoneForm()">
          📱 Sign in with Phone
        </button>
      </div>
    `;
  }

  showEmailForm() {
    this.currentStep = 'email-form';
    const content = document.getElementById('auth-content');
    content.innerHTML = `
      <div class="auth-form">
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
        <a class="auth-link" onclick="window.authUI.showLoginTypeSelection()">← Back</a>
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
        <a class="auth-link" onclick="window.authUI.showLoginTypeSelection()">← Back</a>
      </div>
    `;

    // Focus on name field
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

    this.setLoading('phone-submit-btn', true);

    try {
      this.userData = { name, phone };
      const result = await window.authService.requestPhoneOtp(phone, name);
      this.showMessage('phone-message', result.message, 'success');
      this.showPhoneOtpForm();
    } catch (error) {
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
    if (loading) {
      button.disabled = true;
      button.innerHTML = '<span class="loading"></span> Please wait...';
    } else {
      button.disabled = false;
      button.textContent = button.textContent.replace('Please wait...', '').trim();
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
    // Flutter app will now load
  }

  showAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
    }
  }
}

// Create global instance
window.authUI = new AuthUI();