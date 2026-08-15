import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/app.dart';
import 'package:into_youth_admin/core/config/app_diagnostics.dart';
import 'package:into_youth_admin/features/settings/about_app_card.dart';
import 'package:into_youth_admin/features/settings/permissions_screen.dart';
import 'package:package_info_plus/package_info_plus.dart';

void main() {
  testWidgets('shows a safe configuration boundary without runtime URLs', (
    tester,
  ) async {
    await tester.pumpWidget(const ProviderScope(child: IntoYouthAdminApp()));

    expect(find.text('尚未配置 API'), findsOneWidget);
    expect(find.textContaining('API_BASE_URL'), findsOneWidget);
  });

  testWidgets(
    'permissions page explains the Android minimum-permission model',
    (tester) async {
      await tester.pumpWidget(const MaterialApp(home: PermissionsScreen()));

      expect(find.text('权限管理'), findsOneWidget);
      expect(find.text('网络访问'), findsOneWidget);
      expect(find.text('图片访问'), findsOneWidget);
      expect(find.text('视频访问'), findsOneWidget);
      expect(find.text('文件存储'), findsOneWidget);
      expect(find.text('已授权'), findsNWidgets(4));

      await tester.scrollUntilVisible(
        find.text('打开系统权限设置'),
        280,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('打开系统权限设置'), findsOneWidget);
    },
  );

  testWidgets('about card shows release and open-source information', (
    tester,
  ) async {
    var versionTapCount = 0;
    final package = PackageInfo(
      appName: 'INTO Youth Admin',
      packageName: 'com.example.admin',
      version: '1.0.0',
      buildNumber: '1',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: AboutAppCard(
              packageInfo: Future.value(package),
              onVersionTap: () => versionTapCount += 1,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('关于 App'), findsOneWidget);
    expect(find.text('INTO Youth Admin'), findsOneWidget);
    expect(find.text('1.0.0'), findsOneWidget);
    expect(find.text('GitHub 项目地址'), findsOneWidget);
    expect(find.text('官方网站地址'), findsOneWidget);
    expect(find.text('MIT License'), findsOneWidget);
    expect(find.text('复制诊断信息'), findsOneWidget);

    for (var index = 0; index < 7; index += 1) {
      await tester.tap(find.text('1.0.0'));
    }
    expect(versionTapCount, 7);
  });

  test('diagnostic text contains build metadata but no credentials', () {
    const diagnostics = AppDiagnostics(
      appName: 'INTO Youth Admin',
      version: '1.0.0',
      versionCode: '1',
      packageName: 'com.example.admin',
    );

    final text = diagnostics.toClipboardText();
    expect(text, contains('Git Commit:'));
    expect(text, contains('API Environment:'));
    expect(text.toLowerCase(), isNot(contains('token')));
    expect(text.toLowerCase(), isNot(contains('password')));
    expect(text.toLowerCase(), isNot(contains('secret')));
  });
}
