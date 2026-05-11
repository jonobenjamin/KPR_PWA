const admin = require('firebase-admin');

/**
 * Find a `users` document for an identifier that may be a Firebase Auth UID, email,
 * or legacy custom doc id (`email_*`, `uname_*`, etc.).
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} identifier
 * @returns {Promise<FirebaseFirestore.DocumentSnapshot|null>}
 */
async function getUserDocByIdentifier(db, identifier) {
  if (!db || identifier == null || identifier === '') return null;
  const id = String(identifier).trim();
  if (!id) return null;

  let snap = await db.collection('users').doc(id).get();
  if (snap.exists) return snap;

  if (id.includes('@')) {
    const lower = id.toLowerCase();
    try {
      const rec = await admin.auth().getUserByEmail(lower);
      snap = await db.collection('users').doc(rec.uid).get();
      if (snap.exists) return snap;
    } catch (e) {
      if (e.code && e.code !== 'auth/user-not-found') throw e;
    }
    const emailKey = lower.replace(/[^a-zA-Z0-9]/g, '_');
    snap = await db.collection('users').doc(`email_${emailKey}`).get();
    if (snap.exists) return snap;
  }

  const all = await db.collection('users').get();
  for (const doc of all.docs) {
    const data = doc.data();
    if (data.email === id || data.uid === id || data.name === id) return doc;
    if (data.name && id.includes(data.name)) return doc;
    if (data.email && id.includes(data.email.split('@')[0])) return doc;
  }
  return null;
}

module.exports = { getUserDocByIdentifier };
