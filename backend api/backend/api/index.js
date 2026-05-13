'use strict';

// Vercel may run an Express-framework detector that only looks for a direct `require('express')`
// on an entry file. This handler is serverless; express is still used inside `./_lib/runtime`.
require('express');

const rt = require('./_lib/runtime');

const {
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
  sendClientFirebaseConfig
} = rt;

function syncUrlForRewrite(req) {
  const matched = req.headers['x-matched-path'];
  if (!matched || typeof matched !== 'string' || !matched.startsWith('/')) return;
  const u = req.url || '/';
  const q = u.indexOf('?');
  const qs = q >= 0 ? u.slice(q) : '';
  req.url = matched.split('?')[0] + qs;
}

function routePath(req) {
  syncUrlForRewrite(req);
  const u = req.url || '/';
  return u.split('?')[0];
}

module.exports = (req, res) => {
  const path = routePath(req);

  if (path === '/api' || path === '/api/') {
    return sendApiIndex(req, res);
  }

  if (path === '/health' || path.startsWith('/api/health')) {
    return sendHealth(req, res);
  }

  if (path === '/api/client-firebase-config' || path.startsWith('/api/client-firebase-config/')) {
    return sendClientFirebaseConfig(req, res);
  }

  if (path.startsWith('/api/moremi-auth')) {
    return runExpressMount('/api/moremi-auth', getMoremiAuthRouter(), req, res);
  }

  if (path.startsWith('/api/auth')) {
    return runExpressMount('/api/auth', getMoremiAuthRouter(), req, res);
  }

  if (path.startsWith('/api/moremi-app')) {
    return runExpressMount('/api/moremi-app', getMoremiAppRouter(), req, res);
  }

  if (path.startsWith('/api/observations')) {
    return runExpressMount('/api/observations', getObservationsRouter(), req, res);
  }

  if (path.startsWith('/api/map')) {
    return runExpressMount('/api/map', getMapRouter(), req, res);
  }

  if (path.startsWith('/api/water-monitoring')) {
    return runExpressMount('/api/water-monitoring', getWaterMonitoringRouter(), req, res);
  }

  if (path.startsWith('/api/tracking')) {
    return runExpressMount('/api/tracking', getTrackingRouter(), req, res);
  }

  applyCors(res);
  if (handlePreflight(req, res)) return;
  res.status(404).json({ error: 'Route not found' });
};
