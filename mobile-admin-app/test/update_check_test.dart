import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:into_youth_admin/core/config/app_config.dart';
import 'package:into_youth_admin/core/update/update_service.dart';
import 'package:into_youth_admin/features/settings/settings_screen.dart';

class ManifestAdapter implements HttpClientAdapter {
  ManifestAdapter(this.body);
  final Map<String, dynamic> body;
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode(body),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const url = 'https://photos.example.com/downloads/admin-app/version.json';
  setUp(() {
    PackageInfo.setMockInitialValues(
      appName: 'Test',
      packageName: 'org.memoryarchive.admin.secure',
      version: '1.5.1',
      buildNumber: '15',
      buildSignature: 'test',
    );
    AppConfig.connection = const SiteConnection(
      'https://photos.example.com',
      updateUrl: url,
    );
  });
  tearDown(() => AppConfig.connection = null);
  UpdateService service(ManifestAdapter adapter) =>
      UpdateService(dio: Dio()..httpClientAdapter = adapter);
  Map<String, dynamic> manifest({int code = 16}) => {
    'version': code == 16 ? '1.6.0' : '1.5.1',
    'versionCode': code,
    'packageName': 'org.memoryarchive.admin.secure',
    'apkUrl': 'https://photos.example.com/admin.apk',
    'sha256': 'a' * 64,
  };

  test(
    'an empty override discovers the update directly from the selected server',
    () async {
      AppConfig.connection = const SiteConnection('https://photos.example.com');
      final adapter = ManifestAdapter(manifest());
      final result = await service(adapter).check();
      expect(result.hasUpdate, isTrue);
      expect(result.sourceName, '本站服务器');
      expect(
        adapter.requests.single.uri.path,
        '/downloads/admin-app/version.json',
      );
    },
  );
  test('1.5.1 detects code 16 and bypasses a cached manifest URL', () async {
    final adapter = ManifestAdapter(manifest());
    final updater = service(adapter);
    final result = await updater.check();
    expect(result.currentBuild, 15);
    expect(result.hasUpdate, isTrue);
    expect(result.manifest!.versionName, '1.6.0');
    final first = adapter.requests.single;
    expect(first.uri.origin, 'https://photos.example.com');
    expect(first.uri.path, '/downloads/admin-app/version.json');
    expect(first.uri.queryParameters['_updateCheck'], isNotEmpty);
    expect(first.headers['Cache-Control'], 'no-cache');
    expect(first.headers['Pragma'], 'no-cache');
    await updater.check();
    expect(adapter.requests.last.uri.query, isNot(first.uri.query));
  });
  test('matching manifest reports the actual server version', () async {
    final result = await service(ManifestAdapter(manifest(code: 15))).check();
    expect(result.hasUpdate, isFalse);
    expect(result.manifest!.versionCode, 15);
  });
  test(
    'a manifest without version information cannot claim no update',
    () async {
      await expectLater(
        service(
          ManifestAdapter({'packageName': 'org.memoryarchive.admin.secure'}),
        ).check(),
        throwsFormatException,
      );
    },
  );
  testWidgets(
    'existing blank update settings offer the server update without configuration',
    (tester) async {
      AppConfig.connection = const SiteConnection('https://photos.example.com');
      final adapter = ManifestAdapter(manifest());
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: AppUpdateCard(service: service(adapter))),
        ),
      );
      await tester.tap(find.text('检查更新'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('从服务器获取更新'));
      await tester.pumpAndSettle();
      expect(find.text('发现新版本 1.6.0'), findsOneWidget);
      expect(find.text('更新来源：本站服务器'), findsOneWidget);
      expect(find.textContaining('当前已是最新版本'), findsNothing);
      expect(find.text('站点与高级设置'), findsOneWidget);
      expect(adapter.requests, hasLength(1));
      await tester.tap(find.text('稍后'));
      await tester.pumpAndSettle();
    },
  );
  testWidgets('configured 1.5.1 offers the actual 1.6.0 update', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AppUpdateCard(service: service(ManifestAdapter(manifest()))),
        ),
      ),
    );
    await tester.tap(find.text('检查更新'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('从服务器获取更新'));
    await tester.pumpAndSettle();
    expect(find.text('发现新版本 1.6.0'), findsOneWidget);
    expect(find.text('下载更新'), findsOneWidget);
    expect(find.text('GitHub Release'), findsNothing);
    await tester.tap(find.text('稍后'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'a completed check shows local version, remote version and source',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AppUpdateCard(
              service: service(ManifestAdapter(manifest(code: 15))),
            ),
          ),
        ),
      );
      await tester.tap(find.text('检查更新'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('从服务器获取更新'));
      await tester.pumpAndSettle();
      expect(find.textContaining('服务器版本 1.5.1+15'), findsOneWidget);
      expect(find.text('更新来源：本站服务器'), findsOneWidget);
    },
  );
}
