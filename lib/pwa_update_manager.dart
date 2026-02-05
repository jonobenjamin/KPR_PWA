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

      // Listen for service worker updates
      html.window.navigator.serviceWorker?.addEventListener('message', (event) {
        final data = (event as html.MessageEvent).data;
        if (data == 'update_available') {
          _updateAvailable = true;
          notifyListeners();
        }
      });

      // Check for existing service worker
      _registration = await html.window.navigator.serviceWorker?.ready;

      // Listen for updates
      _registration?.addEventListener('updatefound', (event) {
        final newWorker = _registration?.installing;
        if (newWorker != null) {
          newWorker.addEventListener('statechange', (event) {
            if (newWorker.state == 'installed' && html.window.navigator.onLine!) {
              _updateAvailable = true;
              notifyListeners();
            }
          });
        }
      });

      debugPrint('PWA Update Manager initialized');
    } catch (e) {
      debugPrint('Failed to initialize PWA Update Manager: $e');
    }
  }

  /// Apply the available update
  Future<void> applyUpdate() async {
    if (!kIsWeb || !_updateAvailable) return;

    try {
      // Skip waiting for the new service worker
      _registration?.waiting?.postMessage({'type': 'SKIP_WAITING'});

      // Listen for the controlling change
      html.window.navigator.serviceWorker?.addEventListener('controllerchange', (event) {
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