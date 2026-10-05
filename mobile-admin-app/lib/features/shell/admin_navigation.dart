import 'package:flutter/material.dart';

class AdminDestination {
  const AdminDestination(
    this.id,
    this.label,
    this.icon, [
    this.children = const [],
  ]);
  final String id, label;
  final IconData icon;
  final List<AdminDestination> children;
}

// Same order, labels and two-level groups as the website AdminDashboard.
const adminNavigation = [
  AdminDestination('status', '服务器状态', Icons.dns_outlined),
  AdminDestination('content', '网站内容设置', Icons.dashboard_outlined, [
    AdminDestination('images', '内容概览', Icons.grid_view_outlined),
    AdminDestination('media', '青春故事集', Icons.photo_library_outlined),
    AdminDestination('river', '3D 粒子树', Icons.auto_awesome_outlined),
    AdminDestination('campus', '校园碎片', Icons.school_outlined),
    AdminDestination('timeline', '时间线', Icons.timeline_outlined),
    AdminDestination('notes', '随手记', Icons.edit_note_outlined),
    AdminDestination('about', '关于我们', Icons.people_outline),
    AdminDestination('messages', '留言操场', Icons.forum_outlined),
  ]),
  AdminDestination('inbox', '留言与投稿信箱', Icons.inbox_outlined, [
    AdminDestination('comments', '留言管理', Icons.chat_bubble_outline),
    AdminDestination('submissions', '投稿信箱', Icons.markunread_mailbox_outlined),
  ]),
  AdminDestination('intro', '首页开场', Icons.play_circle_outline),
  AdminDestination('settings', '网站设置', Icons.tune_outlined),
  AdminDestination('pet', 'AI 桌宠设置', Icons.smart_toy_outlined),
  AdminDestination('account', '账号管理', Icons.manage_accounts_outlined),
];

const sectionCards = {
  'media': 'home_card_story_image',
  'river': 'home_card_memory_image',
  'campus': 'home_card_campus_image',
  'timeline': 'home_card_timeline_image',
  'notes': 'home_card_notes_image',
  'about': 'home_card_about_image',
  'messages': 'home_card_messages_image',
};
const sectionMediaFlags = {
  'media': 'show_in_stories',
  'river': 'show_in_3d',
  'campus': 'show_on_home',
};

String sectionLabel(String id) {
  for (final item in adminNavigation) {
    if (item.id == id) return item.label;
    for (final child in item.children) {
      if (child.id == id) return child.label;
    }
  }
  return id == 'tools' ? '关于与版本' : '开发诊断';
}

String fieldSection(Map<String, dynamic> field) {
  final key = field['key'] as String;
  if (key.startsWith('intro_')) return 'intro';
  for (final entry in sectionCards.entries) {
    if (key == entry.value) return entry.key;
  }
  const copyPrefixes = {
    'home_stories_': 'media',
    'home_portal_': 'river',
    'home_campus_': 'campus',
    'home_timeline_': 'timeline',
    'home_notes_': 'notes',
    'home_about_': 'about',
    'home_comments_': 'messages',
  };
  for (final entry in copyPrefixes.entries) {
    if (key.startsWith(entry.key)) return entry.value;
  }
  const special = {
    'show_stories': 'media',
    'show_timeline': 'timeline',
    'notes_title': 'notes',
    'notes_body': 'notes',
    'profile_text': 'about',
    'about_page_image': 'about',
    'show_about': 'about',
    'show_comments': 'messages',
  };
  if (special.containsKey(key)) return special[key]!;
  if (field['group'] == '3D 与动效') return 'river';
  if (key.startsWith('hero_') ||
      key.startsWith('home_hero_') ||
      field['group'] == '首页与栏目图片') {
    return 'images';
  }
  return 'settings';
}

bool fieldInSection(Map<String, dynamic> field, String section) {
  final key = field['key'] as String;
  return fieldSection(field) == section ||
      (section == 'images' && sectionCards.containsValue(key)) ||
      (section == 'about' &&
          (key == 'site_title' ||
              [
                'github_url',
                'contact_email',
                'contact_douyin_url',
              ].contains(key)));
}

bool mediaInSection(Map<String, dynamic> item, String? section) {
  final flag = sectionMediaFlags[section];
  return flag == null || item[flag]?.toString() == '1';
}

class AdminMenu extends StatelessWidget {
  const AdminMenu({
    super.key,
    required this.selected,
    required this.onSelect,
    this.developerMode = false,
  });
  final String selected;
  final ValueChanged<String> onSelect;
  final bool developerMode;
  Widget _entry(AdminDestination destination, {bool child = false}) => ListTile(
    key: ValueKey('nav-${destination.id}'),
    contentPadding: EdgeInsets.only(left: child ? 38 : 20, right: 16),
    leading: Icon(destination.icon, size: 22),
    title: Text(destination.label),
    selected: destination.id == selected,
    onTap: () => onSelect(destination.id),
  );
  @override
  Widget build(BuildContext context) => ListView(
    padding: EdgeInsets.only(
      top: MediaQuery.paddingOf(context).top + 16,
      bottom: 20,
    ),
    children: [
      const Padding(
        padding: EdgeInsets.fromLTRB(20, 8, 16, 20),
        child: Text(
          '我的站点管理',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
      ),
      for (final item in adminNavigation)
        if (item.children.isEmpty)
          _entry(item)
        else
          ExpansionTile(
            key: PageStorageKey('menu-${item.id}'),
            initiallyExpanded: true,
            leading: Icon(item.icon),
            title: Text(item.label),
            children: [
              for (final child in item.children) _entry(child, child: true),
            ],
          ),
      const Divider(),
      _entry(const AdminDestination('tools', '关于与版本', Icons.info_outline)),
      if (developerMode)
        _entry(
          const AdminDestination(
            'developer',
            '开发诊断',
            Icons.developer_mode_outlined,
          ),
        ),
    ],
  );
}
