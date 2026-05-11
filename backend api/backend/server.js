require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');

let firebaseAdminProjectId = null;
let firestoreDatabaseIdForHealth = '(default)';

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

// Initialize Firebase Admin SDK (serverless-safe)
let db;

function initializeFirebase() {
  if (!admin.apps.length) {
    // Firebase not initialized yet - ONLY use environment variable (no file loading)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        console.log('FIREBASE_SERVICE_ACCOUNT_KEY length:', process.env.FIREBASE_SERVICE_ACCOUNT_KEY.length);

        // Try to clean up the JSON string if needed
        let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();

        // Remove any surrounding quotes that might have been added accidentally
        if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
          jsonString = jsonString.slice(1, -1);
        }

        // Unescape any escaped quotes
        jsonString = jsonString.replace(/\\"/g, '"');

        const serviceAccount = JSON.parse(jsonString);
        console.log('Successfully parsed service account from environment variable');

        // Validate required fields
        const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
        const missingFields = requiredFields.filter(field => !serviceAccount[field]);

        if (missingFields.length > 0) {
          console.error('Service account missing required fields:', missingFields);
          throw new Error(`Service account missing fields: ${missingFields.join(', ')}`);
        }

        const resolvedProjectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;
        firebaseAdminProjectId = resolvedProjectId;
        console.log('Admin SDK projectId (env override or service account):', resolvedProjectId);

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: `https://${resolvedProjectId}.firebaseio.com`,
          storageBucket: `${resolvedProjectId}.firebasestorage.app`
        });
        console.log('Firebase Admin SDK initialized successfully with Storage');

      } catch (error) {
        console.error('Failed to initialize Firebase:', error.message);
        throw error;
      }
    } else {
      console.error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable not set!');
      throw new Error('Firebase service account key not configured');
    }
  }

  return admin.firestore();
}

// Initialize Firebase safely
try {
  initializeFirebase();
  // Access the named database
  db = admin.firestore();

  // Handle serverless environment where settings might already be configured
  try {
    const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
    firestoreDatabaseIdForHealth = firestoreDatabaseId;
    db.settings({ databaseId: firestoreDatabaseId });
    console.log('Firestore databaseId:', firestoreDatabaseId);
  } catch (settingsError) {
    console.log('Firebase settings already configured, continuing...');
  }

  console.log('Firebase initialized successfully');

} catch (error) {
  console.error('Failed to initialize Firebase:', error.message);
  console.log('Continuing without Firebase for testing map endpoints...');
  db = null; // Set db to null so routes that need it will fail gracefully
  firebaseAdminProjectId = parseServiceAccountProjectId();
}
const app = express();
const PORT = process.env.PORT || 3000;

// GitHub Pages (e.g. https://jonobenjamin.github.io) + local dev: browsers require these on
// every response, including errors/timeouts. Apply before helmet/rate limits so preflight works.
const MOREMI_CORS_ALLOW_HEADERS =
  'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', MOREMI_CORS_ALLOW_HEADERS);
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Do not use default CORP "same-origin" — it blocks cross-origin fetch from GitHub Pages.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

app.set('trust proxy', 1); // Trust Vercel proxy for rate limiting

/** Full shape the browser Firebase SDK expects; fill derived fields from projectId. */
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

// PWA loads this on every visit — keep it outside strict /api/ rate limit bucket
app.get('/api/client-firebase-config', (req, res) => {
  const projectId =
    firebaseAdminProjectId ||
    parseServiceAccountProjectId() ||
    process.env.FIREBASE_PROJECT_ID ||
    null;

  if (process.env.FIREBASE_WEB_CONFIG_JSON) {
    try {
      const cfg = JSON.parse(process.env.FIREBASE_WEB_CONFIG_JSON);
      const out = completeClientFirebasePayload(cfg || {}, projectId);
      if (!out) {
        return res.status(503).json({
          error:
            'FIREBASE_WEB_CONFIG_JSON must include apiKey and projectId, and appId + messagingSenderId (or set FIREBASE_WEB_APP_ID and FIREBASE_WEB_MESSAGING_SENDER_ID on Vercel to fill gaps).'
        });
      }
      return res.json(out);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid FIREBASE_WEB_CONFIG_JSON' });
    }
  }

  const out = completeClientFirebasePayload(
    {
      apiKey: process.env.FIREBASE_WEB_API_KEY,
      appId: process.env.FIREBASE_WEB_APP_ID,
      messagingSenderId: process.env.FIREBASE_WEB_MESSAGING_SENDER_ID,
      projectId
    },
    projectId
  );

  if (!out) {
    return res.status(503).json({
      error:
        'Backend missing web client env. On Vercel set FIREBASE_WEB_API_KEY, FIREBASE_WEB_APP_ID, FIREBASE_WEB_MESSAGING_SENDER_ID (from the same Firebase project as FIREBASE_SERVICE_ACCOUNT_KEY), or FIREBASE_WEB_CONFIG_JSON.',
      hint_projectId: projectId,
      hasWebApiKey: !!process.env.FIREBASE_WEB_API_KEY
    });
  }

  res.json(out);
});

// Rate limiting (never preflight — some stacks run OPTIONS before other middleware behaves well)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => req.method === 'OPTIONS'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Wildlife Tracker API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      clientFirebase: '/api/client-firebase-config',
      observations: '/api/observations (POST only - write-only)',
      tracking: '/api/tracking (POST/GET)',
      images: '/api/observations/:id/image (secure image access)',
      testFile: '/test-file (POST - test file upload)'
    },
    docs: 'See README.md for API documentation'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    firebase_project_id: firebaseAdminProjectId || parseServiceAccountProjectId(),
    firestore_database_id: firestoreDatabaseIdForHealth,
    db_ready: !!db
  });
});

// Simple file test endpoint
const testUpload = require('multer')({
  storage: require('multer').memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('image');

app.post('/test-file', testUpload, (req, res) => {
  res.json({
    file: req.file ? {
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
      buffer: req.file.buffer ? `Present (${req.file.buffer.length} bytes)` : 'Missing'
    } : null,
    body: req.body,
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/observations', require('./api/observations')(db));
app.use('/api/map', require('./api/map'));
// Firebase auth REST (register, PIN, password, flutter-session). Do not use /api/auth — on some
// Vercel deployments that prefix never returns a body (clients see CORS / net::ERR_FAILED).
const MOREMI_AUTH_MOUNT = '/api/moremi-auth';
const authRouter = require('./api/auth')(db);
app.use(MOREMI_AUTH_MOUNT, authRouter);
app.use('/api/moremi-app', require('./api/moremi-app')(db));
if (db) {
  app.post(`${MOREMI_AUTH_MOUNT}/join-group`, require('./api/moremi-group-join')(db));
} else {
  app.post(`${MOREMI_AUTH_MOUNT}/join-group`, (req, res) => {
    res.status(503).json({ success: false, message: 'Database not configured' });
  });
}
app.use('/api/admin', require('./api/admin')(db));
app.use('/api/fires', require('./api/fires')(db));
app.use('/api/cron/fire-check', require('./api/cron-fire-check'));
app.use('/api/water-monitoring', require('./api/water-monitoring')(db));
app.use('/api/tracking', require('./api/tracking')(db));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', MOREMI_CORS_ALLOW_HEADERS);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', MOREMI_CORS_ALLOW_HEADERS);
  res.status(404).json({ error: 'Route not found' });
});

// For Vercel serverless functions, we export the app
// For local development, we can still listen
if (require.main === module) {
  // This runs when the file is executed directly (local development)
  app.listen(PORT, () => {
    console.log(`🚀 Wildlife Tracker API running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
