import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/app_config.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/shell/admin_shell.dart';

class IntoYouthAdminApp extends ConsumerWidget {
  const IntoYouthAdminApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return MaterialApp(
      title: 'INTO 青春管理',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: !AppConfig.isConfigured
          ? const _MissingConfigurationScreen()
          : switch (auth.status) {
              AuthStatus.checking => const _LaunchScreen(),
              AuthStatus.signedOut => const LoginScreen(),
              AuthStatus.signedIn => const AdminShell(),
            },
    );
  }
}

class _LaunchScreen extends StatelessWidget {
  const _LaunchScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              radius: 30,
              backgroundColor: AppTheme.ink,
              foregroundColor: AppTheme.acid,
              child: Text('IN', style: TextStyle(fontWeight: FontWeight.w900)),
            ),
            SizedBox(height: 20),
            CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}

class _MissingConfigurationScreen extends StatelessWidget {
  const _MissingConfigurationScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.settings_ethernet_rounded, size: 44),
                      const SizedBox(height: 14),
                      Text(
                        '尚未配置 API',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        '请使用 --dart-define=API_BASE_URL=https://example.com/api/v1/admin-app 构建。真实地址不会写入开源仓库。',
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
