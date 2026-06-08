// Firebase — Moremi (same web app as docs/firebase-config.js and Flutter firebase_options.dart)
const firebaseConfig = {
  apiKey: 'AIzaSyB4eTkmBRxQ7hNm0zNRuXa1xzqTkeNa4bM',
  authDomain: 'moremi-app.firebaseapp.com',
  projectId: 'moremi-app',
  storageBucket: 'moremi-app.firebasestorage.app',
  messagingSenderId: '478665220534',
  appId: '1:478665220534:web:98b23a9c8fb77504232117',
};

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithCustomToken, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

window.firebasePortal = {
  auth,
  db,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
};
