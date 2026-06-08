import 'biodiversity.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'moremi_firestore_service.dart';
import 'moremi_svg_widgets.dart';

const String kMoremiPwaInviteBase = 'https://jonobenjamin.github.io/Moremi-PWA/';

class GroupDashboardScreen extends StatelessWidget {
  const GroupDashboardScreen({super.key, required this.groupId});

  final String groupId;

  @override
  Widget build(BuildContext context) {
    final gRef = FirebaseFirestore.instance.collection('groups').doc(groupId);

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: gRef.snapshots(),
      builder: (context, snap) {
        if (snap.hasError) {
          return Scaffold(
            appBar: AppBar(title: const Text('Group')),
            body: Center(child: Text('${snap.error}')),
          );
        }
        if (!snap.hasData || !snap.data!.exists) {
          return Scaffold(
            appBar: AppBar(title: const Text('Group')),
            body: Center(
              child: MoremiPangolinLoadingIndicator(size: 40),
            ),
          );
        }
        final d = snap.data!.data()!;
        final name = d['groupName']?.toString() ?? 'Group';
        final code = d['inviteCode']?.toString() ?? '';
        final inviteUrl = code.isEmpty
            ? ''
            : '${kMoremiPwaInviteBase.replaceAll(RegExp(r'/$'), '')}/?joinGroup=$code';

        return DefaultTabController(
          length: 3,
          child: Scaffold(
            appBar: AppBar(
              title: Text(name),
              bottom: const TabBar(
                tabs: [
                  Tab(text: 'Overview'),
                  Tab(text: 'Members'),
                  Tab(text: 'Leaderboard'),
                ],
              ),
            ),
            body: TabBarView(
              children: [
                _OverviewTab(
                  groupId: groupId,
                  inviteUrl: inviteUrl,
                  code: code,
                ),
                _MembersTab(groupId: groupId),
                _LeaderboardTab(groupId: groupId),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({
    required this.groupId,
    required this.inviteUrl,
    required this.code,
  });

  final String groupId;
  final String inviteUrl;
  final String code;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('observations')
          .where('groupId', isEqualTo: groupId)
          .where('category', isEqualTo: 'Sighting')
          .limit(800)
          .snapshots(),
      builder: (context, sightSnap) {
        if (sightSnap.hasError) {
          return Center(child: Text('${sightSnap.error}'));
        }
        final docs = sightSnap.data?.docs ?? [];
        final counts = <String, int>{};
        var total = 0;
        for (final doc in docs) {
          final d = doc.data();
          final sp = d['species']?.toString() ??
              d['animal']?.toString() ??
              'Unknown';
          final c = (d['sighting_count'] as num?)?.toInt() ?? 1;
          counts[sp] = (counts[sp] ?? 0) + c;
          total += c;
        }
        final species = counts.length;
        final h = shannonWiener(counts);
        MoremiFirestoreService.saveGroupSummaryCache(groupId, {
          'totalSightings': total,
          'uniqueSpecies': species,
          'shannon': h,
          'counts': counts,
          'updatedAt': DateTime.now().toIso8601String(),
        });

        final sorted = counts.entries.toList()
          ..sort((a, b) => b.value.compareTo(a.value));

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              elevation: 0,
              color: Theme.of(context).colorScheme.surfaceContainerHighest.withOpacity(0.6),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Invite', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    if (inviteUrl.isEmpty)
                      const Text('No invite code yet.')
                    else ...[
                      Center(
                        child: QrImageView(
                          data: inviteUrl,
                          version: QrVersions.auto,
                          size: 180,
                          backgroundColor: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Scan with the Moremi app to join this group.',
                        style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                      ),
                      const SizedBox(height: 8),
                      Text('Code: $code', style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              elevation: 0,
              color: Theme.of(context).colorScheme.surfaceContainerHighest.withOpacity(0.6),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Sightings summary', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    Text(
                      'Total sightings: $total',
                      style: const TextStyle(fontSize: 16),
                    ),
                    Text(
                      'Unique species: $species',
                      style: const TextStyle(fontSize: 16),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Biodiversity score: ${h.toStringAsFixed(3)}',
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        letterSpacing: -0.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Shannon–Wiener H for this group',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text('Species breakdown', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (sorted.isEmpty)
              Text(
                'No sightings in this group yet.',
                style: TextStyle(color: Colors.grey.shade700),
              )
            else
              ...sorted.map(
                (e) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(e.key),
                    trailing: Text(
                      '${e.value}',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _MembersTab extends StatelessWidget {
  const _MembersTab({required this.groupId});

  final String groupId;

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('groups')
          .doc(groupId)
          .collection('members')
          .snapshots(),
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(child: Text('${snap.error}'));
        }
        final docs = snap.data?.docs ?? [];
        docs.sort((a, b) {
          final na = a.data()['username']?.toString() ?? '';
          final nb = b.data()['username']?.toString() ?? '';
          return na.compareTo(nb);
        });
        if (docs.isEmpty) {
          return const Center(child: Text('No members loaded.'));
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: docs.length,
          itemBuilder: (context, i) {
            final doc = docs[i];
            final data = doc.data();
            final un = data['username']?.toString() ?? 'User';
            final emoji = data['avatarEmoji']?.toString() ?? '🐘';
            final self = doc.id == uid;
            return Card(
              child: ListTile(
                leading: Text(emoji, style: const TextStyle(fontSize: 28)),
                title: Text(un),
                subtitle: self ? const Text('You') : null,
              ),
            );
          },
        );
      },
    );
  }
}

enum _LbMetric { total, species, diversity }

class _LeaderboardTab extends StatefulWidget {
  const _LeaderboardTab({required this.groupId});

  final String groupId;

  @override
  State<_LeaderboardTab> createState() => _LeaderboardTabState();
}

class _LeaderboardTabState extends State<_LeaderboardTab> {
  _LbMetric _metric = _LbMetric.total;

  @override
  Widget build(BuildContext context) {
    final membersStream = FirebaseFirestore.instance
        .collection('groups')
        .doc(widget.groupId)
        .collection('members')
        .snapshots();
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('observations')
          .where('groupId', isEqualTo: widget.groupId)
          .where('category', isEqualTo: 'Sighting')
          .limit(800)
          .snapshots(),
      builder: (context, sightSnap) {
        return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: membersStream,
          builder: (context, memSnap) {
            if (sightSnap.hasError) {
              return Center(child: Text('${sightSnap.error}'));
            }
            if (!sightSnap.hasData) {
              return Center(
                child: MoremiPangolinLoadingIndicator(size: 36),
              );
            }

            final uidToName = <String, String>{};
            final uidToEmoji = <String, String>{};
            for (final d in memSnap.data?.docs ?? []) {
              final data = d.data();
              uidToName[d.id] = data['username']?.toString() ?? 'User';
              uidToEmoji[d.id] = data['avatarEmoji']?.toString() ?? '🐘';
            }

            final byUser = <String, Map<String, int>>{};
            for (final doc in sightSnap.data!.docs) {
              final data = doc.data();
              final uid = data['user_uid']?.toString() ??
                  data['createdBy']?.toString() ??
                  '_unknown';
              final sp = data['species']?.toString() ??
                  data['animal']?.toString() ??
                  'Unknown';
              final c = (data['sighting_count'] as num?)?.toInt() ?? 1;
              byUser.putIfAbsent(uid, () => {});
              final m = byUser[uid]!;
              m[sp] = (m[sp] ?? 0) + c;
            }

            final rows = <_LbRow>[];
            for (final e in byUser.entries) {
              final counts = e.value;
              final total = counts.values.fold<int>(0, (a, b) => a + b);
              final unique = counts.length;
              final h = shannonWiener(counts);
              final uid = e.key;
              final label = uid == '_unknown'
                  ? 'Unknown submitter'
                  : (uidToName[uid] ?? 'User ${uid.length > 8 ? '${uid.substring(0, 8)}…' : uid}');
              rows.add(_LbRow(
                uid: uid,
                label: label,
                emoji: uidToEmoji[uid] ?? '👤',
                total: total,
                uniqueSpecies: unique,
                diversity: h,
              ));
            }

            rows.sort((a, b) {
              switch (_metric) {
                case _LbMetric.total:
                  return b.total.compareTo(a.total);
                case _LbMetric.species:
                  return b.uniqueSpecies.compareTo(a.uniqueSpecies);
                case _LbMetric.diversity:
                  return b.diversity.compareTo(a.diversity);
              }
            });

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Rank by', style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilterChip(
                      label: const Text('Total animals'),
                      selected: _metric == _LbMetric.total,
                      onSelected: (_) => setState(() => _metric = _LbMetric.total),
                    ),
                    FilterChip(
                      label: const Text('Different species'),
                      selected: _metric == _LbMetric.species,
                      onSelected: (_) => setState(() => _metric = _LbMetric.species),
                    ),
                    FilterChip(
                      label: const Text('Diversity (H′)'),
                      selected: _metric == _LbMetric.diversity,
                      onSelected: (_) => setState(() => _metric = _LbMetric.diversity),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Per-member stats use sightings recorded in this group only.',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                ),
                const SizedBox(height: 16),
                if (rows.isEmpty)
                  Text(
                    'No group sightings yet.',
                    style: TextStyle(color: Colors.grey.shade700),
                  )
                else
                  ...rows.asMap().entries.map((entry) {
                    final rank = entry.key + 1;
                    final r = entry.value;
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: Text(r.emoji, style: const TextStyle(fontSize: 28)),
                        title: Text('#$rank  ${r.label}'),
                        subtitle: Text(
                          '${r.total} animals · ${r.uniqueSpecies} species · H′ ${r.diversity.toStringAsFixed(3)}',
                        ),
                      ),
                    );
                  }),
              ],
            );
          },
        );
      },
    );
  }
}

class _LbRow {
  _LbRow({
    required this.uid,
    required this.label,
    required this.emoji,
    required this.total,
    required this.uniqueSpecies,
    required this.diversity,
  });

  final String uid;
  final String label;
  final String emoji;
  final int total;
  final int uniqueSpecies;
  final double diversity;
}
