const express = require('express');
const admin = require('firebase-admin');
const crypto = require('crypto');

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@$%';
  let s = '';
  for (let i = 0; i < 24; i++) s += chars[crypto.randomInt(0, chars.length)];
  return `${s}Aa1!`;
}

const requireAdmin = (req, res, next) => {
  console.log('🔐 ADMIN AUTH CHECK - Request to:', req.originalUrl);

  const adminKey = req.headers['x-api-key'];
  const expectedAdminKey = process.env.ADMIN_API_KEY || 'wildlife_admin_2024';

  console.log('🔑 Received API key:', adminKey ? '***' + adminKey.slice(-4) : 'NONE');
  console.log('🔑 Expected API key ends with:', '***' + expectedAdminKey.slice(-4));

  if (!adminKey || adminKey !== expectedAdminKey) {
    console.log('🚫 ADMIN AUTH FAILED - Access denied');
    return res.status(401).json({
      success: false,
      message: 'Admin authentication required - invalid or missing API key',
      debug: {
        received: !!adminKey,
        expectedEndsWith: expectedAdminKey.slice(-4)
      }
    });
  }

  console.log('✅ ADMIN AUTH SUCCESSFUL - Access granted');
  req.adminUid = 'admin_user';
  next();
};

module.exports = function createAdminRouter(db) {
  const router = express.Router();

  const requireDb = (_req, res, next) => {
    if (!db) {
      return res.status(503).json({ success: false, message: 'Database not configured' });
    }
    next();
  };

  // Get all users
  router.get('/users', requireAdmin, requireDb, async (req, res) => {
    try {
      console.log('📊 Admin API - listing users');

      let usersSnapshot;
      try {
        usersSnapshot = await db.collection('users').orderBy('registeredAt', 'desc').get();
      } catch (e) {
        usersSnapshot = await db.collection('users').get();
      }

      const users = [];
      for (const docSnap of usersSnapshot.docs) {
        const userData = docSnap.data();
        let lastLoginIso = userData.lastLogin?.toDate?.()
          ? userData.lastLogin.toDate().toISOString()
          : userData.lastLogin;

        let hasPassword = !!(userData.passwordSalt && userData.passwordHash);

        try {
          const authUser = await admin.auth().getUser(docSnap.id);
          const authSignIn = authUser.metadata?.lastSignInTime;
          hasPassword =
            hasPassword ||
            (authUser.providerData || []).some((p) => p.providerId === 'password');
          if (authSignIn) {
            const authMs = new Date(authSignIn).getTime();
            const fsMs = lastLoginIso ? new Date(lastLoginIso).getTime() : 0;
            if (!fsMs || authMs > fsMs) {
              lastLoginIso = new Date(authSignIn).toISOString();
            }
          }
        } catch (_) {
          // No Auth user for this Firestore doc id
        }

        users.push({
          id: docSnap.id,
          uid: userData.uid,
          name: userData.name,
          email: userData.email,
          phone: userData.phone,
          role: userData.role || 'user',
          status: userData.status || 'active',
          hasPassword,
          registeredAt: userData.registeredAt?.toDate?.()
            ? userData.registeredAt.toDate().toISOString()
            : userData.registeredAt,
          lastLogin: lastLoginIso
        });
      }

      const stats = {
        total: users.length,
        active: users.filter((u) => u.status === 'active').length,
        revoked: users.filter((u) => u.status === 'revoked').length
      };

      res.json({
        success: true,
        users,
        stats
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users'
      });
    }
  });

  // Create user — Firebase Auth uid; Firestore users/{uid}
  router.post('/users', requireAdmin, requireDb, async (req, res) => {
    try {
      const { name, email, phone, password, role } = req.body;
      const identifier = (email || phone || '').toString().trim();

      if (!name || !identifier) {
        return res.status(400).json({
          success: false,
          message: 'Name and email or phone are required'
        });
      }

      const validRoles = ['admin', 'user', 'viewer'];
      const userRole = validRoles.includes(role) ? role : 'user';
      const isEmail = identifier.includes('@');

      if (isEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(identifier)) {
          return res.status(400).json({ success: false, message: 'Invalid email format' });
        }
      } else {
        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        if (!phoneRegex.test(identifier.replace(/\s/g, ''))) {
          return res.status(400).json({
            success: false,
            message: 'Phone must be E.164 (e.g. +26771234567)'
          });
        }
      }

      try {
        if (isEmail) await admin.auth().getUserByEmail(identifier.toLowerCase());
        else await admin.auth().getUserByPhoneNumber(identifier.replace(/\s/g, ''));
        return res.status(400).json({
          success: false,
          message: 'A user with this email or phone already exists in Firebase Auth'
        });
      } catch (e) {
        if (e.code !== 'auth/user-not-found') {
          console.error('Auth duplicate check error:', e);
          throw e;
        }
      }

      const createParams = {
        displayName: name.trim()
      };
      if (isEmail) createParams.email = identifier.toLowerCase();
      else createParams.phoneNumber = identifier.replace(/\s/g, '');

      if (password && password.length >= 6) {
        createParams.password = String(password);
      } else {
        createParams.password = generateTempPassword();
      }

      const userRecord = await admin.auth().createUser(createParams);
      const uid = userRecord.uid;

      const userData = {
        uid,
        name: name.trim(),
        role: userRole,
        status: 'active',
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: req.adminUid
      };

      if (isEmail) userData.email = identifier.toLowerCase();
      else userData.phone = identifier.replace(/\s/g, '');

      try {
        await db.collection('users').doc(uid).set(userData);
      } catch (fsErr) {
        await admin.auth().deleteUser(uid).catch(() => {});
        throw fsErr;
      }

      res.json({
        success: true,
        message: 'User created successfully',
        user: {
          id: uid,
          name: userData.name,
          email: userData.email,
          phone: userData.phone,
          role: userData.role,
          status: userData.status
        }
      });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create user'
      });
    }
  });

  router.patch('/users/:userId', requireAdmin, requireDb, async (req, res) => {
    try {
      const { userId } = req.params;
      const { name, role, password } = req.body;

      const userRef = db.collection('users').doc(userId);

      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const updates = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: req.adminUid
      };

      if (name !== undefined && name.trim()) {
        updates.name = name.trim();
        try {
          await admin.auth().updateUser(userId, { displayName: name.trim() });
        } catch (e) {
          if (e.code !== 'auth/user-not-found') console.warn('admin.auth updateUser displayName:', e);
        }
      }

      if (role !== undefined) {
        const validRoles = ['admin', 'user', 'viewer'];
        if (validRoles.includes(role)) {
          updates.role = role;
        }
      }

      if (password !== undefined) {
        if (password.length >= 6) {
          await admin.auth().updateUser(userId, { password: String(password) });
          updates.passwordSalt = admin.firestore.FieldValue.delete();
          updates.passwordHash = admin.firestore.FieldValue.delete();
        } else if (password.length === 0) {
          updates.passwordSalt = admin.firestore.FieldValue.delete();
          updates.passwordHash = admin.firestore.FieldValue.delete();
        }
      }

      await userRef.update(updates);

      res.json({
        success: true,
        message: 'User updated successfully',
        userId
      });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user'
      });
    }
  });

  router.patch('/users/:userId/status', requireAdmin, requireDb, async (req, res) => {
    try {
      const { userId } = req.params;
      const { status } = req.body;

      if (!['active', 'revoked'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be "active" or "revoked"'
        });
      }

      const userRef = db.collection('users').doc(userId);

      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      await userRef.update({
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: req.adminUid
      });

      res.json({
        success: true,
        message: `User ${status === 'revoked' ? 'revoked' : 'restored'} successfully`,
        userId,
        status
      });
    } catch (error) {
      console.error('Error updating user status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user status'
      });
    }
  });

  router.delete('/users/:userId', requireAdmin, requireDb, async (req, res) => {
    try {
      const { userId } = req.params;

      const userRef = db.collection('users').doc(userId);

      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      await userRef.delete();

      try {
        await admin.auth().deleteUser(userId);
      } catch (e) {
        if (e.code !== 'auth/user-not-found') console.warn('admin.auth.deleteUser:', e);
      }

      res.json({
        success: true,
        message: 'User deleted successfully',
        userId
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete user'
      });
    }
  });

  router.get('/users/:userId', requireAdmin, requireDb, async (req, res) => {
    try {
      const { userId } = req.params;

      const userDoc = await db.collection('users').doc(userId).get();

      if (!userDoc.exists) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const userData = userDoc.data();

      res.json({
        success: true,
        user: {
          id: userDoc.id,
          uid: userData.uid,
          name: userData.name,
          email: userData.email,
          phone: userData.phone,
          role: userData.role || 'user',
          status: userData.status || 'active',
          registeredAt: userData.registeredAt,
          lastLogin: userData.lastLogin
        }
      });
    } catch (error) {
      console.error('Error fetching user details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user details'
      });
    }
  });

  return router;
};
