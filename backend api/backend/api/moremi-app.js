const express = require('express');

const joinGroupHandler = require('../routes/moremi-group-join');
const createGroupHandler = require('../routes/moremi-group-create');
const syncGroupIdsHandler = require('../routes/moremi-sync-group-ids');

/**
 * Moremi PWA — /api/moremi-app routes (group join/create via server; other data is client Firestore).
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
  router.post('/create-group', createGroupHandler(db));
  router.post('/sync-group-ids', syncGroupIdsHandler(db));

  return router;
};
