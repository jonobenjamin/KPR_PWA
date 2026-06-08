import 'dart:async';
import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import 'web_compat.dart'
    show
        localStorageClearMoremiAuthKeys,
        localStorageGet,
        localStorageRemove,
        moremiFreshIdTokenFromJsShell;

/// Bridges existing JS Firebase Auth (ID token in localStorage) into FlutterFire for [FirebaseFirestore].
class MoremiFirebaseSession {
  static const _apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://moremi-pwa.vercel.app',
  );
  static const _apiKey = String.fromEnvironment('API_KEY');

  /// Pre-migration custom UIDs from backend-issued custom tokens (no longer valid as identities).
  static bool _legacyMoremiUid(String uid) =>
      uid.startsWith('uname_') ||
      uid.startsWith('email_') ||
      uid.startsWith('phone_');

  static void _purgeStaleLegacyLocalStorage() {
    final lsUid = localStorageGet('firebaseUid');
    if (lsUid != null && _legacyMoremiUid(lsUid)) {
      localStorageClearMoremiAuthKeys();
    }
  }

  static Future<void> _clearLegacySessionIfNeeded() async {
    final u = FirebaseAuth.instance.currentUser;
    if (u == null || !_legacyMoremiUid(u.uid)) return;
    await FirebaseAuth.instance.signOut();
    localStorageClearMoremiAuthKeys();
  }

  /// True if JWT is missing [exp] or already past [exp] (with skew), or payload cannot be decoded.
  static bool _idTokenExpiredOrInvalid(String token, {int skewSeconds = 120}) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return true;
      var payload = parts[1];
      final rem = payload.length % 4;
      if (rem > 0) payload = payload.padRight(payload.length + (4 - rem), '=');
      final map = jsonDecode(utf8.decode(base64Url.decode(payload)))
          as Map<String, dynamic>;
      final exp = map['exp'];
      if (exp is! num) return true;
      final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      return now >= exp.toInt() - skewSeconds;
    } catch (_) {
      return true;
    }
  }

  static Future<User?> _waitForFirebaseUser(
      {Duration timeout = const Duration(seconds: 10)}) async {
    var u = FirebaseAuth.instance.currentUser;
    if (u != null) return u;
    try {
      return await FirebaseAuth.instance
          .authStateChanges()
          .where((user) => user != null)
          .map((user) => user!)
          .first
          .timeout(timeout);
    } on TimeoutException {
      return FirebaseAuth.instance.currentUser;
    } catch (_) {
      return FirebaseAuth.instance.currentUser;
    }
  }

  static Future<void> _signOutLegacyIfNeeded() async {
    final u = FirebaseAuth.instance.currentUser;
    if (u != null && _legacyMoremiUid(u.uid)) {
      await FirebaseAuth.instance.signOut();
      localStorageClearMoremiAuthKeys();
    }
  }

  static Future<void> ensureSignedIn() async {
    _purgeStaleLegacyLocalStorage();
    await _clearLegacySessionIfNeeded();

    // JS shell may restore Firebase slightly after Flutter starts; wait before falling back to localStorage.
    var user = await _waitForFirebaseUser();

    // If already signed in, verify the session can still issue a fresh token.
    if (user != null) {
      try {
        await user.getIdToken(true);
        await _signOutLegacyIfNeeded();
        return;
      } catch (_) {
        try {
          await FirebaseAuth.instance.signOut();
        } catch (_) {}
        user = null;
      }
    }

    final jsFresh = await moremiFreshIdTokenFromJsShell();
    var tokenLs = localStorageGet('firebaseIdToken');
    if (tokenLs != null &&
        tokenLs.isNotEmpty &&
        _idTokenExpiredOrInvalid(tokenLs)) {
      localStorageRemove('firebaseIdToken');
      tokenLs = null;
    }
    final bearer0 = (jsFresh != null && jsFresh.isNotEmpty) ? jsFresh : tokenLs;
    if (bearer0 == null || bearer0.isEmpty) return;

    /// Exchanges ID token for a custom token and signs Flutter in. Retries once on 401 with JS [getIdToken(true)].
    Future<bool> exchangeFlutterSession(String firstBearer) async {
      for (var attempt = 0; attempt < 2; attempt++) {
        final tok = attempt == 0
            ? firstBearer
            : ((await moremiFreshIdTokenFromJsShell()) ??
                    localStorageGet('firebaseIdToken')) ??
                '';
        if (tok.isEmpty) return false;
        if (attempt > 0 && tok == firstBearer) return false;
        try {
          final res = await http
              .post(
                Uri.parse('$_apiBase/api/moremi-auth/flutter-session'),
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer $tok',
                  if (_apiKey.isNotEmpty) 'x-api-key': _apiKey,
                },
              )
              .timeout(const Duration(seconds: 25));
          if (res.statusCode == 200) {
            final body = jsonDecode(res.body) as Map<String, dynamic>;
            final ct = body['customToken'] as String?;
            if (ct == null || ct.isEmpty) return false;
            await FirebaseAuth.instance.signInWithCustomToken(ct);
            return true;
          }
          if (res.statusCode != 401) return false;
        } catch (_) {
          return false;
        }
      }
      return false;
    }

    try {
      if (await exchangeFlutterSession(bearer0)) {
        await _signOutLegacyIfNeeded();
        return;
      }

      // JS [onIdTokenChanged] may have refreshed the token right after our request — brief wait + retry.
      await Future<void>.delayed(const Duration(milliseconds: 500));
      user = FirebaseAuth.instance.currentUser;
      if (user != null) {
        try {
          await user.getIdToken(true);
          await _signOutLegacyIfNeeded();
          return;
        } catch (_) {}
      }

      final retryTok = localStorageGet('firebaseIdToken');
      if (retryTok != null &&
          retryTok.isNotEmpty &&
          !_idTokenExpiredOrInvalid(retryTok) &&
          await exchangeFlutterSession(retryTok)) {
        await _signOutLegacyIfNeeded();
      }
    } catch (_) {}
  }
}
