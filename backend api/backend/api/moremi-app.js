const express = require('express');

const joinGroupHandler = require('./moremi-group-join');

/**
 * Moremi PWA — /api/moremi-app routes (group join via server; other data is client Firestore).
 * Single function export — Vercel Node bytecode breaks module.exports = { ... }.
 */
module.exports = function moremiAppRouter(db) {
  const router = express.Router();

  if (!db) {
    router.use((req, res) => {
      res.status(503).json({ success: false, message: 'Database not configured' });
    });
    return router;
  }

  router.post('/join-group', joinGroupHandler(db));

  return router;
};
