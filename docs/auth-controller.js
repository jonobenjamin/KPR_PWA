// Authentication Controller - Main entry point
class AuthController {
  constructor() {
    this.flutterStarted = false;
  }

  async init() {
    console.log('Auth controller initializing...');

    // Wait for auth services to be ready
    await this.waitForServices();
    console.log('Auth services ready');

    // Check if we have a previously authenticated user stored locally
    const storedAuth = localStorage.getItem('userAuthenticated');
    const storedUserName = localStorage.getItem('authenticatedUserName');

    if (storedAuth === 'true' && storedUserName) {
      console.log('Found previously authenticated user:', storedUserName);
      // Still show auth UI but user can choose to skip or re-auth
      console.log('Auth UI should be visible (can skip for offline access)');
      return;
    }

    // Check if user is currently authenticated with Firebase
    const isAuthenticated = window.authService.isAuthenticated();
    console.log('Current Firebase auth state:', isAuthenticated);

    if (isAuthenticated) {
      console.log('User is currently authenticated with Firebase');
      // Still show auth UI - user can proceed or re-auth
      console.log('Auth UI should be visible (already authenticated)');
      return;
    }

    // User is not authenticated - auth UI should already be showing
    console.log('User not authenticated - auth UI is showing for initial login');
  }

  waitForServices() {
    return new Promise((resolve) => {
      const checkServices = () => {
        if (window.firebaseAuth && window.authService && window.authUI) {
          resolve();
        } else {
          setTimeout(checkServices, 100);
        }
      };
      checkServices();
    });
  }

  showAuthScreen() {
    // Auth UI is already initialized and showing, nothing to do
    console.log('Auth screen should already be visible');
  }

  showOfflineMessage() {
    const container = document.createElement('div');
    container.id = 'auth-overlay';
    container.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); display: flex; justify-content: center; align-items: center; z-index: 9999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: white; border-radius: 16px; padding: 24px; max-width: 400px; width: 90%; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2); text-align: center;">
          <h2 style="margin: 0 0 20px 0; color: #333; font-size: 24px;">KPR Monitoring App</h2>
          <div style="font-size: 48px; margin-bottom: 20px;">📱</div>
          <p style="color: #666; margin-bottom: 20px; font-size: 16px;">
            You're currently offline. This app requires an internet connection for initial setup and authentication.
          </p>
          <p style="color: #666; margin-bottom: 30px; font-size: 14px;">
            Please connect to the internet and try again.
          </p>
          <button onclick="window.location.reload()" style="background: linear-gradient(135deg, #007aff, #0056cc); color: white; border: none; padding: 16px 20px; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; width: 100%; box-sizing: border-box; min-height: 48px;">
            Retry Connection
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(container);
  }


  startFlutterApp() {
    console.log('🎯 STARTING FLUTTER APP - User is authenticated');

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

    // Load Flutter app
    console.log('Loading Flutter bootstrap script...');
    const script = document.createElement('script');
    script.src = 'flutter_bootstrap.js';
    script.async = true;
    script.onload = () => {
      console.log('Flutter bootstrap script loaded successfully');
    };
    script.onerror = (e) => console.error('Failed to load Flutter bootstrap script:', e);
    document.body.appendChild(script);

    console.log('Flutter app initialization complete');
  }



}

// Initialize auth controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.authController = new AuthController();
});

// Export for use in other scripts
window.AuthController = AuthController;