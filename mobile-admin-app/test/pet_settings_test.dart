import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/features/pet/pet_settings_screen.dart';

class FakePetRepository implements PetSettingsRepository {
  Map<String, dynamic>? saved;
  String? savedKey;
  bool fail = false;
  final settings = <String, dynamic>{
    'name': '墨灵',
    'character': 'moling',
    'systemPrompt': '自己的墨灵人设',
    'model': 'deepseek-flash',
    'maxTokens': 5000,
    'maxFPS': 30,
    'tones': {'moling': '温柔', 'miku': '元气'},
    'lines': {
      'guest': ['欢迎'],
    },
    'size': 267,
    'opacity': .8,
    'enabled': true,
  };
  @override
  Future<Map<String, dynamic>> load() async => {
    'settings': settings,
    'keyMask': 'sk-****demo',
  };
  @override
  Future<Map<String, dynamic>> save(
    Map<String, dynamic> value,
    String key,
  ) async {
    if (fail) throw Exception('连接失败');
    saved = value;
    savedKey = key;
    return {'settings': value, 'keyMask': 'sk-****demo'};
  }
}

void main() {
  Future<FakePetRepository> open(WidgetTester tester) async {
    final repo = FakePetRepository();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [petSettingsRepositoryProvider.overrideWithValue(repo)],
        child: const MaterialApp(home: PetSettingsScreen()),
      ),
    );
    await tester.pumpAndSettle();
    return repo;
  }

  Future<void> save(WidgetTester tester) async {
    await tester.scrollUntilVisible(
      find.text('保存助手设置'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('保存助手设置'));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'saves native settings, preserves unedited parameters and clears new key',
    (tester) async {
      final repo = await open(tester);
      expect(find.text('AI 助手设置'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.widgetWithText(TextFormField, '输出上限'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, '输出上限'),
        '10000',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, '新的 DeepSeek API Key'),
        'fixture-key-123456',
      );
      await save(tester);
      expect(repo.saved!['maxTokens'], 10000);
      expect(repo.saved!['size'], 267);
      expect(repo.saved!['lines'], repo.settings['lines']);
      expect(repo.savedKey, 'fixture-key-123456');
      expect(find.text('助手设置已保存'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.widgetWithText(TextFormField, '新的 DeepSeek API Key'),
        -200,
        scrollable: find.byType(Scrollable).first,
      );
      final field = tester.widget<TextFormField>(
        find.widgetWithText(TextFormField, '新的 DeepSeek API Key'),
      );
      expect(field.controller!.text, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'invalid output budget stops API calls and failed saves keep edits',
    (tester) async {
      final repo = await open(tester);
      await tester.scrollUntilVisible(
        find.widgetWithText(TextFormField, '输出上限'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, '输出上限'),
        '10001',
      );
      await save(tester);
      expect(repo.saved, isNull);
      await tester.scrollUntilVisible(
        find.widgetWithText(TextFormField, '输出上限'),
        -200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, '输出上限'),
        '6000',
      );
      repo.fail = true;
      await save(tester);
      expect(find.textContaining('保存失败'), findsOneWidget);
      expect(repo.saved, isNull);
      expect(tester.takeException(), isNull);
    },
  );
}
