// Firebase — Moremi PWA web app (must match PWA Build/lib/firebase_options.dart → projectId moremi-app)
const firebaseConfig = {
  apiKey: 'AIzaSyB4eTkmBRxQ7hNm0zNRuXa1xzqTkeNa4bM',
  authDomain: 'moremi-app.firebaseapp.com',
  projectId: 'moremi-app',
  storageBucket: 'moremi-app.firebasestorage.app',
  messagingSenderId: '478665220534',
  appId: '1:478665220534:web:98b23a9c8fb77504232117',
};

// Backend API — Moremi deployment (must match build-app.sh / Flutter --dart-define=API_BASE_URL)
const MOREMI_API_BASE = 'https://moremi-pwa.vercel.app';

// Initialize Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getAuth,
  signInWithCustomToken,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut,
  onAuthStateChanged,
  sendSignInLinkToEmail
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

console.log('Firebase config loaded — project:', firebaseConfig.projectId);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log('Firebase initialized:', { app, auth, db });

// Export for use in other modules
window.firebaseAuth = {
  auth,
  db,
  signInWithCustomToken,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp
};

console.log('window.firebaseAuth set:', window.firebaseAuth);

// Backend root for auth-service fetch() (register, PIN, etc.)
window.MOREMI_API_BASE = MOREMI_API_BASE;
