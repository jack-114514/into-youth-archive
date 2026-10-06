import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/core/providers.dart';
import 'package:into_youth_admin/features/media/media_screen.dart';
import 'package:into_youth_admin/features/notes/notes_screen.dart';

import 'admin_parity_test.dart' show FakeManagementApi;

class JournalApi extends FakeManagementApi {
  final notes = <Map<String, dynamic>>[];
  Map<String, dynamic>? mediaSaved;
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    Map<String, dynamic>? query,
    bool retry = true,
  }) async {
    if (path == '/notes') {
      return {'notes': notes.map(Map<String, dynamic>.from).toList()};
    }
    if (path == '/media') {
      return {
        'media': [
          {
            'id': 1,
            'title': 'Existing photo',
            'url': '/uploads/old.jpg',
            'thumbnail_url': '/uploads/custom.webp',
            'show_on_home': 1,
            'show_in_3d': 0,
            'show_in_stories': 0,
          },
        ],
      };
    }
    return super.getJson(path, query: query, retry: retry);
  }

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    notes.add({'id': 1, ...body});
    return {'id': 1};
  }

  @override
  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    if (path.startsWith('/notes/')) {
      notes[0] = {'id': 1, ...body};
    } else {
      mediaSaved = body;
    }
    return {'ok': true};
  }

  @override
  Future<Map<String, dynamic>> deleteJson(String path) async {
    notes[0]['status'] = 'archived';
    return {'ok': true};
  }
}

void main() {
  Future<JournalApi> open(WidgetTester tester, Widget screen) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = JournalApi();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(api)],
        child: MaterialApp(home: screen),
      ),
    );
    await tester.pumpAndSettle();
    return api;
  }

  Future<void> press(WidgetTester tester, String label) async {
    await tester.ensureVisible(find.text(label).last);
    await tester.tap(find.text(label).last);
    await tester.pumpAndSettle();
  }

  testWidgets(
    'native journal saves a draft, publishes, archives and restores with original text',
    (tester) async {
      final api = await open(tester, const NotesScreen());
      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, '标题'),
        'Phone journal',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, '正文'),
        'First line\n<script>plain text</script>',
      );
      await press(tester, '保存草稿');
      expect(api.notes.single['status'], 'draft');
      await press(tester, '编辑');
      await press(tester, '发布随手记');
      expect(api.notes.single['status'], 'published');
      expect(
        api.notes.single['body'],
        'First line\n<script>plain text</script>',
      );
      await press(tester, '归档');
      await press(tester, '确认归档');
      expect(api.notes.single['status'], 'archived');
      expect(find.text('归档'), findsNothing);
      await press(tester, '编辑');
      await press(tester, '发布随手记');
      expect(api.notes.single['status'], 'published');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'native journal validates empty input and protects an unsaved draft on cancel',
    (tester) async {
      final api = await open(tester, const NotesScreen());
      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();
      await press(tester, '发布随手记');
      expect(find.text('请填写标题'), findsOneWidget);
      expect(api.notes, isEmpty);
      await tester.enterText(
        find.widgetWithText(TextFormField, '标题'),
        'Unsaved draft',
      );
      await press(tester, '取消');
      expect(find.text('放弃未保存的随手记修改？'), findsOneWidget);
      await press(tester, '继续编辑');
      expect(find.text('Unsaved draft'), findsOneWidget);
      await press(tester, '取消');
      await press(tester, '放弃修改');
      expect(api.notes, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );

  for (final changePhoto in [false, true]) {
    testWidgets(
      'native media ${changePhoto ? 'replaces a stale preview when changing a photo' : 'retains a custom preview when editing text'}',
      (tester) async {
        final api = await open(tester, const MediaScreen());
        await tester.tap(find.byTooltip('内容操作').first);
        await tester.pumpAndSettle();
        await press(tester, '编辑');
        if (changePhoto) {
          await tester.enterText(
            find.widgetWithText(TextFormField, '原图 / 主视频地址'),
            '/uploads/new.jpg',
          );
        }
        await tester.scrollUntilVisible(
          find.text('保存内容'),
          250,
          scrollable: find
              .descendant(
                of: find.byType(DraggableScrollableSheet),
                matching: find.byType(Scrollable),
              )
              .first,
        );
        await tester.tap(find.text('保存内容'));
        await tester.pumpAndSettle();
        expect(
          api.mediaSaved?['thumbnail_url'],
          changePhoto ? '' : '/uploads/custom.webp',
        );
        expect(
          api.mediaSaved?['url'],
          changePhoto ? '/uploads/new.jpg' : '/uploads/old.jpg',
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
}
