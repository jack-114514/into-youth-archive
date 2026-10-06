import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/core/providers.dart';
import 'package:into_youth_admin/features/auth/inline_turnstile.dart';
import 'package:into_youth_admin/features/media/media_screen.dart';
import 'package:into_youth_admin/features/settings/admin_fields.dart';
import 'package:into_youth_admin/features/settings/full_settings_screen.dart';
import 'package:into_youth_admin/features/shell/admin_navigation.dart';
import 'package:into_youth_admin/features/shell/admin_shell.dart';

import 'admin_parity_test.dart' show FakeManagementApi;

class NavigationApi extends FakeManagementApi {
  final requests = <String>[];
  Map<String, dynamic>? created;
  final rows = [
    {
      'id': 1,
      'title': 'Story only',
      'show_in_stories': 1,
      'show_in_3d': 0,
      'show_on_home': 0,
    },
    {
      'id': 2,
      'title': 'Tree only',
      'show_in_stories': 0,
      'show_in_3d': 1,
      'show_on_home': 0,
    },
    {
      'id': 3,
      'title': 'Campus only',
      'show_in_stories': 0,
      'show_in_3d': 0,
      'show_on_home': 1,
    },
  ];
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    Map<String, dynamic>? query,
    bool retry = true,
  }) async {
    requests.add(path);
    if (path == '/status') return {};
    if (path == '/media') return {'media': rows};
    if (path == '/pet') {
      return {
        'settings': {
          'name': '墨灵',
          'character': 'moling',
          'model': 'deepseek-flash',
          'maxTokens': 5000,
          'maxFPS': 30,
          'enabled': true,
          'tones': {},
          'lines': {},
        },
        'keyMask': '',
      };
    }
    return super.getJson(path, query: query, retry: retry);
  }

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    created = body;
    return {'ok': true};
  }
}

void main() {
  Future<NavigationApi> open(WidgetTester tester, {Widget? home}) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = NavigationApi();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(api),
          inlineVerificationBuilderProvider.overrideWithValue(
            (_, _) => const Text('Fixture verification'),
          ),
        ],
        child: MaterialApp(home: home ?? const AdminShell()),
      ),
    );
    await tester.pumpAndSettle();
    return api;
  }

  Future<void> select(WidgetTester tester, String id) async {
    tester.state<ScaffoldState>(find.byType(Scaffold).first).openDrawer();
    await tester.pumpAndSettle();
    final menu = find.byType(AdminMenu);
    await tester.scrollUntilVisible(
      find.byKey(ValueKey('nav-$id')),
      200,
      scrollable: find
          .descendant(of: menu, matching: find.byType(Scrollable))
          .first,
    );
    await tester.tap(find.byKey(ValueKey('nav-$id')));
    await tester.pumpAndSettle();
  }

  testWidgets('opening, pet and account are direct website menu destinations', (
    tester,
  ) async {
    final api = await open(tester);
    await select(tester, 'intro');
    expect(find.text('首页开场'), findsOneWidget);
    expect(api.requests, contains('/homepage-intro'));
    expect(api.requests, isNot(contains('/settings')));
    await select(tester, 'pet');
    expect(find.text('AI 桌宠设置'), findsOneWidget);
    expect(api.requests, contains('/pet'));
    await select(tester, 'account');
    expect(find.text('账号管理'), findsOneWidget);
    expect(find.text('Fixture verification'), findsOneWidget);
    expect(find.text('系统设置'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'menu switching and phone-to-tablet resizing preserve a settings draft',
    (tester) async {
      final api = await open(tester);
      await select(tester, 'notes');
      await tester.tap(find.text('栏目设置'));
      await tester.pumpAndSettle();
      final label =
          adminFields.firstWhere((f) => f['key'] == 'notes_title')['label']
              as String;
      await tester.enterText(
        find.widgetWithText(TextFormField, label),
        'Unsaved note title',
      );
      await select(tester, 'status');
      expect(find.text('放弃尚未保存的修改？'), findsNothing);
      await select(tester, 'notes');
      expect(find.text('Unsaved note title'), findsOneWidget);
      tester.view.physicalSize = const Size(1100, 800);
      await tester.pumpAndSettle();
      expect(find.text('Unsaved note title'), findsOneWidget);
      await tester.tap(find.text('保存随手记'));
      await tester.pumpAndSettle();
      expect(api.saved, {'notes_title': 'Unsaved note title'});
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'website settings excludes content editors and retains music and contacts',
    (tester) async {
      final api = await open(
        tester,
        home: const FullSettingsScreen(group: '网站设置', section: 'settings'),
      );
      expect(find.widgetWithText(TextFormField, '网站名称'), findsOneWidget);
      expect(find.text('时间线节点'), findsNothing);
      expect(find.text('路线节点'), findsNothing);
      expect(find.text('首页开场'), findsNothing);
      await tester.enterText(
        find.widgetWithText(TextFormField, '网站名称'),
        'Global name',
      );
      await tester.tap(find.text('保存网站设置'));
      await tester.pumpAndSettle();
      expect(api.saved, {'site_title': 'Global name'});
      expect(
        fieldInSection(
          adminFields.firstWhere((f) => f['key'] == 'music_default_volume'),
          'settings',
        ),
        isTrue,
      );
      expect(
        fieldInSection(
          adminFields.firstWhere((f) => f['key'] == 'contact_email'),
          'settings',
        ),
        isTrue,
      );
    },
  );

  for (final entry in {
    'media': 'Story only',
    'river': 'Tree only',
    'campus': 'Campus only',
  }.entries) {
    testWidgets(
      '${entry.key} lists only its website media and defaults new records to that section',
      (tester) async {
        final api = await open(tester, home: MediaScreen(section: entry.key));
        expect(find.text(entry.value), findsOneWidget);
        for (final row in api.rows.where((r) => r['title'] != entry.value)) {
          expect(find.text(row['title'] as String), findsNothing);
        }
        await tester.tap(find.text('新增内容'));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.widgetWithText(TextFormField, '原图 / 主视频地址'),
          '/uploads/new.jpg',
        );
        await tester.scrollUntilVisible(
          find.widgetWithText(TextFormField, '标题'),
          200,
          scrollable: find.byType(Scrollable).last,
        );
        await tester.enterText(
          find.widgetWithText(TextFormField, '标题'),
          'New section image',
        );
        await tester.scrollUntilVisible(
          find.text('保存内容'),
          250,
          scrollable: find.byType(Scrollable).last,
        );
        await tester.tap(find.text('保存内容'));
        await tester.pumpAndSettle();
        for (final flag in sectionMediaFlags.entries) {
          expect(api.created![flag.value], flag.key == entry.key);
        }
      },
    );
  }
}
