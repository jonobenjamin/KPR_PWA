import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'groups_screen.dart';
import 'moremi_firebase_session.dart';
import 'moremi_firestore_service.dart';
import 'moremi_nav_icons.dart';
import 'moremi_svg_widgets.dart';
import 'web_compat.dart';
import 'wildlife_app.dart';

/// Bottom navigation: sightings (map), groups, profile.
class MoremiAppShell extends StatefulWidget {
  const MoremiAppShell({super.key});

  /// Embedded at compile time by `./build-app.sh` (`--dart-define=MOREMI_BUILD_ID=...`).
  static const String embeddedBuildId =
      String.fromEnvironment('MOREMI_BUILD_ID', defaultValue: '');

  @override
  State<MoremiAppShell> createState() => _MoremiAppShellState();
}

class _MoremiAppShellState extends State<MoremiAppShell> with WidgetsBindingObserver {
  int _index = 0;
  final GlobalKey<WildlifeHomePageState> _mapKey = GlobalKey<WildlifeHomePageState>();
  final GlobalKey<WildlifeProfilePageState> _profileKey = GlobalKey<WildlifeProfilePageState>();
  bool _newerBuildOnServer = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _handleDeepLinkJoin();
      _checkNewerBuildOnServer();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkNewerBuildOnServer();
    }
  }

  Future<void> _checkNewerBuildOnServer() async {
    if (!kIsWeb || MoremiAppShell.embeddedBuildId.isEmpty) return;
    final url = moremiBuildJsonUrl();
    if (url == null) return;
    try {
      final res = await http
          .get(Uri.parse('$url?t=${DateTime.now().millisecondsSinceEpoch}'))
          .timeout(const Duration(seconds: 12));
      if (!mounted || res.statusCode != 200) return;
      final m = jsonDecode(res.body) as Map<String, dynamic>;
      final id = m['id']?.toString();
      if (id == null || id.isEmpty) return;

      final embedded = MoremiAppShell.embeddedBuildId;
      final ack = localStorageGet('ackRemoteBuildId');

      if (ack != null && ack == id && id != embedded) {
        if (mounted) setState(() => _newerBuildOnServer = false);
        return;
      }

      if (id == embedded) {
        if (ack != null && ack == id) {
          localStorageRemove('ackRemoteBuildId');
        }
        if (mounted && _newerBuildOnServer) {
          setState(() => _newerBuildOnServer = false);
        }
        return;
      }

      if (mounted) setState(() => _newerBuildOnServer = true);
    } catch (_) {}
  }

  Future<void> _handleDeepLinkJoin() async {
    if (!kIsWeb) return;
    final code = peekJoinGroupQueryParam();
    if (code == null || code.isEmpty || !mounted) return;
    stripJoinGroupQueryParam();
    await MoremiFirebaseSession.ensureSignedIn();
    if (FirebaseAuth.instance.currentUser == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in, then scan the invite again.')),
      );
      return;
    }
    if (!mounted) return;
    final go = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Join group?'),
        content: Text('Use invite code $code?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Join'),
          ),
        ],
      ),
    );
    if (go != true || !mounted) return;
    try {
      await MoremiFirestoreService.instance.joinGroupWithInvite(code);
      _mapKey.currentState?.refreshSightingsPublic();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Joined group')),
        );
        setState(() => _index = 1);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  void _onGroupChanged() {
    _mapKey.currentState?.refreshSightingsPublic();
    setState(() {});
  }

  void _onSightingsChangedFromMap() {
    _profileKey.currentState?.refreshActivityPublic();
    _onGroupChanged();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: [
          WildlifeHomePage(
            key: _mapKey,
            showProfileShortcut: false,
            onSightingsChanged: _onSightingsChangedFromMap,
          ),
          GroupsScreen(onGroupChanged: _onGroupChanged),
          WildlifeProfilePage(
            key: _profileKey,
            onSyncRequested: () async {
              await _mapKey.currentState?.syncOfflinePublic();
            },
            onSignedOut: () {},
            onDataChanged: _onGroupChanged,
            showAppUpdateBadge: _newerBuildOnServer,
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.only(bottom: 4),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 4),
          child: NavigationBar(
            height: 72,
            selectedIndex: _index,
            onDestinationSelected: (i) => setState(() => _index = i),
            destinations: [
              NavigationDestination(
                icon: const MoremiNavBinocularsSvg(),
                selectedIcon: const MoremiNavBinocularsSvg(),
                label: 'Sightings',
              ),
              NavigationDestination(
                icon: MoremiGroupsNavIcon(selected: false),
                selectedIcon: MoremiGroupsNavIcon(selected: true),
                label: 'Groups',
              ),
              NavigationDestination(
                icon: _newerBuildOnServer
                    ? Badge(
                        label: const Text('1'),
                        child: MoremiProfileNavIcon(selected: false),
                      )
                    : MoremiProfileNavIcon(selected: false),
                selectedIcon: _newerBuildOnServer
                    ? Badge(
                        label: const Text('1'),
                        child: MoremiProfileNavIcon(selected: true),
                      )
                    : MoremiProfileNavIcon(selected: true),
                label: 'Profile',
              ),
            ],
          ),
        ),
      ),
    );
  }
}
