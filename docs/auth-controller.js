// Authentication Controller - Main entry point
class AuthController {
  constructor() {
    this.initialized = false;
    this.flutterStarted = false;
    this.init();
  }

  async init() {
    // Check if we have a previously authenticated user stored locally
    const storedAuth = localStorage.getItem('userAuthenticated');
    const storedUserName = localStorage.getItem('authenticatedUserName');

    if (storedAuth === 'true' && storedUserName) {
      console.log('Found previously authenticated user, proceeding offline:', storedUserName);
      // Skip Firebase initialization for offline mode
      this.startFlutterApp();
      this.initialized = true;
      return;
    }

    // Online authentication flow
    try {
      // Wait for Firebase to be ready before proceeding
      await this.waitForFirebase();

      // Initialize auth service after Firebase is ready
      await window.authService.init();

      // Set up auth state listener
      this.setupAuthStateListener();

      // Check if user is already authenticated
      const isAuthenticated = window.authService.isAuthenticated();
      console.log('Auth controller init - isAuthenticated:', isAuthenticated);
      console.log('Auth controller init - currentUser:', window.authService.currentUser);

      if (isAuthenticated) {
        await this.handleAuthenticatedUser();
        return;
      }

      // Show authentication UI
      console.log('User not authenticated or status check failed, showing login');
      this.showAuthScreen();

    } catch (error) {
      console.error('Auth initialization failed (likely offline):', error);
      // If Firebase fails to load (likely offline), show a message
      this.showOfflineMessage();
    }

    this.initialized = true;
  }

  setupAuthStateListener() {
    // Listen for authentication state changes
    window.firebaseAuth.auth.onAuthStateChanged(async (user) => {
      console.log('Auth state changed - user:', user ? user.uid : 'null');
      if (user) {
        console.log('User signed in, handling authenticated user...');
        await this.handleAuthenticatedUser();
      } else {
        console.log('User signed out, showing login');
        this.showAuthScreen();
      }
    });
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

  showOfflineMessage() {
    const container = document.getElementById('auth-overlay') || document.createElement('div');
    container.id = 'auth-overlay';
    container.innerHTML = `
      <div id="auth-container">
        <div id="auth-header">
          <h2>KPR Monitoring App</h2>
        </div>
        <div id="auth-content">
          <div style="text-align: center; padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 20px;">📱</div>
            <p style="color: #666; margin-bottom: 20px; font-size: 16px;">
              You're currently offline. This app requires an internet connection for initial setup and authentication.
            </p>
            <p style="color: #666; margin-bottom: 30px; font-size: 14px;">
              Please connect to the internet and try again.
            </p>
            <button class="auth-button" onclick="window.location.reload()" style="background: #007aff;">
              Retry Connection
            </button>
          </div>
        </div>
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
        border-radius: 16px;
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
      .auth-button {
        background: linear-gradient(135deg, #007aff, #0056cc);
        color: white;
        border: none;
        padding: 16px 20px;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        width: 100%;
        box-sizing: border-box;
        min-height: 48px;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(container);
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
    console.log('🎯 STARTING FLUTTER APP - User is authenticated and active');

    // Prevent multiple calls
    if (this.flutterStarted) {
      console.log('Flutter app already started, skipping');
      return;
    }
    this.flutterStarted = true;

    // Hide auth overlay if it exists
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      console.log('Auth overlay hidden');
    }

    // Check if Flutter is already loaded
    if (window.flutter_bootstrap) {
      console.log('Flutter already loaded, skipping bootstrap');
      return;
    }

    // Start Flutter app by loading flutter_bootstrap.js
    console.log('Loading Flutter bootstrap script...');
    const script = document.createElement('script');
    script.src = 'flutter_bootstrap.js';
    script.async = true;
    script.onload = () => {
      console.log('Flutter bootstrap script loaded successfully');
      // Flutter should now initialize automatically
    };
    script.onerror = (e) => console.error('Failed to load Flutter bootstrap script:', e);
    document.body.appendChild(script);

    console.log('Flutter app initialization complete');
  }

  waitForFirebase() {
    return new Promise((resolve) => {
      const checkFirebase = () => {
        if (window.firebaseAuth && window.firebaseAuth.auth && window.firebaseAuth.db) {
          resolve();
        } else {
          setTimeout(checkFirebase, 100);
        }
      };
      checkFirebase();
    });
  }


  async handleAuthenticatedUser() {
    // For new authentication, assume user is active and proceed immediately
    // The user document will be created by the auth service
    console.log('User authenticated successfully, proceeding to app immediately');

    // Store authentication state locally for offline access
    localStorage.setItem('userAuthenticated', 'true');

    // Don't wait for Firestore check - proceed directly to app
    // The Firestore document will be created asynchronously
    this.startFlutterApp();
  }
}

// Initialize auth controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.authController = new AuthController();
});

// Export for use in other scripts
window.AuthController = AuthController;
