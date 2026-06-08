'use strict';

/**
 * Express app: local dev (`node server.js`) + Vercel (`api/index.js` → server.js).
 * CORS is applied on every path so GitHub Pages → Vercel preflight and responses work.
 * Route modules are loaded defensively so one failure does not crash the whole function.
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fb = require('./lib/firebaseBackend');

fb.initFirebase();
const db = fb.getDb();

if (!db) {
  console.error(
    '[Moremi bootstrap] Firestore db is NULL — group/API routes that need Admin SDK will return 503. Set FIREBASE_SERVICE_ACCOUNT_KEY on Vercel.'
  );
} else {
  console.log('[Moremi bootstrap] Firestore db ready');
}

const { applyCors, MOREMI_CORS_ALLOW_HEADERS } = require('./lib/moremiCors');

const { completeClientFirebasePayload } = require('./lib/clientFirebasePayload');

function stubRouter(message) {
  const r = express.Router();
  r.all('*', (req, res) => {
    applyCors(req, res);
    res.status(503).json({
      error: 'route failed to load',
      message,
    });
  });
  return r;
}

/**
 * Load a `module.exports = (db) => expressRouterOrStack` factory safely.
 */
function useDbRouter(app, mountPath, relPath, label) {
  let factory;
  try {
    factory = require(relPath);
  } catch (err) {
    console.error(`[Moremi routes] FAILED require(${relPath}) for ${label}`, err.stack || err);
    app.use(mountPath, stubRouter(`${label}: require failed — ${err.message}`));
    return;
  }
  if (typeof factory !== 'function') {
    console.error(`[Moremi routes] FAILED ${label}: module.exports is not a function (${relPath})`);
    app.use(mountPath, stubRouter(`${label}: invalid module export`));
    return;
  }
  try {
    const mounted = factory(db);
    app.use(mountPath, mounted);
    console.log(`[Moremi routes] mounted ${label} at ${mountPath}`);
  } catch (err) {
    console.error(
      `[Moremi routes] FAILED ${label} factory(${mountPath}) — ${err.message}`,
      err.stack || err
    );
    app.use(mountPath, stubRouter(`${label}: factory(db) threw — ${err.message}`));
  }
}

function useStaticRouter(app, mountPath, relPath, label) {
  try {
    const router = require(relPath);
    app.use(mountPath, router);
    console.log(`[Moremi routes] mounted ${label} at ${mountPath}`);
  } catch (err) {
    console.error(`[Moremi routes] FAILED ${label} (require ${relPath})`, err.stack || err);
    app.use(mountPath, stubRouter(`${label} routes failed to load`));
  }
}

