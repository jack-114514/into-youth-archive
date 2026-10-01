import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'app_config.dart';

class SiteStore {
  const SiteStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _storage;
  static const key = 'self_hosted_site_connection';
  Future<SiteConnection?> read() async {
    final value = await _storage.read(key: key);
    if (value == null) return null;
    try {
      final data = jsonDecode(value) as Map<String, dynamic>;
      return SiteConnection.parse(
        data['origin'] as String,
        updateUrl: data['updateUrl'] as String? ?? '',
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> write(SiteConnection site) => _storage.write(
    key: key,
    value: jsonEncode({'origin': site.origin, 'updateUrl': site.updateUrl}),
  );
}
