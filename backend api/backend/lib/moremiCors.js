'use strict';

/**
 * CORS for Moremi PWA (GitHub Pages + local dev).
 * Echoes Origin when it is allowed; otherwise falls back to the primary deploy origin.
 */
const MOREMI_ALLOWED_ORIGINS = [
  'https://jonobenjamin.github.io',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
];

function normalizeOrigin(o) {
  if (!o || typeof o !== 'string') return '';
  return o.replace(/\/$/, '');
}

function resolveAllowOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) {
    return MOREMI_ALLOWED_ORIGINS[0];
  }
  const n = normalizeOrigin(origin);
  const allowed = MOREMI_ALLOWED_ORIGINS.some(
    (a) => normalizeOrigin(a) === n
  );
  return allowed ? origin : MOREMI_ALLOWED_ORIGINS[0];
}

/** Methods the Flutter web app and REST clients use. */
const MOREMI_CORS_METHODS =
  'GET, POST, PUT, PATCH, DELETE, OPTIONS';

const MOREMI_CORS_ALLOW_HEADERS =
  'Content-Type, Authorization, x-api-key, Accept, Origin, X-Requested-With';

function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', resolveAllowOrigin(req));
  res.setHeader('Access-Control-Allow-Methods', MOREMI_CORS_METHODS);
  res.setHeader('Access-Control-Allow-Headers', MOREMI_CORS_ALLOW_HEADERS);
  res.setHeader('Vary', 'Origin');
}

module.exports = {
  MOREMI_ALLOWED_ORIGINS,
  MOREMI_CORS_METHODS,
  MOREMI_CORS_ALLOW_HEADERS,
  resolveAllowOrigin,
  applyCors,
};
