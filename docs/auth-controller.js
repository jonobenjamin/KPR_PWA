// Authentication Controller - Main entry point
class AuthController {
  constructor() {
    this.initialized = false;
    this.init();
  }

  async init() {
    // Wait for Firebase to be ready before proceeding
    await this.waitForFirebase();

    try {
      // Initialize auth service after Firebase is ready
      await window.authService.init();

      // Check if user is already authenticated
      const isAuthenticated = window.authService.isAuthenticated();

      if (isAuthenticated) {
        // Check user status in Firestore
        const userStatus = await window.authService.checkUserStatus();

        if (userStatus && userStatus.status === 'active') {
          console.log('User is authenticated and active, proceeding to app');
          this.startFlutterApp();
          return;
        } else if (userStatus && userStatus.status === 'revoked') {
          console.log('User account is revoked');
          this.showRevokedScreen();
          return;
        }
      }

      // Show authentication UI
      console.log('User not authenticated or status check failed, showing login');
      this.showAuthScreen();

    } catch (error) {
      console.error('Auth initialization failed:', error);
      // Fallback to showing auth screen
      this.showAuthScreen();
    }

    this.initialized = true;
  }

  waitForFirebase() {
    return new Promise((resolve) => {
      const checkFirebase = () => {
        if (window.firebaseAuth && window.authService) {
          resolve();
        } else {
          setTimeout(checkFirebase, 100);
        }
      };
      checkFirebase();
    });
  }

  showAuthScreen() {
    // Auth UI is already initialized, just make sure it's visible
    window.authUI.showAuthOverlay();
  }

  showRevokedScreen() {
    const container = document.getElementById('auth-overlay') || document.createElement('div');
    container.id = 'auth-overlay';
    container.innerHTML = `
      <div id="auth-container">
        <div id="auth-header">
          <h2>Access Revoked</h2>
        </div>
        <div id="auth-content">
          <div style="text-align: center; padding: 20px;">
            <p style="color: #dc3545; margin-bottom: 20px;">
              Your account has been suspended by an administrator.
            </p>
            <p style="color: #666; font-size: 14px;">
              Please contact support for assistance.
            </p>
            <button class="auth-button secondary" onclick="window.authController.signOutAndReload()" style="margin-top: 20px;">
              Sign Out
            </button>
          </div>
        </div>
      </div>
    `;

    if (!document.getElementById('auth-overlay')) {
      document.body.appendChild(container);
    }

    // Add styles if not already present
    if (!document.getElementById('auth-styles')) {
      const style = document.createElement('style');
      style.id = 'auth-styles';
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
        }
        #auth-header h2 {
          margin: 0 0 20px 0;
          color: #333;
          font-size: 24px;
          text-align: center;
        }
        .auth-button.secondary {
          background: #f0f0f0;
          color: #333;
          border: none;
          padding: 14px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        .auth-button.secondary:hover {
          background: #e0e0e0;
        }
      `;
      document.head.appendChild(style);
    }
  }

  async signOutAndReload() {
    await window.authService.signOut();
    window.location.reload();
  }

  startFlutterApp() {
    // Hide auth overlay if it exists
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }

    // Start Flutter app by loading flutter_bootstrap.js
    console.log('Starting Flutter app...');
    const script = document.createElement('script');
    script.src = 'flutter_bootstrap.js';
    script.async = true;
    document.body.appendChild(script);
  }

  waitForFirebase() {
    return new Promise((resolve) => {
      const checkFirebase = () => {
        if (window.firebaseAuth && window.firebaseAuth.auth) {
          resolve();
        } else {
          setTimeout(checkFirebase, 100);
        }
      };
      checkFirebase();
    });
  }
}

// Initialize auth controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.authController = new AuthController();
});

// Export for use in other scripts
window.AuthController = AuthController;
