const crypto = require('crypto');
const admin = require('firebase-admin');

function randomInvite(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars[crypto.randomInt(0, chars.length)];
  }
  return s;
}

/**
 * POST create-group — same data shape as client, but Admin SDK (no Firestore rules).
 */
module.exports = function moremiCreateGroupHandler(db) {
  return async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token) {
        return res.status(401).json({ success: false, message: 'Authorization token required' });
      }
      const decoded = await admin.auth().verifyIdToken(token);
      const uid = decoded.uid;

      const rawName = (req.body && req.body.groupName) || '';
      const groupName = String(rawName).trim().slice(0, 120);
      if (!groupName) {
        return res.status(400).json({ success: false, message: 'Group name is required' });
      }

      const profileRef = db.collection('userProfiles').doc(uid);
      const profileSnap = await profileRef.get();
      const username =
        (profileSnap.exists && profileSnap.data().username) || decoded.name || 'User';
      const avatarEmoji = (profileSnap.exists && profileSnap.data().avatarEmoji) || '🐘';

      const gid = db.collection('groups').doc().id;
      let code = randomInvite(8);
      for (let attempt = 0; attempt < 8; attempt++) {
        const clash = await db.collection('groupInvites').doc(code).get();
        if (!clash.exists) break;
        code = randomInvite(8);
      }

      const gRef = db.collection('groups').doc(gid);
      const inviteRef = db.collection('groupInvites').doc(code);

      const batch = db.batch();
      batch.set(gRef, {
        groupName,
        createdBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        memberIds: [uid],
        inviteCode: code,
      });
      batch.set(gRef.collection('members').doc(uid), {
        username,
        avatarEmoji,
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.set(inviteRef, {
        groupId: gid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.set(
        profileRef,
        {
          currentGroupId: gid,
          groupIds: admin.firestore.FieldValue.arrayUnion(gid),
        },
        { merge: true }
      );

      await batch.commit();

      res.json({ success: true, groupId: gid, inviteCode: code });
    } catch (error) {
      console.error('create-group error:', error);
      if (error.code === 'auth/id-token-expired') {
        return res.status(401).json({ success: false, message: 'Session expired' });
      }
      if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
      res.status(500).json({ success: false, message: 'Could not create group' });
    }
  };
};
