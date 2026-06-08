const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');

/** One-time password for email-PIN users created in Auth without exposing sign-in password. */
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@$%';
  let s = '';
  for (let i = 0; i < 24; i++) s += chars[crypto.randomInt(0, chars.length)];
  return `${s}Aa1!`;
}

module.exports = function createAuthRouter(db) {
  const router = express.Router();

  function requireDb(req, res, next) {
    if (!db) {
      return res.status(503).json({ success: false, message: 'Database not configured' });
    }
    next();
  }

  // Register — Firebase Auth assigns uid; Firestore users/{uid}. Password lives in Auth only.
  router.post('/register', requireDb, async (req, res) => {
    try {
      const { username, password, email, phone, displayName } = req.body || {};
      const emailNorm = email ? String(email).trim().toLowerCase() : '';
      const phoneNorm = phone ? String(phone).trim() : '';
      const profileUsername = username ? String(username).trim().toLowerCase() : '';
      const nameForProfile = String(
        (displayName && displayName.trim()) ||
          (profileUsername || emailNorm.split('@')[0] || 'User')
      ).trim();

      if (!emailNorm || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }
      if (String(password).length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailNorm)) {
        return res.status(400).json({ success: false, message: 'Invalid email format' });
      }
      if (phoneNorm) {
        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        if (!phoneRegex.test(phoneNorm)) {
          return res.status(400).json({
            success: false,
            message: 'Phone must be in international format (e.g. +26771234567)'
          });
        }
      }

      const authCreate = {
        email: emailNorm,
        password: String(password),
        displayName: nameForProfile
      };

      let userRecord;
      try {
        userRecord = await admin.auth().createUser(authCreate);
      } catch (e) {
        if (e.code === 'auth/email-already-exists') {
          return res.status(409).json({ success: false, message: 'This email is already registered' });
        }
        if (e.code === 'auth/phone-number-already-exists') {
          return res.status(409).json({ success: false, message: 'This phone number is already registered' });
        }
        console.error('createUser error:', e);
        return res.status(500).json({ success: false, message: 'Could not create account' });
      }

      const uid = userRecord.uid;

      if (phoneNorm) {
        try {
          await admin.auth().updateUser(uid, { phoneNumber: phoneNorm });
        } catch (e) {
          console.error('updateUser phone error:', e);
          await admin.auth().deleteUser(uid).catch(() => {});
          if (e.code === 'auth/phone-number-already-exists') {
            return res.status(409).json({ success: false, message: 'This phone number is already registered' });
          }
          return res.status(500).json({ success: false, message: 'Could not attach phone number' });
        }
      }

      try {
        await db.collection('users').doc(uid).set({
          uid,
          username: profileUsername || null,
          name: nameForProfile,
          email: emailNorm,
          phone: phoneNorm || null,
          role: 'user',
          status: 'active',
          registeredAt: admin.firestore.FieldValue.serverTimestamp(),
          lastLogin: admin.firestore.FieldValue.serverTimestamp(),
          provider: 'password_register'
        });
      } catch (fsErr) {
        console.error('Firestore user doc error:', fsErr);
        await admin.auth().deleteUser(uid).catch(() => {});
        return res.status(500).json({ success: false, message: 'Registration failed' });
      }

      const customToken = await admin.auth().createCustomToken(uid, {
        email: emailNorm,
        name: nameForProfile,
        username: profileUsername || undefined,
        provider: 'password'
      });

      res.json({
        success: true,
        customToken,
        email: emailNorm,
        name: nameForProfile,
        username: profileUsername || null
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ success: false, message: 'Registration failed' });
    }
  });

  /** Email + password login via Identity Toolkit on the server, then [createCustomToken] (same as PIN/register). */
  function getFirebaseWebApiKey() {
    const k = process.env.FIREBASE_WEB_API_KEY;
    if (k && String(k).trim()) return String(k).trim();
    const raw = process.env.FIREBASE_WEB_CONFIG_JSON;
    if (raw) {
      try {
        const o = JSON.parse(raw);
        if (o && o.apiKey) return String(o.apiKey).trim();
      } catch (_) {}
    }
    return null;
  }

  router.post('/sign-in-password', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const emailNorm = email ? String(email).trim().toLowerCase() : '';
      const pass = password != null ? String(password) : '';
      if (!emailNorm || !pass) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
      }
      const apiKey = getFirebaseWebApiKey();
      if (!apiKey) {
        return res.status(503).json({
          success: false,
          message:
            'Server is missing FIREBASE_WEB_API_KEY (or apiKey inside FIREBASE_WEB_CONFIG_JSON). Needed for email/password sign-in.',
        });
      }
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailNorm,
          password: pass,
          returnSecureToken: true,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = data.error?.message || data.error || '';
        const m = String(msg);
        if (m.includes('OPERATION_NOT_ALLOWED')) {
          return res.status(503).json({
            success: false,
            message:
              'Email/Password sign-in is disabled in Firebase. Enable it in Firebase Console → Authentication → Sign-in method → Email/Password.',
          });
        }
        if (
          m.includes('INVALID_PASSWORD') ||
          m.includes('INVALID_LOGIN_CREDENTIALS') ||
          m.includes('EMAIL_NOT_FOUND')
        ) {
          return res.status(401).json({
            success: false,
            message:
              'Invalid email or password. If you created this account with an email PIN only, sign in with PIN — password login is for accounts registered with email + password.',
          });
        }
        if (m.includes('USER_DISABLED')) {
          return res.status(403).json({ success: false, message: 'This account has been disabled' });
        }
        if (m.includes('INVALID_EMAIL')) {
          return res.status(400).json({ success: false, message: 'Invalid email address' });
        }
        if (m.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
          return res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
        }
        console.error('sign-in-password Identity Toolkit error:', m, data);
        return res.status(400).json({ success: false, message: m || 'Sign-in failed' });
      }
      const uid = data.localId;
      if (!uid) {
        return res.status(500).json({ success: false, message: 'Sign-in response missing user id' });
      }
      let name = emailNorm.split('@')[0] || 'User';
      try {
        const rec = await admin.auth().getUser(uid);
        if (rec.displayName) name = rec.displayName;
      } catch (_) {}
      const customToken = await admin.auth().createCustomToken(uid, {
        email: emailNorm,
        name,
        provider: 'password',
      });
      res.json({
        success: true,
        customToken,
        email: emailNorm,
        name,
      });
    } catch (error) {
      console.error('sign-in-password error:', error);
      res.status(500).json({ success: false, message: 'Sign-in failed' });
    }
  });

