import 'dart:async';
import 'dart:html' as html;
import 'dart:js' as js;

bool navigatorOnLine() {
  // Browsers often report `navigator.onLine === false` while the PWA still has a
  // working connection (notably with a service worker). That routed every sighting
  // through the offline outbox. We always attempt cloud writes; failures still
  // queue via Firestore error handling.
  return true;
}

String _moremiStoragePrefix() {
  try {
    final path = html.window.location.pathname ?? '/';
    final parts = path.replaceAll(RegExp(r'^/+|/+$'), '').split('/');
    final seg = parts.isEmpty ? 'app' : parts.first;
    return 'moremi:$seg:';
  } catch (_) {
    return 'moremi:app:';
  }
}

String? localStorageGet(String key) {
  try {
    return html.window.localStorage[_moremiStoragePrefix() + key];
  } catch (_) {
    return null;
  }
}

void localStorageSet(String key, String value) {
  try {
    html.window.localStorage[_moremiStoragePrefix() + key] = value;
  } catch (_) {}
}

void localStorageRemove(String key) {
  try {
    html.window.localStorage.remove(_moremiStoragePrefix() + key);
  } catch (_) {}
}

const _moremiAuthStorageKeys = [
  'firebaseIdToken',
  'firebaseUid',
  'userAuthenticated',
  'authenticatedUserName',
  'authenticatedUsername',
];

void localStorageClearMoremiAuthKeys() {
  final p = _moremiStoragePrefix();
  for (final k in _moremiAuthStorageKeys) {
    try {
      html.window.localStorage.remove(p + k);
    } catch (_) {}
  }
}

void listenOnline(void Function() onOnline) {
  try {
    html.window.onOnline.listen((_) => onOnline());
  } catch (_) {}
}

void listenOffline(void Function() onOffline) {
  try {
    html.window.onOffline.listen((_) => onOffline());
  } catch (_) {}
}

void signOutMoremi() {
  try {
    final f = js.context['moremiSignOut'];
    if (f != null) {
      js.context.callMethod('moremiSignOut');
      return;
    }
  } catch (_) {}
  html.window.location.reload();
}

/// Deep link `?joinGroup=CODE` for QR invites (staging/prod path agnostic).
String? peekJoinGroupQueryParam() {
  try {
    final u = Uri.parse(html.window.location.href);
    final c = u.queryParameters['joinGroup'];
    if (c == null || c.isEmpty) return null;
    return c.trim().toUpperCase();
  } catch (_) {
    return null;
  }
}

void triggerForceAppUpdate() {
  try {
    final f = js.context['forceAppUpdate'];
    if (f != null) {
      js.context.callMethod('forceAppUpdate');
    }
  } catch (_) {}
}

String? moremiBuildJsonUrl() {
  try {
    var base = html.document.querySelector('base')?.getAttribute('href') ?? '/';
    base = base.trim();
    if (base.isEmpty) base = '/';
    var path = base.replaceAll(RegExp(r'/+$'), '');
    if (!path.startsWith('/')) path = '/$path';
    final origin = html.window.location.origin;
    return '$origin$path/moremi_build.json';
  } catch (_) {
    return null;
  }
}

void stripJoinGroupQueryParam() {
  try {
    final u = Uri.parse(html.window.location.href);
    if (!u.queryParameters.containsKey('joinGroup')) return;
    final qp = Map<String, String>.from(u.queryParameters)..remove('joinGroup');
    final next = u.replace(
      queryParameters: qp.isEmpty ? const <String, String>{} : qp,
    );
    html.window.history.replaceState(null, '', next.toString());
  } catch (_) {}
}

/// Calls JS shell to run Firebase `getIdToken(true)` and read result (polling; no `allowInterop`).
Future<String?> moremiFreshIdTokenFromJsShell() async {
  try {
    final req = js.context['moremiRequestFreshTokenForDart'];
    if (req == null) return null;
    js.context.callMethod('moremiRequestFreshTokenForDart');
    const maxTicks = 120;
    for (var i = 0; i < maxTicks; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 50));
      final ready = js.context['moremiDartFreshTokenReady'];
      if (ready == true) {
        final v = js.context['moremiDartFreshTokenValue'];
        if (v == null) return null;
        final s = v.toString();
        return s.isEmpty ? null : s;
      }
    }
    return null;
  } catch (_) {
    return null;
  }
}
