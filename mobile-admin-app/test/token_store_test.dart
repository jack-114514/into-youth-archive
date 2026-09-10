import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/core/security/token_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  test('session tokens survive a new TokenStore instance', () async {
    final firstInstance = TokenStore();
    await firstInstance.write(
      const SessionTokens(
        accessToken: 'persisted-access',
        refreshToken: 'persisted-refresh',
      ),
    );

    final restored = await TokenStore().read();

    expect(restored?.accessToken, 'persisted-access');
    expect(restored?.refreshToken, 'persisted-refresh');
  });

  test('logout clears only the app session tokens', () async {
    FlutterSecureStorage.setMockInitialValues({'unrelated-setting': 'keep'});
    const storage = FlutterSecureStorage();
    final tokenStore = TokenStore(storage: storage);
    await tokenStore.write(
      const SessionTokens(
        accessToken: 'access',
        refreshToken: 'refresh',
      ),
    );

    await tokenStore.clear();

    expect(await tokenStore.read(), isNull);
    expect(await storage.read(key: 'unrelated-setting'), 'keep');
  });
}
