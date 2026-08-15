import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';
import '../comments/comments_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../developer/developer_screen.dart';
import '../media/media_screen.dart';
import '../settings/settings_screen.dart';
import '../submissions/submissions_screen.dart';

class AdminShell extends ConsumerStatefulWidget {
  const AdminShell({super.key});

  @override
  ConsumerState<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends ConsumerState<AdminShell> {
  int _index = 0;
  int _versionTapCount = 0;
  bool _developerMode = false;

  static const _destinations = [
    (label: '概览', icon: Icons.space_dashboard_outlined),
    (label: '内容', icon: Icons.photo_library_outlined),
    (label: '评论', icon: Icons.forum_outlined),
    (label: '投稿', icon: Icons.inbox_outlined),
    (label: '设置', icon: Icons.tune_rounded),
  ];

  List<Widget> get _screens => [
    const DashboardScreen(),
    const MediaScreen(),
    const CommentsScreen(),
    const SubmissionsScreen(),
    SettingsScreen(onVersionTap: _handleVersionTap),
    if (_developerMode) const DeveloperScreen(),
  ];

  void _handleVersionTap() {
    _versionTapCount += 1;
    if (_versionTapCount < 7 || _developerMode) return;
    setState(() {
      _developerMode = true;
      _index = _screens.length - 1;
    });
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('开发者模式已启用')));
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 820;
    final destinations = [
      ..._destinations,
      if (_developerMode) (label: '开发', icon: Icons.developer_mode_outlined),
    ];
    final content = IndexedStack(index: _index, children: _screens);
    if (!wide) {
      return Scaffold(
        appBar: AppBar(
          title: Text(destinations[_index].label),
          backgroundColor: AppTheme.mint,
          actions: [
            IconButton(
              tooltip: '退出登录',
              onPressed: () =>
                  ref.read(authControllerProvider.notifier).logout(),
              icon: const Icon(Icons.logout_rounded),
            ),
          ],
        ),
        drawer: NavigationDrawer(
          selectedIndex: _index,
          onDestinationSelected: (value) {
            setState(() => _index = value);
            Navigator.pop(context);
          },
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(28, 24, 20, 12),
              child: Text(
                'INTO / 青春管理',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
              ),
            ),
            for (final destination in destinations)
              NavigationDrawerDestination(
                icon: Icon(destination.icon),
                label: Text(destination.label),
              ),
            const Divider(),
            ListTile(
              onTap: () {
                setState(() => _index = 4);
                Navigator.pop(context);
              },
              leading: const Icon(Icons.info_outline_rounded),
              title: const Text('关于与版本'),
              subtitle: const Text('在设置中查看 App 版本'),
            ),
          ],
        ),
        body: content,
      );
    }
    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: _index,
            onDestinationSelected: (value) => setState(() => _index = value),
            extended: MediaQuery.sizeOf(context).width >= 1080,
            backgroundColor: const Color(0xFFF5F8F1),
            leading: const Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: CircleAvatar(
                backgroundColor: AppTheme.ink,
                foregroundColor: AppTheme.acid,
                child: Text(
                  'IN',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
            ),
            trailing: Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  IconButton(
                    tooltip: '关于与版本',
                    onPressed: () => setState(() => _index = 4),
                    icon: const Icon(Icons.info_outline_rounded),
                  ),
                  IconButton(
                    tooltip: '退出登录',
                    onPressed: () =>
                        ref.read(authControllerProvider.notifier).logout(),
                    icon: const Icon(Icons.logout_rounded),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
            destinations: [
              for (final destination in destinations)
                NavigationRailDestination(
                  icon: Icon(destination.icon),
                  label: Text(destination.label),
                ),
            ],
          ),
          const VerticalDivider(width: 1),
          Expanded(child: content),
        ],
      ),
    );
  }
}
