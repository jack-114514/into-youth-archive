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
      request.response.write(
        jsonEncode({
          'error': {'code': 'invalid_credentials', 'message': '账号或密码错误'},
          'captcha_required': true,
        }),
      );
      await request.response.close();
      await assertion;
      client.dispose();
      await server.close(force: true);
    },
  );

  test(
    'free password attempt omits captcha fields and receives server escalation',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final client = ApiClient(
        TokenStore(origin: 'test'),
        baseUrl: 'http://127.0.0.1:${server.port}/api/v1/admin-app',
      );
      final requestFuture = server.first;
      final login = client.login('owner@example.org', 'test-only-password', '');
      final assertion = expectLater(
        login,
        throwsA(
          isA<ApiException>().having(
            (e) => e.captchaRequired,
            'captchaRequired',
            true,
          ),
        ),
      );
      final request = await requestFuture;
      final data = jsonDecode(await utf8.decoder.bind(request).join());
      expect(data, {
        'username': 'owner@example.org',
        'password': 'test-only-password',
      });
      request.response.statusCode = 401;
      request.response.headers.contentType = ContentType.json;
      request.response.write(
        jsonEncode({
          'error': {'code': 'invalid_credentials', 'message': '密码错误'},
          'captcha_required': true,
        }),
      );
      await request.response.close();
      await assertion;
      client.dispose();
      await server.close(force: true);
    },
  );

  test(
    'login requirement is read without credentials or an access token',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final client = ApiClient(
        TokenStore(origin: 'test'),
        baseUrl: 'http://127.0.0.1:${server.port}/api/v1/admin-app',
      );
      final requestFuture = server.first;
      final policy = client.loginSecurity();
      final request = await requestFuture;
      expect(request.method, 'GET');
      expect(request.uri.path, '/api/v1/admin-app/auth/login-security');
      expect(request.headers.value('Authorization'), isNull);
      request.response.headers.contentType = ContentType.json;
      request.response.write(
        jsonEncode({'captcha_required': false, 'free_attempts_remaining': 2}),
      );
      await request.response.close();
      expect(await policy, isFalse);
      client.dispose();
      await server.close(force: true);
    },
  );
}
