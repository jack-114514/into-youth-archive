import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:into_youth_admin/core/config/app_config.dart';
import 'package:into_youth_admin/core/config/site_store.dart';
import 'package:into_youth_admin/core/security/token_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('site URL normalizes and derives APIs from the selected origin', () {
    final site = SiteConnection.parse(' https://Photos.Example.org/ ');
    expect(site.origin, 'https://photos.example.org');
    expect(site.apiBaseUrl, 'https://photos.example.org/api/v1/admin-app');
    expect(
      SiteConnection.parse('https://example.org:8443').origin,
      'https://example.org:8443',
    );
  });
  test('rejects HTTP, credentials, protocol-relative and path/query URLs', () {
    for (final url in [
      'http://example.org',
      '//example.org',
      'https://user:pass@example.org',
      'https://example.org/admin',
      'https://example.org?key=secret',
      'https://example.org#admin',
      'javascript:alert(1)',
      'https://example.org:70000',
      r'https://example.org\evil',
    ]) {
      expect(
        () => SiteConnection.parse(url),
        throwsFormatException,
        reason: url,
      );
    }
    expect(
      () => SiteConnection.parse(
        'https://example.org',
        updateUrl: 'https://other.example.org/version.json',
      ),
      throwsFormatException,
    );
  });
  test(
    'tokens are isolated by site; logout keeps connection settings',
    () async {
      FlutterSecureStorage.setMockInitialValues({});
      const settings = SiteStore();
      final a = TokenStore(origin: 'https://a.example.org');
      final b = TokenStore(origin: 'https://b.example.org');
      await settings.write(SiteConnection.parse('https://a.example.org'));
      await a.write(
        const SessionTokens(accessToken: 'a-access', refreshToken: 'a-refresh'),
      );
      expect(await b.read(), isNull);
      await b.write(
        const SessionTokens(accessToken: 'b-access', refreshToken: 'b-refresh'),
      );
      await a.clear();
      expect(await a.read(), isNull);
      expect((await b.read())!.accessToken, 'b-access');
      expect((await settings.read())!.origin, 'https://a.example.org');
    },
  );
  test(
    'switching sites discards pending token writes from the old client',
    () async {
      FlutterSecureStorage.setMockInitialValues({});
      final a = TokenStore(origin: 'https://a.example.org');
      final pending = a.write(
        const SessionTokens(accessToken: 'old', refreshToken: 'old-refresh'),
      );
      await a.deactivate();
      await pending;
      await a.write(
        const SessionTokens(accessToken: 'late', refreshToken: 'late-refresh'),
      );
      expect(await TokenStore(origin: 'https://a.example.org').read(), isNull);
    },
  );
}
