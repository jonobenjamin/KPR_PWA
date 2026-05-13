'use strict';

const path = require('path');
const express = require('express');

/** `backend api/backend` — parent of `api/` and `lib/`. */
const backendRoot = path.join(__dirname, '..', '..');

require('dotenv').config({ path: path.join(backendRoot, '.env') });

const fb = require('../../lib/firebaseBackend');
const { completeClientFirebasePayload } = require('../../lib/clientFirebasePayload');

fb.initFirebase();

const MOREMI_CORS_ALLOW_HEADERS =
  'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key';

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', MOREMI_CORS_ALLOW_HEADERS);
  res.setHeader('Vary', 'Origin');
}

function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

function normalizeRequestUrl(req, mountPath) {
  const raw = req.url || '/';
  const q = raw.indexOf('?');
  const rawPath = q >= 0 ? raw.slice(0, q) : raw;
  const qs = q >= 0 ? raw.slice(q) : '';
  const matched = req.headers['x-matched-path'];
  if (!matched || typeof matched !== 'string' || !matched.startsWith('/')) return;
  const mPath = matched.split('?')[0];
  if (!mPath.startsWith(mountPath)) return;
  if (rawPath === '/' || rawPath === '' || !rawPath.startsWith(mountPath)) {
    req.url = mPath + qs;
  }
}

function adjustUrl(req, mountPath) {
  normalizeRequestUrl(req, mountPath);
  const url = req.url || '/';
  const q = url.indexOf('?');
  const pathOnly = q >= 0 ? url.slice(0, q) : url;
  const qs = q >= 0 ? url.slice(q) : '';

  if (!pathOnly.startsWith(mountPath)) {
    return false;
  }

  let rest = pathOnly.slice(mountPath.length);
  if (!rest || rest === '') rest = '/';
  req.url = rest + qs;
  return true;
}

function runExpressMount(mountPath, router, req, res) {
  applyCors(res);
  if (handlePreflight(req, res)) return;

  if (!adjustUrl(req, mountPath)) {
    res.status(404).json({ error: 'Route not found' });
    return;
  }

  const json = express.json({ limit: '10mb' });
  const urlenc = express.urlencoded({ extended: true });

  json(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    urlenc(req, res, (err2) => {
      if (err2) {
        res.status(400).json({ error: 'Invalid body' });
        return;
      }
      router(req, res, (e) => {
        if (e) {
          console.error(e);
          if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
          return;
        }
        if (!res.writableEnded && !res.headersSent) {
          res.status(404).json({ error: 'Route not found' });
        }
      });
    });
  });
}

function createMoremiAuthRouter() {
  const db = fb.getDb();
  const authRouter = require('../../routes/auth')(db);
  const r = express.Router();
  if (db) {
    r.post('/join-group', require('../../routes/moremi-group-join')(db));
    r.post('/create-group', require('../../routes/moremi-group-create')(db));
  } else {
    r.post('/join-group', (req, res) => {
      res.status(503).json({ success: false, message: 'Database not configured' });
    });
    r.post('/create-group', (req, res) => {
      res.status(503).json({ success: false, message: 'Database not configured' });
    });
  }
  r.use(authRouter);
  return r;
}

let cachedAuthRouter;
function getMoremiAuthRouter() {
  if (!cachedAuthRouter) cachedAuthRouter = createMoremiAuthRouter();
  return cachedAuthRouter;
}

let observationsRouter;
let mapRouter;
let moremiAppRouter;
let waterMonitoringRouter;
let trackingRouter;

function getObservationsRouter() {
  if (!observationsRouter) {
    observationsRouter = require('../../routes/observations')(fb.getDb());
  }
  return observationsRouter;
}

function getMapRouter() {
  if (!mapRouter) {
    mapRouter = require('../../routes/map');
  }
  return mapRouter;
}

function getMoremiAppRouter() {
  if (!moremiAppRouter) {
    moremiAppRouter = require('../../routes/moremi-app')(fb.getDb());
  }
  return moremiAppRouter;
}

function getWaterMonitoringRouter() {
  if (!waterMonitoringRouter) {
    waterMonitoringRouter = require('../../routes/water-monitoring')(fb.getDb());
  }
  return waterMonitoringRouter;
}

function getTrackingRouter() {
  if (!trackingRouter) {
    trackingRouter = require('../../routes/tracking')(fb.getDb());
  }
  return trackingRouter;
}

function sendApiIndex(req, res) {
  applyCors(res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.status(200).json({
    message: 'Moremi PWA API',
    version: '1.0.0',
    note: 'Single serverless entry — paths are rewritten to this function.',
    endpoints: {
      health: '/health',
      clientFirebase: '/api/client-firebase-config',
      auth: '/api/auth',
      moremiAuth: '/api/moremi-auth',
      observations: '/api/observations',
      tracking: '/api/tracking',
      map: '/api/map',
      moremiApp: '/api/moremi-app',
      waterMonitoring: '/api/water-monitoring'
    }
  });
}

function sendHealth(req, res) {
  applyCors(res);
  if (handlePreflight(req, res)) return;
  const db = fb.getDb();
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    firebase_project_id: fb.firebaseAdminProjectId || fb.parseServiceAccountProjectId(),
    firestore_database_id: fb.firestoreDatabaseIdForHealth,
    db_ready: !!db
  });
}

function sendClientFirebaseConfig(req, res) {
  applyCors(res);
  if (handlePreflight(req, res)) return;

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
      return res.status(200).json(out);
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
        'Backend missing web client env. Set FIREBASE_WEB_API_KEY, FIREBASE_WEB_APP_ID, FIREBASE_WEB_MESSAGING_SENDER_ID, or FIREBASE_WEB_CONFIG_JSON.',
      hint_projectId: projectId,
      hasWebApiKey: !!process.env.FIREBASE_WEB_API_KEY
    });
  }

  res.status(200).json(out);
}

module.exports = {
  fb,
  applyCors,
  handlePreflight,
  runExpressMount,
  getMoremiAuthRouter,
  getObservationsRouter,
  getMapRouter,
  getMoremiAppRouter,
  getWaterMonitoringRouter,
  getTrackingRouter,
  sendApiIndex,
  sendHealth,
  sendClientFirebaseConfig,
  MOREMI_CORS_ALLOW_HEADERS
};
