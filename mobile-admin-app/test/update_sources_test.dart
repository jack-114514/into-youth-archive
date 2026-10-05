import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:into_youth_admin/core/config/app_config.dart';
import 'package:into_youth_admin/core/update/update_service.dart';
import 'package:into_youth_admin/features/settings/settings_screen.dart';

class SourceAdapter implements HttpClientAdapter {
  SourceAdapter(this.routes);
  final Map<String, (int, Object)> routes;
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final route =
        routes['${options.uri.origin}${options.uri.path}'] ?? (404, {});
    if (route.$1 == 302) {
      return ResponseBody.fromString(
        '',
        302,
        headers: {
          'location': [route.$2 as String],
        },
      );
    }
    return ResponseBody.fromString(
      jsonEncode(route.$2),
      route.$1,
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
  const repo = 'example/archive';
  const site = 'https://photos.example.org';
  const api = 'https://api.github.com/repos/$repo/releases/latest';
  const meta = 'https://api.github.com/repos/$repo/releases/assets/1';
  const apk =
      'https://github.com/$repo/releases/download/v3.5.1/memory-archive-admin-v1.7.1.apk';
  final manifest = <String, dynamic>{
    'version': '1.7.1',
    'versionCode': 19,
    'packageName': 'org.memoryarchive.admin.secure',
    'apkUrl': apk,
    'sha256': 'a' * 64,
  };
  Map<String, (int, Object)> githubRoutes() => {
    api: (
      200,
      {
        'draft': false,
        'prerelease': false,
        'assets': [
          {
            'id': 1,
            'name': 'android-version-v1.7.1.json',
            'browser_download_url':
                'https://github.com/$repo/releases/download/v3.5.1/android-version-v1.7.1.json',
          },
          {
            'id': 2,
            'name': 'memory-archive-admin-v1.7.1.apk',
            'browser_download_url': apk,
            'digest': 'sha256:${'a' * 64}',
          },
        ],
      },
    ),
    meta: (200, manifest),
  };
  UpdateService updater(SourceAdapter adapter) => UpdateService(
    dio: Dio()..httpClientAdapter = adapter,
    githubRepository: repo,
  );
  setUp(() {
    PackageInfo.setMockInitialValues(
      appName: 'Test',
      packageName: 'org.memoryarchive.admin.secure',
      version: '1.6.1',
      buildNumber: '17',
      buildSignature: 'test',
    );
    AppConfig.connection = const SiteConnection(site);
  });
  tearDown(() => AppConfig.connection = null);

  test('server selection derives its URL from an existing blank setting and never contacts GitHub', () async {
    final adapter = SourceAdapter({
      '$site/downloads/admin-app/version.json': (200, manifest),
      ...githubRoutes(),
    });
    final result = await updater(adapter).check(source: UpdateSource.server);
    expect(result.hasUpdate, isTrue);
    expect(result.sourceName, '本站服务器');
    expect(adapter.requests, hasLength(1));
    expect(adapter.requests.single.uri.origin, site);
    expect(
      adapter.requests.single.headers.containsKey('Authorization'),
      isFalse,
    );
  });
  test('GitHub selection reads the stable release and matching Android asset without contacting the site', () async {
    final adapter = SourceAdapter(githubRoutes());
    final result = await updater(adapter).check(source: UpdateSource.github);
    expect(result.hasUpdate, isTrue);
    expect(result.manifest!.versionCode, 19);
    expect(result.sourceName, 'GitHub 正式发行');
    expect(adapter.requests, hasLength(2));
    expect(adapter.requests.every((r) => r.uri.origin != site), isTrue);
    expect(
      adapter.requests.every((r) => !r.headers.containsKey('Authorization')),
      isTrue,
    );
  });
  test(
    'server failure remains a failed check and never changes the chosen source',
    () async {
      final adapter = SourceAdapter(githubRoutes());
      await expectLater(
        updater(adapter).check(source: UpdateSource.server),
        throwsA(isA<DioException>()),
      );
      expect(adapter.requests, hasLength(1));
    },
  );
  test('GitHub rejects a mismatched package', () async {
    final routes = githubRoutes();
    routes[meta] = (200, {...manifest, 'packageName': 'org.other.app'});
    await expectLater(
      updater(SourceAdapter(routes)).check(source: UpdateSource.github),
      throwsFormatException,
    );
  });
  test(
    'GitHub rejects a release APK whose digest differs from the manifest',
    () async {
      final routes = githubRoutes();
      routes[meta] = (200, {...manifest, 'sha256': 'b' * 64});
      await expectLater(
        updater(SourceAdapter(routes)).check(source: UpdateSource.github),
        throwsFormatException,
      );
    },
  );
  test(
    'GitHub follows HTTPS asset CDN redirects without leaking site credentials',
    () async {
      final routes = githubRoutes();
      routes[meta] = (
        302,
        'https://release-assets.githubusercontent.com/demo/metadata',
      );
      routes['https://release-assets.githubusercontent.com/demo/metadata'] = (
        200,
        manifest,
      );
      final adapter = SourceAdapter(routes);
      expect(
        (await updater(adapter).check(source: UpdateSource.github)).hasUpdate,
        isTrue,
      );
      expect(adapter.requests, hasLength(3));
      expect(
        adapter.requests.last.headers.containsKey('Authorization'),
        isFalse,
      );
      expect(
        adapter.requests.last.uri.queryParameters.containsKey('_updateCheck'),
        isFalse,
      );
    },
  );
  test(
    'server cross-origin redirects are blocked before sending a second request',
    () async {
      final adapter = SourceAdapter({
        '$site/downloads/admin-app/version.json': (
          302,
          'https://other.example.org/update',
        ),
      });
      await expectLater(updater(adapter).check(), throwsFormatException);
      expect(adapter.requests, hasLength(1));
    },
  );
  test('GitHub does not follow an HTTP or unrelated asset redirect', () async {
    for (final location in [
      'http://github.com/$repo/metadata',
      'https://unrelated.example.org/update',
    ]) {
      final routes = githubRoutes();
      routes[meta] = (302, location);
      final adapter = SourceAdapter(routes);
      await expectLater(
        updater(adapter).check(source: UpdateSource.github),
        throwsFormatException,
      );
      expect(adapter.requests, hasLength(2));
    }
  });
  test('explicit custom server update path remains supported', () async {
    AppConfig.connection = const SiteConnection(
      site,
      updateUrl: '$site/custom/update.json',
    );
    final adapter = SourceAdapter({
      '$site/custom/update.json': (200, manifest),
    });
    expect((await updater(adapter).check()).hasUpdate, isTrue);
    expect(adapter.requests.single.uri.path, '/custom/update.json');
  });
  testWidgets(
    'source chooser has both choices and repository link below them; opening it sends no request',
    (tester) async {
      final adapter = SourceAdapter(githubRoutes());
      final service = updater(adapter);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: AppUpdateCard(service: service)),
        ),
      );
      await tester.tap(find.text('检查更新'));
      await tester.pumpAndSettle();
      expect(find.text('从 GitHub 获取更新'), findsOneWidget);
      expect(find.text('从服务器获取更新'), findsOneWidget);
      final dialog = find.byType(AlertDialog);
      final link = find.descendant(
        of: dialog,
        matching: find.text('前往 GitHub 开源地址'),
      );
      expect(
        tester.getTopLeft(link).dy,
        greaterThan(tester.getTopLeft(find.text('从服务器获取更新')).dy),
      );
      expect(service.sourceRepositoryUrl, 'https://github.com/$repo');
      expect(adapter.requests, isEmpty);
      await tester.tap(find.text('从 GitHub 获取更新'));
      await tester.pumpAndSettle();
      expect(find.text('发现新版本 1.7.1'), findsOneWidget);
      expect(find.text('更新来源：GitHub 正式发行'), findsOneWidget);
      await tester.tap(find.text('稍后'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
}
