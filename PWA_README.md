# Wildlife Tracker PWA

This Flutter application has been converted to a Progressive Web App (PWA) that can be installed on mobile devices and works offline.

## Features

- **Offline Functionality**: Uses Hive for local data storage
- **GPS Tracking**: Automatic GPS location capture on mobile devices
- **Data Synchronization**: Sync offline data to backend when connected
- **PWA Installation**: Installable on Android and iOS devices
- **Responsive Design**: Works on mobile and desktop browsers

## PWA Capabilities

✅ **Web App Manifest**: Proper app metadata and icons
✅ **Service Worker**: Caching for offline functionality
✅ **Install Prompt**: User-friendly installation prompts
✅ **Standalone Mode**: Runs like a native app when installed
✅ **Offline Data Storage**: Local data persistence with sync

## Building for Production

```bash
# Build for web with environment variables (SECURE)
flutter build web --release \
  --dart-define=API_BASE_URL=https://your-api-url.com \
  --dart-define=API_KEY=your-secure-api-key

# Or use a .env file (create .env file first)
flutter build web --release --dart-define-from-file=.env

# The built files will be in build/web/
```

### 🔐 Security Note
**Never hardcode API keys in your source code!** Use `--dart-define` flags or environment files that are not committed to version control.

## Deployment

### Option 1: Static Hosting (Recommended)
Deploy the `build/web/` folder to any static hosting service:

- **Vercel**: Drag and drop the `build/web/` folder
- **Netlify**: Connect repository and set publish directory to `build/web/`
- **Firebase Hosting**: `firebase deploy`
- **GitHub Pages**: Upload contents of `build/web/`

### Option 2: Local Testing
```bash
cd build/web
python3 -m http.server 8080
# Visit http://localhost:8080
```

## Mobile Installation

1. **Android**: Open in Chrome → Tap "Add to Home screen"
2. **iOS**: Open in Safari → Tap share button → "Add to Home Screen"

## Offline Features

- **Data Entry**: Record wildlife sightings, incidents, and maintenance offline
- **GPS Capture**: Automatic location capture on mobile devices
- **Data Sync**: Sync all offline data when internet connection is restored
- **Local Storage**: All data persists locally using Hive database

## API Configuration

The app connects to your backend API. Configure the API endpoint in `lib/main.dart`:

```dart
const String API_BASE_URL = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://your-api-url.com');
const String API_KEY = String.fromEnvironment('API_KEY', defaultValue: 'your-api-key');
```

## Requirements

- **HTTPS**: Required for PWA installation (most hosting services provide this)
- **Modern Browsers**: Chrome 70+, Firefox 68+, Safari 12.2+, Edge 79+
- **Mobile Devices**: Android 5.0+, iOS 11.3+

## Testing PWA Features

1. **Installability**: Use Lighthouse in Chrome DevTools
2. **Offline Mode**: Use Chrome DevTools → Network → Offline
3. **Service Worker**: Check Application → Service Workers in DevTools
4. **Manifest**: Check Application → Manifest in DevTools

## Troubleshooting

- **Not Installing**: Ensure served over HTTPS and manifest is valid
- **Offline Not Working**: Check service worker registration in DevTools
- **GPS Not Working**: Grant location permissions in browser settings

## Backend Integration

The app expects a REST API with this endpoint:
```
POST /api/observations
Headers: Content-Type: application/json, x-api-key: <your-key>
Body: { category, animal?, incident_type?, maintenance_type?, latitude?, longitude?, timestamp, user }
```