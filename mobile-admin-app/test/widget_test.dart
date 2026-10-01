import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/app.dart';

void main() {
  testWidgets('shows a safe configuration boundary without runtime URLs', (
    tester,
  ) async {
    await tester.pumpWidget(const ProviderScope(child: IntoYouthAdminApp()));

    expect(find.text('连接你的站点'), findsOneWidget);
    expect(find.text('网站地址'), findsOneWidget);
    expect(find.text('连接并保存'), findsOneWidget);
  });
}
