import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/config/app_config.dart';
import '../auth/auth_controller.dart';
import '../comments/comments_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../developer/developer_screen.dart';
import '../media/media_screen.dart';
import '../settings/settings_screen.dart';
import '../settings/website_text_screen.dart';
import '../settings/website_customization_screen.dart';
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
    (label: '网站文字', icon: Icons.text_fields_rounded),
    (label: '个性化', icon: Icons.palette_outlined),
    (label: '设置', icon: Icons.tune_rounded),
  ];

  List<Widget> get _screens => [
    const DashboardScreen(),
    const MediaScreen(),
    const CommentsScreen(),
    const SubmissionsScreen(),
    const WebsiteTextScreen(),
    const WebsiteCustomizationScreen(),
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

  Future<void> _confirmLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('退出登录？'),
        content: const Text(
          '退出登录会清除本机保存的登录状态，下次打开需要重新登录。'
          '如果只是想关闭 App，请直接返回桌面。',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('保持登录'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('确认退出'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await ref.read(authControllerProvider.notifier).logout();
    }
  }

  @override
  Widget build(BuildContext context) {
    final brandSettings =
        ref.watch(websiteSettingsProvider).asData?.value ??
        const <String, dynamic>{};
    final appName =
        brandSettings['app_display_name']?.toString().trim().isNotEmpty == true
        ? brandSettings['app_display_name'].toString().trim()
        : 'INTO 青春管理';
    final rawLogo = brandSettings['app_logo_url']?.toString().trim() ?? '';
    final logoUrl = rawLogo.isEmpty
        ? ''
        : rawLogo.startsWith('http')
        ? rawLogo
        : '${AppConfig.publicBaseUrl}${rawLogo.startsWith('/') ? '' : '/'}$rawLogo';
    Widget brandAvatar() => CircleAvatar(
      backgroundColor: AppTheme.ink,
      foregroundColor: AppTheme.acid,
      child: logoUrl.isEmpty
          ? const Text('IN', style: TextStyle(fontWeight: FontWeight.w900))
          : ClipOval(
              child: Image.network(
                logoUrl,
                width: 40,
                height: 40,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => const Text(
                  'IN',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
            ),
    );
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
              onPressed: _confirmLogout,
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
            Padding(
              padding: const EdgeInsets.fromLTRB(28, 24, 20, 12),
              child: Row(
                children: [
                  brandAvatar(),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      appName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 18,
                      ),
                    ),
                  ),
                ],
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
                setState(() => _index = 6);
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
            leading: Padding(
              padding: const EdgeInsets.symmetric(vertical: 18),
              child: Tooltip(message: appName, child: brandAvatar()),
            ),
            trailing: Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  IconButton(
                    tooltip: '关于与版本',
                    onPressed: () => setState(() => _index = 6),
                    icon: const Icon(Icons.info_outline_rounded),
                  ),
                  IconButton(
                    tooltip: '退出登录',
                    onPressed: _confirmLogout,
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
