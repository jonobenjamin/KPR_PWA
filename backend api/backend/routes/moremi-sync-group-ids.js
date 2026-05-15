const admin = require('firebase-admin');

/**
 * POST /sync-group-ids — Admin lists groups where uid ∈ memberIds and writes userProfiles.groupIds.
 * Lets the client show “my groups” without a client-side collection query on /groups (rules-safe).
 */
module.exports = function moremiSyncGroupIdsHandler(db) {
  return async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token) {
        return res.status(401).json({ success: false, message: 'Authorization token required' });
      }
      const decoded = await admin.auth().verifyIdToken(token);
      const uid = decoded.uid;

      const q = await db
        .collection('groups')
        .where('memberIds', 'array-contains', uid)
        .get();

      const groupIds = q.docs.map((d) => d.id);

      await db.collection('userProfiles').doc(uid).set(
        { groupIds },
        { merge: true }
      );

      res.json({ success: true, groupIds });
    } catch (error) {
      console.error('sync-group-ids error:', error);
      if (error.code === 'auth/id-token-expired') {
        return res.status(401).json({ success: false, message: 'Session expired' });
      }
      if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
      res.status(500).json({ success: false, message: 'Could not sync groups' });
    }
  };
};
