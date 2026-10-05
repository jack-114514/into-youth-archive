import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/core/network/api_client.dart';
import 'package:into_youth_admin/core/providers.dart';
import 'package:into_youth_admin/core/security/token_store.dart';
import 'package:into_youth_admin/features/settings/admin_fields.dart';
import 'package:into_youth_admin/features/settings/full_settings_screen.dart';

class FakeManagementApi extends ApiClient {
  FakeManagementApi()
    : super(
        TokenStore(origin: 'fixture'),
        baseUrl: 'https://example.invalid/api/v1/admin-app',
      );
  Map<String, dynamic>? saved;
  String? path;
  bool fail = false;
  final values = <String, dynamic>{
    for (final field in adminFields) field['key'] as String: field['value'],
    'site_title': 'Existing name',
    'timeline_items': '[{"date":"NOW","title":"Existing story","text":"Original body","extra":"keep"}]',
    'contact_custom_links':
        '[{"label":"Existing link","url":"https://example.org","id":"keep"}]',
    'home_card_order': '[]',
    'home_card_visibility': '{}',
    'home_card_aspects': '{}',
    'home_card_crops': '{}',
    'music_playlist': '[]',
  };
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    Map<String, dynamic>? query,
    bool retry = true,
  }) async => {
    'settings': values,
    'nodes': [
      {
        'id': 71,
        'title': 'Existing node',
        'subtitle': 'OLD',
        'enabled': 1,
        'sort_order': 1,
      },
    ],
  };
  @override
  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    if (fail) throw Exception('fixture offline');
    this.path = path;
    saved = body;
    return {'ok': true, 'changed': body.keys.toList()};
  }
}

void main() {
  Future<FakeManagementApi> open(
    WidgetTester tester,
    String group, {
    Size? size,
  }) async {
    if (size != null) {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
    }
    final api = FakeManagementApi();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(api)],
        child: MaterialApp(home: FullSettingsScreen(group: group)),
      ),
    );
    await tester.pumpAndSettle();
    return api;
  }

  testWidgets('basic form sends only edits and preserves other content', (
    tester,
  ) async {
    final api = await open(tester, '网站基础');
    await tester.enterText(
      find.widgetWithText(TextFormField, '网站名称'),
      'Changed name',
    );
    await tester.tap(find.text('保存网站基础'));
    await tester.pumpAndSettle();
    expect(api.saved, {'site_title': 'Changed name'});
    expect(find.text('已保存，网站同步生效'), findsOneWidget);
  });
  testWidgets('timeline edits use rows and preserve unknown fields', (
    tester,
  ) async {
    final api = await open(tester, '网站基础');
    await tester.scrollUntilVisible(
      find.widgetWithText(TextFormField, '正文'),
      350,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, '正文'),
      'New body',
    );
    await tester.tap(find.text('保存网站基础'));
    await tester.pumpAndSettle();
    final rows = jsonDecode(api.saved!['timeline_items'] as String) as List;
    expect(rows.first['text'], 'New body');
    expect(rows.first['extra'], 'keep');
  });
  testWidgets('failed save keeps the local draft', (tester) async {
    final api = await open(tester, '网站基础');
    api.fail = true;
    await tester.enterText(
      find.widgetWithText(TextFormField, '网站名称'),
      'Keep draft',
    );
    await tester.tap(find.text('保存网站基础'));
    await tester.pumpAndSettle();
    expect(find.text('Keep draft'), findsOneWidget);
    expect(api.saved, isNull);
  });
  testWidgets('opening retains existing nodes in its save payload', (
    tester,
  ) async {
    final api = await open(tester, '首页开场');
    await tester.scrollUntilVisible(
      find.widgetWithText(TextFormField, '开场标题'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, '开场标题'),
      'New opening',
    );
    await tester.tap(find.text('保存首页开场'));
    await tester.pumpAndSettle();
    expect(api.path, '/homepage-intro');
    expect((api.saved!['settings'] as Map)['intro_title'], 'New opening');
    expect((api.saved!['nodes'] as List).first['id'], 71);
  });
  for (final group in [
    '网站基础',
    '首页与栏目图片',
    '文字与排版',
    '首页开场',
    '3D 与动效',
    '音乐',
    '联系与应用',
  ]) {
    testWidgets('$group opens on a narrow phone without layout exceptions', (
      tester,
    ) async {
      await open(tester, group, size: const Size(320, 640));
      expect(tester.takeException(), isNull);
    });
  }
}