// Email PIN challenges in Firestore (required on Vercel/serverless: in-memory Maps were lost
// between request-pin and verify-pin on different instances).
const PIN_TTL_MS = 15 * 60 * 1000;
const EMAIL_PIN_COLLECTION = 'emailPinChallenges';

// Generate a secure PIN
function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash PIN for storage
function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

// Email PIN request endpoint
router.post('/request-pin', requireDb, async (req, res) => {
  try {
    console.log('Request body:', req.body);
    const { email, name } = req.body;
    console.log('Extracted email:', email, 'name:', name);

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email and name are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Generate PIN
    const pin = generatePin();
    const hashedPin = hashPin(String(pin).trim());
    const emailKey = email.toLowerCase();
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + PIN_TTL_MS);

    await db.collection(EMAIL_PIN_COLLECTION).doc(emailKey).set({
      pinHash: hashedPin,
      name: name.trim(),
      attempts: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt
    });

    // Send PIN via email using EmailJS (reuse existing notification service)
    try {
      const emailSubject = 'Your Moremi Sightings PIN code';

      // HTML email template
      const emailBodyHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Moremi Sightings PIN</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #2e7d32;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #2e7d32;
            margin-bottom: 10px;
        }
        .tagline {
            color: #666;
            font-size: 16px;
        }
        .pin-container {
            background: linear-gradient(135deg, #2e7d32, #4caf50);
            border-radius: 8px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
            color: white;
        }
        .pin-label {
            font-size: 14px;
            margin-bottom: 10px;
            opacity: 0.9;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .pin-code {
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 8px;
            margin: 10px 0;
            font-family: 'Courier New', monospace;
        }
        .pin-note {
            font-size: 12px;
            opacity: 0.8;
            margin-top: 15px;
        }
        .content {
            margin: 30px 0;
            line-height: 1.7;
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
            color: #856404;
        }
        .warning strong {
            display: block;
            margin-bottom: 5px;
        }
        .footer {
            border-top: 1px solid #eee;
            padding-top: 20px;
            margin-top: 40px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
        .security-note {
            background: #e8f5e8;
            border-left: 4px solid #2e7d32;
            padding: 15px;
            margin: 20px 0;
        }
        .contact {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🦌 Moremi Sightings</div>
            <div class="tagline">Field Observation Platform</div>
        </div>

        <div class="content">
            <h2>Hello ${name.trim()}!</h2>

            <p>Welcome to Moremi Sightings. To complete your sign-in, please use the verification PIN below:</p>

            <div class="pin-container">
                <div class="pin-label">Your Verification PIN</div>
                <div class="pin-code">${pin}</div>
                <div class="pin-note">Valid for 15 minutes</div>
            </div>

            <div class="security-note">
                <strong>🔒 Security Notice:</strong> This PIN is unique to your email address and will expire in 15 minutes. Do not share this PIN with anyone.
            </div>

            <div class="warning">
                <strong>⚠️ Important:</strong> If you didn't request this PIN, please ignore this email. Your account remains secure.
            </div>

            <p>
                Enter this PIN in the Moremi app or web portal to complete your authentication.
                This helps us ensure that only authorized field users can access the observation platform.
            </p>

            <p>
                If you have any questions or need assistance, please contact your system administrator.
            </p>
        </div>

        <div class="footer">
            <div class="contact">
                <strong>Moremi Sightings</strong><br>
                Field observation and conservation platform
            </div>

            <p style="margin-top: 20px; font-size: 12px; color: #999;">
                This is an automated message from Moremi Sightings.<br>
                Please do not reply to this email.
            </p>
        </div>
    </div>
</body>
</html>`;

      // Use existing email service (adapted for PIN sending)
      await sendPinEmail(email, emailSubject, emailBodyHtml, true); // true = HTML email

      console.log(`PIN sent to ${email}: ${pin}`);
    } catch (emailError) {
      console.error('Failed to send PIN email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send PIN email. Please try again.'
      });
    }

    res.json({
      success: true,
      message: 'PIN sent to your email'
    });

  } catch (error) {
    console.error('PIN request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// PIN verification endpoint
router.post('/verify-pin', requireDb, async (req, res) => {
  try {
    console.log('🔍 PIN verification request received:', { email: req.body.email, pin: req.body.pin });
    const { email, pin } = req.body;

    if (!email || !pin) {
      console.log('Missing email or PIN');
      return res.status(400).json({
        success: false,
        message: 'Email and PIN are required'
      });
    }

    const emailKey = email.toLowerCase();
    const pinRef = db.collection(EMAIL_PIN_COLLECTION).doc(emailKey);
    console.log('Looking up PIN for email:', emailKey);
    const pinSnap = await pinRef.get();
    if (!pinSnap.exists) {
      console.log('PIN not found or expired for:', emailKey);
      return res.status(400).json({
        success: false,
        message: 'PIN not found or expired. Please request a new PIN.'
      });
    }

    const storedData = pinSnap.data();
    if (!storedData || !storedData.pinHash || !storedData.expiresAt) {
      await pinRef.delete().catch(() => {});
      return res.status(400).json({
        success: false,
        message: 'PIN not found or expired. Please request a new PIN.'
      });
    }
    const nowTs = admin.firestore.Timestamp.now();
    if (storedData.expiresAt.toMillis() < nowTs.toMillis()) {
      await pinRef.delete().catch(() => {});
      return res.status(400).json({
        success: false,
        message: 'PIN has expired. Please request a new PIN.'
      });
    }

    const attempts = storedData.attempts || 0;
    if (attempts >= 5) {
      await pinRef.delete().catch(() => {});
      return res.status(400).json({
        success: false,
        message: 'Too many failed attempts. Please request a new PIN.'
      });
    }

    console.log('Verifying PIN for:', emailKey);
    const hashedInputPin = hashPin(String(pin).trim());
    console.log('PIN hash comparison:', hashedInputPin === storedData.pinHash ? 'MATCH' : 'NO MATCH');

    if (hashedInputPin !== storedData.pinHash) {
      await pinRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
      const after = await pinRef.get();
      const att = after.data()?.attempts || attempts + 1;
      console.log('Invalid PIN attempt', att, 'for:', emailKey);
      if (att >= 5) {
        await pinRef.delete().catch(() => {});
        return res.status(400).json({
          success: false,
          message: 'Too many failed attempts. Please request a new PIN.'
        });
      }
      return res.status(400).json({
        success: false,
        message: `Invalid PIN. ${5 - att} attempts remaining.`
      });
    }

    console.log('PIN verified successfully for:', emailKey);

    let userRecord;
    let createdViaPin = false;
    try {
      userRecord = await admin.auth().getUserByEmail(emailKey);
    } catch (lookupErr) {
      if (lookupErr.code !== 'auth/user-not-found') {
        console.error('getUserByEmail error:', lookupErr);
        throw lookupErr;
      }
      userRecord = await admin.auth().createUser({
        email: emailKey,
        password: generateTempPassword(),
        displayName: storedData.name || 'User'
      });
      createdViaPin = true;
    }

    const uid = userRecord.uid;
    const additionalClaims = {
      email: emailKey,
      name: storedData.name,
      provider: 'email_pin'
    };

    console.log('Token details:', { uid, claims: additionalClaims });
    const customToken = await admin.auth().createCustomToken(uid, additionalClaims);
    console.log('Custom token created successfully');

    try {
      if (createdViaPin) {
        await db.collection('users').doc(uid).set({
          uid,
          name: storedData.name,
          email: emailKey,
          phone: null,
          role: 'user',
          status: 'active',
          provider: 'email_pin',
          registeredAt: admin.firestore.FieldValue.serverTimestamp(),
          lastLogin: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        await db.collection('users').doc(uid).set(
          { lastLogin: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
    } catch (fsErr) {
      if (createdViaPin) await admin.auth().deleteUser(uid).catch(() => {});
      throw fsErr;
    }

    console.log(`PIN verified for ${email}, custom token for Auth uid ${uid}`);

    await pinRef.delete().catch(() => {});

    const responseData = {
      success: true,
      customToken,
      name: storedData.name
    };
    console.log('Sending response:', { success: true, hasToken: !!customToken, name: storedData.name });

    res.json(responseData);

  } catch (error) {
    console.error('PIN verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update password for signed-in user (Bearer Firebase ID token) — Auth is source of truth.
router.post('/change-password', requireDb, async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authorization token required' });
    }

    const { newPassword, confirmPassword } = req.body || {};
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirmation are required'
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    await admin.auth().updateUser(uid, { password: String(newPassword) });

    await db.collection('users').doc(uid).set(
      {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        passwordSalt: admin.firestore.FieldValue.delete(),
        passwordHash: admin.firestore.FieldValue.delete()
      },
      { merge: true }
    );

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('change-password error:', error);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ success: false, message: 'Session expired; please sign in again' });
    }
    if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ success: false, message: 'Invalid session; please sign in again' });
    }
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

// PIN email delivery removed (EmailJS retired). Configure a mail provider and implement sendPinEmail to restore.
async function sendPinEmail(_toEmail, _subject, _body, _isHtml = false) {
  throw new Error(
    'Email delivery is not configured on this server (EmailJS removed).'
  );
}

// Let FlutterFire sign in for Firestore rules (after JS Firebase Auth already issued an ID token).
router.post('/flutter-session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authorization token required' });
    }
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const customToken = await admin.auth().createCustomToken(uid, {
      username: decoded.username || undefined
    });
    res.json({ success: true, customToken });
  } catch (error) {
    console.error('flutter-session error:', error);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ success: false, message: 'Session expired' });
    }
    if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    res.status(500).json({ success: false, message: 'Could not create session' });
  }
});

  return router;
};