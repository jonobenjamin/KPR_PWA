'use strict';
/**
 * Vercel serverless entry (repo root). Delegates to the Express app under
 * `backend api/backend/server.js`.
 *
 * **Deployment:** In root `vercel.json`, `functions.api/index.js.includeFiles` copies
 * `routes/`, `lib/`, `services/`, and `data/` into the function bundle. Without that,
 * Vercel can place `express-app.js` in `/var/task/` without `./routes/`, and
 * `require('./routes/moremi-group-join')` fails at cold start.
 */
module.exports = require('../backend api/backend/server.js');
