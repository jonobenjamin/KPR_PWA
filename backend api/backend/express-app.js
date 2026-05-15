'use strict';

/**
 * Express application for local development (`node server.js`) and Vercel
 * (via repo-root `api/index.js` → `../backend api/backend/server.js`).
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fb = require('./lib/firebaseBackend');

fb.initFirebase();
const db = fb.getDb();

const MOREMI_CORS_ALLOW_HEADERS =
  'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key';

const { completeClientFirebasePayload } = require('./lib/clientFirebasePayload');

/** All-requests stub when a route module fails to load (missing file, bad path on Vercel, etc.). */
function stubRouter(message) {
  const r = express.Router();
  r.all('*', (req, res) => {
    res.status(503).json({ error: 'Service unavailable', message });
  });
  return r;
}

function useDbRouter(app, mountPath, relPath, label) {
  try {
    const factory = require(relPath);
    app.use(mountPath, factory(db));
    console.log(`[Moremi routes] mounted ${label} at ${mountPath}`);
  } catch (err) {
    console.error(`[Moremi routes] FAILED ${label} (require ${relPath})`, err);
    app.use(mountPath, stubRouter(`${label} routes failed to load`));
  }
}

function useStaticRouter(app, mountPath, relPath, label) {
  try {
    app.use(mountPath, require(relPath));
    console.log(`[Moremi routes] mounted ${label} at ${mountPath}`);
  } catch (err) {
    console.error(`[Moremi routes] FAILED ${label} (require ${relPath})`, err);
    app.use(mountPath, stubRouter(`${label} routes failed to load`));
  }
}

function createApp() {
  const app = express();

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

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  );

  app.set('trust proxy', 1);

  app.get('/api/client-firebase-config', (req, res) => {
    const projectId =
      fb.firebaseAdminProjectId ||
      fb.parseServiceAccountProjectId() ||
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

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    skip: (req) => req.method === 'OPTIONS'
  });
  app.use('/api/', limiter);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  function sendHealth(_req, res) {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      firebase_project_id: fb.firebaseAdminProjectId || fb.parseServiceAccountProjectId(),
      firestore_database_id: fb.firestoreDatabaseIdForHealth,
      db_ready: !!db
    });
  }

  app.get('/', (req, res) => {
    res.json({
      message: 'Moremi API (local Express)',
      version: '1.0.0',
      note: 'Production uses one Vercel function at /api (see repo root vercel.json).',
      endpoints: {
        health: '/health',
        healthApi: '/api/health',
        clientFirebase: '/api/client-firebase-config'
      }
    });
  });

  app.get('/health', sendHealth);
  app.get('/api/health', sendHealth);

  const testUpload = require('multer')({
    storage: require('multer').memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
  }).single('image');

  app.post('/test-file', testUpload, (req, res) => {
    res.json({
      file: req.file
        ? {
            name: req.file.originalname,
            size: req.file.size,
            type: req.file.mimetype,
            buffer: req.file.buffer ? `Present (${req.file.buffer.length} bytes)` : 'Missing'
          }
        : null,
      body: req.body,
      timestamp: new Date().toISOString()
    });
  });

  useDbRouter(app, '/api/observations', './routes/observations', 'observations');
  useStaticRouter(app, '/api/map', './routes/map', 'map');

  let authRouter;
  try {
    authRouter = require('./routes/auth')(db);
    console.log('[Moremi routes] mounted auth router');
  } catch (err) {
    console.error('[Moremi routes] FAILED auth (require ./routes/auth)', err);
    authRouter = stubRouter('auth routes failed to load');
  }

  function mountAuthWithJoin(prefix) {
    const r = express.Router();
    if (db) {
      try {
        r.post('/join-group', require('./routes/moremi-group-join')(db));
        r.post('/create-group', require('./routes/moremi-group-create')(db));
        console.log('[Moremi routes] loaded moremi-group-join + moremi-group-create for', prefix);
      } catch (err) {
        console.error('[Moremi routes] FAILED moremi-group-join or moremi-group-create', err);
        const fail = (_req, res) =>
          res.status(503).json({ success: false, message: 'Group join/create unavailable' });
        r.post('/join-group', fail);
        r.post('/create-group', fail);
      }
    } else {
      r.post('/join-group', (req, res) => {
        res.status(503).json({ success: false, message: 'Database not configured' });
      });
      r.post('/create-group', (req, res) => {
        res.status(503).json({ success: false, message: 'Database not configured' });
      });
    }
    r.use(authRouter);
    app.use(prefix, r);
  }
  mountAuthWithJoin('/api/moremi-auth');
  mountAuthWithJoin('/api/auth');

  useDbRouter(app, '/api/moremi-app', './routes/moremi-app', 'moremi-app');
  useDbRouter(app, '/api/water-monitoring', './routes/water-monitoring', 'water-monitoring');
  useDbRouter(app, '/api/tracking', './routes/tracking', 'tracking');

  app.use((err, req, res, _next) => {
    console.error(err.stack);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', MOREMI_CORS_ALLOW_HEADERS);
    res.status(500).json({
      error: 'Something went wrong!',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  });

  app.use('*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', MOREMI_CORS_ALLOW_HEADERS);
    res.status(404).json({ error: 'Route not found' });
  });

  return app;
}

module.exports = { createApp, MOREMI_CORS_ALLOW_HEADERS };
