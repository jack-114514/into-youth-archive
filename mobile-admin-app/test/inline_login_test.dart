import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:into_youth_admin/core/config/app_config.dart';
import 'package:into_youth_admin/features/auth/auth_controller.dart';
import 'package:into_youth_admin/features/auth/inline_turnstile.dart';
import 'package:into_youth_admin/features/auth/login_screen.dart';

class TestAuth extends AuthController {
  final calls = <List<String>>[];
  @override
  AuthState build() =>
      const AuthState(status: AuthStatus.signedOut, captchaRequired: true);
  @override
  Future<bool> login(String username, String password, String proof) async {
    calls.add([username, password, proof]);
    state = AuthState(
      status: AuthStatus.signedOut,
      message: '账号或密码错误',
      captchaRequired: proof.isNotEmpty || calls.length >= 2,
    );
    return false;
  }
}

class FreeAuth extends TestAuth {
  @override
  AuthState build() =>
      const AuthState(status: AuthStatus.signedOut, captchaRequired: false);
}

class UnknownPolicyAuth extends TestAuth {
  @override
  AuthState build() => const AuthState(status: AuthStatus.signedOut);
}

void main() {
  setUp(
    () => AppConfig.connection = SiteConnection.parse('https://example.org'),
  );
  tearDown(() => AppConfig.connection = null);
  late ValueChanged<String?> verified;
  Future<void> mount(WidgetTester tester, TestAuth auth) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authControllerProvider.overrideWith(() => auth),
          inlineVerificationBuilderProvider.overrideWithValue((
            context,
            callback,
          ) {
            verified = callback;
            return const Text('内嵌 Cloudflare 验证框');
          }),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextFormField).at(0),
      'owner@example.org',
    );
    await tester.enterText(
      find.byType(TextFormField).at(1),
      'test-only-password',
    );
    await tester.ensureVisible(find.text('安全登录'));
  }

  FilledButton button(WidgetTester tester) =>
      tester.widget(find.byType(FilledButton));

  testWidgets(
    'first two password failures do not create a WebView; third needs verification',
    (tester) async {
      final auth = FreeAuth();
      await mount(tester, auth);
      expect(find.text('内嵌 Cloudflare 验证框'), findsNothing);
      expect(button(tester).onPressed, isNotNull);
      await tester.tap(find.text('安全登录'));
      await tester.pumpAndSettle();
      expect(auth.calls.single.last, '');
      expect(find.text('内嵌 Cloudflare 验证框'), findsNothing);
      expect(button(tester).onPressed, isNotNull);
      await tester.tap(find.text('安全登录'));
      await tester.pumpAndSettle();
      expect(auth.calls, hasLength(2));
      expect(find.text('内嵌 Cloudflare 验证框'), findsOneWidget);
      expect(button(tester).onPressed, isNull);
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(auth.calls, hasLength(2));
      verified('third-attempt-proof');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('安全登录'));
      await tester.tap(find.text('安全登录'));
      await tester.pumpAndSettle();
      expect(auth.calls.last.last, 'third-attempt-proof');
      expect(button(tester).onPressed, isNull);
    },
  );

  testWidgets('unknown server policy cannot submit a password', (tester) async {
    final auth = UnknownPolicyAuth();
    await mount(tester, auth);
    expect(button(tester).onPressed, isNull);
    expect(find.text('内嵌 Cloudflare 验证框'), findsNothing);
    await tester.testTextInput.receiveAction(TextInputAction.done);
    expect(auth.calls, isEmpty);
  });

  testWidgets(
    'inline verification precedes disabled login; keyboard cannot submit',
    (tester) async {
      final auth = TestAuth();
      await mount(tester, auth);
      expect(find.text('内嵌 Cloudflare 验证框'), findsOneWidget);
      expect(button(tester).onPressed, isNull);
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(auth.calls, isEmpty);
      expect(find.byType(LoginScreen), findsOneWidget);
    },
  );

  testWidgets(
    'verified session enables only explicit login and is consumed after wrong password',
    (tester) async {
      final auth = TestAuth();
      await mount(tester, auth);
      verified('test-proof');
      await tester.pumpAndSettle();
      expect(button(tester).onPressed, isNotNull);
      expect(auth.calls, isEmpty);
      await tester.tap(find.text('安全登录'));
      await tester.pumpAndSettle();
      expect(auth.calls.single, [
        'owner@example.org',
        'test-only-password',
        'test-proof',
      ]);
      expect(button(tester).onPressed, isNull);
      expect(find.text('账号或密码错误'), findsOneWidget);
      await tester.testTextInput.receiveAction(TextInputAction.done);
      expect(auth.calls, hasLength(1));
    },
  );

  testWidgets('expired or failed verification disables password checking', (
    tester,
  ) async {
    final auth = TestAuth();
    await mount(tester, auth);
    verified('test-proof');
    await tester.pumpAndSettle();
    verified(null);
    await tester.pumpAndSettle();
    expect(button(tester).onPressed, isNull);
    await tester.testTextInput.receiveAction(TextInputAction.done);
    expect(auth.calls, isEmpty);
  });

  testWidgets('old site callback cannot enable another site login', (
    tester,
  ) async {
    final auth = TestAuth();
    await mount(tester, auth);
    final oldCallback = verified;
    AppConfig.connection = SiteConnection.parse(
      'https://different.example.org',
    );
    oldCallback('old-site-proof');
    await tester.pumpAndSettle();
    expect(button(tester).onPressed, isNull);
    await tester.testTextInput.receiveAction(TextInputAction.done);
    expect(auth.calls, isEmpty);
  });

  test('Cloudflare internal frames are allowed without unrelated top-level navigation', () {
    final page = Uri.parse(
      'https://example.org/api/v1/admin-app/auth/challenge?flow=abc&inline=1',
    );
    expect(
      allowVerificationNavigation(Uri.parse('about:blank'), page, false),
      isTrue,
    );
    expect(
      allowVerificationNavigation(Uri.parse('about:srcdoc'), page, false),
      isTrue,
    );
    expect(
      allowVerificationNavigation(
        Uri.parse('https://challenges.cloudflare.com/frame'),
        page,
        false,
      ),
      isTrue,
    );
    expect(
      allowVerificationNavigation(
        Uri.parse('https://challenges.cloudflare.com/frame'),
        page,
        true,
      ),
      isFalse,
    );
    expect(allowVerificationNavigation(page, page, true), isTrue);
    expect(
      allowVerificationNavigation(
        Uri.parse('https://attacker.example.org/'),
        page,
        false,
      ),
      isFalse,
    );
    expect(
      allowVerificationNavigation(Uri.parse('http://example.org/'), page, true),
      isFalse,
    );
    expect(
      allowVerificationNavigation(
        Uri.parse('file:///data/site.db'),
        page,
        true,
      ),
      isFalse,
    );
  });
}
