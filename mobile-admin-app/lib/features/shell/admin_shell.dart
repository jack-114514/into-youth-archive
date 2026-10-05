import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'admin_navigation.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/admin_layout.dart';
import '../auth/auth_controller.dart';
import '../connection/site_screen.dart';
import '../comments/comments_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../developer/developer_screen.dart';
import '../media/media_screen.dart';
import '../pet/pet_settings_screen.dart';
import '../settings/account_screen.dart';
import '../settings/full_settings_screen.dart';
import '../settings/settings_screen.dart';
import '../submissions/submissions_screen.dart';

class AdminShell extends ConsumerStatefulWidget {
  const AdminShell({super.key});
  @override
  ConsumerState<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends ConsumerState<AdminShell> {
  String _selected = 'status';
  int _versionTaps = 0;
  bool _developerMode = false;
  final _visited = <String, Widget>{'status': const DashboardScreen()};
  final _drafts = <String>{};
  final _scaffold = GlobalKey<ScaffoldState>();
  final _contentKey = GlobalKey();

  Widget _settings(String section) => FullSettingsScreen(
    key: ValueKey('section-$section'),
    group: sectionLabel(section),
    section: section,
    embedded: true,
    onDirtyChanged: (dirty) => setState(() {
      if (dirty) {
        _drafts.add(section);
      } else {
        _drafts.remove(section);
      }
    }),
  );

  Widget _page(String id) => switch (id) {
    'status' => const DashboardScreen(),
    'comments' => const CommentsScreen(),
    'submissions' => const SubmissionsScreen(),
    'pet' => const PetSettingsScreen(embedded: true),
    'account' => const AccountScreen(embedded: true),
    'tools' => AppToolsScreen(onVersionTap: _versionTap),
    'developer' => const DeveloperScreen(),
    'media' || 'river' || 'campus' => DefaultTabController(
      length: 2,
      child: Column(
        children: [
          const TabBar(
            tabs: [
              Tab(text: '图片内容'),
              Tab(text: '栏目设置'),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                MediaScreen(section: id),
                _settings(id),
              ],
            ),
          ),
        ],
      ),
    ),
    _ => _settings(id),
  };

  void _select(String id) => setState(() {
    _visited.putIfAbsent(id, () => _page(id));
    _selected = id;
  });

  void _versionTap() {
    if (++_versionTaps < 7 || _developerMode) return;
    setState(() => _developerMode = true);
    _select('developer');
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('开发者模式已启用')));
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 820;
    final ids = _visited.keys.toList();
    final content = AdminPageWidth(
      child: IndexedStack(
        key: _contentKey,
        index: ids.indexOf(_selected),
        children: _visited.values.toList(),
      ),
    );
    Widget menu({bool drawer = false}) => AdminMenu(
      selected: _selected,
      developerMode: _developerMode,
      onSelect: (id) {
        if (drawer) _scaffold.currentState?.closeDrawer();
        _select(id);
      },
    );
    return PopScope(
      canPop: _drafts.isEmpty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop || _drafts.isEmpty) return;
        if (!await confirmRemoval(context, '离开并放弃尚未保存的修改？') || !mounted) return;
        setState(() => _drafts.clear());
        if (context.mounted && Navigator.of(context).canPop()) {
          Navigator.pop(context);
        } else {
          await SystemNavigator.pop();
        }
      },
      child: Scaffold(
        key: _scaffold,
        appBar: AppBar(
          title: Text(sectionLabel(_selected)),
          backgroundColor: AppTheme.mint,
          actions: [
            const SiteSettingsButton(),
            IconButton(
              tooltip: '退出后台',
              icon: const Icon(Icons.logout_rounded),
              onPressed: () async {
                if (_drafts.isNotEmpty &&
                    !await confirmRemoval(context, '退出并放弃尚未保存的修改？')) {
                  return;
                }
                if (!mounted) return;
                ref.read(authControllerProvider.notifier).logout();
              },
            ),
          ],
        ),
        drawer: wide ? null : Drawer(child: menu(drawer: true)),
        body: wide
            ? Row(
                children: [
                  Material(
                    color: const Color(0xFFF5F8F1),
                    child: SizedBox(width: 280, child: menu()),
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(child: content),
                ],
              )
            : content,
      ),
    );
  }
}
