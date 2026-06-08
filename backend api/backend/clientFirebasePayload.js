'use strict';

function completeClientFirebasePayload(raw, projectIdFromServer) {
  const projectId = raw.projectId || projectIdFromServer;
  if (!projectId || !raw.apiKey) return null;
  const messagingSenderId =
    raw.messagingSenderId || process.env.FIREBASE_WEB_MESSAGING_SENDER_ID || null;
  const appId = raw.appId || process.env.FIREBASE_WEB_APP_ID || null;
  if (!messagingSenderId || !appId) return null;
  return {
    apiKey: raw.apiKey,
    authDomain: raw.authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: raw.storageBucket || `${projectId}.firebasestorage.app`,
    messagingSenderId,
    appId,
    firestoreDatabaseId:
      raw.firestoreDatabaseId || process.env.FIRESTORE_DATABASE_ID || '(default)'
  };
}

module.exports = { completeClientFirebasePayload };

