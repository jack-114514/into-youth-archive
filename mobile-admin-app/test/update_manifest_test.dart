import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/core/update/update_service.dart';

void main() {
  test('decodes a GitHub release manifest returned as plain text', () {
    final payload = decodeUpdateManifestPayload(
      '{"version":"1.0.6","versionCode":7,"patches":[]}',
    );

    expect(payload['version'], '1.0.6');
    expect(payload['versionCode'], 7);
  });

  test('decodes an already parsed manifest map', () {
    final payload = decodeUpdateManifestPayload({
      'version': '1.0.6',
      'versionCode': 7,
    });

    expect(payload['version'], '1.0.6');
    expect(payload['versionCode'], 7);
  });

  test('rejects a non-object manifest payload', () {
    expect(
      () => decodeUpdateManifestPayload('[1,2,3]'),
      throwsA(isA<FormatException>()),
    );
  });

  test('selects only the patch matching the installed version code', () {
    final hashA = List.filled(64, 'a').join();
    final hashB = List.filled(64, 'b').join();
    final manifest = UpdateManifest.fromJson({
      'version': '1.0.4',
      'versionCode': 5,
      'apkUrl': 'https://example.com/app.apk',
      'sha256': hashB,
      'apkSize': 50000000,
      'patches': [
        {
          'fromVersionCode': 4,
          'fromSha256': hashA,
          'url': 'https://example.com/1.0.3-to-1.0.4.iydpatch',
          'sha256': hashB,
          'size': 1000000,
        },
      ],
    });

    expect(manifest.patchFor(4)?.size, 1000000);
    expect(manifest.patchFor(3), isNull);
    expect(manifest.apkSize, 50000000);
  });

  test('ignores insecure or malformed patches', () {
    final hash = List.filled(64, 'a').join();
    final manifest = UpdateManifest.fromJson({
      'version': '1.0.4',
      'versionCode': 5,
      'apkUrl': 'https://example.com/app.apk',
      'sha256': hash,
      'patches': [
        {
          'fromVersionCode': 4,
          'fromSha256': hash,
          'url': 'http://example.com/update.iydpatch',
          'sha256': hash,
          'size': 10,
        },
      ],
    });

    expect(manifest.patches, isEmpty);
  });
}
