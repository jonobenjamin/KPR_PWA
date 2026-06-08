import 'package:cloud_firestore_web/cloud_firestore_web.dart';
import 'package:firebase_auth_web/firebase_auth_web.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart';
import 'package:firebase_core_web/firebase_core_web.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/flutter_web_plugins.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'firebase_options.dart';
import 'moremi_app_shell.dart';
import 'moremi_firebase_session.dart';
import 'moremi_svg_widgets.dart';
import 'moremi_theme.dart';
import 'wildlife_app.dart';

/// Before [FirebaseCoreWeb.registerWith], [FirebasePlatform.instance] defaults to
/// [MethodChannelFirebase], which calls Pigeon `FirebaseCoreHostApi.initializeCore`.
/// On web there is **no** Pigeon host → `PlatformException(channel-error, ...)`.
/// Generated `web_plugin_registrant.dart` normally fixes this; stale tool cache can skip it.
void _ensureFirebaseWebDelegate() {
  if (!kIsWeb) return;
  if (FirebasePlatform.instance is! MethodChannelFirebase) {
          return;
        }
  FirebaseFirestoreWeb.registerWith(webPluginRegistrar);
  FirebaseAuthWeb.registerWith(webPluginRegistrar);
  FirebaseCoreWeb.registerWith(webPluginRegistrar);
  webPluginRegistrar.registerMessageHandler();
}

/// `firebase-config.js` may already call `initializeApp`. Dart must tolerate duplicates.
Future<void> _ensureFirebaseCore() async {
  if (Firebase.apps.isNotEmpty) {
      return;
    }
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    } catch (e) {
    final msg = e.toString().toLowerCase();
    final code = e is FirebaseException ? e.code.toLowerCase() : '';
    final dup = code == 'duplicate-app' ||
        msg.contains('duplicate-app') ||
        msg.contains('already exists') ||
        msg.contains('already been initialized') ||
        msg.contains('duplicate firebase app');
    if (!dup) {
      rethrow;
    }
    debugPrint('[Moremi] Firebase init skipped (already initialized in browser): $e');
  }
  if (Firebase.apps.isEmpty) {
    throw StateError(
      'Firebase has no default app for Flutter plugins. '
      'Check firebase-config.js and DefaultFirebaseOptions.',
    );
  }
}

class _MoremiStartupSplash extends StatelessWidget {
  const _MoremiStartupSplash();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: moremiAppTheme(),
      home: const Scaffold(
        body: Center(
          child: MoremiPangolinLoadingIndicator(size: 48),
        ),
      ),
    );
  }
}

Future<void> _bootstrapAndRunApp() async {
  await WidgetsBinding.instance.endOfFrame;
  try {
    await _ensureFirebaseCore();
    await MoremiFirebaseSession.ensureSignedIn();
    await Hive.initFlutter();
    await Hive.openBox('offlineData');
    await Hive.openBox('userData');
    runApp(const WildlifeAppRoot(home: MoremiAppShell()));
  } catch (e, st) {
    // ignore: avoid_print
    print('MOREMI_BOOTSTRAP_FAILED: $e\n$st');
    runApp(
      MaterialApp(
        theme: moremiAppTheme(),
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(24),
            child: SelectableText('Could not start the app.\n\n$e'),
          ),
        ),
      ),
    );
  }
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  _ensureFirebaseWebDelegate();
  runApp(const _MoremiStartupSplash());
  WidgetsBinding.instance.addPostFrameCallback((_) {
    _bootstrapAndRunApp();
  });
}
