import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/core/update/update_service.dart';

void main() {
  test('dedicated APK manifest cannot update the generic app', () {
    final manifest = UpdateManifest.fromJson({
      'packageName': 'com.intoyoutharchive.into_youth_admin',
    });
    expect(
      () => manifest.requirePackage('org.memoryarchive.admin.secure'),
      throwsFormatException,
    );
  });
  test(
    'legacy manifest without a package identity cannot offer a wrong APK',
    () {
      expect(
        () =>
            UpdateManifest.fromJson({})
                .requirePackage('org.memoryarchive.admin.secure'),
        throwsFormatException,
      );
    },
  );
  test('the matching secure app manifest is accepted', () {
    final manifest = UpdateManifest.fromJson({
      'packageName': 'org.memoryarchive.admin.secure',
    });
    expect(
      () => manifest.requirePackage('org.memoryarchive.admin.secure'),
      returnsNormally,
    );
  });
}
