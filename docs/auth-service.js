// Authentication Service
// Import Firebase functions directly
import {
  signInWithCustomToken,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class AuthService {
  constructor() {
    this.currentUser = null;
    this.recaptchaVerifier = null;
    this.auth = null;
    this.db = null;
    this.init();
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
      const response = await fetch('https://wildlife-tracker-gxz5.vercel.app/api/auth/request-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, name })
      });

      console.log('PIN request response status:', response.status);
      console.log('PIN request response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('PIN request error response:', errorText);
        const error = await response.json().catch(() => ({ message: errorText }));
        throw new Error(error.message || 'Failed to send PIN');
      }

      const result = await response.json();
      console.log('PIN request success:', result);
      return { success: true, message: 'PIN sent to your email' };
    } catch (error) {
      console.error('Email PIN request failed:', error);
      throw new Error(`Failed to send PIN: ${error.message}`);
    }
  }

  async verifyEmailPin(email, pin) {
    try {
      console.log('Making PIN verification request for:', email, 'PIN length:', pin.length);
      const response = await fetch('https://wildlife-tracker-gxz5.vercel.app/api/auth/verify-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, pin })
      });

      console.log('PIN verification response status:', response.status);
      console.log('PIN verification response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('PIN verification error response:', errorText);
        const error = await response.json().catch(() => ({ message: errorText }));
        throw new Error(error.message || 'Invalid PIN');
      }

      const data = await response.json();
      console.log('PIN verification success, received custom token:', !!data.customToken);

      // Sign in with custom token
      console.log('Signing in with custom token...');
      const result = await signInWithCustomToken(this.auth, data.customToken);
      console.log('Firebase sign in successful for user:', result.user.uid);

      // Create/update user document
      console.log('Creating/updating user document...');
      await this.createOrUpdateUser(result.user, { email, name: data.name });
      console.log('User document created/updated');

      // Force re-check of authentication state
      console.log('PIN verification complete - notifying auth controller');
      if (window.authController) {
        setTimeout(() => {
          console.log('Triggering auth controller re-check');
          window.authController.checkAuthState();
        }, 1000); // Give Firebase a moment to settle
      }

      return { success: true, user: result.user };
    } catch (error) {
      console.error('Email PIN verification failed:', error);
      throw error;
    }
  }

  // Phone Authentication - Temporarily disabled due to Firebase config issues
  async requestPhoneOtp(phoneNumber, name) {
    console.log('Phone authentication is currently disabled due to Firebase configuration issues.');
    console.log('Please use email authentication instead.');

    // Show user-friendly error
    throw new Error('Phone authentication is temporarily unavailable. Please use email authentication.');
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
      }

      return { success: true, user: result.user };
    } catch (error) {
      console.error('Phone OTP verification failed:', error);
      throw new Error(`Invalid OTP: ${error.message}`);
    }
  }

  // User Management
  async createOrUpdateUser(user, userData) {
    const userDoc = {
      name: userData.name,
      email: userData.email,
      phone: userData.phone || null,
      status: 'active',
      registeredAt: userData.registeredAt || serverTimestamp(),
      lastLogin: serverTimestamp()
    };

    try {
      await setDoc(doc(this.db, 'users', user.uid), userDoc, { merge: true });
      console.log('User document created/updated:', user.uid);
    } catch (error) {
      console.error('Failed to create/update user document:', error);
      throw error;
    }
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

  async signOut() {
    await signOut(this.auth);
    this.currentUser = null;
  }

  isAuthenticated() {
    return !!this.currentUser;
  }
}

// Create global instance
window.authService = new AuthService();
