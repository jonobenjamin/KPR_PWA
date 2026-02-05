# Khwai Private Reserve Monitoring Dashboard

A professional wildlife monitoring dashboard displaying concession boundaries, roads, and observation data. Features advanced filtering, real-time updates, and animated markers for recent activity.

## Setup Instructions

1. **Upload Files**: Upload these files to your GitHub repository:
   - `map.html` - The main map application
   - `styles.css` - Professional styling (✅ included)
   - `data/geojson/boundary.geojson` - Concession boundary data (✅ included)
   - `data/geojson/KPR_roads.geojson` - **Add your actual roads data here** (currently empty)
   - `README.md` - This documentation

2. **Enable GitHub Pages**: Go to Settings → Pages
   - **Source**: Select "Deploy from a branch"
   - **Branch**: Select "main" (or your default branch)

3. **Access Your Map**: Your map will be available at:
   ```
   https://yourusername.github.io/repository-name/map.html
   ```

4. **Backend Setup**: Ensure your Vercel backend has:
   ```env
   API_KEY=98394a83034f3db48e5acd3ef54bd622c5748ca5bb4fb3ff39c052319711c9a9
   ALLOWED_ORIGINS=https://yourusername.github.io
   ```

## How It Works

- **Static Data**: Boundaries and roads load from local `data/geojson/` files
- **Dynamic Data**: Observations are fetched from your Vercel backend API
- **Interactive Features**:
  - Hover over roads to see names
  - Use filters to toggle observation types (sightings, incidents, maintenance)
  - Click markers for detailed information
- **Simple Hosting**: Just upload files to GitHub and enable Pages - no complex workflows needed!

## Data Sources

- **Boundaries**: `data/geojson/boundary.geojson` (static file - ✅ included)
- **Roads**: `data/geojson/KPR_roads.geojson` (static file - ⚠️ **Add your actual roads data**)
- **Observations**: `https://wildlife-tracker-gxz5.vercel.app/api/observations` (API call)

## Troubleshooting

## Why The YML File? (GitHub Actions Deployment)

The `.yml` file is **NOT for pulling data** - it's for **secure deployment**:

### What It Does:
1. **Runs on GitHub servers** (not your computer)
2. **Creates `config.js`** from your GitHub secrets during deployment
3. **Deploys to GitHub Pages** with secrets injected
4. **Keeps secrets secure** - they're never stored in your repository

### When It Runs:
- Every time you push to the `main` branch
- Or manually via GitHub Actions tab

### Data Fetching Happens Separately:
- **Deployment** (YML file): Creates secure config file
- **User visits site**: HTML/JavaScript fetches data from your Vercel backend

**The YML is for deployment security, not data fetching!** 🔒🚀

2. **Backend Requirements**: Make sure your backend is deployed and accessible. The map fetches data from these endpoints:
   - `GET /api/map/boundary` - Concession boundaries (GeoJSON)
   - `GET /api/map/roads` - Road network (GeoJSON)
   - `GET /api/observations` - Wildlife observations with GPS coordinates

## Features

- **Professional Dashboard Design**: Luxury safari lodge aesthetics with uniform branded ribbons
- **Dual-Panel Interface**: 75% interactive map with comprehensive 25% control sidebar
- **Advanced Filtering System**:
  - Date range picker (start/end dates)
  - Month and year selection
  - View dropdown selector (Sightings/Maintenance/Incidents)
  - Species filtering for wildlife sightings
  - Switch-style toggle for hotspot vs actual location display
- **Real-Time Statistics**: Live counters showing total records for each category
- **Animated Latest Activity**: Bouncing markers for recent sightings/incidents/maintenance (past week)
- **Interactive Map Elements**:
  - Concession boundaries with tan fill
  - Road network with zoom-dependent labels (appear when zoom > 10)
  - Enhanced popups with detailed observation information
  - Heat map style hotspots with color ramp intensity
  - Animated markers for latest weekly activity
- **Mobile Responsive**: Adapts to tablets/phones with stacked layout
- **Submit Data Button**: Direct link to mobile app for data collection

## Usage

Simply open `map.html` in a web browser. The map will automatically:
1. Load concession boundary and road data
2. Fetch observation records from Firebase
3. Display markers for all observations with GPS coordinates
4. Fit the view to show the entire concession area

