import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'group_dashboard_screen.dart';
import 'moremi_firebase_session.dart';
import 'moremi_firestore_service.dart';
import 'moremi_svg_widgets.dart';

class GroupsScreen extends StatefulWidget {
  const GroupsScreen({super.key, required this.onGroupChanged});

  final VoidCallback onGroupChanged;

  @override
  State<GroupsScreen> createState() => _GroupsScreenState();
}

class _GroupsScreenState extends State<GroupsScreen> {
  final _joinCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid == null || !mounted) return;
      try {
        await MoremiFirebaseSession.ensureSignedIn();
        await MoremiFirestoreService.instance.syncMyGroupIdsFromServer();
      } catch (_) {
        /* Old API builds / offline: list still works once groupIds is filled by join/create */
      }
    });
  }

  @override
  void dispose() {
    _joinCtrl.dispose();
    super.dispose();
  }

  Future<void> _busy(Future<void> Function() fn) async {
    try {
      await fn();
      if (mounted) widget.onGroupChanged();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  Future<void> _setMainGroup(String uid, String? groupId) async {
    await _busy(() async {
      await MoremiFirebaseSession.ensureSignedIn();
      await MoremiFirestoreService.instance.setMainGroupForSightings(uid, groupId);
      if (!mounted) return;
      final label = groupId == null
          ? 'New sightings will not be tagged to a group'
          : 'Main group updated — new sightings go there';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(label)));
    });
  }

  Future<void> _createGroup() async {
    final ctrl = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New group'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(
            labelText: 'Group name',
            border: OutlineInputBorder(),
          ),
          autofocus: true,
          textCapitalization: TextCapitalization.words,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    ctrl.dispose();
    if (name == null || name.isEmpty) return;
    if (!mounted) return;
    await _busy(() async {
      await MoremiFirebaseSession.ensureSignedIn();
      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid == null) {
        throw Exception('Session expired — please sign in again.');
      }
      await MoremiFirestoreService.instance.createGroup(
        uid: uid,
        groupName: name,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Group created — set it as main below if you want sightings there')),
        );
      }
    });
  }

  Future<void> _joinTyped() async {
    final code = _joinCtrl.text.trim().toUpperCase();
    if (code.length < 4) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter an invite code')),
      );
      return;
    }
    await _busy(() async {
      await MoremiFirebaseSession.ensureSignedIn();
      await MoremiFirestoreService.instance.joinGroupWithInvite(code);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Joined — choose your main group below for sightings')),
        );
      }
    });
  }

  Future<void> _leave(String uid, String gid) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave group?'),
        content: const Text(
          'You will stop sharing new sightings with this group until you join again. '
          'If this is your main group, pick another one after leaving.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Leave')),
        ],
      ),
    );
    if (ok != true) return;
    await _busy(() async {
      await MoremiFirestoreService.instance.leaveGroup(uid, gid);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Left group')),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) {
      return const Scaffold(
        body: Center(child: Text('Sign in to use groups.')),
      );
    }

    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Groups')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          StreamBuilder<MoremiGroupsUiState>(
            stream: MoremiFirestoreService.instance.watchMyGroupsUiState(uid),
            builder: (context, gSnap) {
              if (gSnap.hasError) {
                return Card(
                  color: scheme.errorContainer.withValues(alpha: 0.35),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text('Could not load groups: ${gSnap.error}'),
                  ),
                );
              }
              if (!gSnap.hasData) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: MoremiPangolinLoadingIndicator(size: 40)),
                );
              }

              final mainId = gSnap.data!.mainGroupId;
              final docs = gSnap.data!.groupDocs;

              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Main group for new sightings',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'You can be in several groups (e.g. Moremi 2026 vs a family trip). '
                            'Only the group you select here gets new map submissions until you change it. '
                            'Open any group’s dashboard anytime.',
                            style: TextStyle(
                              color: Colors.grey.shade800,
                              height: 1.35,
                            ),
                          ),
                          const SizedBox(height: 12),
                          if (mainId == null && docs.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Text(
                                'No main group selected — new sightings are not tagged to a team.',
                                style: TextStyle(
                                  color: scheme.tertiary,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          OutlinedButton.icon(
                            onPressed: () => _setMainGroup(uid, null),
                            icon: const Icon(Icons.person_outline),
                            label: const Text('No group — personal sightings only'),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text('Your groups (${docs.length})', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  if (docs.isEmpty)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          'Create a group or join with a code below.',
                          style: TextStyle(color: Colors.grey.shade800),
                        ),
                      ),
                    )
                  else
                    ...docs.map((doc) {
                      final gid = doc.id;
                      final name =
                          doc.data()?['groupName']?.toString() ?? 'Group';
                      final isMain = mainId == gid;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              ListTile(
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                ),
                                title: Text(name),
                                subtitle: isMain
                                    ? Text(
                                        'New sightings go to this group',
                                        style: TextStyle(
                                          color: scheme.primary,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      )
                                    : const Text(
                                        'Not receiving new sightings',
                                        style: TextStyle(fontSize: 13),
                                      ),
                                trailing: isMain
                                    ? Chip(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                        ),
                                        label: const Text('Main'),
                                        avatar: Icon(
                                          Icons.check_circle,
                                          size: 18,
                                          color: scheme.primary,
                                        ),
                                      )
                                    : TextButton(
                                        onPressed: () =>
                                            _setMainGroup(uid, gid),
                                        child: const Text('Use for sightings'),
                                      ),
                              ),
                              Padding(
                                padding: const EdgeInsets.fromLTRB(8, 0, 8, 4),
                                child: Wrap(
                                  alignment: WrapAlignment.end,
                                  spacing: 4,
                                  runSpacing: 0,
                                  children: [
                                    TextButton.icon(
                                      onPressed: () {
                                        Navigator.push<void>(
                                          context,
                                          MaterialPageRoute(
                                            builder: (_) =>
                                                GroupDashboardScreen(
                                              groupId: gid,
                                            ),
                                          ),
                                        );
                                      },
                                      icon: const Icon(Icons.dashboard_outlined, size: 18),
                                      label: const Text('Dashboard'),
                                    ),
                                    TextButton.icon(
                                      onPressed: () => _leave(uid, gid),
                                      icon: Icon(
                                        Icons.exit_to_app,
                                        size: 18,
                                        color: scheme.error,
                                      ),
                                      label: Text(
                                        'Leave',
                                        style: TextStyle(color: scheme.error),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                  const SizedBox(height: 24),
                ],
              );
            },
          ),
          Text('Create', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: _createGroup,
            icon: const Icon(Icons.add),
            label: const Text('New group'),
          ),
          const SizedBox(height: 24),
          Text('Join with code', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(
            controller: _joinCtrl,
            decoration: const InputDecoration(
              labelText: 'Invite code',
              border: OutlineInputBorder(),
              hintText: 'From QR or friend',
            ),
            textCapitalization: TextCapitalization.characters,
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _joinTyped,
            child: const Text('Join group'),
          ),
        ],
      ),
    );
  }
}
