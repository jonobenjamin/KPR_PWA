import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart' show kIsWeb;

/// Same Firebase web app as [docs/firebase-config.js] (moremi-app).
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    throw UnsupportedError('Add DefaultFirebaseOptions for this platform or use flutterfire configure.');
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyB4eTkmBRxQ7hNm0zNRuXa1xzqTkeNa4bM',
    appId: '1:478665220534:web:98b23a9c8fb77504232117',
    messagingSenderId: '478665220534',
    projectId: 'moremi-app',
    authDomain: 'moremi-app.firebaseapp.com',
    storageBucket: 'moremi-app.firebasestorage.app',
  );
}
