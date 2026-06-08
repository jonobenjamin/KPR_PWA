import 'dart:convert';

import 'package:flutter/material.dart';

import 'moremi_svg_widgets.dart';
import 'package:http/http.dart' as http;

import 'web_compat.dart' show localStorageGet;

/// Same compile-time defines as [build-app.sh] (`API_BASE_URL`, `API_KEY`).
const String _apiBase = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://moremi-pwa.vercel.app',
);
const String _apiKey = String.fromEnvironment('API_KEY');

/// Updates Firebase Auth password (`POST /api/moremi-auth/change-password` with Bearer ID token).
class MoremiPasswordChangeCard extends StatefulWidget {
  const MoremiPasswordChangeCard({super.key});

  @override
  State<MoremiPasswordChangeCard> createState() => _MoremiPasswordChangeCardState();
}

class _MoremiPasswordChangeCardState extends State<MoremiPasswordChangeCard> {
  final _new = TextEditingController();
  final _again = TextEditingController();
  bool _busy = false;
  bool _obscure1 = true;
  bool _obscure2 = true;

  @override
  void dispose() {
    _new.dispose();
    _again.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final p1 = _new.text;
    final p2 = _again.text;
    if (p1.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password must be at least 6 characters')),
      );
      return;
    }
    if (p1 != p2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Passwords do not match')),
      );
      return;
    }
    final token = localStorageGet('firebaseIdToken');
    if (token == null || token.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in again, then change your password.')),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await http
          .post(
            Uri.parse('${_apiBase.replaceAll(RegExp(r'/$'), '')}/api/moremi-auth/change-password'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
              if (_apiKey.isNotEmpty) 'x-api-key': _apiKey,
            },
            body: jsonEncode({
              'newPassword': p1,
              'confirmPassword': p2,
            }),
          )
          .timeout(const Duration(seconds: 30));
      final body = jsonDecode(res.body.isEmpty ? '{}' : res.body);
      final map = body is Map<String, dynamic> ? body : <String, dynamic>{};
      if (res.statusCode != 200 || map['success'] != true) {
        throw Exception(map['message'] ?? 'Request failed (${res.statusCode})');
      }
      if (!mounted) return;
      _new.clear();
      _again.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(map['message']?.toString() ?? 'Password updated')),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Theme.of(context).colorScheme.surfaceContainerHighest.withOpacity(0.65),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Change password', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'For accounts that sign in with a password. You stay signed in after updating.',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade800, height: 1.3),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _new,
              obscureText: _obscure1,
              decoration: InputDecoration(
                labelText: 'New password',
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(
                  icon: Icon(_obscure1 ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                  onPressed: () => setState(() => _obscure1 = !_obscure1),
                ),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _again,
              obscureText: _obscure2,
              onSubmitted: (_) {
                if (!_busy) _submit();
              },
              decoration: InputDecoration(
                labelText: 'Re-enter new password',
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(
                  icon: Icon(_obscure2 ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                  onPressed: () => setState(() => _obscure2 = !_obscure2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: MoremiPangolinLoadingIndicator(size: 22),
                    )
                  : const Text('Set password'),
            ),
          ],
        ),
      ),
    );
  }
}
