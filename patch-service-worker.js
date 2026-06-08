#!/usr/bin/env node
/**
 * Patches flutter_service_worker.js for GitHub Pages base path (e.g. /Moremi-PWA/):
 * - moremiPublicUrl(): install/offline use origin/BASE/... (never cache.add("/") at site root).
 * - Install: fetch + cache.put per CORE url, Promise.allSettled.
 * - downloadOffline: fetch + put with moremiPublicUrl, Promise.allSettled.
 * - Fetch: strip MOREMI_SW_BASE for RESOURCES lookup.
 * - OSM tiles; clients.claim.
 *
 * GITHUB_PAGES_BASE from build-app.sh, default Moremi-PWA.
 */
const fs = require('fs');
const path = require('path');

const BASE_PATH = process.env.GITHUB_PAGES_BASE || 'Moremi-PWA';
const SW_PATH = path.join(__dirname, 'docs', 'flutter_service_worker.js');

let content = fs.readFileSync(SW_PATH, 'utf8');

const urlHelperBlock = `

const MOREMI_SW_BASE = '${BASE_PATH}';
function moremiPublicUrl(resourceKey) {
  var k = resourceKey === '/' || resourceKey === '' ? '' : String(resourceKey).replace(/^\\//, '');
  return self.location.origin + '/' + MOREMI_SW_BASE + '/' + k;
}
`;

if (!content.includes('function moremiPublicUrl')) {
  content = content.replace(/(const CORE = \[[\s\S]*?\];)/, `$1${urlHelperBlock}`);
}

content = content.replace(
  /var key = event\.request\.url\.substring\(origin\.length \+ 1\);\s*const BASE_PATH = '[^']+';\s*\/\/ Normalize key for base path deployment[^\n]*\n\s*if \(key\.startsWith\(BASE_PATH \+ '\/'\)\) \{\s*key = key\.substring\(BASE_PATH\.length \+ 1\);\s*}\s*/m,
  `var key = event.request.url.substring(origin.length + 1);
  if (key.startsWith(MOREMI_SW_BASE + '/')) {
    key = key.substring(MOREMI_SW_BASE.length + 1);
  }
  `
);

const tileCacheHandler = `
  if (event.request.url.startsWith('https://tile.openstreetmap.org/')) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.ok) {
          var clone = response.clone();
          caches.open('osm-tiles').then(function(cache) { cache.put(event.request, clone); });
        }
        return response;
      }).catch(function() {
        return caches.open('osm-tiles').then(function(cache) {
          return cache.match(event.request);
        });
      })
    );
    return;
  }
`;

if (!content.includes('tile.openstreetmap.org')) {
  content = content.replace(
    /(if \(event\.request\.method !== 'GET'\) \{\s*return;\s*\})\s*(var origin)/,
    `$1
${tileCacheHandler}
  $2`
  );
}

content = content.replace(
  /(for \(var request of await contentCache\.keys\(\)\) \{\s*var key = request\.url\.substring\(origin\.length \+ 1\);)\s*(if \(key == ""\))/,
  `$1
        if (key.startsWith('${BASE_PATH}/')) key = key.substring(${BASE_PATH.length + 1});
      $2`
);

const installResilient = `self.addEventListener("install", (event) => {
  self.skipWaiting();
  return event.waitUntil(
    caches.open(TEMP).then(function (cache) {
      return Promise.allSettled(
        CORE.map(function (value) {
          var url = moremiPublicUrl(value);
          var req = new Request(url, { cache: 'reload' });
          return fetch(req)
            .then(function (res) {
              if (res && res.ok) return cache.put(req, res);
            })
            .catch(function (e) {
              console.warn('[flutter_service_worker] install skip:', url, e);
            });
        })
      );
    })
  );
});`;

const flutterInstallAddAll = `self.addEventListener("install", (event) => {
  self.skipWaiting();
  return event.waitUntil(
    caches.open(TEMP).then((cache) => {
      return cache.addAll(
        CORE.map((value) => new Request(value, {'cache': 'reload'})));
    })
  );
});`;

const installAlreadyMoremi =
  content.includes('CORE.map(function (value)') &&
  content.includes('moremiPublicUrl(value)');

if (content.includes(flutterInstallAddAll)) {
  content = content.replace(flutterInstallAddAll, installResilient.trim());
} else if (!installAlreadyMoremi) {
  console.warn(
    '[patch-service-worker] Install block not recognized; ensure docs/flutter_service_worker.js has Moremi install handler'
  );
}

const offlineNew = `return Promise.allSettled(
    resources.map(function (resourceKey) {
      var abs = moremiPublicUrl(resourceKey);
      var reqPut = new Request(abs);
      return fetch(abs, { cache: 'reload' })
        .then(function (res) {
          if (res && res.ok) return contentCache.put(reqPut, res.clone());
        })
        .catch(function (e) {
          console.warn('[flutter_service_worker] offline prefetch skip:', abs, e);
        });
    })
  );`;

const d0 = content.indexOf('async function downloadOffline()');
const d1 = content.indexOf('\nfunction onlineFirst', d0);
const offlineBlock = d0 >= 0 && d1 > d0 ? content.slice(d0, d1) : '';
const offlineNeedsPatch = !offlineBlock.includes('moremiPublicUrl(resourceKey)');

if (offlineNeedsPatch) {
  content = content.replace(/return contentCache\.addAll\(resources\);/, offlineNew);
}

content = content.replace(
  /async function downloadOffline\(\) \{\s*var resources = \[\];\s*var origin = self\.location\.origin;\s*var basePath = '[^']*';/,
  `async function downloadOffline() {\n  var resources = [];\n  var origin = self.location.origin;\n  var basePath = MOREMI_SW_BASE;`
);

const claimSnippet = `

// Moremi: take control of open tabs as soon as this worker activates
self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});
`;
if (!content.includes('Moremi: take control of open tabs')) {
  content += claimSnippet;
}

fs.writeFileSync(SW_PATH, content);
console.log('Patched flutter_service_worker.js (' + BASE_PATH + ')');
