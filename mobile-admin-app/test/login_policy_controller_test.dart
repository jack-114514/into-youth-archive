import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/core/network/api_client.dart';
import 'package:into_youth_admin/core/network/api_exception.dart';
import 'package:into_youth_admin/core/providers.dart';
import 'package:into_youth_admin/core/security/token_store.dart';
import 'package:into_youth_admin/features/auth/auth_controller.dart';

class PolicyApi extends ApiClient {
  PolicyApi({this.required = false})
    : super(
        TokenStore(origin: 'test'),
        baseUrl: 'https://example.org/api/v1/admin-app',
      );
  bool required;
  int attempts = 0;
  @override
  Future<bool> restoreSession() async => false;
  @override
  Future<bool> loginSecurity() async => required;
  @override
  Future<void> login(String username, String password, String proof) async {
    attempts++;
    if (password == 'correct') return;
    required = attempts >= 2;
    throw ApiException(
      '密码错误',
      code: 'invalid_credentials',
      statusCode: 401,
      captchaRequired: required,
    );
  }
}

void main() {
  test(
    'server requirement controls restoration and escalation after two failures',
    () async {
      final api = PolicyApi();
      final container = ProviderContainer(
        overrides: [apiClientProvider.overrideWithValue(api)],
      );
      addTearDown(() {
        container.dispose();
        api.dispose();
      });
      final auth = container.read(authControllerProvider.notifier);
      await pumpEventQueue();
      expect(container.read(authControllerProvider).captchaRequired, isFalse);
      expect(await auth.login('owner', 'wrong', ''), isFalse);
      expect(container.read(authControllerProvider).captchaRequired, isFalse);
      expect(await auth.login('owner', 'wrong', ''), isFalse);
      expect(container.read(authControllerProvider).captchaRequired, isTrue);
      expect(await auth.login('owner', 'correct', ''), isFalse);
      expect(api.attempts, 2);
      expect(await auth.login('owner', 'correct', 'verified-proof'), isTrue);
      expect(
        container.read(authControllerProvider).status,
        AuthStatus.signedIn,
      );
    },
  );

  test(
    'a reopened app respects the existing server requirement immediately',
    () async {
      final api = PolicyApi(required: true);
      final container = ProviderContainer(
        overrides: [apiClientProvider.overrideWithValue(api)],
      );
      addTearDown(() {
        container.dispose();
        api.dispose();
      });
      final auth = container.read(authControllerProvider.notifier);
      await pumpEventQueue();
      expect(container.read(authControllerProvider).captchaRequired, isTrue);
      expect(await auth.login('different-owner', 'correct', ''), isFalse);
      expect(api.attempts, 0);
    },
  );
}
