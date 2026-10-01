import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/providers.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/connection/site_screen.dart';
import 'features/shell/admin_shell.dart';

class IntoYouthAdminApp extends ConsumerWidget {
  const IntoYouthAdminApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final site = ref.watch(siteConnectionProvider);
    return MaterialApp(
      title: '我的站点管理',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: site == null
          ? const SiteScreen()
          : _AuthHome(key: ValueKey(site.origin)),
    );
  }
}

class _AuthHome extends ConsumerWidget {
  const _AuthHome({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      switch (ref.watch(authControllerProvider).status) {
        AuthStatus.checking => const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        ),
        AuthStatus.signedOut => const LoginScreen(),
        AuthStatus.signedIn => const AdminShell(),
      };
}
