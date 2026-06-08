#!/bin/bash
# Build Flutter PWA with API key baked in.
# Usage: ./build-app.sh
#
# IMPORTANT: base-href must match the deployed GitHub Pages URL path (repo name).
# Flutter embeds this in flutter_bootstrap.js, flutter_service_worker.js,
# asset manifests, and service worker scope. Wrong path = wrong main.dart.js (old app).
#
# Default: repo served at https://jonobenjamin.github.io/Moremi-PWA/
# Override: GITHUB_PAGES_BASE=Other-Repo ./build-app.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PAGES_BASE="${GITHUB_PAGES_BASE:-Moremi-PWA}"
echo "GitHub Pages path segment: /${PAGES_BASE}/"

MOREMI_BUILD_ID=$(date -u +%Y%m%d%H%M%S)
echo "Moremi build id: $MOREMI_BUILD_ID"

# --- Moremi: same API root as docs/firebase-config.js → const MOREMI_API_BASE = '...' ---
MOREMI_API_URL=$(sed -n "s/^const MOREMI_API_BASE = '\\([^']*\\)';/\1/p" "$SCRIPT_DIR/docs/firebase-config.js" | head -1)
if [ -z "$MOREMI_API_URL" ] || echo "$MOREMI_API_URL" | grep -q 'PASTE\|YOUR_\|REPLACE'; then
  echo "ERROR: Set const MOREMI_API_BASE in docs/firebase-config.js to your Vercel URL."
  exit 1
fi

# GeoJSON for the map must live under PWA Build/assets/ (Flutter bundle). The build does not modify them.

cd "PWA Build" && flutter build web --base-href="/${PAGES_BASE}/" \
  --dart-define=API_KEY=15c21d2e92dcaed8de1b5ce61bc4eefcc28ce062f0fc39760acc2187b6574002 \
  --dart-define=API_BASE_URL="$MOREMI_API_URL" \
  --dart-define=MOREMI_BUILD_ID="$MOREMI_BUILD_ID" \
  --no-tree-shake-icons \
  --release

echo "Copying build to docs/..."
cd "$SCRIPT_DIR/PWA Build/build/web"
for f in *; do
  [ "$f" != "index.html" ] && cp -r "$f" "$SCRIPT_DIR/docs/"
done
cd "$SCRIPT_DIR"

# Use custom index (auth + Firebase). Source of truth is docs/index.custom.html — it is copied over docs/index.html every build.
cp docs/index.custom.html docs/index.html

# Sync service worker version (optional — keep index / loader in sync via flutter_bootstrap only)
# SW_VER=$(grep -o 'serviceWorkerVersion: "[0-9]*"' docs/flutter_bootstrap.js | head -1 | grep -o '[0-9]*')
# if [ -n "$SW_VER" ]; then ... fi

echo "Patching flutter_bootstrap.js (vanilla body mount for reliable web layout)..."
node "$SCRIPT_DIR/patch-flutter-bootstrap.js"

echo "Patching service worker for base path and offline tile caching..."
GITHUB_PAGES_BASE="$PAGES_BASE" node "$SCRIPT_DIR/patch-service-worker.js"

# Normalize manifest start_url / scope / branding (source web/manifest.json can drift)
GITHUB_PAGES_BASE="$PAGES_BASE" node <<'FIX_MANIFEST'
const fs = require('fs');
const base = process.env.GITHUB_PAGES_BASE || 'Moremi-PWA';
const p = 'docs/manifest.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.start_url = '/' + base + '/';
j.scope = '/' + base + '/';
if (!j.name || String(j.name).toLowerCase().includes('kpr')) {
  j.name = 'Moremi Wildlife Sightings';
  j.short_name = 'Moremi Sightings';
  j.description = 'Moremi Wildlife Sightings — record and share wildlife in the Moremi area.';
  j.background_color = '#1a2744';
  j.theme_color = '#2E7D32';
}
fs.writeFileSync(p, JSON.stringify(j));
FIX_MANIFEST

echo "{\"id\":\"$MOREMI_BUILD_ID\"}" > "$SCRIPT_DIR/docs/moremi_build.json"

# Health / probes: GitHub Pages often checks assets/AssetManifest.json; runtime uses AssetManifest.bin.json
if [ -f "$SCRIPT_DIR/docs/assets/AssetManifest.bin.json" ]; then
  cp "$SCRIPT_DIR/docs/assets/AssetManifest.bin.json" "$SCRIPT_DIR/docs/assets/AssetManifest.json"
fi

echo "Done."