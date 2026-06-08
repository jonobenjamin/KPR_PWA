import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'moremi_firebase_session.dart';
import 'moremi_firestore_service.dart';
import 'moremi_profile_constants.dart';

class MoremiProfileEditorCard extends StatefulWidget {
  const MoremiProfileEditorCard({super.key, this.onSaved});

  final VoidCallback? onSaved;

  @override
  State<MoremiProfileEditorCard> createState() => _MoremiProfileEditorCardState();
}

class _MoremiProfileEditorCardState extends State<MoremiProfileEditorCard> {
  final _usernameCtrl = TextEditingController();
  String? _pickedEmoji;
  bool _seeded = false;

  @override
  void initState() {
    super.initState();
    scheduleMicrotask(() async {
      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid == null) return;
      await MoremiFirebaseSession.ensureSignedIn();
      await MoremiFirestoreService.instance.ensureProfileExists(uid);
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _usernameCtrl.dispose();
    super.dispose();
  }

  Future<void> _save(String uid) async {
    final name = _usernameCtrl.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Username is required')),
      );
      return;
    }
    final emoji = _pickedEmoji ?? kMoremiAvatarEmojis.first;
    await MoremiFirestoreService.instance.updateProfile(
      uid: uid,
      username: name,
      avatarEmoji: emoji,
    );
    if (mounted) {
      widget.onSaved?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile saved')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) {
      return const SizedBox.shrink();
    }

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: MoremiFirestoreService.instance.userProfileStream(uid),
      builder: (context, snap) {
        final d = snap.data?.data();
        if (d != null) {
          final u = d['username']?.toString() ?? '';
          final e = d['avatarEmoji']?.toString();
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            var needSetState = false;
            if (!_seeded) {
              _seeded = true;
              _usernameCtrl.text = u;
              _pickedEmoji =
                  kMoremiAvatarEmojis.contains(e) ? e : kMoremiAvatarEmojis.first;
              needSetState = true;
            } else if (u.isNotEmpty &&
                u != 'User' &&
                (_usernameCtrl.text.isEmpty || _usernameCtrl.text == 'User')) {
              _usernameCtrl.text = u;
              needSetState = true;
            }
            if (needSetState) setState(() {});
          });
        }

        return Card(
          elevation: 0,
          color: Theme.of(context).colorScheme.surfaceContainerHighest.withOpacity(0.65),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Account', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                TextField(
                  controller: _usernameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Username',
                    border: OutlineInputBorder(),
                  ),
                  textCapitalization: TextCapitalization.words,
                ),
                const SizedBox(height: 12),
                Text('Animal avatar', style: Theme.of(context).textTheme.labelLarge),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: kMoremiAvatarEmojis.map((e) {
                    final on = (_pickedEmoji ?? kMoremiAvatarEmojis.first) == e;
                    return Material(
                      color: on
                          ? Theme.of(context).colorScheme.primaryContainer
                          : Theme.of(context).colorScheme.surface,
                      borderRadius: BorderRadius.circular(12),
                      child: InkWell(
                        onTap: () => setState(() => _pickedEmoji = e),
                        borderRadius: BorderRadius.circular(12),
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Text(e, style: const TextStyle(fontSize: 26)),
                        ),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => _save(uid),
                  child: const Text('Save profile'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
