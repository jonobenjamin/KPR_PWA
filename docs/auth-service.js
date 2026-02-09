// Authentication service for Firebase
class AuthService {
  constructor() {
    this.auth = window.firebaseAuth;
  }

  async requestEmailPin(email) {
    try {
      const actionCodeSettings = {
        url: window.location.origin + window.location.pathname,
        handleCodeInApp: true,
      };

      await this.auth.sendSignInLinkToEmail(email, actionCodeSettings);
      localStorage.setItem('emailForSignIn', email);
      return { success: true };
    } catch (error) {
      console.error('Email PIN request failed:', error);
      return { success: false, error: error.message };
    }
  }

  async createOrUpdateUser(userData) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('No authenticated user');

      // Store user data in localStorage for the Flutter app
      localStorage.setItem('authenticatedUserName', userData.name || user.email);
      localStorage.setItem('authenticatedUserEmail', user.email);

      return { success: true, user: { name: userData.name, email: user.email } };
    } catch (error) {
      console.error('User creation/update failed:', error);
      return { success: false, error: error.message };
    }
  }

  signOut() {
    localStorage.removeItem('authenticatedUserName');
    localStorage.removeItem('authenticatedUserEmail');
    localStorage.removeItem('userAuthenticated');
    return this.auth.signOut();
  }
}

window.authService = new AuthService();