## Security

- **API Key Authentication**: Simple but effective authentication using secret API keys
- **Header-based**: API keys are sent in request headers, not URLs
- **No Sensitive Data**: Only observations with GPS coordinates are displayed
- **Rate Limiting**: Backend includes rate limiting protection

## Troubleshooting

If the map doesn't load:
1. **Check repository contents**: Ensure `html/map.html` and `html/README.md` are committed to your GitHub repository
2. **Check GitHub Actions deployment succeeded** (repo → Actions tab)
3. **Verify GitHub secrets are set correctly** (API_KEY and VERCEL_URL)
4. **Check that `config.js` was generated during deployment**
5. **Verify your Vercel URL in secrets matches your actual deployment**
6. **Check browser console for authentication or network errors**
7. **Ensure your Vercel backend has the API_KEY environment variable**
8. **Confirm GeoJSON files exist in your backend** (`Consession_boundary.geojson` and `KPR_roads.geojson`)

- **Map not loading**: Check browser console for errors
- **No boundaries**: Ensure `data/geojson/boundary.geojson` is uploaded (✅ included)
- **No roads showing**: Add your actual roads GeoJSON data to `data/geojson/KPR_roads.geojson` (currently empty)
- **No observations**: Check if Vercel backend is running and CORS is configured
- **404 errors**: Make sure GitHub Pages is enabled and files are in the correct location

### 404 Errors for API Routes:
- **404 on /api/* routes**: Test the health endpoint first
  - Visit: `https://your-vercel-url.vercel.app/health`
  - Should return: `{"status":"OK","timestamp":"..."}`
  - If health fails, server isn't running properly
  - If health works but API fails, check Vercel function logs

### Vercel Deployment Status:
- **"Ready" status**: Your deployment succeeded! The 200 responses confirm server is running
- **API routes not showing**: The logs only show `/` requests, not `/api/*` calls
- **Test API endpoints**: Try these URLs directly:
  - Health: `https://wildlife-tracker-gxz5.vercel.app/health`
  - Boundary: `https://wildlife-tracker-gxz5.vercel.app/api/map/boundary?apiKey=YOUR_KEY`
  - Observations: `https://wildlife-tracker-gxz5.vercel.app/api/observations?apiKey=YOUR_KEY`

### Vercel Deployment Failures:
- **"Deployment failed"**: Check Vercel function logs for specific errors
  - Go to Vercel Dashboard → Your Project → Functions tab
  - Look for startup errors or missing environment variables
  - Common issues: Firebase credentials, missing API_KEY, or syntax errors

- **Firebase initialization errors**: Ensure FIREBASE_SERVICE_ACCOUNT_KEY is properly set
- **Environment variable issues**: All required env vars must be set in Vercel dashboard
- **Build errors**: Check if all dependencies are properly installed

### Vercel CORS Workaround:
If OPTIONS requests return 404 but your server is running, add CORS headers directly to vercel.json:

```json
{
  "version": 2,
  "builds": [{"src": "server.js", "use": "@vercel/node"}],
  "routes": [{"src": "/(.*)", "dest": "server.js"}],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {"key": "Access-Control-Allow-Origin", "value": "https://jonobenjamin.github.io"},
        {"key": "Access-Control-Allow-Methods", "value": "GET, POST, OPTIONS"},
        {"key": "Access-Control-Allow-Headers", "value": "x-api-key, Content-Type"}
      ]
    }
  ]
}
```

## Environment Variables Required

**Backend (Vercel):**
```env
API_KEY=98394a83034f3db48e5acd3ef54bd622c5748ca5bb4fb3ff39c052319711c9a9
ALLOWED_ORIGINS=https://jonobenjamin.github.io
```

**GitHub Repository Secrets:**
- `API_KEY`: `98394a83034f3db48e5acd3ef54bd622c5748ca5bb4fb3ff39c052319711c9a9`
- `VERCEL_URL`: `https://your-project-name.vercel.app`

## File Structure (Repository Root)

```
map.html              # Main map application
styles.css            # Professional Safari theme styling
data/
└── geojson/
    ├── boundary.geojson    # Concession boundary data
    └── KPR_roads.geojson   # Road network data
README.md             # This documentation
```