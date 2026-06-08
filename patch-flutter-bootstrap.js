#!/usr/bin/env node
/**
 * After `flutter build web`, ensure docs/flutter_bootstrap.js uses the DEFAULT
 * engine mount (document.body) — only serviceWorkerSettings, no hostElement /
 * onEntrypointLoaded. Custom #flutter-root hosts often collapse to a thin strip on web.
 *
 * Reads serviceWorkerVersion from the generated file and rewrites the load() call cleanly.
 *
 * IMPORTANT: Do not use a naive regex for the load() block — flutter.js may contain `});`
 * earlier in the same file (minified IIFE), which corrupts the bundle.
 */
const fs = require('fs');
const path = require('path');

const BOOT_PATH = path.join(__dirname, 'docs', 'flutter_bootstrap.js');
let c = fs.readFileSync(BOOT_PATH, 'utf8');

const verMatch = c.match(/serviceWorkerVersion:\s*"(\d+)"/);
if (!verMatch) {
  console.error('patch-flutter-bootstrap: serviceWorkerVersion not found');
  process.exit(1);
}
const ver = verMatch[1];

const cleanLoad =
  '_flutter.loader.load({\n' +
  '  serviceWorkerSettings: {\n' +
  '    serviceWorkerVersion: "' +
  ver +
  '",\n' +
  '    timeoutMillis: 20000\n' +
  '  }\n' +
  '});\n';

const marker = '_flutter.loader.load({';
const start = c.lastIndexOf(marker);
if (start === -1) {
  console.error('patch-flutter-bootstrap: _flutter.loader.load({ not found');
  process.exit(1);
}

let depth = 0;
let i = start + marker.length - 1; // position at opening `{` of the argument object
for (;; i++) {
  if (i >= c.length) {
    console.error('patch-flutter-bootstrap: unmatched braces in load() block');
    process.exit(1);
  }
  const ch = c[i];
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth === 0) {
      i++;
      break;
    }
  }
}

while (i < c.length && /\s/.test(c[i])) i++;
if (c[i] !== ')') {
  console.error('patch-flutter-bootstrap: expected ) after load object, got:', JSON.stringify(c.slice(i, i + 20)));
  process.exit(1);
}
i++;
while (i < c.length && /\s/.test(c[i])) i++;
if (c[i] !== ';') {
  console.error('patch-flutter-bootstrap: expected ; after load(), got:', JSON.stringify(c.slice(i - 1, i + 20)));
  process.exit(1);
}
i++;

const replaced = c.slice(0, start) + cleanLoad + c.slice(i);
if (replaced === c) {
  console.warn('patch-flutter-bootstrap: no change (already vanilla?)');
}
fs.writeFileSync(BOOT_PATH, replaced);
console.log('flutter_bootstrap.js: vanilla body mount (serviceWorkerVersion ' + ver + ')');
