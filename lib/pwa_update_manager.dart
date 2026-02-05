import 'dart:html' as html;
import 'package:flutter/foundation.dart';

/// Manages PWA updates through service worker
class PwaUpdateManager extends ChangeNotifier {
  bool _updateAvailable = false;
  html.ServiceWorkerRegistration? _registration;

  bool get updateAvailable => _updateAvailable;

  /// Initialize the PWA update manager
  Future<void> initialize() async {
    if (!kIsWeb) return;

    try {
      // Check if service workers are supported
      if (html.window.navigator.serviceWorker == null) {
        debugPrint('Service workers not supported');
        return;
      }

      // Get the service worker registration
      _registration = await html.window.navigator.serviceWorker?.ready;

      // Listen for updates using Flutter's service worker pattern
      _registration?.addEventListener('updatefound', (html.Event event) {
        final newWorker = _registration?.installing;
        if (newWorker != null) {
          newWorker.addEventListener('statechange', (html.Event event) {
            if (newWorker.state == 'installed') {
              // Check if there's a waiting worker (new version ready)
              if (_registration?.waiting != null) {
                _updateAvailable = true;
                notifyListeners();
                debugPrint('New PWA version available');
              }
            }
          });
        }
      });

      // Also check periodically for updates
      _startPeriodicUpdateCheck();

      debugPrint('PWA Update Manager initialized');
    } catch (e) {
      debugPrint('Failed to initialize PWA Update Manager: $e');
    }
  }

  /// Start periodic update checking
  void _startPeriodicUpdateCheck() {
    // Check for updates every 5 minutes when the app is visible
    html.document.addEventListener('visibilitychange', (html.Event event) {
      if (html.document.visibilityState == 'visible') {
        checkForUpdates();
      }
    });
  }

  /// Apply the available update
  Future<void> applyUpdate() async {
    if (!kIsWeb || !_updateAvailable) return;

    try {
      // Tell the waiting service worker to skip waiting and activate
      _registration?.waiting?.postMessage({'type': 'SKIP_WAITING'});

      // Listen for when the new service worker takes control
      html.window.navigator.serviceWorker?.addEventListener('controllerchange', (html.Event event) {
        // Reload the page to get the new version
        html.window.location.reload();
      });

      _updateAvailable = false;
      notifyListeners();

      debugPrint('Update applied, page will reload');
    } catch (e) {
      debugPrint('Failed to apply update: $e');
    }
  }

  /// Check for updates manually
  Future<void> checkForUpdates() async {
    if (!kIsWeb) return;

    try {
      _registration?.update();
      debugPrint('Manual update check initiated');
    } catch (e) {
      debugPrint('Failed to check for updates: $e');
    }
  }

  /// Clear update notification
  void clearUpdateNotification() {
    _updateAvailable = false;
    notifyListeners();
  }
}