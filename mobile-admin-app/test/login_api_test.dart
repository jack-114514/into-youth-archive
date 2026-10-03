import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/core/network/api_client.dart';
import 'package:into_youth_admin/core/network/api_exception.dart';
import 'package:into_youth_admin/core/security/token_store.dart';

void main() {
  test(
    'native login sends the challenge token to the selected site API',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final client = ApiClient(
        TokenStore(origin: 'test'),
        baseUrl: 'http://127.0.0.1:${server.port}/api/v1/admin-app',
      );
      final requestFuture = server.first;
      final login = client.login(
        ' owner@example.org ',
        'test-only-password',
        'verified-once',
      );
      final assertion = expectLater(login, throwsA(isA<ApiException>()));
      final request = await requestFuture;
      expect(request.uri.path, '/api/v1/admin-app/auth/login');
      final data = jsonDecode(await utf8.decoder.bind(request).join());
      expect(data, {
        'username': 'owner@example.org',
        'password': 'test-only-password',
        'turnstile_token': 'verified-once',
      });
      request.response.statusCode = 401;
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({'error': '账号或密码错误'}));
      await request.response.close();
      await assertion;
      client.dispose();
      await server.close(force: true);
    },
  );
}
