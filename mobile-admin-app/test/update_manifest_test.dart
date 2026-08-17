import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/core/update/update_service.dart';

void main() {
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