function createApp() {
  const app = express();

  // (1) Global CORS first — OPTIONS returns 200 immediately (Vercel + browser preflight).
  app.use((req, res, next) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }
    next();
  });

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
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
              'FIREBASE_WEB_CONFIG_JSON must include apiKey and projectId, and appId + messagingSenderId (or set FIREBASE_WEB_APP_ID and FIREBASE_WEB_MESSAGING_SENDER_ID on Vercel to fill gaps).',
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
        projectId,
      },
      projectId
    );

    if (!out) {
      return res.status(503).json({
        error:
          'Backend missing web client env. On Vercel set FIREBASE_WEB_API_KEY, FIREBASE_WEB_APP_ID, FIREBASE_WEB_MESSAGING_SENDER_ID (from the same Firebase project as FIREBASE_SERVICE_ACCOUNT_KEY), or FIREBASE_WEB_CONFIG_JSON.',
        hint_projectId: projectId,
        hasWebApiKey: !!process.env.FIREBASE_WEB_API_KEY,
      });
    }

    res.json(out);
  });

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    skip: (req) => req.method === 'OPTIONS',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
      applyCors(req, res);
      const msg =
        typeof options.message === 'string'
          ? options.message
          : 'Too many requests from this IP, please try again later.';
      res.status(options.statusCode).json({
        error: 'Too many requests',
        message: msg,
      });
    },
  });
  app.use('/api/', limiter);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      applyCors(req, res);
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    next(err);
  });

  function sendHealth(_req, res) {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      firebase_project_id:
        fb.firebaseAdminProjectId || fb.parseServiceAccountProjectId(),
      firestore_database_id: fb.firestoreDatabaseIdForHealth,
      db_ready: !!db,
    });
  }

  app.get('/', (req, res) => {
    res.json({
      message: 'Moremi / Wildlife Tracker API',
      version: '1.0.0',
      note: 'Production uses one Vercel function at /api (see repo root vercel.json).',
      endpoints: {
        health: '/health',
        healthApi: '/api/health',
        moremiAppStatus: '/api/moremi-app/status',
        clientFirebase: '/api/client-firebase-config',
      },
    });
  });

  app.get('/health', sendHealth);
  app.get('/api/health', sendHealth);

  try {
    const testUpload = require('multer')({
      storage: require('multer').memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }).single('image');

    app.post('/test-file', testUpload, (req, res) => {
      res.json({
        file: req.file
          ? {
              name: req.file.originalname,
              size: req.file.size,
              type: req.file.mimetype,
              buffer: req.file.buffer
                ? `Present (${req.file.buffer.length} bytes)`
                : 'Missing',
            }
          : null,
        body: req.body,
        timestamp: new Date().toISOString(),
      });
    });
  } catch (err) {
    console.error('[Moremi routes] FAILED mounting /test-file (multer)', err.stack || err);
  }

  useDbRouter(app, '/api/observations', './routes/observations', 'observations');
  useStaticRouter(app, '/api/map', './routes/map', 'map');

  let authRouter;
  try {
    const authFactory = require('./routes/auth');
    if (typeof authFactory !== 'function') {
      throw new Error('routes/auth must export a function');
    }
    authRouter = authFactory(db);
    console.log('[Moremi routes] mounted auth router');
  } catch (err) {
    console.error('[Moremi routes] FAILED auth (require ./routes/auth)', err.stack || err);
    authRouter = stubRouter('auth routes failed to load');
  }

  function mountAuthWithJoin(prefix) {
    const r = express.Router();
    r.use((req, res, next) => {
      applyCors(req, res);
      next();
    });
    if (db) {
      try {
        const joinFactory = require('./routes/moremi-group-join');
        r.post('/join-group', joinFactory(db));
        console.log(`[Moremi routes] loaded moremi-group-join for ${prefix}`);
      } catch (err) {
        console.error('[Moremi routes] FAILED moremi-group-join', err.stack || err);
        const fail = (_req, res) => {
          applyCors(_req, res);
          res.status(503).json({
            error: 'route failed to load',
            route: 'moremi-group-join',
            message: err.message,
          });
        };
        r.post('/join-group', fail);
      }
    } else {
      const noDb = (_req, res) => {
        applyCors(_req, res);
        res.status(503).json({
          success: false,
          message: 'Database not configured',
        });
      };
      r.post('/join-group', noDb);
    }
    r.use(authRouter);
    app.use(prefix, r);
  }
  mountAuthWithJoin('/api/moremi-auth');
  mountAuthWithJoin('/api/auth');

  useDbRouter(app, '/api/moremi-app', './routes/moremi-app', 'moremi-app');
  useDbRouter(
    app,
    '/api/water-monitoring',
    './routes/water-monitoring',
    'water-monitoring'
  );
  useDbRouter(app, '/api/tracking', './routes/tracking', 'tracking');

  app.use((err, req, res, _next) => {
    console.error(err.stack);
    if (res.headersSent) {
      return;
    }
    applyCors(req, res);
    res.status(500).json({
      error: 'internal_error',
      message:
        process.env.NODE_ENV === 'development'
          ? err.message
          : err.message || 'Internal server error',
    });
  });

  app.use('*', (req, res) => {
    applyCors(req, res);
    res.status(404).json({ error: 'Route not found' });
  });

  return app;
}

module.exports = { createApp, MOREMI_CORS_ALLOW_HEADERS };
