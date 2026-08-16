import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/platform/system_settings.dart';
import '../../core/theme/app_theme.dart';

class PermissionsScreen extends StatelessWidget {
  const PermissionsScreen({super.key});

  static const items = <PermissionDescription>[
    PermissionDescription(
      name: '网络访问',
      icon: Icons.language_rounded,
      purpose: '用于通过 HTTPS 连接后台 API、检查更新和上传内容。',
      detail: '安装时由 Android 授予，不会读取设备上的个人信息。',
    ),
    PermissionDescription(
      name: '图片访问',
      icon: Icons.photo_outlined,
      purpose: '用于从系统图片选择器选择照片并上传到网站。',
      detail: 'App 只能读取您主动选择的图片，不会获得整个相册权限。',
    ),
    PermissionDescription(
      name: '视频访问',
      icon: Icons.video_library_outlined,
      purpose: '用于从系统媒体选择器选择短视频并上传到网站。',
      detail: 'App 只能读取您主动选择的视频，不会扫描媒体库。',
    ),
    PermissionDescription(
      name: '文件存储',
      icon: Icons.folder_outlined,
      purpose: '用于在 App 私有目录暂存压缩文件和已校验的更新包。',
      detail: '不需要共享存储权限，也不会访问其他 App 的文件。',
    ),
    PermissionDescription(
      name: '安装更新包',
      icon: Icons.install_mobile_rounded,
      purpose: '用于在下载并校验新版 APK 后打开系统安装界面。',
      detail: 'Android 会要求您手动确认安装；App 不能静默安装或绕过系统确认。',
    ),
  ];

  Future<void> _openSettings(BuildContext context) async {
    try {
      await SystemSettings.openAppPermissionSettings();
    } on PlatformException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('无法打开系统设置：${error.message ?? error.code}')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('权限管理')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
        children: [
          Text('最小权限说明', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 8),
          Text(
            '本 App 使用 Android 系统选择器，不申请完整相册、媒体库或共享存储权限。下面的“已授权”表示对应功能可用。',
            style: TextStyle(color: AppTheme.ink.withValues(alpha: .64)),
          ),
          const SizedBox(height: 18),
          for (final item in items) ...[
            _PermissionCard(item: item),
            const SizedBox(height: 12),
          ],
          const SizedBox(height: 6),
          FilledButton.icon(
            onPressed: () => _openSettings(context),
            icon: const Icon(Icons.settings_outlined),
            label: const Text('打开系统权限设置'),
          ),
          const SizedBox(height: 10),
          Text(
            '将打开 Android 的 INTO 青春管理应用信息页，您可以在其中查看权限。',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: AppTheme.ink.withValues(alpha: .54),
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

class PermissionDescription {
  const PermissionDescription({
    required this.name,
    required this.icon,
    required this.purpose,
    required this.detail,
  });

  final String name;
  final IconData icon;
  final String purpose;
  final String detail;
}

class _PermissionCard extends StatelessWidget {
  const _PermissionCard({required this.item});

  final PermissionDescription item;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              backgroundColor: AppTheme.mint,
              foregroundColor: AppTheme.ink,
              child: Icon(item.icon),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.name,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const _AuthorizedChip(),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(item.purpose),
                  const SizedBox(height: 5),
                  Text(
                    item.detail,
                    style: TextStyle(
                      color: AppTheme.ink.withValues(alpha: .58),
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AuthorizedChip extends StatelessWidget {
  const _AuthorizedChip();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '当前状态：已授权',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: AppTheme.acid.withValues(alpha: .2),
          borderRadius: BorderRadius.circular(99),
        ),
        child: const Text(
          '已授权',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
        ),
      ),
    );
  }
}
