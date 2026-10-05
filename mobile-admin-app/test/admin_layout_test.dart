import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/core/providers.dart';
import 'package:into_youth_admin/core/theme/app_theme.dart';
import 'package:into_youth_admin/features/settings/full_settings_screen.dart';
import 'package:into_youth_admin/features/settings/settings_layout.dart';
import 'package:into_youth_admin/features/settings/admin_fields.dart';
import 'package:into_youth_admin/features/shell/admin_navigation.dart';
import 'package:into_youth_admin/features/dashboard/dashboard_screen.dart';

import 'admin_parity_test.dart' show FakeManagementApi;

class LayoutApi extends FakeManagementApi {
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    Map<String, dynamic>? query,
    bool retry = true,
  }) async => path == '/status'
      ? {'server_time': '2026-10-05T06:00:00.123456+00:00'}
      : super.getJson(path, query: query, retry: retry);
}

void main() {
  test('saved card order deduplicates valid entries and preserves missing defaults', () {
    final order = uniqueHomeCardOrder([
      'home_card_about_image',
      'home_card_about_image',
      'unknown',
      'home_card_notes_image',
    ]);
    expect(order.length, 7);
    expect(order.take(2), ['home_card_about_image', 'home_card_notes_image']);
    expect(order.toSet().length, 7);
  });
  test(
    'each image control is owned once and stays in the same website section',
    () {
      final related = imageRelatedFields.values.expand((v) => v).toList();
      expect(related.length, related.toSet().length);
      for (final entry in imageRelatedFields.entries) {
        final image = adminFields.firstWhere((f) => f['key'] == entry.key);
        for (final key in entry.value) {
          final control = adminFields.firstWhere((f) => f['key'] == key);
          expect(fieldSection(control), fieldSection(image), reason: key);
        }
      }
    },
  );
  Future<LayoutApi> open(
    WidgetTester tester,
    String section, {
    Size size = const Size(390, 844),
    double scale = 1,
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = LayoutApi();
    api.values['home_card_order'] = '["home_card_about_image","home_card_about_image","home_card_timeline_image"]';
    api.values['home_card_crops'] = '{"home_card_timeline_image":{"left":12}}';
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(api)],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: MediaQuery(
            data: MediaQueryData(
              size: size,
              textScaler: TextScaler.linear(scale),
            ),
            child: FullSettingsScreen(
              group: sectionLabel(section),
              section: section,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return api;
  }

  testWidgets(
    'image, visibility, crop and aspect share one card; duplicates render once',
    (tester) async {
      await open(tester, 'images');
      final card = find.byKey(const ValueKey('card-home_card_about_image'));
      await tester.scrollUntilVisible(
        card,
        400,
        scrollable: find.byType(Scrollable).first,
      );
      expect(card, findsOneWidget);
      for (final finder in [
        find.widgetWithText(TextFormField, '关于我们入口图片'),
        find.text('在首页显示此栏目'),
        find.text('调整图片取景'),
        find.text('栏目图片比例'),
      ]) {
        expect(find.descendant(of: card, matching: finder), findsOneWidget);
      }
      final image = find.descendant(
        of: card,
        matching: find.widgetWithText(TextFormField, '关于我们入口图片'),
      );
      final aspect = find.descendant(
        of: card,
        matching: find.byType(DropdownButtonFormField<String>),
      );
      expect(
        tester.getTopLeft(aspect).dy,
        greaterThan(tester.getTopLeft(image).dy),
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'card controls save only that card and retain unrelated crop data',
    (tester) async {
      final api = await open(tester, 'about');
      final card = find.byKey(const ValueKey('card-home_card_about_image'));
      await tester.scrollUntilVisible(
        card,
        300,
        scrollable: find.byType(Scrollable).first,
      );
      final aspect = find.descendant(
        of: card,
        matching: find.byType(DropdownButtonFormField<String>),
      );
      await tester.ensureVisible(aspect);
      await tester.pumpAndSettle();
      await tester.tap(aspect);
      await tester.pumpAndSettle();
      await tester.tap(find.text('4:3').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('保存关于我们'));
      await tester.pumpAndSettle();
      expect(jsonDecode(api.saved!['home_card_aspects'] as String), {
        'home_card_about_image': '4:3',
      });
      expect(api.saved!.containsKey('home_card_crops'), isFalse);
      expect(tester.takeException(), isNull);
    },
  );
  for (final entry in {
    'home_background_url': 'images',
    'intro_background_desktop_image': 'intro',
    'intro_background_mobile_image': 'intro',
  }.entries) {
    testWidgets(
      '${entry.key} places all owned adjustments under its own image',
      (tester) async {
        await open(tester, entry.value);
        final panel = find.byKey(ValueKey('image-${entry.key}'));
        await tester.scrollUntilVisible(
          panel,
          400,
          scrollable: find.byType(Scrollable).first,
        );
        for (final key in imageRelatedFields[entry.key]!) {
          final label =
              adminFields.firstWhere((f) => f['key'] == key)['label'] as String;
          expect(
            find.descendant(of: panel, matching: find.text(label)),
            findsWidgets,
          );
        }
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'narrow phone and enlarged text have no form overflow; keyboard keeps save reachable',
    (tester) async {
      await open(tester, 'images', size: const Size(320, 700), scale: 1.5);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('card-home_card_about_image')),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      tester.view.viewInsets = const FakeViewPadding(bottom: 280);
      await tester.pumpAndSettle();
      expect(find.text('保存内容概览'), findsOneWidget);
      expect(tester.getBottomLeft(find.text('保存内容概览')).dy, lessThan(700));
      expect(tester.takeException(), isNull);
      tester.view.resetViewInsets();
    },
  );
  testWidgets(
    'dashboard long server timestamp wraps on a narrow phone with enlarged text',
    (tester) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [apiClientProvider.overrideWithValue(LayoutApi())],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.linear(1.5)),
              child: Scaffold(body: DashboardScreen()),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('2026-10-05T06:00:00.123456+00:00'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(tester.takeException(), isNull);
    },
  );
}
