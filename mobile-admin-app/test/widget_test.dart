import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/app.dart';

void main() {
  testWidgets('shows a safe configuration boundary without runtime URLs', (
    tester,
  ) async {
    await tester.pumpWidget(const ProviderScope(child: IntoYouthAdminApp()));

    expect(find.text('尚未配置 API'), findsOneWidget);
    expect(find.textContaining('API_BASE_URL'), findsOneWidget);
  });
}
