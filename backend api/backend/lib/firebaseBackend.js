'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const admin = require('firebase-admin');

let firebaseAdminProjectId = null;
let firestoreDatabaseIdForHealth = '(default)';
let db = null;
let initAttempted = false;

function parseServiceAccountProjectId() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return process.env.FIREBASE_PROJECT_ID || null;
  }
  try {
    let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
    if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
      jsonString = jsonString.slice(1, -1);
    }
    jsonString = jsonString.replace(/\\"/g, '"');
    const serviceAccount = JSON.parse(jsonString);
    return process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id || null;
  } catch {
    return process.env.FIREBASE_PROJECT_ID || null;
  }
}

function initFirebase() {
  if (initAttempted) return;
  initAttempted = true;

  try {
    if (!admin.apps.length) {
      if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        throw new Error('Firebase service account key not configured');
      }
      let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
      if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
        jsonString = jsonString.slice(1, -1);
      }
      jsonString = jsonString.replace(/\\"/g, '"');
      const serviceAccount = JSON.parse(jsonString);
      const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
      const missingFields = requiredFields.filter((field) => !serviceAccount[field]);
      if (missingFields.length > 0) {
        throw new Error(`Service account missing fields: ${missingFields.join(', ')}`);
      }
      const resolvedProjectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;
      firebaseAdminProjectId = resolvedProjectId;
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${resolvedProjectId}.firebaseio.com`,
        storageBucket: `${resolvedProjectId}.firebasestorage.app`
      });
    }

    db = admin.firestore();
    try {
      const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
      firestoreDatabaseIdForHealth = firestoreDatabaseId;
      db.settings({ databaseId: firestoreDatabaseId });
    } catch {
      /* already configured */
    }
  } catch (e) {
    console.error('Firebase init:', e.message);
    db = null;
    firebaseAdminProjectId = parseServiceAccountProjectId();
  }
}

function getDb() {
  initFirebase();
  return db;
}

module.exports = {
  initFirebase,
  getDb,
  getFirebaseAdmin: () => admin,
  get firebaseAdminProjectId() {
    return firebaseAdminProjectId || parseServiceAccountProjectId();
  },
  get firestoreDatabaseIdForHealth() {
    return firestoreDatabaseIdForHealth;
  },
  parseServiceAccountProjectId
};
