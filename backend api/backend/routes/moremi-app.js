'use strict';

const express = require('express');

const { applyCors } = require('../lib/moremiCors');

/**
 * Moremi PWA — /api/moremi-app (join, create-group, sync-group-ids).
 * Each POST route loads in isolation so one broken submodule does not take down the rest.
 */
module.exports = function moremiAppRouter(db) {
  const router = express.Router();

  router.use((req, res, next) => {
    applyCors(req, res);
    next();
  });

  /** Lightweight probe: 200 even when Firestore is down (helps debug 503s on Vercel). */
  router.get('/status', (req, res) => {
    applyCors(req, res);
    res.status(200).json({
      ok: true,
      firestoreReady: !!db,
      hint: db
        ? null
        : 'Set FIREBASE_SERVICE_ACCOUNT_KEY (JSON) on Vercel; optional FIRESTORE_DATABASE_ID',
    });
  });

  if (!db) {
    router.use((req, res) => {
      applyCors(req, res);
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Database not configured',
        success: false,
      });
    });
    return router;
  }

  function safePost(path, label, requireFactory) {
    try {
      const factory = requireFactory();
      if (typeof factory !== 'function') {
        throw new Error(`${label} module did not export a function`);
      }
      const handler = factory(db);
      if (typeof handler !== 'function') {
        throw new Error(`${label} factory(db) did not return a handler function`);
      }
      router.post(path, handler);
      console.log(`[moremi-app] mounted POST ${path} (${label})`);
    } catch (err) {
      console.error(`[moremi-app] FAILED loading ${label} for POST ${path}`, err.stack || err);
      router.post(path, (req, res) => {
        applyCors(req, res);
        res.status(503).json({
          error: 'route failed to load',
          route: label,
          message: err.message,
        });
      });
    }
  }

  safePost('/join-group', 'moremi-group-join', () => require('./moremi-group-join'));
  safePost('/create-group', 'moremi-group-create', () => require('./moremi-group-create'));
  safePost('/sync-group-ids', 'moremi-sync-group-ids', () => require('./moremi-sync-group-ids'));

  return router;
};
