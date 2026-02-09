// Authentication controller
class AuthController {
  constructor() {
    this.auth = window.firebaseAuth;
    this.authUI = window.authUI;
    this.authService = window.authService;
  }

  init() {
    // Check if user is already authenticated (offline support)
    const isAuthenticated = localStorage.getItem('userAuthenticated') === 'true';

    if (isAuthenticated) {
      // User was previously authenticated, start Flutter app directly
      this.startFlutterApp();
      return;
    }

    // Check if email link sign-in
    if (this.auth.isSignInWithEmailLink(window.location.href)) {
      this.handleEmailLinkSignIn();
    } else {
      // Show authentication UI
      this.showAuthUI();
    }
  }

  async handleEmailLinkSignIn() {
    let email = localStorage.getItem('emailForSignIn');

    if (!email) {
      email = window.prompt('Please provide your email for confirmation');
    }

    try {
      const result = await this.auth.signInWithEmailLink(email, window.location.href);
      localStorage.removeItem('emailForSignIn');

      // Create or update user
      const userResult = await this.authService.createOrUpdateUser({
        name: email.split('@')[0], // Use email prefix as name
        email: email
      });

      if (userResult.success) {
        this.handleAuthenticatedUser(userResult.user);
      } else {
        throw new Error(userResult.error);
      }
    } catch (error) {
      console.error('Email link sign-in failed:', error);
      alert('Sign-in failed. Please try again.');
      this.showAuthUI();
    }
  }

  showAuthUI() {
    this.authUI.showEmailForm();
  }

  handleAuthenticatedUser(user) {
    // Mark as authenticated for offline support
    localStorage.setItem('userAuthenticated', 'true');

    // Hide auth UI and start Flutter app
    this.authUI.hide();
    this.startFlutterApp();
  }

  startFlutterApp() {
    // Start the Flutter app
    console.log('Starting Flutter app...');

    // The Flutter app will be initialized by flutter_bootstrap.js
    // This function is called when authentication is complete
  }

  showOfflineMessage() {
    // Show message when offline but previously authenticated
    const message = document.createElement('div');
    message.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      text-align: center;
      z-index: 10000;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    message.innerHTML = `
      <h2 style="margin-bottom: 1rem; color: #333;">Offline Mode</h2>
      <p style="margin-bottom: 1.5rem; color: #666;">You are offline but previously authenticated.<br>Loading app...</p>
      <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;

    document.body.appendChild(message);

    // Auto-start Flutter app after showing message
    setTimeout(() => {
      message.remove();
      this.startFlutterApp();
    }, 2000);
  }
}

// Initialize authentication when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.authController = new AuthController();
  window.authController.init();
});