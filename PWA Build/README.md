# Moremi PWA (Flutter)

Flutter app and web build for **Moremi Sightings**, using Firebase project **`moremi-app`** (see `lib/firebase_options.dart`).

## Android Firebase config

After registering package **`com.moremi.sightings`** under the **moremi-app** project in [Firebase Console](https://console.firebase.google.com/), download **`google-services.json`** and replace `android/app/google-services.json`. The committed file is a placeholder until you do that.

Or run:

```bash
flutterfire configure --project=moremi-app
```

## Web / GitHub Pages

Use `./build-app.sh` from the repo root to build Flutter web into `docs/` with the correct base href.

## Notes

Client and API configuration use **moremi-app** (Firebase) and **https://moremi-pwa.vercel.app** (backend). Update Vercel env `FIREBASE_PROJECT_ID`, service account, and `ADMIN_API_KEY` if you still used legacy defaults.
