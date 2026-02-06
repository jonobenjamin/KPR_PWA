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
      const response = await fetch('https://kpr-pwa-authemail.vercel.app/api/auth/request-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, name })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send PIN');
      }

      return { success: true, message: 'PIN sent to your email' };
    } catch (error) {
      console.error('Email PIN request failed:', error);
      throw error;
    }
  }

  async verifyEmailPin(email, pin) {
    try {
      const response = await fetch('https://kpr-pwa-authemail.vercel.app/api/auth/verify-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, pin })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Invalid PIN');
      }

      const data = await response.json();

      // Sign in with custom token
      const result = await signInWithCustomToken(this.auth, data.customToken);

      // Create/update user document
      await this.createOrUpdateUser(result.user, { email, name: data.name });

      return { success: true, user: result.user };
    } catch (error) {
      console.error('Email PIN verification failed:', error);
      throw error;
    }
  }

  // Phone Authentication
  async requestPhoneOtp(phoneNumber, name) {
    try {
      console.log('requestPhoneOtp called, this.auth:', this.auth);

      if (!this.auth) {
        throw new Error('Firebase auth not initialized');
      }

      // For now, skip reCAPTCHA and try direct phone auth
      // This might work if the domain is properly configured
      console.log('Attempting phone auth without reCAPTCHA...');

      const phoneNumberFormatted = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      console.log('Formatted phone number:', phoneNumberFormatted);

      try {
        const confirmationResult = await signInWithPhoneNumber(
          this.auth,
          phoneNumberFormatted
          // Note: No reCAPTCHA verifier - Firebase might handle this automatically
        );

        console.log('Phone auth successful, confirmation result:', confirmationResult);
        this.confirmationResult = confirmationResult;
        return { success: true, message: 'OTP sent to your phone' };

      } catch (phoneError) {
        console.error('Phone auth failed:', phoneError);

        // If direct auth fails, try with reCAPTCHA as fallback
        console.log('Trying with reCAPTCHA fallback...');

        if (!this.recaptchaVerifier) {
          const container = document.getElementById('recaptcha-container');
          console.log('reCAPTCHA container element:', container);

          if (!container) {
            throw new Error('reCAPTCHA container not found in DOM');
          }

          try {
            console.log('Creating RecaptchaVerifier...');
            this.recaptchaVerifier = new RecaptchaVerifier(
              container,
              {
                size: 'normal',
                callback: (response) => {
                  console.log('reCAPTCHA solved:', response);
                },
                'expired-callback': () => {
                  console.log('reCAPTCHA expired');
                }
              },
              this.auth
            );
            console.log('RecaptchaVerifier created successfully');
          } catch (recaptchaError) {
            console.error('RecaptchaVerifier creation failed:', recaptchaError);
            throw new Error(`Phone auth setup failed: ${recaptchaError.message}`);
          }
        }

        // Retry with reCAPTCHA
        const confirmationResult = await signInWithPhoneNumber(
          this.auth,
          phoneNumberFormatted,
          this.recaptchaVerifier
        );

        this.confirmationResult = confirmationResult;

        // Create/update user document for phone auth
        // We'll update it properly after successful verification
        const tempUserData = {
          name,
          email: null,
          phone: phoneNumberFormatted,
          status: 'active',
          registeredAt: serverTimestamp(),
          lastLogin: null // Will be set after verification
        };

        // Store temporarily - will be updated after verification
        sessionStorage.setItem('pendingPhoneUser', JSON.stringify(tempUserData));

        return { success: true, message: 'OTP sent to your phone' };
      }
    } catch (error) {
      console.error('Phone OTP request failed:', error);
      throw new Error(`Failed to send OTP: ${error.message}`);
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
