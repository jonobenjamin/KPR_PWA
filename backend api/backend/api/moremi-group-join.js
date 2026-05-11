const admin = require('firebase-admin');

/**
 * Returns Express handler for POST /join-group (Firestore invite + membership).
 * Exported as a single function for Vercel — object exports break under Node bytecode.
 */
module.exports = function moremiJoinGroupHandler(db) {
  return async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token) {
        return res.status(401).json({ success: false, message: 'Authorization token required' });
      }
      const decoded = await admin.auth().verifyIdToken(token);
      const uid = decoded.uid;
      const inviteCode = String((req.body && req.body.inviteCode) || '').trim().toUpperCase();
      if (inviteCode.length < 4) {
        return res.status(400).json({ success: false, message: 'Invalid invite code' });
      }

      const inviteRef = db.collection('groupInvites').doc(inviteCode);
      const inviteSnap = await inviteRef.get();
      if (!inviteSnap.exists) {
        return res.status(404).json({ success: false, message: 'Unknown invite code' });
      }
      const groupId = inviteSnap.data().groupId;
      if (!groupId || typeof groupId !== 'string') {
        return res.status(500).json({ success: false, message: 'Invite misconfigured' });
      }

      const profileRef = db.collection('userProfiles').doc(uid);
      const profileSnap = await profileRef.get();
      const username =
        (profileSnap.exists && profileSnap.data().username) ||
        decoded.name ||
        'User';
      const avatarEmoji =
        (profileSnap.exists && profileSnap.data().avatarEmoji) || '🐘';

      const groupRef = db.collection('groups').doc(groupId);

      await db.runTransaction(async (t) => {
        const gSnap = await t.get(groupRef);
        if (!gSnap.exists) {
          throw new Error('group_missing');
        }
        const data = gSnap.data();
        const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];
        if (memberIds.includes(uid)) {
          t.set(
            profileRef,
            { currentGroupId: groupId, username, avatarEmoji },
            { merge: true }
          );
          return;
        }
        t.update(groupRef, {
          memberIds: admin.firestore.FieldValue.arrayUnion(uid)
        });
        t.set(groupRef.collection('members').doc(uid), {
          username,
          avatarEmoji,
          joinedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        t.set(
          profileRef,
          {
            username,
            avatarEmoji,
            currentGroupId: groupId
          },
          { merge: true }
        );
      });

      res.json({ success: true, groupId });
    } catch (error) {
      console.error('join-group error:', error);
      if (error.message === 'group_missing') {
        return res.status(404).json({ success: false, message: 'Group not found' });
      }
      if (error.code === 'auth/id-token-expired') {
        return res.status(401).json({ success: false, message: 'Session expired' });
      }
      if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
      res.status(500).json({ success: false, message: 'Could not join group' });
    }
  };
};
