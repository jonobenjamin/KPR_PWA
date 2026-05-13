'use strict';

/**
 * Local development entry only — starts an Express listener.
 * Production: Vercel invokes repo-root /api/*.js serverless functions (no app.listen).
 */

require('dotenv').config();
// Vercel Express preset scans `package.json` `main` / `server.js`; it must import `express` directly.
require('express');

const { createApp } = require('./express-app');

const app = createApp();
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Wildlife Tracker API (local) on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
