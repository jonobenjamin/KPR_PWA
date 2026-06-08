import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:http/http.dart' as http;

import 'web_compat.dart' show localStorageGet, localStorageSet, moremiFreshIdTokenFromJsShell;

/// [groupDocs] from [userProfiles.groupIds] + per-document gets (works with strict Firestore rules).
typedef MoremiGroupsUiState = ({
  String? mainGroupId,
  List<DocumentSnapshot<Map<String, dynamic>>> groupDocs,
});

void _moremiFsLog(String op, String message, [Object? err, StackTrace? st]) {
  final u = FirebaseAuth.instance.currentUser?.uid ?? '(no FirebaseAuth user)';
  final buf = StringBuffer('[MoremiFirestore] uid=$u | ')
    ..write(op)
    ..write(' | ')
    ..write(message);
  if (err != null) buf.write(' | error: $err');
  debugPrint(buf.toString());
  if (st != null && kDebugMode) debugPrint('$st');
}

class MoremiFirestoreService {
  MoremiFirestoreService._();
  static final MoremiFirestoreService instance = MoremiFirestoreService._();

  FirebaseFirestore get _db => FirebaseFirestore.instance;

  static const _apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://moremi-pwa.vercel.app',
  );
  static const _apiKey = String.fromEnvironment('API_KEY');

  /// Must stay in sync with [firebase/firestore.rules] `mapRetentionMillis` (7d).
  static const int observationRetentionDays = 7;

  /// Tight fallback when [/health] is unreachable: keep small so we don’t include pre-window
  /// docs (Firestore rejects the whole map query if any match would fail rules).
  static const int _mapQueryFallbackRetentionDays = 2;

  /// Map `where('timestamp', isGreaterThanOrEqualTo: …)` uses **server** time from [GET /health].
  Future<Timestamp> _mapQueryLowerBoundFromServer() async {
    final server = await _tryFetchServerTimeUtcForMap();
    if (server != null) {
      return Timestamp.fromDate(
        server.subtract(Duration(days: observationRetentionDays)),
      );
    }
    return Timestamp.fromDate(
      DateTime.now().toUtc().subtract(
        const Duration(days: _mapQueryFallbackRetentionDays),
      ),
    );
  }

  Future<DateTime?> _tryFetchServerTimeUtcForMap() async {
    final uris = <Uri>[
      Uri.parse('$_apiBase/health'),
      Uri.parse('$_apiBase/api/health'),
    ];
    for (final uri in uris) {
      try {
        final r = await http.get(uri).timeout(const Duration(seconds: 8));
        if (r.statusCode != 200) continue;
        final j = jsonDecode(r.body);
        if (j is! Map<String, dynamic>) continue;
        final s = j['timestamp'] as String?;
        if (s == null || s.isEmpty) continue;
        return DateTime.parse(s).toUtc();
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  /// Server [users] doc from password registration / admin (source of username + legal name).
  Future<String?> _displayNameFromUsersDoc(String uid) async {
    try {
      final snap = await _db.collection('users').doc(uid).get();
      if (!snap.exists) return null;
      final d = snap.data();
      final un = d?['username']?.toString().trim();
      if (un != null &&
          un.isNotEmpty &&
          un.toLowerCase() != 'user') {
        return un;
      }
      final nm = d?['name']?.toString().trim();
      if (nm != null &&
          nm.isNotEmpty &&
          nm.toLowerCase() != 'user') {
        return nm;
      }
    } catch (_) {}
    return null;
  }

  /// Display name for [userProfiles.username]: same source order as the web shell + Firebase Auth.
  String _profileDisplayNameFallback() {
    final u = localStorageGet('authenticatedUsername')?.trim();
    if (u != null && u.isNotEmpty) return u;
    final ls = localStorageGet('authenticatedUserName')?.trim();
    if (ls != null && ls.isNotEmpty) return ls;
    final auth = FirebaseAuth.instance.currentUser;
    final dn = auth?.displayName?.trim();
    if (dn != null && dn.isNotEmpty) return dn;
    final email = auth?.email;
    if (email != null && email.contains('@')) {
      final part = email.split('@').first.trim();
      if (part.isNotEmpty) return part;
    }
    return 'User';
  }

  bool _needsUsernameBackfill(String? username) {
    if (username == null) return true;
    final t = username.trim();
    return t.isEmpty || t == 'User';
  }

  Future<void> ensureProfileExists(String uid) async {
    final ref = _db.collection('userProfiles').doc(uid);
    final snap = await ref.get();
    final fromUsers = await _displayNameFromUsersDoc(uid);
    final fallback = _profileDisplayNameFallback();
    final desired =
        (fromUsers != null && fromUsers.isNotEmpty) ? fromUsers : fallback;

    if (snap.exists) {
      final data = snap.data();
      final u = data?['username']?.toString();
      if (_needsUsernameBackfill(u)) {
        await ref.set({
          'username': desired,
        }, SetOptions(merge: true));
      }
      return;
    }

    await ref.set({
      'username': desired,
      'avatarEmoji': '🐘',
      'createdAt': FieldValue.serverTimestamp(),
      'currentGroupId': null,
    });
  }

  Future<void> updateProfile({
    required String uid,
    required String username,
    required String avatarEmoji,
  }) async {
    await _db.collection('userProfiles').doc(uid).set({
      'username': username,
      'avatarEmoji': avatarEmoji,
    }, SetOptions(merge: true));

    final prof = await _db.collection('userProfiles').doc(uid).get();
    final raw = prof.data()?['groupIds'];
    final gids = <String>[];
    if (raw is List) {
      for (final e in raw) {
        final s = e?.toString() ?? '';
        if (s.isNotEmpty) gids.add(s);
      }
    }
    if (gids.isNotEmpty) {
      final batch = _db.batch();
      for (final gid in gids.toSet()) {
        batch.set(
          _db.collection('groups').doc(gid).collection('members').doc(uid),
          {'username': username, 'avatarEmoji': avatarEmoji},
          SetOptions(merge: true),
        );
      }
      await batch.commit();
    }
    localStorageSet('authenticatedUserName', username);
  }

  Future<String?> currentGroupId(String uid) async {
    final snap = await _db.collection('userProfiles').doc(uid).get();
    return snap.data()?['currentGroupId'] as String?;
  }

  Future<List<DocumentSnapshot<Map<String, dynamic>>>> _groupDocsForProfileIds(
    List<String> ids,
  ) async {
    if (ids.isEmpty) return [];
    final out = <DocumentSnapshot<Map<String, dynamic>>>[];
    for (final id in ids.toSet()) {
      try {
        final s = await _db.collection('groups').doc(id).get();
        if (s.exists) out.add(s);
      } catch (e, st) {
        _moremiFsLog('_groupDocsForProfileIds', 'skip gid=$id', e, st);
      }
    }
    return out;
  }

  /// Group list for the UI: follows [userProfiles.groupIds] and always includes [currentGroupId]
  /// so a newly created "main" group appears even if [groupIds] is missing or cache-lagged.
  Stream<MoremiGroupsUiState> watchMyGroupsUiState(String uid) {
    return userProfileStream(uid).asyncMap((prof) async {
      final data = prof.data();
      final mainGroupId = data?['currentGroupId'] as String?;
      final raw = data?['groupIds'];
      final ids = <String>{};
      if (mainGroupId != null && mainGroupId.isNotEmpty) {
        ids.add(mainGroupId);
      }
      if (raw is List) {
        for (final e in raw) {
          final s = e?.toString() ?? '';
          if (s.isNotEmpty) ids.add(s);
        }
      }
      final groupDocs = await _groupDocsForProfileIds(ids.toList());
      return (mainGroupId: mainGroupId, groupDocs: groupDocs);
    });
  }

  /// Server writes [userProfiles.groupIds] from Firestore truth (Admin). Call when opening Groups.
  Future<void> syncMyGroupIdsFromServer() async {
    var token = await _idTokenForMapApi(forceRefresh: true);
    if (token == null || token.isEmpty) {
      throw Exception('Not signed in');
    }
    final paths = ['/api/moremi-app/sync-group-ids'];
    Object? lastErr;
    for (final path in paths) {
      final uri = Uri.parse('$_apiBase$path');
      final headers = <String, String>{
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
        if (_apiKey.isNotEmpty) 'x-api-key': _apiKey,
      };
      var res = await http
          .post(uri, headers: headers, body: '{}')
          .timeout(const Duration(seconds: 30));
      if (res.statusCode == 401) {
        token = await _idTokenForMapApi(forceRefresh: true);
        if (token != null && token.isNotEmpty) {
          headers['Authorization'] = 'Bearer $token';
          res = await http
              .post(uri, headers: headers, body: '{}')
              .timeout(const Duration(seconds: 30));
        }
      }
      Map<String, dynamic> body;
      try {
        body = jsonDecode(res.body) as Map<String, dynamic>;
      } catch (_) {
        body = {};
      }
      if (res.statusCode == 200 && body['success'] == true) {
        _moremiFsLog('syncMyGroupIdsFromServer', 'ok via $path');
        return;
      }
      if (res.statusCode == 404) {
        lastErr = body['message'] ?? 'Not found (404)';
        continue;
      }
      throw Exception(body['message'] ?? 'Sync groups failed (${res.statusCode})');
    }
    throw Exception(lastErr?.toString() ?? 'Sync groups — API not available');
  }

  /// [userProfiles.currentGroupId] is stamped on new observations as `groupId`.
  /// Pass [groupId] null to save new sightings without a group tag.
  Future<void> setMainGroupForSightings(String uid, String? groupId) async {
    await ensureProfileExists(uid);
    if (groupId == null || groupId.isEmpty) {
      await _db.collection('userProfiles').doc(uid).set(
        {'currentGroupId': null},
        SetOptions(merge: true),
      );
      return;
    }
    final g = await _db.collection('groups').doc(groupId).get();
    if (!g.exists) {
      throw Exception('Group not found');
    }
    final members = g.data()?['memberIds'];
    if (members is! List || !members.map((e) => e.toString()).contains(uid)) {
      throw Exception('You are not a member of this group');
    }
    await _db.collection('userProfiles').doc(uid).set(
      {'currentGroupId': groupId},
      SetOptions(merge: true),
    );
  }

  /// Map feed: [GET /api/observations/recent] when it returns rows; else Firestore (API can
  /// return 200 with [] if e.g. `/recent` date filter mishandled Firestore Timestamps server-side).
  Future<List<Map<String, dynamic>>> fetchSightingsForMap(String uid) async {
    await ensureProfileExists(uid);
    try {
      final api = await _fetchSightingsForMapViaApi(uid);
      if (api.isNotEmpty) return api;
      _moremiFsLog(
        'fetchSightingsForMap',
        'API returned 0 sightings, trying Firestore',
      );
    } catch (e, st) {
      _moremiFsLog(
        'fetchSightingsForMap',
        'Moremi map API failed, trying Firestore',
        e,
        st,
      );
    }
    return _fetchSightingsForMapFirestore(uid);
  }

  /// Prefer Firebase Auth; fallback to [firebaseIdToken] in localStorage (web shell may refresh it first).
  /// Catches [FirebaseAuthException] from [getIdToken] so a stale restored session does not
  /// surface raw Firebase errors in the UI — callers handle null / empty gracefully.
  Future<String?> _idTokenForMapApi({bool forceRefresh = false}) async {
    try {
      final fromAuth =
          await FirebaseAuth.instance.currentUser?.getIdToken(forceRefresh);
      if (fromAuth != null && fromAuth.isNotEmpty) return fromAuth;
    } catch (e) {
      _moremiFsLog('_idTokenForMapApi', 'getIdToken(forceRefresh=$forceRefresh) threw — trying JS shell / localStorage', e);
    }
    try {
      final fromJs = await moremiFreshIdTokenFromJsShell();
      if (fromJs != null && fromJs.isNotEmpty) return fromJs;
    } catch (_) {}
    final ls = localStorageGet('firebaseIdToken');
    if (ls != null && ls.isNotEmpty) return ls;
    return null;
  }

  /// Same shape as [_observationDocToMap]; normalizes JSON from Admin/Express ([Timestamp] encoding).
  Map<String, dynamic> _normalizeObservationJsonForMap(Map<String, dynamic> raw) {
    final m = Map<String, dynamic>.from(raw);
    final ts = m['timestamp'];
    if (ts is Map) {
      final sec = ts['_seconds'] ?? ts['seconds'];
      final nano = ts['_nanoseconds'] ?? ts['nanoseconds'] ?? 0;
      if (sec is num) {
        m['timestamp'] = Timestamp(sec.toInt(), (nano as num).toInt());
      }
    }
    return m;
  }

  Future<List<Map<String, dynamic>>> _fetchSightingsForMapViaApi(String uid) async {
    final server = await _tryFetchServerTimeUtcForMap();
    final since = server != null
        ? server.subtract(Duration(days: observationRetentionDays))
        : DateTime.now()
            .toUtc()
            .subtract(const Duration(days: _mapQueryFallbackRetentionDays));
    final sinceIso = since.toIso8601String();
    final uri = Uri.parse('$_apiBase/api/observations/recent').replace(
      queryParameters: {'since': sinceIso},
    );
    final headers = <String, String>{'Accept': 'application/json'};
    var idToken = await _idTokenForMapApi();
    if (idToken != null && idToken.isNotEmpty) {
      headers['Authorization'] = 'Bearer $idToken';
    } else if (_apiKey.isNotEmpty) {
      headers['x-api-key'] = _apiKey;
    } else {
      throw StateError('Moremi map: no Firebase ID token and no API_KEY');
    }
    _moremiFsLog(
      'fetchSightingsForMap',
      'Moremi PWA api=GET /api/observations/recent since=$sinceIso '
          'auth=${idToken != null && idToken.isNotEmpty ? 'Bearer' : 'api-key'} | uid=$uid',
    );
    var r = await http.get(uri, headers: headers).timeout(const Duration(seconds: 25));
    if (r.statusCode == 401 && headers.containsKey('Authorization')) {
      idToken = await _idTokenForMapApi(forceRefresh: true);
      if (idToken != null && idToken.isNotEmpty) {
        headers['Authorization'] = 'Bearer $idToken';
        r = await http.get(uri, headers: headers).timeout(const Duration(seconds: 25));
      }
    }
    if (r.statusCode != 200) {
      throw Exception('recent ${r.statusCode}: ${r.body}');
    }
    final decoded = jsonDecode(r.body);
    if (decoded is! Map<String, dynamic>) {
      throw FormatException('recent: expected JSON object');
    }
    final list = decoded['data'] as List<dynamic>? ?? [];
    final out = <Map<String, dynamic>>[];
    for (final item in list) {
      if (item is! Map) continue;
      final row = _normalizeObservationJsonForMap(Map<String, dynamic>.from(item));
      final id = row['id']?.toString() ?? '';
      out.add(_observationDocToMap(id, row));
    }
    _moremiFsLog('fetchSightingsForMap', 'ok count=${out.length} (Moremi API /recent)');
    return out;
  }

  Future<List<Map<String, dynamic>>> _fetchSightingsForMapFirestore(String uid) async {
    final lower = await _mapQueryLowerBoundFromServer();
    _moremiFsLog(
      'fetchSightingsForMap',
      'firestore collection=observations filters=[category==Sighting, timestamp>=$lower] '
          'orderBy=timestamp(desc) limit=800 | authUid=$uid',
    );
    try {
      final snap = await _db
          .collection('observations')
          .where('category', isEqualTo: 'Sighting')
          .where('timestamp', isGreaterThanOrEqualTo: lower)
          .orderBy('timestamp', descending: true)
          .limit(800)
          .get();

      final out = <Map<String, dynamic>>[];
      for (final d in snap.docs) {
        out.add(_observationDocToMap(d.id, d.data()));
      }
      _moremiFsLog('fetchSightingsForMap', 'ok count=${out.length} (Firestore)');
      return out;
    } catch (e, st) {
      _moremiFsLog(
        'fetchSightingsForMap',
        'FAILED permission-denied|failed-precondition|index',
        e,
        st,
      );
      rethrow;
    }
  }

  Map<String, dynamic> _observationDocToMap(String id, Map<String, dynamic> data) {
    final species = data['species']?.toString() ??
        data['animal']?.toString() ??
        'Sighting';
    double lat = 0;
    double lon = 0;
    final geo = data['location'];
    if (geo is GeoPoint) {
      lat = geo.latitude;
      lon = geo.longitude;
    }
    if (data['latitude'] != null && data['longitude'] != null) {
      lat = (data['latitude'] as num).toDouble();
      lon = (data['longitude'] as num).toDouble();
    }
    final ts = data['timestamp'];
    String? tsIso;
    if (ts is Timestamp) {
      tsIso = ts.toDate().toIso8601String();
    } else if (ts != null) {
      tsIso = ts.toString();
    }
    return {
      'id': id,
      'animal': species,
      'species': species,
      'sighting_count': data['sighting_count'] ?? 1,
      'timestamp': tsIso,
      'latitude': lat,
      'longitude': lon,
      'createdBy': data['createdBy'] ?? data['user_uid'],
      '_groupId': data['groupId'] as String?,
    };
  }

  /// Only [FieldValue.serverTimestamp] for `timestamp` (rules require Firestore timestamp on create).
  Future<void> submitSighting({
    required String uid,
    required String species,
    required int count,
    required double lat,
    required double lon,
    String? note,
  }) async {
    await ensureProfileExists(uid);
    // Prefer server-backed profile so [currentGroupId] is correct right after join/create (cache can lag).
    DocumentSnapshot<Map<String, dynamic>> prof;
    try {
      prof = await _db
          .collection('userProfiles')
          .doc(uid)
          .get(const GetOptions(source: Source.server));
    } catch (_) {
      prof = await _db.collection('userProfiles').doc(uid).get();
    }
    final gid = prof.data()?['currentGroupId'] as String?;
    final emoji = prof.data()?['avatarEmoji']?.toString() ?? '🐘';

    final payload = <String, dynamic>{
      'category': 'Sighting',
      'animal': species,
      'sighting_count': count,
      'latitude': lat,
      'longitude': lon,
      'user_uid': uid,
      // Must be Firestore Timestamp (not ISO string) so security rules and `where(timestamp, ...)` work.
      'timestamp': FieldValue.serverTimestamp(),
      'emojiAvatar': emoji,
      'synced': true,
      if (note != null && note.isNotEmpty) 'note': note,
    };
    if (gid != null && gid.isNotEmpty) {
      payload['groupId'] = gid;
    }

    _moremiFsLog(
      'submitSighting',
      'collection=observations op=add category=Sighting animal=$species authUid=$uid',
    );
    try {
      await _db.collection('observations').add(payload);
      _moremiFsLog('submitSighting', 'ok');
    } catch (e, st) {
      _moremiFsLog('submitSighting', 'FAILED', e, st);
      rethrow;
    }
  }

  /// Creates group + invite + profile via Admin API (bypasses strict / batched client rules).
  Future<String> createGroup({
    required String uid,
    required String groupName,
  }) async {
    await ensureProfileExists(uid);
    var token = await _idTokenForMapApi(forceRefresh: true);
    if (token == null || token.isEmpty) {
      throw Exception('Not signed in');
    }
    final paths = [
      '/api/moremi-app/create-group',
    ];
    Object? lastErr;
    for (final path in paths) {
      final uri = Uri.parse('$_apiBase$path');
      final headers = <String, String>{
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
        if (_apiKey.isNotEmpty) 'x-api-key': _apiKey,
      };
      var res = await http
          .post(
            uri,
            headers: headers,
            body: jsonEncode({'groupName': groupName}),
          )
          .timeout(const Duration(seconds: 30));
      if (res.statusCode == 401) {
        token = await _idTokenForMapApi(forceRefresh: true);
        if (token != null && token.isNotEmpty) {
          headers['Authorization'] = 'Bearer $token';
          res = await http
              .post(
                uri,
                headers: headers,
                body: jsonEncode({'groupName': groupName}),
              )
              .timeout(const Duration(seconds: 30));
        }
      }
      Map<String, dynamic> body;
      try {
        body = jsonDecode(res.body) as Map<String, dynamic>;
      } catch (_) {
        body = {};
      }
      if (res.statusCode == 200 &&
          body['success'] == true &&
          body['groupId'] != null) {
        final gidOut = body['groupId'].toString();
        _moremiFsLog('createGroup', 'ok groupId=$gidOut via $path');
        try {
          await syncMyGroupIdsFromServer();
        } catch (e) {
          _moremiFsLog('createGroup', 'sync groupIds after create skipped', e);
        }
        return gidOut;
      }
      if (res.statusCode == 404) {
        lastErr = body['message'] ?? 'Not found (404)';
        continue;
      }
      throw Exception(body['message'] ?? 'Create group failed (${res.statusCode})');
    }
    throw Exception(lastErr?.toString() ?? 'Create group failed — API not available');
  }

  Future<void> joinGroupWithInvite(String inviteCode) async {
    var token = await _idTokenForMapApi(forceRefresh: true);
    if (token == null || token.isEmpty) throw Exception('Not signed in');
    final paths = [
      '/api/moremi-app/join-group',
    ];
    Object? lastErr;
    for (final path in paths) {
      final uri = Uri.parse('$_apiBase$path');
      final headers = <String, String>{
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
        if (_apiKey.isNotEmpty) 'x-api-key': _apiKey,
      };
      var res = await http
          .post(
            uri,
            headers: headers,
            body: jsonEncode({
              'inviteCode': inviteCode.trim().toUpperCase(),
            }),
          )
          .timeout(const Duration(seconds: 30));
      if (res.statusCode == 401) {
        token = await _idTokenForMapApi(forceRefresh: true);
        if (token != null && token.isNotEmpty) {
          headers['Authorization'] = 'Bearer $token';
          res = await http
              .post(
                uri,
                headers: headers,
                body: jsonEncode({
                  'inviteCode': inviteCode.trim().toUpperCase(),
                }),
              )
              .timeout(const Duration(seconds: 30));
        }
      }
      Map<String, dynamic> body;
      try {
        body = jsonDecode(res.body) as Map<String, dynamic>;
      } catch (_) {
        body = {};
      }
      if (res.statusCode == 200) {
        try {
          await syncMyGroupIdsFromServer();
        } catch (e) {
          _moremiFsLog('joinGroupWithInvite', 'sync groupIds after join skipped', e);
        }
        return;
      }
      if (res.statusCode == 404) {
        lastErr = body['message'] ?? 'Not found (404)';
        continue;
      }
      throw Exception(body['message'] ?? 'Join failed (${res.statusCode})');
    }
    throw Exception(lastErr?.toString() ?? 'Join failed — API path not available');
  }

  Future<void> leaveGroup(String uid, String groupId) async {
    final profRef = _db.collection('userProfiles').doc(uid);
    final prof = await profRef.get();
    final cur = prof.data()?['currentGroupId'] as String?;

    final batch = _db.batch();
    final gRef = _db.collection('groups').doc(groupId);
    batch.update(gRef, {
      'memberIds': FieldValue.arrayRemove([uid]),
    });
    final profPatch = <String, dynamic>{
      'groupIds': FieldValue.arrayRemove([groupId]),
    };
    if (cur == groupId) {
      profPatch['currentGroupId'] = null;
    }
    batch.set(profRef, profPatch, SetOptions(merge: true));
    await batch.commit();
  }

  /// Profile list — all of the user’s own sightings (rules allow full history for owner).
  Future<List<Map<String, dynamic>>> fetchMySightingsForProfile(String uid) async {
    await ensureProfileExists(uid);
    _moremiFsLog(
      'fetchMySightingsForProfile',
      'collection=observations '
          'filters=[user_uid==$uid, category==Sighting] '
          'orderBy=timestamp(desc) limit=500 | authUid=$uid',
    );
    try {
      final snap = await _db
          .collection('observations')
          .where('user_uid', isEqualTo: uid)
          .where('category', isEqualTo: 'Sighting')
          .orderBy('timestamp', descending: true)
          .limit(500)
          .get();

      final out = <Map<String, dynamic>>[];
      for (final d in snap.docs) {
        out.add(_observationDocToMap(d.id, d.data()));
      }
      _moremiFsLog('fetchMySightingsForProfile', 'ok count=${out.length}');
      return out;
    } catch (e, st) {
      _moremiFsLog(
        'fetchMySightingsForProfile',
        'FAILED permission-denied|failed-precondition = rules/index mismatch',
        e,
        st,
      );
      rethrow;
    }
  }

  Stream<DocumentSnapshot<Map<String, dynamic>>> userProfileStream(String uid) {
    return _db.collection('userProfiles').doc(uid).snapshots();
  }

  static Map<String, dynamic>? cachedGroupSummary(String groupId) {
    final raw = Hive.box('userData').get('groupSummary_$groupId');
    if (raw is! String) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static void saveGroupSummaryCache(String groupId, Map<String, dynamic> data) {
    Hive.box('userData').put('groupSummary_$groupId', jsonEncode(data));
  }
}
