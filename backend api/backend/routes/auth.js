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

  // Password sign-in: use Firebase client signInWithEmailAndPassword (no custom /login).

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
      const emailSubject = 'Your Wildlife Tracker PIN Code';

      // HTML email template
      const emailBodyHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Wildlife Tracker PIN</title>
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
            <div class="logo">🦌 Wildlife Tracker</div>
            <div class="tagline">Field Observation Platform</div>
        </div>

        <div class="content">
            <h2>Hello ${name.trim()}!</h2>

            <p>Welcome to Wildlife Tracker. To complete your sign-in, please use the verification PIN below:</p>

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
                Enter this PIN in the Wildlife Tracker app to complete your authentication.
                This helps us ensure that only authorized field users can access the observation platform.
            </p>

            <p>
                If you have any questions or need assistance, please contact your system administrator.
            </p>
        </div>

        <div class="footer">
            <div class="contact">
                <strong>Wildlife Tracker System</strong><br>
                Field observation and conservation platform
            </div>

            <p style="margin-top: 20px; font-size: 12px; color: #999;">
                This is an automated message from Wildlife Tracker.<br>
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

// Helper function to send PIN emails (adapted from existing email service)
// Note: Uses EMAILJS_PIN_TEMPLATE_ID for PIN auth, EMAILJS_TEMPLATE_ID is for poaching notifications
async function sendPinEmail(toEmail, subject, body, isHtml = false) {
  // Extract PIN from HTML body for template variable
  const pinMatch = body.match(/pin-code[^>]*>(\d{6})</);
  const pinCode = pinMatch ? pinMatch[1] : 'ERROR';

  const emailData = {
    service_id: process.env.EMAILJS_SERVICE_ID,
    template_id: process.env.EMAILJS_PIN_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID, // PIN template for auth, fallback to general
    user_id: process.env.EMAILJS_PUBLIC_KEY,
    accessToken: process.env.EMAILJS_PRIVATE_KEY, // Required for EmailJS API
    template_params: {
      email: toEmail,     // Template expects {{email}} in To Email field
      pin: pinCode,      // ✅ Add PIN variable for template
      reply_to: toEmail,  // Add reply_to to match template
      subject: subject,
      message: body,
      from_name: process.env.EMAIL_FROM_NAME || 'Wildlife Tracker',
      html_content: isHtml ? body : undefined
    }
  };

  console.log('EmailJS request data:', {
    service_id: emailData.service_id,
    template_id: emailData.template_id,
    user_id: emailData.user_id ? '***' : 'MISSING',
    accessToken: emailData.accessToken ? '***' : 'MISSING',
    to_email: emailData.to_email, // Check if this field exists
    template_params: {
      ...emailData.template_params,
      message: emailData.template_params.message?.substring(0, 50) + '...'
    }
  });

  // Use EmailJS to send the email
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('EmailJS error response:', errorText);
    throw new Error(`EmailJS error: ${response.status} - ${errorText}`);
  }

  // EmailJS returns "OK" as plain text on success
  const result = await response.text();
  console.log('EmailJS success:', result);
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