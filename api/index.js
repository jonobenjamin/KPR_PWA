'use strict';
// Vercel serverless entry — delegates to the Express app.
// All subsequent requires inside server.js use paths relative to backend api/backend/
// (no spaces in those paths) so Vercel's bundler can follow them.
module.exports = require('../backend api/backend/server.js');
