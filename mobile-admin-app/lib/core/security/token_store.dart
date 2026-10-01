import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SessionTokens {
  const SessionTokens({required this.accessToken, required this.refreshToken});
  final String accessToken;
  final String refreshToken;
}

class TokenStore {
  TokenStore({required String origin, FlutterSecureStorage? storage})
    : _scope = base64Url.encode(utf8.encode(origin)),
      _storage = storage ?? const FlutterSecureStorage();
  final String _scope;
  final FlutterSecureStorage _storage;
  bool _active = true;
  Future<void> _pending = Future.value();
  String get _accessKey => 'site_${_scope}_access';
  String get _refreshKey => 'site_${_scope}_refresh';
  Future<SessionTokens?> read() async {
    if (!_active) return null;
    final values = await Future.wait([
      _storage.read(key: _accessKey),
      _storage.read(key: _refreshKey),
    ]);
    if (!_active || values.any((v) => v == null || v.isEmpty)) return null;
    return SessionTokens(accessToken: values[0]!, refreshToken: values[1]!);
  }

  Future<void> write(SessionTokens tokens) {
    return _pending = _pending.catchError((Object _) {}).then((_) async {
      if (!_active) return;
      await Future.wait([
        _storage.write(key: _accessKey, value: tokens.accessToken),
        _storage.write(key: _refreshKey, value: tokens.refreshToken),
      ]);
    });
  }

  Future<void> _deleteTokens() async {
    await Future.wait([
      _storage.delete(key: _accessKey),
      _storage.delete(key: _refreshKey),
    ]);
  }

  Future<void> clear() {
    return _pending = _pending.catchError((Object _) {}).then((_) async {
      if (_active) await _deleteTokens();
    });
  }

  Future<void> deactivate() {
    _active = false;
    return _pending = _pending
        .catchError((Object _) {})
        .then((_) => _deleteTokens());
  }
}
